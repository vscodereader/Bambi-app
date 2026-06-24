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
const { bambiProfile, chatAttachment, chatMessage, chatRoom, jobPost, report } =
	bambiSchema;

interface ReportFixture {
	adminUserId: string;
	attachmentId: string;
	chatRoomId: string;
	employerUserId: string;
	jobPostId: string;
	jobSeekerUserId: string;
	messageId: string;
	organizationId: string;
	reportId: string;
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

const createReportFixture = async (): Promise<ReportFixture> => {
	const now = new Date();
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const jobSeekerUserId = `user_test_seeker_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const jobPostId = randomUUID();
	const chatRoomId = randomUUID();
	const messageId = randomUUID();
	const attachmentId = randomUUID();
	const reportId = randomUUID();
	const userRows = [
		{
			email: makeEmail("admin"),
			id: adminUserId,
			name: "운영자",
		},
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
			displayName: "운영자",
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
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
	]);
	await db.insert(jobPost).values({
		createdByUserId: employerUserId,
		description: "신고 테스트용 공고입니다.",
		id: jobPostId,
		industryCategory: "라운지",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		region: "서울 강남구",
		status: "published",
		title: "신고 테스트 공고",
		workSchedule: "20:00-02:00",
	});
	await db.insert(chatRoom).values({
		employerUserId,
		id: chatRoomId,
		jobPostId,
		jobSeekerUserId,
		organizationId,
	});
	await db.insert(chatMessage).values({
		body: "첨부 파일을 보냈습니다.",
		chatRoomId,
		id: messageId,
		senderUserId: jobSeekerUserId,
	});
	await db.insert(chatAttachment).values({
		byteSize: 512_000,
		category: "image",
		chatRoomId,
		createdByUserId: jobSeekerUserId,
		fileName: "reported-photo.png",
		id: attachmentId,
		messageId,
		mimeType: "image/png",
		storageKey: `bambi-chat/${chatRoomId}/${randomUUID()}-reported-photo.png`,
	});
	await db.insert(report).values({
		details: "첨부 이미지가 정책상 검토 필요해 보입니다.",
		id: reportId,
		reason: "other",
		reporterUserId: employerUserId,
		targetId: messageId,
		targetType: "chat_message",
	});

	return {
		adminUserId,
		attachmentId,
		chatRoomId,
		employerUserId,
		jobPostId,
		jobSeekerUserId,
		messageId,
		organizationId,
		reportId,
		userIds: [adminUserId, employerUserId, jobSeekerUserId],
	};
};

const cleanupReportFixture = async (fixture: ReportFixture): Promise<void> => {
	await db.delete(report).where(eq(report.id, fixture.reportId));
	await db
		.delete(chatAttachment)
		.where(eq(chatAttachment.chatRoomId, fixture.chatRoomId));
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

describe("bambi moderation router media context", () => {
	it("includes safe attachment metadata for reported chat messages", async () => {
		const fixture = await createReportFixture();

		try {
			const listReports = createProcedureClient(moderationRouter.listReports, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "moderation", "listReports"],
			});

			const reports = await listReports({ limit: 20 });
			const targetReport = reports.find((item) => item.id === fixture.reportId);

			expect(targetReport).toMatchObject({
				targetContext: {
					chatMessage: {
						attachments: [
							{
								byteSize: 512_000,
								category: "image",
								fileName: "reported-photo.png",
								id: fixture.attachmentId,
								mimeType: "image/png",
							},
						],
						body: "첨부 파일을 보냈습니다.",
						chatRoomId: fixture.chatRoomId,
						id: fixture.messageId,
						senderUserId: fixture.jobSeekerUserId,
					},
				},
			});
			expect(JSON.stringify(targetReport?.targetContext)).not.toContain(
				"storageKey"
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});
});
