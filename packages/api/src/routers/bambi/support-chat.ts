import { db } from "@bambi-app/db";
import { member, organization, user } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	supportChatMessage,
	supportChatRoom,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import z from "zod";

import type { Context } from "../../context";
import { adminProcedure, publicProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import {
	resolveSupportChatNotificationTarget,
	SUPPORT_CHAT_BODY_MAX,
	SUPPORT_CHAT_RATE_LIMIT_ERROR,
	SUPPORT_CHAT_SEND_LIMIT,
	SUPPORT_CHAT_WINDOW_MS,
	type SupportChatInquirer,
	supportChatSendKeys,
} from "../../services/bambi-support-chat";
import { takeRateLimit } from "../../services/rate-limit";

// 위젯이 한 번에 보여 주는 최근 메시지 수. ponytail: 커서 페이징 없음 — 문의 채팅이
// 100건을 넘는 방이 흔해지면 그때 커서를 단다.
const INQUIRER_MESSAGE_LIMIT = 100;

const NO_IDENTITY_ERROR = "문의 세션이 없어요. 새로고침 후 다시 시도해 주세요.";
const BLOCKED_ERROR = "문의 발신이 제한된 상태예요.";

const ADMIN_ROOM_PAGE_SIZE = 30;
const ADMIN_MESSAGE_LIMIT = 200;
const ROOM_NOT_FOUND = "문의 방을 찾을 수 없어요.";

// 세션이 있으면 회원 축, 없으면 서명 쿠키 축. 둘 다 없으면 null — getMyRoom은 "방
// 없음"으로, sendMessage는 쿠키 발급(web 라우트) 후 재시도를 유도한다.
const resolveInquirer = (
	context: Pick<Context, "clientIp" | "session" | "supportChat">
): null | SupportChatInquirer => {
	const userId = context.session?.user.id;
	if (userId) {
		return { kind: "member", userId };
	}
	return context.supportChat
		? { kind: "guest", sid: context.supportChat.sid }
		: null;
};

const inquirerRoomWhere = (inquirer: SupportChatInquirer) =>
	inquirer.kind === "member"
		? eq(supportChatRoom.userId, inquirer.userId)
		: eq(supportChatRoom.guestId, inquirer.sid);

const EPOCH = new Date(0);

// 워터마크 이후에 쌓인 상대측 메시지 수 — 미읽음의 정의.
const countUnread = async (
	roomId: string,
	senderType: "admin" | "inquirer",
	watermark: Date | null
): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(supportChatMessage)
		.where(
			and(
				eq(supportChatMessage.roomId, roomId),
				eq(supportChatMessage.senderType, senderType),
				gt(supportChatMessage.createdAt, watermark ?? EPOCH)
			)
		);
	return row?.value ?? 0;
};

const loadRecentMessages = async (roomId: string, limit: number) => {
	const rows = await db
		.select({
			body: supportChatMessage.body,
			createdAt: supportChatMessage.createdAt,
			id: supportChatMessage.id,
			senderType: supportChatMessage.senderType,
		})
		.from(supportChatMessage)
		.where(eq(supportChatMessage.roomId, roomId))
		.orderBy(desc(supportChatMessage.createdAt))
		.limit(limit);
	return rows.reverse();
};

export const supportChatRouter = {
	getMyRoom: publicProcedure.handler(async ({ context }) => {
		const inquirer = resolveInquirer(context);
		if (!inquirer) {
			return null;
		}
		const [room] = await db
			.select()
			.from(supportChatRoom)
			.where(inquirerRoomWhere(inquirer))
			.limit(1);
		if (!room) {
			return null;
		}
		return {
			messages: await loadRecentMessages(room.id, INQUIRER_MESSAGE_LIMIT),
			room: { id: room.id, isBlocked: room.isBlocked },
			unreadCount: await countUnread(room.id, "admin", room.userLastReadAt),
		};
	}),

	sendMessage: publicProcedure
		.input(
			z.object({
				body: z.string().trim().min(1).max(SUPPORT_CHAT_BODY_MAX),
			})
		)
		.handler(async ({ context, input }) => {
			const inquirer = resolveInquirer(context);
			if (!inquirer) {
				throw new ORPCError("UNAUTHORIZED", { message: NO_IDENTITY_ERROR });
			}
			if (inquirer.kind === "member") {
				// 정지 계정 차단 겸 역할 확인. 운영자 계정은 받는 쪽이다 — 자기 문의가
				// 공용 큐에 섞이면 처리 대상이 흐려진다(기존 티켓과 같은 규칙).
				const profile = await requireActiveBambiProfile(context.session);
				if (profile.role === "admin") {
					throw new ORPCError("FORBIDDEN", {
						message: "운영자 계정은 문의 채팅을 보낼 수 없어요.",
					});
				}
			}
			const now = Date.now();
			for (const key of supportChatSendKeys(inquirer, context.clientIp)) {
				if (
					!takeRateLimit({
						key,
						limit: SUPPORT_CHAT_SEND_LIMIT,
						now,
						windowMs: SUPPORT_CHAT_WINDOW_MS,
					})
				) {
					throw new ORPCError("TOO_MANY_REQUESTS", {
						message: SUPPORT_CHAT_RATE_LIMIT_ERROR,
					});
				}
			}

			// 1인 1방 — 없으면 만들고, 동시 첫 발신 경합은 부분 유니크 +
			// onConflictDoNothing 후 재조회로 잡는다.
			let [room] = await db
				.select()
				.from(supportChatRoom)
				.where(inquirerRoomWhere(inquirer))
				.limit(1);
			if (!room) {
				await db
					.insert(supportChatRoom)
					.values(
						inquirer.kind === "member"
							? { userId: inquirer.userId }
							: { guestId: inquirer.sid }
					)
					.onConflictDoNothing();
				[room] = await db
					.select()
					.from(supportChatRoom)
					.where(inquirerRoomWhere(inquirer))
					.limit(1);
			}
			if (!room) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "문의 방을 만들지 못했어요.",
				});
			}
			if (room.isBlocked) {
				throw new ORPCError("FORBIDDEN", { message: BLOCKED_ERROR });
			}

			// 에지 트리거 판정은 삽입 전에 센다 — 삽입 후에 세면 항상 1 이상이라
			// 알림이 영영 안 나간다.
			const prevUnreadCount = await countUnread(
				room.id,
				"inquirer",
				room.adminLastReadAt
			);
			const [inserted] = await db
				.insert(supportChatMessage)
				.values({
					body: input.body,
					roomId: room.id,
					senderType: "inquirer",
					senderUserId: inquirer.kind === "member" ? inquirer.userId : null,
				})
				.returning({
					createdAt: supportChatMessage.createdAt,
					id: supportChatMessage.id,
				});
			if (!inserted) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "메시지를 보내지 못했어요.",
				});
			}
			await db
				.update(supportChatRoom)
				.set({ lastMessageAt: inserted.createdAt })
				.where(eq(supportChatRoom.id, room.id));

			const target = resolveSupportChatNotificationTarget({
				prevUnreadCount,
				roomUserId: room.userId,
				senderType: "inquirer",
			});
			if (target) {
				await notifyBambiNotification({
					actorUserId: inquirer.kind === "member" ? inquirer.userId : null,
					metadata: { action: "message" },
					targetId: room.id,
					targetType: "support_chat",
					...target,
				});
			}
			return { id: inserted.id };
		}),

	markRead: publicProcedure.handler(async ({ context }) => {
		const inquirer = resolveInquirer(context);
		if (!inquirer) {
			return { ok: false };
		}
		await db
			.update(supportChatRoom)
			.set({ userLastReadAt: new Date() })
			.where(inquirerRoomWhere(inquirer));
		return { ok: true };
	}),

	admin: {
		listRooms: adminProcedure
			.input(z.object({ page: z.number().int().min(1).default(1) }))
			.handler(async ({ input }) => {
				const [totalRow] = await db
					.select({ value: count() })
					.from(supportChatRoom);
				const rooms = await db
					.select({
						createdAt: supportChatRoom.createdAt,
						guestId: supportChatRoom.guestId,
						id: supportChatRoom.id,
						isBlocked: supportChatRoom.isBlocked,
						lastMessageAt: supportChatRoom.lastMessageAt,
						userId: supportChatRoom.userId,
						userName: user.name,
					})
					.from(supportChatRoom)
					.leftJoin(user, eq(supportChatRoom.userId, user.id))
					.orderBy(desc(supportChatRoom.lastMessageAt))
					.limit(ADMIN_ROOM_PAGE_SIZE)
					.offset((input.page - 1) * ADMIN_ROOM_PAGE_SIZE);

				const roomIds = rooms.map((room) => room.id);
				// 페이지 방들의 미읽음·마지막 메시지를 각각 한 방 쿼리로 — 방마다
				// N+1을 돌리지 않는다.
				const unreadRows = roomIds.length
					? await db
							.select({
								roomId: supportChatMessage.roomId,
								value: count(),
							})
							.from(supportChatMessage)
							.innerJoin(
								supportChatRoom,
								eq(supportChatMessage.roomId, supportChatRoom.id)
							)
							.where(
								and(
									inArray(supportChatMessage.roomId, roomIds),
									eq(supportChatMessage.senderType, "inquirer"),
									sql`${supportChatMessage.createdAt} > coalesce(${supportChatRoom.adminLastReadAt}, to_timestamp(0))`
								)
							)
							.groupBy(supportChatMessage.roomId)
					: [];
				const lastMessages = roomIds.length
					? await db
							.selectDistinctOn([supportChatMessage.roomId], {
								body: supportChatMessage.body,
								roomId: supportChatMessage.roomId,
							})
							.from(supportChatMessage)
							.where(inArray(supportChatMessage.roomId, roomIds))
							.orderBy(
								supportChatMessage.roomId,
								desc(supportChatMessage.createdAt)
							)
					: [];
				const unreadByRoom = new Map(
					unreadRows.map((row) => [row.roomId, row.value])
				);
				const previewByRoom = new Map(
					lastMessages.map((row) => [row.roomId, row.body])
				);
				return {
					items: rooms.map((room) => ({
						id: room.id,
						// 회원은 계정 이름, 비회원은 sid 앞 8자로 구분만 되게.
						displayName: room.userId
							? (room.userName ?? "회원")
							: `비회원 ${room.guestId?.slice(0, 8) ?? ""}`,
						isBlocked: room.isBlocked,
						isMember: room.userId !== null,
						lastMessageAt: room.lastMessageAt,
						lastMessagePreview: previewByRoom.get(room.id) ?? "",
						unreadCount: unreadByRoom.get(room.id) ?? 0,
					})),
					page: input.page,
					pageSize: ADMIN_ROOM_PAGE_SIZE,
					totalCount: totalRow?.value ?? 0,
				};
			}),

		getRoom: adminProcedure
			.input(z.object({ roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				const [room] = await db
					.select()
					.from(supportChatRoom)
					.where(eq(supportChatRoom.id, input.roomId))
					.limit(1);
				if (!room) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				const messages = await loadRecentMessages(room.id, ADMIN_MESSAGE_LIMIT);
				let inquirer:
					| {
							gender: null | string;
							joinedAt: Date;
							kind: "member";
							name: string;
							organizationName: null | string;
							role: string;
					  }
					| { firstContactAt: Date; kind: "guest" };
				if (room.userId) {
					const [info] = await db
						.select({
							gender: bambiProfile.gender,
							joinedAt: user.createdAt,
							name: user.name,
							role: bambiProfile.role,
						})
						.from(user)
						.leftJoin(bambiProfile, eq(bambiProfile.userId, user.id))
						.where(eq(user.id, room.userId))
						.limit(1);
					const [org] =
						info?.role === "employer"
							? await db
									.select({ name: organization.name })
									.from(member)
									.innerJoin(
										organization,
										eq(member.organizationId, organization.id)
									)
									.where(
										and(
											eq(member.userId, room.userId),
											eq(member.status, "active")
										)
									)
									.limit(1)
							: [];
					inquirer = {
						gender: info?.gender ?? null,
						joinedAt: info?.joinedAt ?? room.createdAt,
						kind: "member",
						name: info?.name ?? "회원",
						organizationName: org?.name ?? null,
						role: info?.role ?? "job_seeker",
					};
				} else {
					inquirer = { firstContactAt: room.createdAt, kind: "guest" };
				}
				return {
					inquirer,
					messages,
					room: { id: room.id, isBlocked: room.isBlocked },
					unreadCount: await countUnread(
						room.id,
						"inquirer",
						room.adminLastReadAt
					),
				};
			}),

		sendMessage: adminProcedure
			.input(
				z.object({
					body: z.string().trim().min(1).max(SUPPORT_CHAT_BODY_MAX),
					roomId: z.string().uuid(),
				})
			)
			.handler(async ({ context, input }) => {
				const [room] = await db
					.select()
					.from(supportChatRoom)
					.where(eq(supportChatRoom.id, input.roomId))
					.limit(1);
				if (!room) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				const prevUnreadCount = await countUnread(
					room.id,
					"admin",
					room.userLastReadAt
				);
				const [inserted] = await db
					.insert(supportChatMessage)
					.values({
						body: input.body,
						roomId: room.id,
						senderType: "admin",
						senderUserId: context.session.user.id,
					})
					.returning({
						createdAt: supportChatMessage.createdAt,
						id: supportChatMessage.id,
					});
				if (!inserted) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "메시지를 보내지 못했어요.",
					});
				}
				await db
					.update(supportChatRoom)
					.set({ lastMessageAt: inserted.createdAt })
					.where(eq(supportChatRoom.id, room.id));
				const target = resolveSupportChatNotificationTarget({
					prevUnreadCount,
					roomUserId: room.userId,
					senderType: "admin",
				});
				if (target) {
					await notifyBambiNotification({
						actorUserId: context.session.user.id,
						metadata: { action: "replied" },
						targetId: room.id,
						targetType: "support_chat",
						...target,
					});
				}
				return { id: inserted.id };
			}),

		markRead: adminProcedure
			.input(z.object({ roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				await db
					.update(supportChatRoom)
					.set({ adminLastReadAt: new Date() })
					.where(eq(supportChatRoom.id, input.roomId));
				return { ok: true };
			}),

		setBlocked: adminProcedure
			.input(z.object({ isBlocked: z.boolean(), roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				await db
					.update(supportChatRoom)
					.set({ isBlocked: input.isBlocked })
					.where(eq(supportChatRoom.id, input.roomId));
				return { ok: true };
			}),
	},
};
