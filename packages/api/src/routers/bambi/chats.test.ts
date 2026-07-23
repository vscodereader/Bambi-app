import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { chatsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./chats"),
]);

const { organization, user } = authSchema;
const {
	bambiNotification,
	bambiProfile,
	chatAttachment,
	chatMessage,
	chatMessageReadReceipt,
	chatRoom,
	contactRevealConsent,
	interviewSchedule,
	jobPerformanceEvent,
	jobPost,
} = bambiSchema;

interface ChatFixture {
	chatRoomId: string;
	employerUserId: string;
	jobPostId: string;
	jobSeekerUserId: string;
	organizationId: string;
	outsiderUserId: string;
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

const createChatFixture = async (): Promise<ChatFixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const jobSeekerUserId = `user_test_seeker_${randomUUID()}`;
	const outsiderUserId = `user_test_outsider_${randomUUID()}`;
	const jobPostId = randomUUID();
	const chatRoomId = randomUUID();
	const userRows = [
		{
			email: makeEmail("employer"),
			id: employerUserId,
			name: "채용 담당자",
		},
		{
			email: makeEmail("seeker"),
			id: jobSeekerUserId,
			name: "구직자",
		},
		{
			email: makeEmail("outsider"),
			id: outsiderUserId,
			name: "외부 사용자",
		},
	];

	await db.insert(user).values(userRows);
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "테스트 조직",
		slug: `test-${randomUUID()}`,
	});
	await db.insert(bambiProfile).values([
		{
			displayName: "채용 담당자",
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
		{
			displayName: "구직자",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: jobSeekerUserId,
		},
		{
			displayName: "외부 사용자",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: outsiderUserId,
		},
	]);
	await db.insert(jobPost).values({
		createdByUserId: employerUserId,
		description: "안전한 채팅으로 자료를 확인합니다.",
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		region: "서울 강남구",
		status: "published",
		title: "테스트 공고",
		workSchedule: "20:00-02:00",
	});
	await db.insert(chatRoom).values({
		employerUserId,
		id: chatRoomId,
		jobPostId,
		jobSeekerUserId,
		organizationId,
	});

	return {
		chatRoomId,
		employerUserId,
		jobPostId,
		jobSeekerUserId,
		organizationId,
		outsiderUserId,
		userIds: [employerUserId, jobSeekerUserId, outsiderUserId],
	};
};

const cleanupChatFixture = async (fixture: ChatFixture): Promise<void> => {
	await db
		.delete(chatAttachment)
		.where(eq(chatAttachment.chatRoomId, fixture.chatRoomId));
	await db
		.delete(bambiNotification)
		.where(eq(bambiNotification.chatRoomId, fixture.chatRoomId));
	await db
		.delete(chatMessageReadReceipt)
		.where(eq(chatMessageReadReceipt.chatRoomId, fixture.chatRoomId));
	await db
		.delete(contactRevealConsent)
		.where(
			inArray(contactRevealConsent.userId, [
				fixture.employerUserId,
				fixture.jobSeekerUserId,
			])
		);
	await db
		.delete(jobPerformanceEvent)
		.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId));
	await db
		.delete(interviewSchedule)
		.where(eq(interviewSchedule.chatRoomId, fixture.chatRoomId));
	await db
		.delete(chatMessage)
		.where(eq(chatMessage.chatRoomId, fixture.chatRoomId));
	await db.delete(chatRoom).where(eq(chatRoom.id, fixture.chatRoomId));
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

describe("bambi chats router media", () => {
	it("rejects attachment upload intents when the user is not a room participant", async () => {
		const fixture = await createChatFixture();

		try {
			const createAttachmentUpload = createProcedureClient(
				chatsRouter.createAttachmentUpload,
				{
					context: createContextForUser(fixture.outsiderUserId),
					path: ["bambi", "chats", "createAttachmentUpload"],
				}
			);

			await expectOrpcCode(
				createAttachmentUpload({
					byteSize: 128_000,
					chatRoomId: fixture.chatRoomId,
					fileName: "profile.jpg",
					mimeType: "image/jpeg",
				}),
				"NOT_FOUND"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("rejects unsupported MIME types before issuing an upload intent", async () => {
		const fixture = await createChatFixture();

		try {
			const createAttachmentUpload = createProcedureClient(
				chatsRouter.createAttachmentUpload,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "createAttachmentUpload"],
				}
			);

			await expectOrpcCode(
				createAttachmentUpload({
					byteSize: 128_000,
					chatRoomId: fixture.chatRoomId,
					fileName: "installer.exe",
					mimeType: "application/x-msdownload",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("creates a media message with attachment metadata", async () => {
		const fixture = await createChatFixture();

		try {
			const createAttachmentUpload = createProcedureClient(
				chatsRouter.createAttachmentUpload,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "createAttachmentUpload"],
				}
			);
			const sendMediaMessage = createProcedureClient(
				chatsRouter.sendMediaMessage,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "sendMediaMessage"],
				}
			);

			const uploadIntent = await createAttachmentUpload({
				byteSize: 256_000,
				chatRoomId: fixture.chatRoomId,
				fileName: "shift-photo.jpg",
				mimeType: "image/jpeg",
			});
			const result = await sendMediaMessage({
				byteSize: uploadIntent.byteSize,
				chatRoomId: fixture.chatRoomId,
				fileName: uploadIntent.fileName,
				mimeType: uploadIntent.mimeType,
				storageKey: uploadIntent.storageKey,
			});
			const [savedAttachment] = await db
				.select()
				.from(chatAttachment)
				.where(eq(chatAttachment.messageId, result.message.id))
				.limit(1);

			expect(result.attachment).toMatchObject({
				category: "image",
				chatRoomId: fixture.chatRoomId,
				fileName: "shift-photo.jpg",
				mimeType: "image/jpeg",
				storageKey: uploadIntent.storageKey,
			});
			expect(savedAttachment).toMatchObject({
				byteSize: 256_000,
				category: "image",
				chatRoomId: fixture.chatRoomId,
				createdByUserId: fixture.jobSeekerUserId,
				fileName: "shift-photo.jpg",
				mimeType: "image/jpeg",
				storageKey: uploadIntent.storageKey,
			});
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router interview proposals", () => {
	const futureScheduledAt = () =>
		new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

	it("rejects interview proposals from the job seeker", async () => {
		const fixture = await createChatFixture();

		try {
			const proposeInterview = createProcedureClient(
				chatsRouter.proposeInterview,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "proposeInterview"],
				}
			);

			await expectOrpcCode(
				proposeInterview({
					chatRoomId: fixture.chatRoomId,
					scheduledAt: futureScheduledAt(),
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("allows the employer to propose an interview", async () => {
		const fixture = await createChatFixture();

		try {
			const proposeInterview = createProcedureClient(
				chatsRouter.proposeInterview,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "chats", "proposeInterview"],
				}
			);

			const schedule = await proposeInterview({
				chatRoomId: fixture.chatRoomId,
				scheduledAt: futureScheduledAt(),
			});

			expect(schedule).toMatchObject({
				chatRoomId: fixture.chatRoomId,
				proposedByUserId: fixture.employerUserId,
				status: "proposed",
			});
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router analytics", () => {
	it("records a chat_start event when a seeker starts a chat from a job post", async () => {
		const fixture = await createChatFixture();

		try {
			const startFromJobPost = createProcedureClient(
				chatsRouter.startFromJobPost,
				{
					context: createContextForUser(fixture.outsiderUserId),
					path: ["bambi", "chats", "startFromJobPost"],
				}
			);

			const room = await startFromJobPost({ jobPostId: fixture.jobPostId });
			const [event] = await db
				.select()
				.from(jobPerformanceEvent)
				.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId))
				.limit(1);

			expect(room).toMatchObject({
				jobPostId: fixture.jobPostId,
				jobSeekerUserId: fixture.outsiderUserId,
			});
			expect(event).toMatchObject({
				actorUserId: fixture.outsiderUserId,
				eventType: "chat_start",
				jobPostId: fixture.jobPostId,
				organizationId: fixture.organizationId,
			});
			expect(event?.metadata).toMatchObject({
				chatRoomId: room.id,
			});
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("records a contact_reveal event when contact information is revealed", async () => {
		const fixture = await createChatFixture();
		const scheduleId = randomUUID();

		try {
			await db.insert(interviewSchedule).values({
				chatRoomId: fixture.chatRoomId,
				id: scheduleId,
				proposedByUserId: fixture.employerUserId,
				scheduledAt: new Date(),
				status: "confirmed",
			});

			const revealContact = createProcedureClient(chatsRouter.revealContact, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "chats", "revealContact"],
			});

			await revealContact({
				contactMethod: "phone",
				contactValue: "010-1234-5678",
				interviewScheduleId: scheduleId,
			});

			const [event] = await db
				.select()
				.from(jobPerformanceEvent)
				.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId))
				.limit(1);

			expect(event).toMatchObject({
				actorUserId: fixture.employerUserId,
				eventType: "contact_reveal",
				jobPostId: fixture.jobPostId,
				organizationId: fixture.organizationId,
			});
			expect(event?.metadata).toMatchObject({
				chatRoomId: fixture.chatRoomId,
				contactMethod: "phone",
				interviewScheduleId: scheduleId,
			});
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router unread state", () => {
	it("counts a room as unread when the counterpart sent a message, and clears it after markRead", async () => {
		const fixture = await createChatFixture();

		try {
			const [message] = await db
				.insert(chatMessage)
				.values({
					body: "안녕하세요, 지원 관련해서 연락드려요.",
					chatRoomId: fixture.chatRoomId,
					senderUserId: fixture.employerUserId,
				})
				.returning();

			if (!message) {
				throw new Error("채팅 메시지 픽스처를 만들지 못했습니다.");
			}

			const unreadStateForSeeker = createProcedureClient(
				chatsRouter.unreadState,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "unreadState"],
				}
			);
			const unreadStateForEmployer = createProcedureClient(
				chatsRouter.unreadState,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "chats", "unreadState"],
				}
			);

			// 상대(구인자)가 보낸 미읽음 메시지가 있으므로 구직자 쪽은 방 1개가 잡힌다.
			expect(await unreadStateForSeeker({})).toEqual({ unreadRoomCount: 1 });
			// 보낸 본인(구인자)에게는 안 읽은 방으로 잡히지 않는다.
			expect(await unreadStateForEmployer({})).toEqual({ unreadRoomCount: 0 });

			const markRead = createProcedureClient(chatsRouter.markRead, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "chats", "markRead"],
			});
			await markRead({
				chatRoomId: fixture.chatRoomId,
				messageIds: [message.id],
			});

			// 읽음 처리 후에는 안 읽은 방 수가 0으로 떨어진다.
			expect(await unreadStateForSeeker({})).toEqual({ unreadRoomCount: 0 });
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router contact reveal", () => {
	const confirmInterview = async (fixture: ChatFixture): Promise<string> => {
		const [schedule] = await db
			.insert(interviewSchedule)
			.values({
				chatRoomId: fixture.chatRoomId,
				proposedByUserId: fixture.employerUserId,
				scheduledAt: new Date(Date.now() + 86_400_000),
				status: "confirmed",
			})
			.returning();

		if (!schedule) {
			throw new Error("면접 일정 픽스처를 만들지 못했습니다.");
		}

		return schedule.id;
	};

	const completeSchedule = async (scheduleId: string): Promise<void> => {
		await db
			.update(interviewSchedule)
			.set({ status: "completed" })
			.where(eq(interviewSchedule.id, scheduleId));
	};

	const consent = async (
		scheduleId: string,
		userId: string,
		contactValue: string
	): Promise<void> => {
		await db.insert(contactRevealConsent).values({
			contactMethod: "phone",
			contactValue,
			interviewScheduleId: scheduleId,
			userId,
		});
	};

	it("rejects a contact reveal attempt from the job seeker", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);

			const revealContact = createProcedureClient(chatsRouter.revealContact, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "chats", "revealContact"],
			});

			await expectOrpcCode(
				revealContact({
					contactMethod: "phone",
					contactValue: "010-3333-4444",
					interviewScheduleId: scheduleId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("lets the job seeker view the employer contact once the employer registered it", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await consent(scheduleId, fixture.employerUserId, "010-1111-2222");

			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.viewerIsEmployer).toBe(false);
			expect(result.canViewCounterpart).toBe(true);
			expect(result.counterpartContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-1111-2222" },
			]);
			expect(result.mineContacts).toEqual([]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("shows the employer only their own contact, never a counterpart", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await consent(scheduleId, fixture.employerUserId, "010-1111-2222");

			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.viewerIsEmployer).toBe(true);
			expect(result.canViewCounterpart).toBe(false);
			expect(result.counterpartContacts).toEqual([]);
			expect(result.mineContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-1111-2222" },
			]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("never surfaces a stray job seeker consent row in any view", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await consent(scheduleId, fixture.employerUserId, "010-1111-2222");
			// 과거 구직자 명의로 남아 있을 수 있는 동의 행.
			await consent(scheduleId, fixture.jobSeekerUserId, "010-9999-8888");

			const seekerView = createProcedureClient(chatsRouter.getContactReveal, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "chats", "getContactReveal"],
			});
			const seekerResult = await seekerView({
				chatRoomId: fixture.chatRoomId,
			});
			expect(seekerResult.mineContacts).toEqual([]);
			expect(seekerResult.counterpartContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-1111-2222" },
			]);

			const employerView = createProcedureClient(chatsRouter.getContactReveal, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "chats", "getContactReveal"],
			});
			const employerResult = await employerView({
				chatRoomId: fixture.chatRoomId,
			});
			expect(employerResult.counterpartContacts).toEqual([]);
			expect(employerResult.mineContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-1111-2222" },
			]);

			// 구직자 명의 값은 어느 응답에도 실리지 않는다.
			expect(JSON.stringify([seekerResult, employerResult])).not.toContain(
				"010-9999-8888"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("still lets the employer reveal contact after the interview is completed", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await completeSchedule(scheduleId);

			const revealContact = createProcedureClient(chatsRouter.revealContact, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "chats", "revealContact"],
			});

			const consentRow = await revealContact({
				contactMethod: "phone",
				contactValue: "010-1111-2222",
				interviewScheduleId: scheduleId,
			});

			expect(consentRow?.contactValue).toBe("010-1111-2222");
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("still lets the job seeker view the employer contact after the interview is completed", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await consent(scheduleId, fixture.employerUserId, "010-1111-2222");
			await completeSchedule(scheduleId);

			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.canViewCounterpart).toBe(true);
			expect(result.counterpartContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-1111-2222" },
			]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("hides everything when no interview is confirmed", async () => {
		const fixture = await createChatFixture();

		try {
			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.canViewCounterpart).toBe(false);
			expect(result.confirmedSchedule).toBeNull();
			expect(result.counterpartContacts).toEqual([]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});
