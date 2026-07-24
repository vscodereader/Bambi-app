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
	chatRoom,
	communityComment,
	communityPost,
	jobPost,
	report,
} = bambiSchema;

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
		{
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
		industryCategory: "룸싸롱",
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
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, fixture.userIds));
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

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi moderation router media context", () => {
	it("exposes bulk moderation procedures", () => {
		expect(moderationRouter.bulkSetJobPostStatus).toBeDefined();
		expect(moderationRouter.bulkSetReportStatus).toBeDefined();
		expect(moderationRouter.bulkSetUserStatus).toBeDefined();
	});

	it("exposes the job post payment procedure", () => {
		expect(moderationRouter.setJobPostPayment).toBeDefined();
	});

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

describe("bambi moderation router community reports", () => {
	it("존재하는 커뮤니티 글(community_post) 신고가 성공한다(잠재 버그 수정 검증)", async () => {
		const fixture = await createReportFixture();
		const postId = randomUUID();

		try {
			await db.insert(communityPost).values({
				authorDisplayName: "달빛토끼",
				authorRole: "job_seeker",
				authorUserId: fixture.jobSeekerUserId,
				board: "free",
				body: "신고 대상 글 본문",
				id: postId,
				passwordHash: "",
				title: "신고 대상 글",
			});

			const createReport = createProcedureClient(
				moderationRouter.createReport,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "createReport"],
				}
			);

			const created = await createReport({
				reason: "other",
				targetId: postId,
				targetType: "community_post",
			});
			// returning() 파생 타입이 undefined를 포함해 좁혀서 사용한다.
			if (!created) {
				throw new Error("신고 생성 결과가 비어 있습니다.");
			}
			expect(created.targetType).toBe("community_post");
			expect(created.targetId).toBe(postId);

			// 이 테스트가 새로 만든 report는 fixture.reportId가 아니므로 직접 정리한다.
			await db.delete(report).where(eq(report.id, created.id));
		} finally {
			await db.delete(communityPost).where(eq(communityPost.id, postId));
			await cleanupReportFixture(fixture);
		}
	});

	it("존재하지 않는 커뮤니티 댓글(community_comment) 신고는 NOT_FOUND", async () => {
		const fixture = await createReportFixture();

		try {
			const createReport = createProcedureClient(
				moderationRouter.createReport,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "createReport"],
				}
			);

			// INSERT 전에 존재 검증에서 throw되므로 DB enum에 값이 없어도 안전하다.
			await expectOrpcCode(
				createReport({
					reason: "other",
					targetId: randomUUID(),
					targetType: "community_comment",
				}),
				"NOT_FOUND"
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});

	it("커뮤니티 댓글 신고에 uuid가 아닌 targetId를 주면 BAD_REQUEST", async () => {
		const fixture = await createReportFixture();

		try {
			const createReport = createProcedureClient(
				moderationRouter.createReport,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "createReport"],
				}
			);

			// uuidTargetTypes에 포함되므로 uuid 형식 검증에서 INSERT 전에 막힌다.
			await expectOrpcCode(
				createReport({
					reason: "other",
					targetId: "not-a-uuid",
					targetType: "community_comment",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});
});

describe("bambi moderation router community target context", () => {
	it("커뮤니티 글·댓글 신고의 targetContext가 계약 형태로 채워지고 대상 미존재면 null", async () => {
		const fixture = await createReportFixture();
		const postId = randomUUID();
		const commentId = randomUUID();
		const postReportId = randomUUID();
		const commentReportId = randomUUID();
		const missingReportId = randomUUID();

		try {
			// 글 본문은 Tiptap doc JSON, 댓글 본문은 평문. 글은 hidden 상태여도 컨텍스트가 나와야 한다.
			await db.insert(communityPost).values({
				authorDisplayName: "달빛토끼",
				authorRole: "job_seeker",
				authorUserId: fixture.jobSeekerUserId,
				board: "free",
				body: JSON.stringify({
					content: [
						{
							content: [{ text: "신고 대상 본문입니다.", type: "text" }],
							type: "paragraph",
						},
					],
					type: "doc",
				}),
				id: postId,
				passwordHash: "",
				status: "hidden",
				title: "신고 대상 글",
			});
			await db.insert(communityComment).values({
				authorRole: "job_seeker",
				authorUserId: fixture.jobSeekerUserId,
				body: "신고 대상 댓글 본문",
				id: commentId,
				postId,
				status: "published",
			});
			await db.insert(report).values([
				{
					id: postReportId,
					reason: "other",
					reporterUserId: fixture.employerUserId,
					targetId: postId,
					targetType: "community_post",
				},
				{
					id: commentReportId,
					reason: "other",
					reporterUserId: fixture.employerUserId,
					targetId: commentId,
					targetType: "community_comment",
				},
				{
					id: missingReportId,
					reason: "other",
					reporterUserId: fixture.employerUserId,
					targetId: randomUUID(),
					targetType: "community_post",
				},
			]);

			const listReports = createProcedureClient(moderationRouter.listReports, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "moderation", "listReports"],
			});
			const reports = await listReports({ limit: 100 });

			const postReport = reports.find((item) => item.id === postReportId);
			expect(postReport?.targetContext).toMatchObject({
				communityPost: {
					authorName: "달빛토끼",
					board: "free",
					bodyPreview: "신고 대상 본문입니다.",
					id: postId,
					status: "hidden",
					title: "신고 대상 글",
				},
			});

			const commentReport = reports.find((item) => item.id === commentReportId);
			expect(commentReport?.targetContext).toMatchObject({
				communityComment: {
					authorName: "구직자",
					bodyPreview: "신고 대상 댓글 본문",
					id: commentId,
					postBoard: "free",
					postId,
					postTitle: "신고 대상 글",
					status: "published",
				},
			});

			const missingReport = reports.find((item) => item.id === missingReportId);
			expect(missingReport?.targetContext).toBeNull();
		} finally {
			await db
				.delete(report)
				.where(
					inArray(report.id, [postReportId, commentReportId, missingReportId])
				);
			await db
				.delete(communityComment)
				.where(eq(communityComment.id, commentId));
			await db.delete(communityPost).where(eq(communityPost.id, postId));
			await cleanupReportFixture(fixture);
		}
	});
});

describe("bambi moderation router bulk actions", () => {
	it("requires an admin profile for bulk actions", async () => {
		const fixture = await createReportFixture();

		try {
			const context = createContextForUser(fixture.employerUserId);
			const bulkSetJobPostStatus = createProcedureClient(
				moderationRouter.bulkSetJobPostStatus,
				{
					context,
					path: ["bambi", "moderation", "bulkSetJobPostStatus"],
				}
			);
			const bulkSetReportStatus = createProcedureClient(
				moderationRouter.bulkSetReportStatus,
				{
					context,
					path: ["bambi", "moderation", "bulkSetReportStatus"],
				}
			);
			const bulkSetUserStatus = createProcedureClient(
				moderationRouter.bulkSetUserStatus,
				{
					context,
					path: ["bambi", "moderation", "bulkSetUserStatus"],
				}
			);

			await expectOrpcCode(
				bulkSetJobPostStatus({
					jobPostIds: [fixture.jobPostId],
					reason: "운영자 권한 테스트",
					status: "hidden",
				}),
				"FORBIDDEN"
			);
			await expectOrpcCode(
				bulkSetReportStatus({
					reason: "운영자 권한 테스트",
					reportIds: [fixture.reportId],
					status: "resolved",
				}),
				"FORBIDDEN"
			);
			await expectOrpcCode(
				bulkSetUserStatus({
					reason: "운영자 권한 테스트",
					status: "warned",
					targetUserIds: [fixture.jobSeekerUserId],
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});

	it("partially applies bulk job post moderation and writes audit logs", async () => {
		const fixture = await createReportFixture();
		const missingJobPostId = randomUUID();

		try {
			const bulkSetJobPostStatus = createProcedureClient(
				moderationRouter.bulkSetJobPostStatus,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "bulkSetJobPostStatus"],
				}
			);

			const result = await bulkSetJobPostStatus({
				jobPostIds: [fixture.jobPostId, missingJobPostId],
				reason: "정책 기준을 충족해 게시 승인합니다.",
				status: "published",
			});

			const [updatedJobPost] = await db
				.select({
					publishedAt: jobPost.publishedAt,
					status: jobPost.status,
				})
				.from(jobPost)
				.where(eq(jobPost.id, fixture.jobPostId))
				.limit(1);
			const actionLogs = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.adminUserId, fixture.adminUserId));

			expect(result).toEqual({
				failed: 1,
				failures: [
					{
						code: "NOT_FOUND",
						message: "Job post was not found.",
						targetId: missingJobPostId,
					},
				],
				succeeded: 1,
				total: 2,
			});
			expect(updatedJobPost).toMatchObject({
				status: "published",
			});
			expect(updatedJobPost?.publishedAt).toBeInstanceOf(Date);
			expect(actionLogs).toContainEqual(
				expect.objectContaining({
					action: "set_status:published",
					reason: "정책 기준을 충족해 게시 승인합니다.",
					targetId: fixture.jobPostId,
					targetType: "job_post",
				})
			);
			expect(actionLogs).not.toContainEqual(
				expect.objectContaining({ targetId: missingJobPostId })
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});

	it("requires an admin profile for setJobPostPayment", async () => {
		const fixture = await createReportFixture();

		try {
			const setJobPostPayment = createProcedureClient(
				moderationRouter.setJobPostPayment,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "setJobPostPayment"],
				}
			);

			await expectOrpcCode(
				setJobPostPayment({
					jobPostId: fixture.jobPostId,
					paymentStatus: "paid",
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});

	it("sets exposureEndsAt on paid and clears it on unpaid", async () => {
		const fixture = await createReportFixture();

		try {
			await db
				.update(jobPost)
				.set({ exposureDurationDays: 30 })
				.where(eq(jobPost.id, fixture.jobPostId));

			const setJobPostPayment = createProcedureClient(
				moderationRouter.setJobPostPayment,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "setJobPostPayment"],
				}
			);

			const beforePaid = Date.now();
			const paidResult = await setJobPostPayment({
				jobPostId: fixture.jobPostId,
				paymentStatus: "paid",
			});

			expect(paidResult.paymentStatus).toBe("paid");
			expect(paidResult.exposureEndsAt).toBeInstanceOf(Date);
			const endsAt = paidResult.exposureEndsAt?.getTime() ?? 0;
			expect(endsAt).toBeGreaterThanOrEqual(
				beforePaid + 29 * 24 * 60 * 60 * 1000
			);
			expect(endsAt).toBeLessThanOrEqual(Date.now() + 31 * 24 * 60 * 60 * 1000);

			const unpaidResult = await setJobPostPayment({
				jobPostId: fixture.jobPostId,
				paymentStatus: "unpaid",
			});

			expect(unpaidResult.paymentStatus).toBe("unpaid");
			expect(unpaidResult.exposureEndsAt).toBeNull();
		} finally {
			await cleanupReportFixture(fixture);
		}
	});

	it("returns NOT_FOUND when the job post is missing", async () => {
		const fixture = await createReportFixture();

		try {
			const setJobPostPayment = createProcedureClient(
				moderationRouter.setJobPostPayment,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "setJobPostPayment"],
				}
			);

			await expectOrpcCode(
				setJobPostPayment({
					jobPostId: randomUUID(),
					paymentStatus: "paid",
				}),
				"NOT_FOUND"
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});

	it("applies bulk report and user status updates with audit logs", async () => {
		const fixture = await createReportFixture();

		try {
			const context = createContextForUser(fixture.adminUserId);
			const bulkSetReportStatus = createProcedureClient(
				moderationRouter.bulkSetReportStatus,
				{
					context,
					path: ["bambi", "moderation", "bulkSetReportStatus"],
				}
			);
			const bulkSetUserStatus = createProcedureClient(
				moderationRouter.bulkSetUserStatus,
				{
					context,
					path: ["bambi", "moderation", "bulkSetUserStatus"],
				}
			);

			await expect(
				bulkSetReportStatus({
					reason: "신고 조치를 완료했습니다.",
					reportIds: [fixture.reportId],
					status: "resolved",
				})
			).resolves.toMatchObject({
				failed: 0,
				succeeded: 1,
				total: 1,
			});
			await expect(
				bulkSetUserStatus({
					reason: "정책 위반 안내와 경고를 발송했습니다.",
					status: "warned",
					targetUserIds: [fixture.jobSeekerUserId],
				})
			).resolves.toMatchObject({
				failed: 0,
				succeeded: 1,
				total: 1,
			});

			const [updatedReport] = await db
				.select({ status: report.status })
				.from(report)
				.where(eq(report.id, fixture.reportId))
				.limit(1);
			const [updatedProfile] = await db
				.select({ status: bambiProfile.status })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, fixture.jobSeekerUserId))
				.limit(1);
			const actionLogs = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.adminUserId, fixture.adminUserId));

			expect(updatedReport?.status).toBe("resolved");
			expect(updatedProfile?.status).toBe("warned");
			expect(actionLogs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						action: "set_report_status:resolved",
						reason: "신고 조치를 완료했습니다.",
						targetId: fixture.messageId,
						targetType: "chat_message",
					}),
					expect.objectContaining({
						action: "set_status:warned",
						reason: "정책 위반 안내와 경고를 발송했습니다.",
						targetId: fixture.jobSeekerUserId,
						targetType: "user",
					}),
				])
			);
		} finally {
			await cleanupReportFixture(fixture);
		}
	});
});
