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
		industryCategory: "라운지",
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
		.where(eq(contactRevealConsent.userId, fixture.jobSeekerUserId));
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
