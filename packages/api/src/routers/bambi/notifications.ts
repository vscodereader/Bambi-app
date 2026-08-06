import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import { bambiNotification } from "@bambi-app/db/schema/bambi";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	notInArray,
	or,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
} from "../../services/bambi-authz";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// 채팅 알림은 헤더 채팅 핀이 담당한다. 알림함에서 또 세면 같은 사건이 두 번 카운트되고,
// "안 읽음 2"인데 알림함에는 하나만 보이는 상태가 된다.
const CHAT_TARGET_TYPES = ["chat_message", "chat_room"] as const;

// 역할 공유 알림을 받는 역할. 그 외 역할은 개인 수신 행만 본다.
const SHARED_RECIPIENT_ROLES = ["admin", "legal_advisor"] as const;

// 정렬 총순서가 (created_at, id)라 커서도 두 값을 함께 든다(chats.getById와 같은 규칙).
const notificationCursorInput = z.object({
	createdAt: z.string().datetime(),
	id: z.string().uuid(),
});

const listInput = z.object({
	cursor: notificationCursorInput.optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const markReadInput = z.object({
	ids: z.array(z.string().uuid()).min(1).max(MAX_PAGE_SIZE),
});

const isSharedRecipientRole = (
	role: BambiAccessProfile["role"]
): role is "admin" | "legal_advisor" =>
	SHARED_RECIPIENT_ROLES.some((shared) => shared === role);

/**
 * 이 사용자가 볼 수 있는 알림: 개인 수신(본인) + (공유 역할이면) 본인 role 수신.
 * 채팅류는 항상 제외한다 — 읽기·카운트·읽음 처리가 모두 같은 대상 집합을 써야
 * "배지에는 남는데 목록에는 없는" 유령 카운트가 생기지 않는다.
 */
const buildVisibleFilter = (profile: BambiAccessProfile) =>
	and(
		notInArray(bambiNotification.targetType, [...CHAT_TARGET_TYPES]),
		isSharedRecipientRole(profile.role)
			? or(
					eq(bambiNotification.recipientUserId, profile.userId),
					eq(bambiNotification.recipientRole, profile.role)
				)
			: eq(bambiNotification.recipientUserId, profile.userId)
	);

const countUnread = async (profile: BambiAccessProfile): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(bambiNotification)
		.where(and(buildVisibleFilter(profile), isNull(bambiNotification.readAt)));

	return row?.value ?? 0;
};

export const notificationsRouter = {
	list: protectedProcedure
		.input(listInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const cursorCreatedAt = input.cursor
				? new Date(input.cursor.createdAt)
				: null;
			// keyset 페이지네이션. 동시각 알림은 id로 갈라 경계에서 빠지거나 겹치지 않는다.
			const olderThanCursor =
				cursorCreatedAt && input.cursor
					? or(
							lt(bambiNotification.createdAt, cursorCreatedAt),
							and(
								eq(bambiNotification.createdAt, cursorCreatedAt),
								lt(bambiNotification.id, input.cursor.id)
							)
						)
					: undefined;

			// 한 건을 더 읽어 "다음 페이지가 있는지"를 별도 count 없이 판단한다.
			const rows = await db
				.select({
					chatRoomId: bambiNotification.chatRoomId,
					createdAt: bambiNotification.createdAt,
					id: bambiNotification.id,
					metadata: bambiNotification.metadata,
					readAt: bambiNotification.readAt,
					// 공유 행의 "확인: ○○" 표시용. 개인 행에서는 화면이 쓰지 않는다.
					readByName: user.name,
					recipientRole: bambiNotification.recipientRole,
					targetId: bambiNotification.targetId,
					targetType: bambiNotification.targetType,
				})
				.from(bambiNotification)
				.leftJoin(user, eq(user.id, bambiNotification.readByUserId))
				.where(and(buildVisibleFilter(profile), olderThanCursor))
				.orderBy(desc(bambiNotification.createdAt), desc(bambiNotification.id))
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const last = items.at(-1);

			return {
				items,
				nextCursor:
					hasMore && last
						? { createdAt: last.createdAt.toISOString(), id: last.id }
						: null,
			};
		}),

	unreadCount: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		return { unreadCount: await countUnread(profile) };
	}),

	markRead: protectedProcedure
		.input(markReadInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			// 볼 수 있는 행만 건드린다(남의 알림 id를 넣어도 조용히 0건). 이미 읽은 행은
			// 그대로 둬 확인자·확인 시각이 나중 요청으로 덮이지 않게 한다 — 멱등.
			await db
				.update(bambiNotification)
				.set({ readAt: new Date(), readByUserId: profile.userId })
				.where(
					and(
						buildVisibleFilter(profile),
						inArray(bambiNotification.id, input.ids),
						isNull(bambiNotification.readAt)
					)
				);

			// 갱신 후 정본 카운트를 함께 돌려준다 — 클라이언트가 재조회 타이밍에 기대지
			// 않고 배지를 바로 덮어쓸 수 있다(채팅 핀에서 겪은 잔존 버그와 같은 대비).
			return { unreadCount: await countUnread(profile) };
		}),

	markAllRead: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		await db
			.update(bambiNotification)
			.set({ readAt: new Date(), readByUserId: profile.userId })
			.where(
				and(buildVisibleFilter(profile), isNull(bambiNotification.readAt))
			);

		return { unreadCount: await countUnread(profile) };
	}),
};
