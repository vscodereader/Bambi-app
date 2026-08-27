import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiDirectMessage,
	bambiDirectMessageRecipient,
	bambiProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import {
	DIRECT_MESSAGE_BODY_MAX,
	DIRECT_MESSAGE_TITLE_MAX,
	expandTargetRoles,
	mergeRecipientUserIds,
} from "../../services/bambi-direct-messages";
import { notifyBambiNotification } from "../../services/bambi-notifications";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// 전체 구직자 브로드캐스트가 수천 행일 수 있어 insert를 나눈다(파라미터 한도 대비).
const INSERT_CHUNK_SIZE = 500;
// ponytail: 수신자당 개별 INSERT+emit, 대량 브로드캐스트가 상시화되면 알림 배치 insert로 승격
const NOTIFY_CHUNK_SIZE = 25;

const sendInput = z.object({
	roles: z.array(z.enum(["job_seeker", "employer"])).default([]),
	recipientUserIds: z.array(z.string().min(1)).max(1000).default([]),
	title: z.string().trim().min(1).max(DIRECT_MESSAGE_TITLE_MAX),
	body: z.string().trim().min(1).max(DIRECT_MESSAGE_BODY_MAX),
});

// 정렬 총순서 (created_at, message_id) — notifications.list와 같은 keyset 규칙.
const cursorInput = z.object({
	createdAt: z.string().datetime(),
	messageId: z.string().uuid(),
});

const listMineInput = z.object({
	tab: z.enum(["inbox", "archived"]).default("inbox"),
	cursor: cursorInput.optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const listSentInput = z.object({
	cursor: cursorInput.optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
	order: z.enum(["newest", "oldest"]).default("newest"),
});

const messageIdInput = z.object({ messageId: z.string().uuid() });

const setArchivedInput = z.object({
	messageId: z.string().uuid(),
	archived: z.boolean(),
});

/** 내 수신자 행(소프트 삭제 제외). 모든 수신자 프로시저가 같은 필터를 쓴다. */
const mineFilter = (userId: string) =>
	and(
		eq(bambiDirectMessageRecipient.recipientUserId, userId),
		isNull(bambiDirectMessageRecipient.deletedAt)
	);

const countUnread = async (userId: string): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(bambiDirectMessageRecipient)
		.where(and(mineFilter(userId), isNull(bambiDirectMessageRecipient.readAt)));
	return row?.value ?? 0;
};

export const directMessagesRouter = {
	// ---- 운영자 ----------------------------------------------------------
	send: adminProcedure.input(sendInput).handler(async ({ context, input }) => {
		const profile = await requireActiveBambiProfile(context.session);

		// 중복 역할은 한 번만 — 스냅샷·확장 입력 양쪽에서 정규화해 쓴다.
		const roles = [...new Set(input.roles)];

		// 역할 브로드캐스트 대상: 해당 역할의 활성 프로필 계정(탈퇴 계정은 user 삭제
		// 아닌 soft라 bambi_profile이 남는다 — user.deletedAt으로 거른다).
		const expandedRoles = expandTargetRoles(roles);
		const roleUserIds =
			expandedRoles.length > 0
				? (
						await db
							.select({ userId: bambiProfile.userId })
							.from(bambiProfile)
							.innerJoin(user, eq(user.id, bambiProfile.userId))
							.where(
								and(
									inArray(bambiProfile.role, expandedRoles),
									isNull(user.deletedAt)
								)
							)
					).map((row) => row.userId)
				: [];

		// 개별 지정은 실존·미탈퇴 + 발송 가능 역할(구직자·법률자문·구인자)만 남긴다.
		// admin·guest는 조용히 제외하고, 프로필 없는 온보딩 전 계정은 job_seeker로 취급
		// (moderation.listUsers의 coalesce 관례). 지운 계정 id가 섞여도 조용히 빠진다.
		const explicitUserIds =
			input.recipientUserIds.length > 0
				? (
						await db
							.select({ id: user.id })
							.from(user)
							.leftJoin(bambiProfile, eq(bambiProfile.userId, user.id))
							.where(
								and(
									inArray(user.id, input.recipientUserIds),
									isNull(user.deletedAt),
									sql`coalesce(${bambiProfile.role}, 'job_seeker') in ('job_seeker', 'employer', 'legal_advisor')`
								)
							)
					).map((row) => row.id)
				: [];

		const recipientUserIds = mergeRecipientUserIds(
			roleUserIds,
			explicitUserIds
		);
		if (recipientUserIds.length === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "발송할 수신자가 없습니다. 역할 또는 수신자를 선택해 주세요.",
			});
		}

		const messageId = await db.transaction(async (tx) => {
			const [message] = await tx
				.insert(bambiDirectMessage)
				.values({
					senderUserId: profile.userId,
					targetRoles: roles,
					title: input.title,
					body: input.body,
				})
				.returning({ id: bambiDirectMessage.id });
			if (!message) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "쪽지 생성에 실패했습니다.",
				});
			}
			for (let i = 0; i < recipientUserIds.length; i += INSERT_CHUNK_SIZE) {
				await tx.insert(bambiDirectMessageRecipient).values(
					recipientUserIds
						.slice(i, i + INSERT_CHUNK_SIZE)
						.map((recipientUserId) => ({
							messageId: message.id,
							recipientUserId,
						}))
				);
			}
			return message.id;
		});

		// 커밋 후 best-effort 알림 — 알림 실패가 발송을 깨지 않는다(래퍼가 삼킨다).
		// 청크 단위 병렬로 순차 왕복을 줄인다(래퍼가 개별 실패를 삼켜 Promise.all 안전).
		for (let i = 0; i < recipientUserIds.length; i += NOTIFY_CHUNK_SIZE) {
			await Promise.all(
				recipientUserIds
					.slice(i, i + NOTIFY_CHUNK_SIZE)
					.map((recipientUserId) =>
						notifyBambiNotification({
							actorUserId: profile.userId,
							metadata: { title: input.title },
							recipientUserId,
							targetId: messageId,
							targetType: "direct_message",
						})
					)
			);
		}

		return { messageId, recipientCount: recipientUserIds.length };
	}),

	listSent: adminProcedure.input(listSentInput).handler(async ({ input }) => {
		// 커서 비교 연산자와 orderBy 방향은 반드시 같아야 페이지가 겹치거나 빠지지 않는다.
		const isOldest = input.order === "oldest";
		const beyond = isOldest ? gt : lt;
		const orderDir = isOldest ? asc : desc;
		const cursorCreatedAt = input.cursor
			? new Date(input.cursor.createdAt)
			: null;
		const beyondCursor =
			cursorCreatedAt && input.cursor
				? or(
						beyond(bambiDirectMessage.createdAt, cursorCreatedAt),
						and(
							eq(bambiDirectMessage.createdAt, cursorCreatedAt),
							beyond(bambiDirectMessage.id, input.cursor.messageId)
						)
					)
				: undefined;

		// 집계는 상관 서브쿼리 — 조인이면 수신자 수만큼 행이 뻥튀기된다
		// (moderation.listUsers와 같은 규칙). 소프트 삭제 행도 통계에는 포함.
		const recipientCountSql = sql<number>`(
			select count(*)::int from ${bambiDirectMessageRecipient}
			where ${bambiDirectMessageRecipient.messageId} = ${bambiDirectMessage.id}
		)`;
		const readCountSql = sql<number>`(
			select count(*)::int from ${bambiDirectMessageRecipient}
			where ${bambiDirectMessageRecipient.messageId} = ${bambiDirectMessage.id}
				and ${bambiDirectMessageRecipient.readAt} is not null
		)`;

		const rows = await db
			.select({
				messageId: bambiDirectMessage.id,
				title: bambiDirectMessage.title,
				targetRoles: bambiDirectMessage.targetRoles,
				senderName: user.name,
				recipientCount: recipientCountSql,
				readCount: readCountSql,
				createdAt: bambiDirectMessage.createdAt,
			})
			.from(bambiDirectMessage)
			.leftJoin(user, eq(user.id, bambiDirectMessage.senderUserId))
			.where(beyondCursor)
			.orderBy(
				orderDir(bambiDirectMessage.createdAt),
				orderDir(bambiDirectMessage.id)
			)
			.limit(input.limit + 1);

		const hasMore = rows.length > input.limit;
		const items = hasMore ? rows.slice(0, input.limit) : rows;
		const last = items.at(-1);
		return {
			items,
			nextCursor:
				hasMore && last
					? {
							createdAt: last.createdAt.toISOString(),
							messageId: last.messageId,
						}
					: null,
		};
	}),

	sentDetail: adminProcedure
		.input(messageIdInput)
		.handler(async ({ input }) => {
			// listSent와 같은 상관 서브쿼리 — 아래 recipients는 1000건 상한이라 실제
			// 발송 수와 다를 수 있어 정확한 총계를 헤드라인용으로 따로 센다.
			const recipientCountSql = sql<number>`(
				select count(*)::int from ${bambiDirectMessageRecipient}
				where ${bambiDirectMessageRecipient.messageId} = ${bambiDirectMessage.id}
			)`;
			const [message] = await db
				.select({
					messageId: bambiDirectMessage.id,
					title: bambiDirectMessage.title,
					body: bambiDirectMessage.body,
					targetRoles: bambiDirectMessage.targetRoles,
					senderName: user.name,
					recipientCount: recipientCountSql,
					createdAt: bambiDirectMessage.createdAt,
				})
				.from(bambiDirectMessage)
				.leftJoin(user, eq(user.id, bambiDirectMessage.senderUserId))
				.where(eq(bambiDirectMessage.id, input.messageId))
				.limit(1);
			if (!message) {
				throw new ORPCError("NOT_FOUND", {
					message: "쪽지를 찾을 수 없습니다.",
				});
			}

			// 수신자별 읽음 여부. 수백~수천이 될 수 있으나 운영자 확인 화면이라 전량 반환
			// 대신 상한을 두고 요약 카운트는 listSent가 담당한다.
			const recipients = await db
				.select({
					recipientUserId: bambiDirectMessageRecipient.recipientUserId,
					recipientName: user.name,
					readAt: bambiDirectMessageRecipient.readAt,
				})
				.from(bambiDirectMessageRecipient)
				.innerJoin(
					user,
					eq(user.id, bambiDirectMessageRecipient.recipientUserId)
				)
				.where(eq(bambiDirectMessageRecipient.messageId, input.messageId))
				.orderBy(desc(bambiDirectMessageRecipient.readAt))
				.limit(1000);

			return { message, recipients };
		}),

	// ---- 수신자 ----------------------------------------------------------
	listMine: protectedProcedure
		.input(listMineInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const cursorCreatedAt = input.cursor
				? new Date(input.cursor.createdAt)
				: null;
			const olderThanCursor =
				cursorCreatedAt && input.cursor
					? or(
							lt(bambiDirectMessage.createdAt, cursorCreatedAt),
							and(
								eq(bambiDirectMessage.createdAt, cursorCreatedAt),
								lt(bambiDirectMessage.id, input.cursor.messageId)
							)
						)
					: undefined;

			const rows = await db
				.select({
					messageId: bambiDirectMessage.id,
					title: bambiDirectMessage.title,
					body: bambiDirectMessage.body,
					targetRoles: bambiDirectMessage.targetRoles,
					senderName: user.name,
					readAt: bambiDirectMessageRecipient.readAt,
					archivedAt: bambiDirectMessageRecipient.archivedAt,
					createdAt: bambiDirectMessage.createdAt,
				})
				.from(bambiDirectMessageRecipient)
				.innerJoin(
					bambiDirectMessage,
					eq(bambiDirectMessage.id, bambiDirectMessageRecipient.messageId)
				)
				.leftJoin(user, eq(user.id, bambiDirectMessage.senderUserId))
				.where(
					and(
						mineFilter(profile.userId),
						input.tab === "inbox"
							? isNull(bambiDirectMessageRecipient.archivedAt)
							: isNotNull(bambiDirectMessageRecipient.archivedAt),
						olderThanCursor
					)
				)
				.orderBy(
					desc(bambiDirectMessage.createdAt),
					desc(bambiDirectMessage.id)
				)
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const last = items.at(-1);
			return {
				items,
				nextCursor:
					hasMore && last
						? {
								createdAt: last.createdAt.toISOString(),
								messageId: last.messageId,
							}
						: null,
			};
		}),

	unreadCount: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		return { unreadCount: await countUnread(profile.userId) };
	}),

	// 열람 = 읽음. 이미 읽은 행은 그대로 둔다(멱등 — notifications.markRead와 같은 규칙).
	read: protectedProcedure
		.input(messageIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await db
				.update(bambiDirectMessageRecipient)
				.set({ readAt: new Date() })
				.where(
					and(
						mineFilter(profile.userId),
						eq(bambiDirectMessageRecipient.messageId, input.messageId),
						isNull(bambiDirectMessageRecipient.readAt)
					)
				);
			return { unreadCount: await countUnread(profile.userId) };
		}),

	setArchived: protectedProcedure
		.input(setArchivedInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await db
				.update(bambiDirectMessageRecipient)
				.set({ archivedAt: input.archived ? new Date() : null })
				.where(
					and(
						mineFilter(profile.userId),
						eq(bambiDirectMessageRecipient.messageId, input.messageId)
					)
				);
			return { ok: true };
		}),

	// 소프트 삭제. 내 행만 건드리므로 남의 messageId를 넣어도 조용히 0건.
	remove: protectedProcedure
		.input(messageIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await db
				.update(bambiDirectMessageRecipient)
				.set({ deletedAt: new Date() })
				.where(
					and(
						mineFilter(profile.userId),
						eq(bambiDirectMessageRecipient.messageId, input.messageId)
					)
				);
			return { unreadCount: await countUnread(profile.userId) };
		}),
};
