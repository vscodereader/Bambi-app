import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray, or } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { Context } from "@/context";
import { resetRateLimits } from "@/services/rate-limit";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { chatsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/chats"),
]);

const { organization, user } = authSchema;
const {
	bambiNotification,
	bambiProfile,
	chatAttachment,
	chatMessage,
	chatMessageReadReceipt,
	chatResponseActivity,
	chatRoom,
	contactRevealConsent,
	interviewSchedule,
	jobPerformanceEvent,
	jobPost,
	report,
	userBlock,
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

// 발신 계열에 계정 단위 한도가 걸려 있고 카운터가 모듈 전역이라, 한 테스트의 호출이
// 다음 테스트로 샌다(같은 픽스처 사용자를 여러 번 쓰면 엉뚱하게 429로 깨진다).
beforeEach(resetRateLimits);

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
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
		{
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: jobSeekerUserId,
		},
		{
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
		.delete(report)
		.where(
			or(
				eq(report.targetId, fixture.chatRoomId),
				inArray(report.reporterUserId, fixture.userIds)
			)
		);
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

// 서버가 id를 만들 때 쓰는 형식(UUIDv7 — 버전 자리가 7).
const UUID_V7_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

	it("atomically creates separate attachment and text messages without duplicating retries", async () => {
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
			const messageId = randomUUID();
			const textMessageId = randomUUID();
			const uploadIntent = await createAttachmentUpload({
				byteSize: 256_000,
				chatRoomId: fixture.chatRoomId,
				fileName: "shift-photo.jpg",
				mimeType: "image/jpeg",
			});
			const input = {
				body: "사진 설명입니다.",
				byteSize: uploadIntent.byteSize,
				chatRoomId: fixture.chatRoomId,
				fileName: uploadIntent.fileName,
				messageId,
				mimeType: uploadIntent.mimeType,
				storageKey: uploadIntent.storageKey,
				textMessageId,
			};

			const first = await sendMediaMessage(input);
			const retried = await sendMediaMessage(input);
			const savedMessages = await db
				.select()
				.from(chatMessage)
				.where(inArray(chatMessage.id, [messageId, textMessageId]));
			const savedAttachments = await db
				.select()
				.from(chatAttachment)
				.where(eq(chatAttachment.messageId, messageId));

			expect(first.message.id).toBe(messageId);
			expect(first.textMessage).toMatchObject({
				body: "사진 설명입니다.",
				id: textMessageId,
			});
			expect(retried.message.id).toBe(messageId);
			expect(retried.textMessage?.id).toBe(textMessageId);
			expect(savedMessages).toHaveLength(2);
			expect(first.message.createdAt.getTime()).toBeLessThan(
				first.textMessage?.createdAt.getTime() ?? 0
			);
			expect(savedAttachments).toHaveLength(1);
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

	it("records an interview status action as the seeker's response", async () => {
		const fixture = await createChatFixture();

		try {
			const proposeInterview = createProcedureClient(
				chatsRouter.proposeInterview,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "chats", "proposeInterview"],
				}
			);
			const setInterviewStatus = createProcedureClient(
				chatsRouter.setInterviewStatus,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "setInterviewStatus"],
				}
			);
			const schedule = await proposeInterview({
				chatRoomId: fixture.chatRoomId,
				scheduledAt: futureScheduledAt(),
			});
			await setInterviewStatus({
				interviewScheduleId: schedule.id,
				status: "confirmed",
			});

			const activities = await db
				.select()
				.from(chatResponseActivity)
				.where(eq(chatResponseActivity.chatRoomId, fixture.chatRoomId))
				.orderBy(chatResponseActivity.id);
			expect(activities).toHaveLength(2);
			expect(activities[1]).toMatchObject({
				actorUserId: fixture.jobSeekerUserId,
			});
			expect(activities[1]?.responseSeconds).toBeGreaterThanOrEqual(0);
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
			const [activity] = await db
				.select()
				.from(chatResponseActivity)
				.where(eq(chatResponseActivity.chatRoomId, fixture.chatRoomId));
			expect(activity).toMatchObject({
				actorUserId: fixture.employerUserId,
				responseSeconds: null,
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
	it("상대가 보낸 안 읽은 메시지를 개별 합산하고 markRead만큼 차감한다", async () => {
		const fixture = await createChatFixture();
		const secondJobPostId = randomUUID();
		const secondChatRoomId = randomUUID();

		try {
			await db.insert(jobPost).values({
				createdByUserId: fixture.employerUserId,
				description: "두 번째 채팅방 집계 테스트입니다.",
				id: secondJobPostId,
				industryCategory: "BAR",
				organizationId: fixture.organizationId,
				payAmount: 190_000,
				payUnit: "일급",
				region: "서울 강남구",
				status: "published",
				title: "두 번째 테스트 공고",
				workSchedule: "21:00-03:00",
			});
			await db.insert(chatRoom).values({
				employerUserId: fixture.employerUserId,
				id: secondChatRoomId,
				jobPostId: secondJobPostId,
				jobSeekerUserId: fixture.jobSeekerUserId,
				organizationId: fixture.organizationId,
			});

			// markRead가 "이 메시지까지"라는 기준선으로 동작하므로 시각이 겹치면 안 된다
			// (한 INSERT의 defaultNow는 트랜잭션 시각이라 모두 같아진다).
			const baseTime = Date.now();
			const messages = await db
				.insert(chatMessage)
				.values(
					["첫 메시지", "두 번째 메시지", "세 번째 메시지"].map(
						(body, index) => ({
							body,
							chatRoomId: fixture.chatRoomId,
							createdAt: new Date(baseTime + index * 1000),
							senderUserId: fixture.employerUserId,
						})
					)
				)
				.returning();

			const [firstMessage, ...remainingMessages] = messages;
			if (!(firstMessage && remainingMessages.length === 2)) {
				throw new Error("채팅 메시지 픽스처를 만들지 못했습니다.");
			}
			const secondRoomMessages = await db
				.insert(chatMessage)
				.values(
					["다른 방 첫 메시지", "다른 방 두 번째 메시지"].map(
						(body, index) => ({
							body,
							chatRoomId: secondChatRoomId,
							createdAt: new Date(baseTime + index * 1000),
							senderUserId: fixture.employerUserId,
						})
					)
				)
				.returning();
			if (secondRoomMessages.length !== 2) {
				throw new Error("두 번째 채팅방 메시지 픽스처를 만들지 못했습니다.");
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

			expect(await unreadStateForSeeker({})).toEqual({
				unreadMessageCount: 5,
			});
			// 보낸 본인의 메시지는 안 읽음으로 잡히지 않는다.
			expect(await unreadStateForEmployer({})).toEqual({
				unreadMessageCount: 0,
			});

			const markRead = createProcedureClient(chatsRouter.markRead, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "chats", "markRead"],
			});
			// 방에 들어온 순간 서버가 현재 저장된 이 방의 수신 메시지를 모두 읽음 처리한다.
			const firstMarkRead = await markRead({
				chatRoomId: fixture.chatRoomId,
				upToMessageId: firstMessage.id,
			});

			expect(await unreadStateForSeeker({})).toEqual({
				unreadMessageCount: 2,
			});
			// 화면 핀은 방별 수가 아니라 이 총합을 그린다 — 응답값과 unreadState가
			// 갈라지면 읽음 직후 핀이 틀린 숫자로 굳는다.
			expect(firstMarkRead.totalUnreadMessageCount).toBe(2);

			const lastMessage = remainingMessages.at(-1);
			const lastSecondRoomMessage = secondRoomMessages.at(-1);
			if (!(lastMessage && lastSecondRoomMessage)) {
				throw new Error("채팅 메시지 픽스처를 만들지 못했습니다.");
			}
			expect(firstMarkRead.latestUnreadMessageId).toBeNull();
			expect(firstMarkRead.unreadCount).toBe(0);

			// 같은 방을 다시 읽어도 멱등이며 다른 방의 안 읽음 수에는 영향을 주지 않는다.
			const lastRoomMarkRead = await markRead({
				chatRoomId: fixture.chatRoomId,
				upToMessageId: lastMessage.id,
			});
			expect(lastRoomMarkRead.latestUnreadMessageId).toBeNull();
			expect(lastRoomMarkRead.unreadCount).toBe(0);
			expect(await unreadStateForSeeker({})).toEqual({
				unreadMessageCount: 2,
			});
			await markRead({
				chatRoomId: secondChatRoomId,
				upToMessageId: lastSecondRoomMessage.id,
			});
			expect(await unreadStateForSeeker({})).toEqual({
				unreadMessageCount: 0,
			});
		} finally {
			await db
				.delete(chatMessageReadReceipt)
				.where(eq(chatMessageReadReceipt.chatRoomId, secondChatRoomId));
			await db
				.delete(chatMessage)
				.where(eq(chatMessage.chatRoomId, secondChatRoomId));
			await db.delete(chatRoom).where(eq(chatRoom.id, secondChatRoomId));
			await db.delete(jobPost).where(eq(jobPost.id, secondJobPostId));
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

const setProfilePhone = async (
	userId: string,
	phoneNumber: string | null,
	isPhoneVerified: boolean
): Promise<void> => {
	await db
		.update(bambiProfile)
		.set({ isPhoneVerified, phoneNumber })
		.where(eq(bambiProfile.userId, userId));
};

const seedMessage = async (
	fixture: ChatFixture,
	senderUserId: string
): Promise<{ id: string }> => {
	const [created] = await db
		.insert(chatMessage)
		.values({
			body: "안녕하세요.",
			chatRoomId: fixture.chatRoomId,
			senderUserId,
		})
		.returning({ id: chatMessage.id });

	if (!created) {
		throw new Error("채팅 메시지 픽스처를 만들지 못했습니다.");
	}

	return created;
};

const requestReveal = (userId: string) =>
	createProcedureClient(chatsRouter.requestContactReveal, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "requestContactReveal"],
	});

const respondReveal = (userId: string) =>
	createProcedureClient(chatsRouter.respondContactReveal, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "respondContactReveal"],
	});

const listMineFor = (userId: string) =>
	createProcedureClient(chatsRouter.listMine, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "listMine"],
	});

const getByIdFor = (userId: string) =>
	createProcedureClient(chatsRouter.getById, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "getById"],
	});

const markReadFor = (userId: string) =>
	createProcedureClient(chatsRouter.markRead, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "markRead"],
	});

const unreadStateFor = (userId: string) =>
	createProcedureClient(chatsRouter.unreadState, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "unreadState"],
	});

const sendMessageFor = (userId: string) =>
	createProcedureClient(chatsRouter.sendMessage, {
		context: createContextForUser(userId),
		path: ["bambi", "chats", "sendMessage"],
	});

describe("bambi chats router 응답시간 activity", () => {
	it("도입 후 액션만 이어 보고 연속 발신 묶음의 첫 시각부터 첫 답장을 한 번 센다", async () => {
		const fixture = await createChatFixture();

		try {
			// migration 전 이력과 같은 직접 메시지는 activity가 없어 첫 응답 기준이 되지 않는다.
			await seedMessage(fixture, fixture.employerUserId);
			const seekerSend = sendMessageFor(fixture.jobSeekerUserId);
			const employerSend = sendMessageFor(fixture.employerUserId);
			await seekerSend({
				body: "첫 문의",
				chatRoomId: fixture.chatRoomId,
			});
			await seekerSend({
				body: "추가 문의",
				chatRoomId: fixture.chatRoomId,
			});
			await employerSend({
				body: "첫 답변",
				chatRoomId: fixture.chatRoomId,
			});

			const activities = await db
				.select()
				.from(chatResponseActivity)
				.where(eq(chatResponseActivity.chatRoomId, fixture.chatRoomId))
				.orderBy(chatResponseActivity.id);
			expect(activities).toHaveLength(3);
			expect(activities[0]?.responseSeconds).toBeNull();
			expect(activities[1]?.responseSeconds).toBeNull();
			expect(activities[2]?.promptStartedAt).toEqual(activities[0]?.occurredAt);
			expect(activities[2]?.responseSeconds).toBeGreaterThanOrEqual(0);

			const [room] = await listMineFor(fixture.jobSeekerUserId)({});
			expect(room?.counterpartResponseBucket).toBe("ten_minutes");

			await db
				.delete(chatResponseActivity)
				.where(eq(chatResponseActivity.chatRoomId, fixture.chatRoomId));
			const oldResponseAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
			await db.insert(chatResponseActivity).values({
				activityKey: `test-old-response:${randomUUID()}`,
				actorUserId: fixture.employerUserId,
				chatRoomId: fixture.chatRoomId,
				occurredAt: oldResponseAt,
				promptStartedAt: new Date(oldResponseAt.getTime() - 60_000),
				responseSeconds: 60,
			});
			const [withoutExpiredAverage] = await listMineFor(
				fixture.jobSeekerUserId
			)({});
			expect(withoutExpiredAverage?.counterpartResponseBucket).toBeNull();
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router 신고된 방 양방향 제한", () => {
	it("신고가 활성 상태면 양쪽 목록·열람·발신·안 읽음에서 숨기고 기각 시 복구한다", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);
			const [createdReport] = await db
				.insert(report)
				.values({
					reason: "외부 연락처 유도",
					reporterUserId: fixture.jobSeekerUserId,
					status: "open",
					targetId: fixture.chatRoomId,
					targetType: "chat_room",
				})
				.returning({ id: report.id });

			if (!createdReport) {
				throw new Error("신고 픽스처를 만들지 못했습니다.");
			}

			for (const userId of [fixture.jobSeekerUserId, fixture.employerUserId]) {
				expect(
					(await listMineFor(userId)({})).some(
						(room) => room.id === fixture.chatRoomId
					)
				).toBe(false);
				await expectOrpcCode(
					getByIdFor(userId)({ id: fixture.chatRoomId }),
					"FORBIDDEN"
				);
			}

			await expectOrpcCode(
				sendMessageFor(fixture.employerUserId)({
					body: "신고 뒤에도 보내면 안 됩니다.",
					chatRoomId: fixture.chatRoomId,
				}),
				"FORBIDDEN"
			);
			expect(await unreadStateFor(fixture.jobSeekerUserId)({})).toEqual({
				unreadMessageCount: 0,
			});

			await db
				.update(report)
				.set({ status: "resolved" })
				.where(eq(report.id, createdReport.id));
			expect(
				(await listMineFor(fixture.employerUserId)({})).some(
					(room) => room.id === fixture.chatRoomId
				)
			).toBe(false);

			await db
				.update(report)
				.set({ status: "dismissed" })
				.where(eq(report.id, createdReport.id));
			expect(
				(await listMineFor(fixture.employerUserId)({})).some(
					(room) => room.id === fixture.chatRoomId
				)
			).toBe(true);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("메시지 신고도 부모 채팅방을 양쪽에서 숨긴다", async () => {
		const fixture = await createChatFixture();

		try {
			const message = await seedMessage(fixture, fixture.employerUserId);
			await db.insert(report).values({
				reason: "외부 연락처 유도",
				reporterUserId: fixture.jobSeekerUserId,
				status: "open",
				targetId: message.id,
				targetType: "chat_message",
			});

			for (const userId of [fixture.jobSeekerUserId, fixture.employerUserId]) {
				expect(
					(await listMineFor(userId)({})).some(
						(room) => room.id === fixture.chatRoomId
					)
				).toBe(false);
			}
			await expectOrpcCode(
				sendMessageFor(fixture.employerUserId)({
					body: "메시지 신고 뒤에도 보내면 안 됩니다.",
					chatRoomId: fixture.chatRoomId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router contact reveal request", () => {
	it("rejects a contact reveal request from the job seeker", async () => {
		const fixture = await createChatFixture();

		try {
			await expectOrpcCode(
				requestReveal(fixture.jobSeekerUserId)({
					chatRoomId: fixture.chatRoomId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("creates a pending contact_request when the employer requests", async () => {
		const fixture = await createChatFixture();

		try {
			const message = await requestReveal(fixture.employerUserId)({
				chatRoomId: fixture.chatRoomId,
			});

			expect(message).toMatchObject({
				chatRoomId: fixture.chatRoomId,
				kind: "contact_request",
				senderUserId: fixture.employerUserId,
			});
			expect(message.metadata).toMatchObject({
				requesterUserId: fixture.employerUserId,
				status: "pending",
				targetUserId: fixture.jobSeekerUserId,
			});
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("rejects a duplicate request while one is still pending", async () => {
		const fixture = await createChatFixture();

		try {
			await requestReveal(fixture.employerUserId)({
				chatRoomId: fixture.chatRoomId,
			});
			await expectOrpcCode(
				requestReveal(fixture.employerUserId)({
					chatRoomId: fixture.chatRoomId,
				}),
				"CONFLICT"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("rejects a request when the employer is not phone-verified", async () => {
		const fixture = await createChatFixture();

		try {
			await setProfilePhone(fixture.employerUserId, null, false);
			await expectOrpcCode(
				requestReveal(fixture.employerUserId)({
					chatRoomId: fixture.chatRoomId,
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router contact reveal response", () => {
	const createPendingRequest = async (
		fixture: ChatFixture
	): Promise<string> => {
		const message = await requestReveal(fixture.employerUserId)({
			chatRoomId: fixture.chatRoomId,
		});

		return message.id;
	};

	it("rejects a response from the employer (not the target)", async () => {
		const fixture = await createChatFixture();

		try {
			const messageId = await createPendingRequest(fixture);

			await expectOrpcCode(
				respondReveal(fixture.employerUserId)({
					decision: "reveal",
					messageId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("marks the request revealed when the seeker reveals", async () => {
		const fixture = await createChatFixture();

		try {
			const messageId = await createPendingRequest(fixture);
			const updated = await respondReveal(fixture.jobSeekerUserId)({
				decision: "reveal",
				messageId,
			});

			expect(updated.metadata).toMatchObject({ status: "revealed" });
			const activities = await db
				.select()
				.from(chatResponseActivity)
				.where(eq(chatResponseActivity.chatRoomId, fixture.chatRoomId))
				.orderBy(chatResponseActivity.id);
			expect(activities).toHaveLength(2);
			expect(activities[0]?.actorUserId).toBe(fixture.employerUserId);
			expect(activities[1]?.actorUserId).toBe(fixture.jobSeekerUserId);
			expect(activities[1]?.responseSeconds).toBeGreaterThanOrEqual(0);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("marks the request declined when the seeker declines", async () => {
		const fixture = await createChatFixture();

		try {
			const messageId = await createPendingRequest(fixture);
			const updated = await respondReveal(fixture.jobSeekerUserId)({
				decision: "decline",
				messageId,
			});

			expect(updated.metadata).toMatchObject({ status: "declined" });
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

// 목록의 isBlocked는 방 컬럼이 아니라 "이 방에 들어갈 수 있는가"다. 방 컬럼만 보면
// 화면은 열리는 방처럼 그려놓고 누르면 진입 가드가 FORBIDDEN을 던지는 상태가 남는다.
describe("bambi chats listMine 차단 판정", () => {
	const blockedFlagFor = async (
		fixture: ChatFixture,
		viewerUserId: string
	): Promise<boolean | undefined> => {
		const rooms = await listMineFor(viewerUserId)({});

		return rooms.find((room) => room.id === fixture.chatRoomId)?.isBlocked;
	};

	it("flags the room when the viewer blocked the counterpart", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);
			await db.insert(userBlock).values({
				blockedUserId: fixture.employerUserId,
				blockerUserId: fixture.jobSeekerUserId,
			});

			expect(await blockedFlagFor(fixture, fixture.jobSeekerUserId)).toBe(true);
		} finally {
			await db
				.delete(userBlock)
				.where(inArray(userBlock.blockerUserId, [fixture.jobSeekerUserId]));
			await cleanupChatFixture(fixture);
		}
	});

	// 이 방향이 클라이언트에서는 절대 알 수 없는 쪽이다. 서버가 실어주지 않으면
	// "상대가 나를 차단한" 방은 계속 멀쩡해 보이고 눌러야만 에러가 뜬다.
	it("flags the room when the counterpart blocked the viewer", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);
			await db.insert(userBlock).values({
				blockedUserId: fixture.jobSeekerUserId,
				blockerUserId: fixture.employerUserId,
			});

			expect(await blockedFlagFor(fixture, fixture.jobSeekerUserId)).toBe(true);
		} finally {
			await db
				.delete(userBlock)
				.where(inArray(userBlock.blockerUserId, [fixture.employerUserId]));
			await cleanupChatFixture(fixture);
		}
	});

	it("leaves the room open when neither side blocked", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);

			expect(await blockedFlagFor(fixture, fixture.jobSeekerUserId)).toBe(
				false
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

// 나가기 = 방이 양쪽 모두에게서 사라진다(되살아나지 않는다).
describe("bambi chats router 나가기", () => {
	const hasRoom = (rooms: Array<{ id: string }>, chatRoomId: string): boolean =>
		rooms.some((room) => room.id === chatRoomId);

	const deleteRoomFor = (userId: string) =>
		createProcedureClient(chatsRouter.deleteChatRoom, {
			context: createContextForUser(userId),
			path: ["bambi", "chats", "deleteChatRoom"],
		});

	const sendMessageFor = (userId: string) =>
		createProcedureClient(chatsRouter.sendMessage, {
			context: createContextForUser(userId),
			path: ["bambi", "chats", "sendMessage"],
		});

	it("한쪽이 나가면 양쪽 목록에서 함께 사라진다", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);

			expect(
				await deleteRoomFor(fixture.jobSeekerUserId)({
					chatRoomId: fixture.chatRoomId,
				})
			).toEqual({ ok: true });

			const seekerRooms = await listMineFor(fixture.jobSeekerUserId)({});
			const employerRooms = await listMineFor(fixture.employerUserId)({});

			expect(hasRoom(seekerRooms, fixture.chatRoomId)).toBe(false);
			expect(hasRoom(employerRooms, fixture.chatRoomId)).toBe(false);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	// 남은 쪽에게도 없는 방이다 — 열람·발신·읽음이 모두 NOT_FOUND여야 한다.
	it("상대가 나간 방은 열람·발신 모두 NOT_FOUND다", async () => {
		const fixture = await createChatFixture();

		try {
			const seeded = await seedMessage(fixture, fixture.employerUserId);

			await deleteRoomFor(fixture.jobSeekerUserId)({
				chatRoomId: fixture.chatRoomId,
			});

			await expectOrpcCode(
				getByIdFor(fixture.employerUserId)({ id: fixture.chatRoomId }),
				"NOT_FOUND"
			);
			await expectOrpcCode(
				sendMessageFor(fixture.employerUserId)({
					body: "새 메시지입니다.",
					chatRoomId: fixture.chatRoomId,
				}),
				"NOT_FOUND"
			);
			await expectOrpcCode(
				markReadFor(fixture.employerUserId)({
					chatRoomId: fixture.chatRoomId,
					upToMessageId: seeded.id,
				}),
				"NOT_FOUND"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	// 유령 핀 방지 — 목록에 없는 방의 안 읽음이 총합에 남으면 끌 방법이 없다.
	it("나간 방의 안 읽음은 총합에서 빠진다", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);

			await deleteRoomFor(fixture.employerUserId)({
				chatRoomId: fixture.chatRoomId,
			});

			const { unreadMessageCount } = await unreadStateFor(
				fixture.jobSeekerUserId
			)({});

			expect(unreadMessageCount).toBe(0);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("rejects deleteChatRoom from an outsider", async () => {
		const fixture = await createChatFixture();

		try {
			const deleteChatRoom = createProcedureClient(chatsRouter.deleteChatRoom, {
				context: createContextForUser(fixture.outsiderUserId),
				path: ["bambi", "chats", "deleteChatRoom"],
			});

			await expectOrpcCode(
				deleteChatRoom({ chatRoomId: fixture.chatRoomId }),
				"NOT_FOUND"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router employer verified phone", () => {
	it("returns the employer verified phone in getById, and null when unverified", async () => {
		const fixture = await createChatFixture();

		try {
			await setProfilePhone(fixture.employerUserId, "010-1234-5678", true);

			const verified = await getByIdFor(fixture.jobSeekerUserId)({
				id: fixture.chatRoomId,
			});
			expect(verified.employerVerifiedPhone).toBe("010-1234-5678");

			await setProfilePhone(fixture.employerUserId, "010-1234-5678", false);
			const unverified = await getByIdFor(fixture.jobSeekerUserId)({
				id: fixture.chatRoomId,
			});
			expect(unverified.employerVerifiedPhone).toBeNull();
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("injects revealedPhone for the employer after reveal, but never for the seeker", async () => {
		const fixture = await createChatFixture();

		try {
			await setProfilePhone(fixture.jobSeekerUserId, "010-9999-0000", true);

			const requestMessage = await requestReveal(fixture.employerUserId)({
				chatRoomId: fixture.chatRoomId,
			});
			await respondReveal(fixture.jobSeekerUserId)({
				decision: "reveal",
				messageId: requestMessage.id,
			});

			const employerView = await getByIdFor(fixture.employerUserId)({
				id: fixture.chatRoomId,
			});
			const seekerView = await getByIdFor(fixture.jobSeekerUserId)({
				id: fixture.chatRoomId,
			});
			const employerMessage = employerView.messages.find(
				(message) => message.id === requestMessage.id
			);
			const seekerMessage = seekerView.messages.find(
				(message) => message.id === requestMessage.id
			);

			expect(employerMessage?.revealedPhone).toBe("010-9999-0000");
			expect(seekerMessage?.revealedPhone).toBeNull();
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

// 나간 방은 되살아나지 않는다 — 공고에서 다시 문의하면 새 방을 판다(이전 대화는
// 이어지지 않고, 옛 방은 운영자 이력으로만 남는다).
describe("bambi chats router 재문의 = 새 방", () => {
	const startFor = (userId: string) =>
		createProcedureClient(chatsRouter.startFromJobPost, {
			context: createContextForUser(userId),
			path: ["bambi", "chats", "startFromJobPost"],
		});

	const deleteRoomFor = (userId: string) =>
		createProcedureClient(chatsRouter.deleteChatRoom, {
			context: createContextForUser(userId),
			path: ["bambi", "chats", "deleteChatRoom"],
		});

	it("업주가 나간 방으로 재문의하면 새 방이 생긴다", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.jobSeekerUserId);
			await deleteRoomFor(fixture.employerUserId)({
				chatRoomId: fixture.chatRoomId,
			});

			const created = await startFor(fixture.jobSeekerUserId)({
				jobPostId: fixture.jobPostId,
			});

			expect(created.id).not.toBe(fixture.chatRoomId);
			expect(created.employerDeletedAt).toBeNull();
			expect(created.seekerDeletedAt).toBeNull();

			// 옛 방은 나간 채로 남고(운영자 이력), 새 방은 아직 메시지가 없어 목록에
			// 뜨지 않는다.
			const [oldRoom] = await db
				.select()
				.from(chatRoom)
				.where(eq(chatRoom.id, fixture.chatRoomId))
				.limit(1);

			expect(oldRoom?.employerDeletedAt).not.toBeNull();
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("구직자가 나간 방으로 재문의해도 새 방이 생긴다", async () => {
		const fixture = await createChatFixture();

		try {
			await seedMessage(fixture, fixture.employerUserId);
			await deleteRoomFor(fixture.jobSeekerUserId)({
				chatRoomId: fixture.chatRoomId,
			});

			const created = await startFor(fixture.jobSeekerUserId)({
				jobPostId: fixture.jobPostId,
			});

			expect(created.id).not.toBe(fixture.chatRoomId);
			expect(created.seekerDeletedAt).toBeNull();
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("아무도 나가지 않은 방은 그대로 재사용한다", async () => {
		const fixture = await createChatFixture();

		try {
			const reused = await startFor(fixture.jobSeekerUserId)({
				jobPostId: fixture.jobPostId,
			});

			expect(reused.id).toBe(fixture.chatRoomId);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router 메시지 멱등성", () => {
	const sendFor = (userId: string) =>
		createProcedureClient(chatsRouter.sendMessage, {
			context: createContextForUser(userId),
			path: ["bambi", "chats", "sendMessage"],
		});

	// 네트워크 재시도·더블클릭이 같은 id로 다시 와도 방에 메시지가 두 번 남으면 안 된다.
	it("같은 messageId 재전송은 원래 행을 돌려주고 부수효과를 다시 돌리지 않는다", async () => {
		const fixture = await createChatFixture();
		const messageId = randomUUID();

		try {
			const first = await sendFor(fixture.jobSeekerUserId)({
				body: "안녕하세요.",
				chatRoomId: fixture.chatRoomId,
				messageId,
			});
			const retried = await sendFor(fixture.jobSeekerUserId)({
				body: "재시도라 무시돼야 하는 본문",
				chatRoomId: fixture.chatRoomId,
				messageId,
			});

			expect(retried.id).toBe(first.id);
			expect(retried.body).toBe("안녕하세요.");

			const rows = await db
				.select()
				.from(chatMessage)
				.where(eq(chatMessage.chatRoomId, fixture.chatRoomId));
			const notifications = await db
				.select()
				.from(bambiNotification)
				.where(eq(bambiNotification.chatRoomId, fixture.chatRoomId));

			expect(rows).toHaveLength(1);
			// 알림도 한 번만 — 재전송마다 뱃지가 늘면 핀이 실제 메시지 수와 어긋난다.
			expect(notifications).toHaveLength(1);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("남이 쓴 메시지 id를 재사용하면 CONFLICT로 막는다", async () => {
		const fixture = await createChatFixture();
		const messageId = randomUUID();

		try {
			await sendFor(fixture.jobSeekerUserId)({
				body: "구직자 메시지",
				chatRoomId: fixture.chatRoomId,
				messageId,
			});

			await expectOrpcCode(
				sendFor(fixture.employerUserId)({
					body: "같은 id를 노린 업주 메시지",
					chatRoomId: fixture.chatRoomId,
					messageId,
				}),
				"CONFLICT"
			);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("messageId를 안 보내는 옛 클라이언트도 그대로 보낸다", async () => {
		const fixture = await createChatFixture();

		try {
			const message = await sendFor(fixture.jobSeekerUserId)({
				body: "id 없는 전송",
				chatRoomId: fixture.chatRoomId,
			});

			expect(message.id).toMatch(UUID_V7_PATTERN);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});

describe("bambi chats router 메시지 커서 페이지네이션", () => {
	// createdAt을 명시해 총순서를 고정한다(defaultNow는 같은 ms로 겹칠 수 있다).
	const seedOrderedMessages = async (
		fixture: ChatFixture,
		count: number
	): Promise<string[]> => {
		const ids = Array.from({ length: count }, () => randomUUID());

		await db.insert(chatMessage).values(
			ids.map((id, index) => ({
				body: `메시지 ${index}`,
				chatRoomId: fixture.chatRoomId,
				createdAt: new Date(Date.UTC(2026, 7, 6, 0, 0, index)),
				id,
				senderUserId: fixture.employerUserId,
			}))
		);

		return ids;
	};

	it("커서로 이전 구간을 이어 읽고, 끝에서 nextCursor가 null이 된다", async () => {
		const fixture = await createChatFixture();

		try {
			const ids = await seedOrderedMessages(fixture, 3);
			const firstPage = await getByIdFor(fixture.jobSeekerUserId)({
				id: fixture.chatRoomId,
				limit: 2,
			});

			// 최신 2건이 오래된 → 최신 순으로 온다.
			expect(firstPage.messages.map((message) => message.id)).toEqual([
				ids[1],
				ids[2],
			]);
			expect(firstPage.hasMoreMessages).toBe(true);
			expect(firstPage.nextCursor).toMatchObject({ id: ids[1] });

			const secondPage = await getByIdFor(fixture.jobSeekerUserId)({
				cursor: firstPage.nextCursor ?? undefined,
				id: fixture.chatRoomId,
				limit: 2,
			});

			// 커서 이전 구간만. 경계 메시지가 겹쳐 오지 않아야 한다.
			expect(secondPage.messages.map((message) => message.id)).toEqual([
				ids[0],
			]);
			expect(secondPage.hasMoreMessages).toBe(false);
			expect(secondPage.nextCursor).toBeNull();
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("예전 상한(500건)을 넘는 이력도 커서로 계속 거슬러 올라간다", async () => {
		const fixture = await createChatFixture();

		try {
			const ids = await seedOrderedMessages(fixture, 6);
			const seenIds: string[] = [];
			let cursor: { createdAt: string; id: string } | null = null;

			for (let page = 0; page < 6; page += 1) {
				const result = await getByIdFor(fixture.jobSeekerUserId)({
					cursor: cursor ?? undefined,
					id: fixture.chatRoomId,
					limit: 2,
				});

				seenIds.unshift(...result.messages.map((message) => message.id));
				cursor = result.nextCursor;

				if (!cursor) {
					break;
				}
			}

			expect(seenIds).toEqual(ids);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});
