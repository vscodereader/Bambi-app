import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { organization, user } = authSchema;
const {
	adminModerationAction,
	bambiProfile,
	chatAttachment,
	chatMessage,
	chatMessageReadReceipt,
	chatRoom,
	interviewSchedule,
	jobPost,
	report,
} = bambiSchema;

interface RoomSeed {
	chatRoomId: string;
	label: string;
	messageId: string;
	userId: string;
}

// 고정 키 집합. Record<string, RoomSeed>는 noUncheckedIndexedAccess로 접근 시
// undefined가 섞이므로, 구체 키 타입으로 두어 픽스처 접근을 안전하게 한다.
interface RoomSet {
	blocked: RoomSeed;
	deleted: RoomSeed;
	normal: RoomSeed;
	reportedMessage: RoomSeed;
	reportedRoom: RoomSeed;
}

interface ChatModerationFixture {
	adminUserId: string;
	employerUserId: string;
	jobPostId: string;
	organizationId: string;
	roomIds: string[];
	rooms: RoomSet;
	userIds: string[];
}

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

const makeRoom = (label: string): RoomSeed => ({
	chatRoomId: randomUUID(),
	label,
	messageId: randomUUID(),
	userId: `user_test_seeker_${label}_${randomUUID()}`,
});

const createFixture = async (): Promise<ChatModerationFixture> => {
	const now = new Date();
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const jobPostId = randomUUID();

	const rooms: RoomSet = {
		blocked: makeRoom("blocked"),
		deleted: makeRoom("deleted"),
		normal: makeRoom("normal"),
		reportedMessage: makeRoom("reportedMessage"),
		reportedRoom: makeRoom("reportedRoom"),
	};
	const roomList = Object.values(rooms);

	await db.insert(user).values([
		{ email: makeEmail("admin"), id: adminUserId, name: "운영자" },
		{ email: makeEmail("employer"), id: employerUserId, name: "채용 담당자" },
		...roomList.map((r) => ({
			email: makeEmail(r.label),
			id: r.userId,
			name: `구직자-${r.label}`,
		})),
	]);
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "테스트 조직",
		slug: `test-${randomUUID()}`,
	});
	await db.insert(bambiProfile).values([
		{
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
		...roomList.map((r) => ({
			isPhoneVerified: true,
			role: "job_seeker" as const,
			status: "active" as const,
			userId: r.userId,
		})),
	]);
	await db.insert(jobPost).values({
		createdByUserId: employerUserId,
		description: "채팅 관리 테스트 공고입니다.",
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		region: "서울 강남구",
		status: "published",
		title: "채팅 관리 테스트 공고",
		workSchedule: "20:00-02:00",
	});
	await db.insert(chatRoom).values(
		roomList.map((r) => ({
			employerUserId,
			id: r.chatRoomId,
			isBlocked: r.chatRoomId === rooms.blocked.chatRoomId,
			jobPostId,
			jobSeekerUserId: r.userId,
			organizationId,
			seekerDeletedAt: r.chatRoomId === rooms.deleted.chatRoomId ? now : null,
		}))
	);
	await db.insert(chatMessage).values(
		roomList.map((r) => ({
			body: `메시지 ${r.label}`,
			chatRoomId: r.chatRoomId,
			id: r.messageId,
			senderUserId: r.userId,
		}))
	);
	// 방 직접 신고(chat_room) + 방 안 메시지 신고(chat_message) 두 경로 모두 목록에 떠야 한다.
	await db.insert(report).values([
		{
			reason: "other",
			reporterUserId: employerUserId,
			targetId: rooms.reportedRoom.chatRoomId,
			targetType: "chat_room",
		},
		{
			reason: "other",
			reporterUserId: employerUserId,
			targetId: rooms.reportedMessage.messageId,
			targetType: "chat_message",
		},
	]);

	return {
		adminUserId,
		employerUserId,
		jobPostId,
		organizationId,
		roomIds: roomList.map((r) => r.chatRoomId),
		rooms,
		userIds: [adminUserId, employerUserId, ...roomList.map((r) => r.userId)],
	};
};

const cleanupFixture = async (
	fixture: ChatModerationFixture
): Promise<void> => {
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, fixture.userIds));
	await db
		.delete(report)
		.where(inArray(report.reporterUserId, fixture.userIds));
	await db
		.delete(chatMessageReadReceipt)
		.where(inArray(chatMessageReadReceipt.chatRoomId, fixture.roomIds));
	await db
		.delete(chatAttachment)
		.where(inArray(chatAttachment.chatRoomId, fixture.roomIds));
	await db
		.delete(chatMessage)
		.where(inArray(chatMessage.chatRoomId, fixture.roomIds));
	await db
		.delete(interviewSchedule)
		.where(inArray(interviewSchedule.chatRoomId, fixture.roomIds));
	await db.delete(chatRoom).where(inArray(chatRoom.id, fixture.roomIds));
	await db.delete(jobPost).where(eq(jobPost.id, fixture.jobPostId));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
	await db
		.delete(organization)
		.where(eq(organization.id, fixture.organizationId));
};

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("listChatsForModeration", () => {
	it("삭제·차단·신고된 방만 노출하고 정상 방은 제외한다", async () => {
		const fixture = await createFixture();

		try {
			const listChats = createProcedureClient(
				moderationRouter.listChatsForModeration,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "listChatsForModeration"],
				}
			);

			const rows = await listChats({});
			const byRoomId = new Map(rows.map((row) => [row.chatRoomId, row]));

			// 정상 방은 어떤 플래그도 없으므로 목록에서 제외된다.
			expect(byRoomId.has(fixture.rooms.normal.chatRoomId)).toBe(false);

			const blocked = byRoomId.get(fixture.rooms.blocked.chatRoomId);
			expect(blocked).toBeDefined();
			expect(blocked?.isBlocked).toBe(true);

			const deleted = byRoomId.get(fixture.rooms.deleted.chatRoomId);
			expect(deleted).toBeDefined();
			expect(deleted?.isDeleted).toBe(true);

			const reportedRoom = byRoomId.get(fixture.rooms.reportedRoom.chatRoomId);
			expect(reportedRoom).toBeDefined();
			expect(reportedRoom?.isReported).toBe(true);

			const reportedMessage = byRoomId.get(
				fixture.rooms.reportedMessage.chatRoomId
			);
			expect(reportedMessage).toBeDefined();
			expect(reportedMessage?.isReported).toBe(true);

			// 행 형태: 참여자 이름·공고 제목·최근 메시지 시각이 채워진다.
			expect(blocked).toMatchObject({
				employerUserId: fixture.employerUserId,
				jobPostTitle: "채팅 관리 테스트 공고",
				jobSeekerName: "구직자-blocked",
				jobSeekerUserId: fixture.rooms.blocked.userId,
			});
			expect(blocked?.employerName).toBe("채용 담당자");
			expect(blocked?.lastMessageAt).toBeInstanceOf(Date);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("비운영자는 FORBIDDEN", async () => {
		const fixture = await createFixture();

		try {
			const listChats = createProcedureClient(
				moderationRouter.listChatsForModeration,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "listChatsForModeration"],
				}
			);

			await expectOrpcCode(listChats({}), "FORBIDDEN");
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

describe("hardDeleteChatRoom", () => {
	it("연관 행을 삭제하고 admin_moderation_action 로그를 1건 남긴다", async () => {
		const fixture = await createFixture();
		const targetRoomId = fixture.rooms.reportedRoom.chatRoomId;
		const targetMessageId = fixture.rooms.reportedRoom.messageId;

		try {
			// 하드삭제가 첨부·읽음영수증·면접일정까지 함께 지우는지 확인하기 위해 시드.
			await db.insert(chatAttachment).values({
				byteSize: 512_000,
				category: "image",
				chatRoomId: targetRoomId,
				createdByUserId: fixture.rooms.reportedRoom.userId,
				fileName: "photo.png",
				messageId: targetMessageId,
				mimeType: "image/png",
				storageKey: `bambi-chat/${targetRoomId}/${randomUUID()}.png`,
			});
			await db.insert(chatMessageReadReceipt).values({
				chatRoomId: targetRoomId,
				messageId: targetMessageId,
				readerUserId: fixture.employerUserId,
			});
			await db.insert(interviewSchedule).values({
				chatRoomId: targetRoomId,
				proposedByUserId: fixture.employerUserId,
				scheduledAt: new Date(Date.now() + 86_400_000),
			});

			const hardDeleteChatRoom = createProcedureClient(
				moderationRouter.hardDeleteChatRoom,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "hardDeleteChatRoom"],
				}
			);

			const result = await hardDeleteChatRoom({
				chatRoomId: targetRoomId,
				reason: "정책 위반으로 채팅방을 파기합니다.",
			});

			expect(result).toEqual({ ok: true });

			const remainingRooms = await db
				.select({ id: chatRoom.id })
				.from(chatRoom)
				.where(eq(chatRoom.id, targetRoomId));
			expect(remainingRooms).toHaveLength(0);

			const remainingMessages = await db
				.select({ id: chatMessage.id })
				.from(chatMessage)
				.where(eq(chatMessage.chatRoomId, targetRoomId));
			expect(remainingMessages).toHaveLength(0);

			const logs = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.targetId, targetRoomId));
			expect(logs).toHaveLength(1);
			expect(logs[0]).toMatchObject({
				action: "hard_delete",
				adminUserId: fixture.adminUserId,
				reason: "정책 위반으로 채팅방을 파기합니다.",
				targetType: "chat_room",
			});
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("사유가 2자 미만이면 검증 에러", async () => {
		const fixture = await createFixture();

		try {
			const hardDeleteChatRoom = createProcedureClient(
				moderationRouter.hardDeleteChatRoom,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "hardDeleteChatRoom"],
				}
			);

			await expectOrpcCode(
				hardDeleteChatRoom({
					chatRoomId: fixture.rooms.blocked.chatRoomId,
					reason: "x",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("비운영자는 FORBIDDEN", async () => {
		const fixture = await createFixture();

		try {
			const hardDeleteChatRoom = createProcedureClient(
				moderationRouter.hardDeleteChatRoom,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "hardDeleteChatRoom"],
				}
			);

			await expectOrpcCode(
				hardDeleteChatRoom({
					chatRoomId: fixture.rooms.blocked.chatRoomId,
					reason: "권한 없는 사용자입니다.",
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupFixture(fixture);
		}
	});
});
