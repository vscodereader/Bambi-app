import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq, inArray, or } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/moderation"),
	]);

const { member, organization, user } = authSchema;
const {
	adminModerationAction,
	bambiNotification,
	bambiProfile,
	chatMessage,
	chatRoom,
	employerOrganizationProfile,
	jobPost,
	report,
	review,
} = bambiSchema;

interface ManagementFixture {
	adminUserId: string;
	chatRoomId: string;
	chatRoomReportId: string;
	employerUserId: string;
	jobPostId: string;
	jobPostReportId: string;
	jobSeekerUserId: string;
	memberId: string;
	messageIds: string[];
	organizationId: string;
	reviewId: string;
	reviewReportId: string;
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

const createManagementFixture = async (): Promise<ManagementFixture> => {
	const now = new Date();
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const jobSeekerUserId = `user_test_seeker_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const memberId = `member_test_${randomUUID()}`;
	const jobPostId = randomUUID();
	const chatRoomId = randomUUID();
	const messageIds = [randomUUID(), randomUUID()];
	const reviewId = randomUUID();
	const jobPostReportId = randomUUID();
	const reviewReportId = randomUUID();
	const chatRoomReportId = randomUUID();

	await db.insert(user).values([
		{ email: makeEmail("admin"), id: adminUserId, name: "운영자" },
		{ email: makeEmail("employer"), id: employerUserId, name: "채용 담당자" },
		{ email: makeEmail("seeker"), id: jobSeekerUserId, name: "구직자" },
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
		{
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: jobSeekerUserId,
		},
	]);
	await db.insert(employerOrganizationProfile).values({
		businessRegistrationNumber: "123-45-67890",
		displayName: "밤비 라운지",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(member).values({
		createdAt: now,
		id: memberId,
		organizationId,
		role: "owner",
		status: "active",
		userId: employerUserId,
	});
	await db.insert(jobPost).values({
		createdByUserId: employerUserId,
		description: "관리 테스트용 공고입니다.",
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		region: "서울 강남구",
		riskFlags: ["manual_review"],
		status: "published",
		title: "관리 테스트 공고",
		workSchedule: "20:00-02:00",
	});
	await db.insert(chatRoom).values({
		employerUserId,
		id: chatRoomId,
		jobPostId,
		jobSeekerUserId,
		organizationId,
	});
	await db.insert(chatMessage).values([
		{
			body: "안녕하세요, 지원 문의드립니다.",
			chatRoomId,
			id: messageIds[0],
			senderUserId: jobSeekerUserId,
		},
		{
			body: "네, 확인 후 연락드릴게요.",
			chatRoomId,
			id: messageIds[1],
			senderUserId: employerUserId,
		},
	]);
	await db.insert(review).values({
		body: "면접 분위기가 좋았어요.",
		chatRoomId,
		id: reviewId,
		jobPostId,
		organizationId,
		rating: 5,
		reviewerUserId: jobSeekerUserId,
		riskFlags: [],
		status: "published",
	});
	await db.insert(report).values([
		{
			details: "공고 내용이 과장된 것 같습니다.",
			id: jobPostReportId,
			reason: "misleading_job_information",
			reporterUserId: jobSeekerUserId,
			targetId: jobPostId,
			targetType: "job_post",
		},
		{
			details: "리뷰가 허위인 것 같습니다.",
			id: reviewReportId,
			reason: "other",
			reporterUserId: employerUserId,
			targetId: reviewId,
			targetType: "review",
		},
		{
			details: "채팅에서 부적절한 요구가 있었습니다.",
			id: chatRoomReportId,
			reason: "coercion_or_safety",
			reporterUserId: jobSeekerUserId,
			targetId: chatRoomId,
			targetType: "chat_room",
		},
	]);

	return {
		adminUserId,
		chatRoomId,
		chatRoomReportId,
		employerUserId,
		jobPostId,
		jobPostReportId,
		jobSeekerUserId,
		memberId,
		messageIds,
		organizationId,
		reviewId,
		reviewReportId,
		userIds: [adminUserId, employerUserId, jobSeekerUserId],
	};
};

const cleanupManagementFixture = async (
	fixture: ManagementFixture
): Promise<void> => {
	await db
		.delete(bambiNotification)
		.where(
			or(
				inArray(bambiNotification.actorUserId, fixture.userIds),
				inArray(bambiNotification.recipientUserId, fixture.userIds)
			)
		);
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, fixture.userIds));
	await db
		.delete(report)
		.where(inArray(report.reporterUserId, fixture.userIds));
	await db.delete(review).where(eq(review.id, fixture.reviewId));
	await db
		.delete(chatMessage)
		.where(eq(chatMessage.chatRoomId, fixture.chatRoomId));
	await db.delete(chatRoom).where(eq(chatRoom.id, fixture.chatRoomId));
	await db
		.delete(member)
		.where(eq(member.organizationId, fixture.organizationId));
	await db
		.delete(employerOrganizationProfile)
		.where(
			eq(employerOrganizationProfile.organizationId, fixture.organizationId)
		);
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

describe("bambi moderation management: warnings", () => {
	it("decrements the active warning count once per reversal", async () => {
		const fixture = await createManagementFixture();

		try {
			const context = createContextForUser(fixture.adminUserId);
			const setUserStatus = createProcedureClient(
				moderationRouter.setUserStatus,
				{ context, path: ["bambi", "moderation", "setUserStatus"] }
			);
			const revertLatestWarning = createProcedureClient(
				moderationRouter.revertLatestWarning,
				{ context, path: ["bambi", "moderation", "revertLatestWarning"] }
			);
			const listUsers = createProcedureClient(moderationRouter.listUsers, {
				context,
				path: ["bambi", "moderation", "listUsers"],
			});

			for (let index = 0; index < 3; index += 1) {
				await setUserStatus({
					reason: `경고 ${index + 1}회`,
					status: "warned",
					targetUserId: fixture.jobSeekerUserId,
				});
			}

			const first = await revertLatestWarning({
				reason: "최근 경고 되돌리기",
				targetUserId: fixture.jobSeekerUserId,
			});
			expect(first.warningsCount).toBe(2);

			const second = await revertLatestWarning({
				reason: "그 이전 경고도 되돌리기",
				targetUserId: fixture.jobSeekerUserId,
			});
			expect(second.warningsCount).toBe(1);

			const users = await listUsers({ limit: 1000 });
			expect(
				users.find((row) => row.userId === fixture.jobSeekerUserId)
					?.warningsCount
			).toBe(1);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});
});

describe("bambi moderation management: reviews", () => {
	it("lists reviews with join fields and applies the status filter", async () => {
		const fixture = await createManagementFixture();

		try {
			const listReviews = createProcedureClient(moderationRouter.listReviews, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "moderation", "listReviews"],
			});

			const published = await listReviews({
				pageSize: 100,
				status: "published",
			});
			const seeded = published.items.find((row) => row.id === fixture.reviewId);

			expect(seeded).toMatchObject({
				body: "면접 분위기가 좋았어요.",
				jobPostId: fixture.jobPostId,
				jobPostTitle: "관리 테스트 공고",
				organizationDisplayName: "밤비 라운지",
				rating: 5,
				reviewerDisplayName: "구직자",
				reviewerUserId: fixture.jobSeekerUserId,
				status: "published",
			});

			const hidden = await listReviews({ pageSize: 100, status: "hidden" });
			expect(
				hidden.items.find((row) => row.id === fixture.reviewId)
			).toBeUndefined();
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});

	it("sets review status and writes an audit log", async () => {
		const fixture = await createManagementFixture();

		try {
			const setReviewStatus = createProcedureClient(
				moderationRouter.setReviewStatus,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "setReviewStatus"],
				}
			);

			const updated = await setReviewStatus({
				reason: "정책 위반 소지가 있어 숨김 처리합니다.",
				reviewId: fixture.reviewId,
				status: "hidden",
			});

			expect(updated).toMatchObject({ id: fixture.reviewId, status: "hidden" });

			const [row] = await db
				.select({ status: review.status })
				.from(review)
				.where(eq(review.id, fixture.reviewId))
				.limit(1);
			expect(row?.status).toBe("hidden");

			const actionLogs = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.adminUserId, fixture.adminUserId));
			expect(actionLogs).toContainEqual(
				expect.objectContaining({
					action: "set_status:hidden",
					reason: "정책 위반 소지가 있어 숨김 처리합니다.",
					targetId: fixture.reviewId,
					targetType: "review",
				})
			);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});

	it("rejects review status changes from non-admins", async () => {
		const fixture = await createManagementFixture();

		try {
			const setReviewStatus = createProcedureClient(
				moderationRouter.setReviewStatus,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "moderation", "setReviewStatus"],
				}
			);

			await expectOrpcCode(
				setReviewStatus({
					reason: "권한 테스트입니다.",
					reviewId: fixture.reviewId,
					status: "hidden",
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});
});

describe("bambi moderation management: employers", () => {
	it("filters employers by verification status", async () => {
		const fixture = await createManagementFixture();

		try {
			const listEmployers = createProcedureClient(
				moderationRouter.listEmployers,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "listEmployers"],
				}
			);

			const verified = await listEmployers({ limit: 100, status: "verified" });
			expect(
				verified.find((row) => row.organizationId === fixture.organizationId)
			).toMatchObject({
				displayName: "밤비 라운지",
				ownerUserId: fixture.employerUserId,
				verificationStatus: "verified",
			});

			const pending = await listEmployers({ limit: 100, status: "pending" });
			expect(
				pending.find((row) => row.organizationId === fixture.organizationId)
			).toBeUndefined();
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});
});

describe("bambi moderation management: chat rooms", () => {
	it("toggles chat room block state and writes an audit log", async () => {
		const fixture = await createManagementFixture();

		try {
			const setChatRoomBlocked = createProcedureClient(
				moderationRouter.setChatRoomBlocked,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "setChatRoomBlocked"],
				}
			);

			const blocked = await setChatRoomBlocked({
				chatRoomId: fixture.chatRoomId,
				isBlocked: true,
				reason: "안전 우려로 채팅방을 차단합니다.",
			});
			expect(blocked).toMatchObject({
				id: fixture.chatRoomId,
				isBlocked: true,
			});

			const [afterBlock] = await db
				.select({ isBlocked: chatRoom.isBlocked })
				.from(chatRoom)
				.where(eq(chatRoom.id, fixture.chatRoomId))
				.limit(1);
			expect(afterBlock?.isBlocked).toBe(true);

			await setChatRoomBlocked({
				chatRoomId: fixture.chatRoomId,
				isBlocked: false,
				reason: "검토 후 차단을 해제합니다.",
			});
			const [afterUnblock] = await db
				.select({ isBlocked: chatRoom.isBlocked })
				.from(chatRoom)
				.where(eq(chatRoom.id, fixture.chatRoomId))
				.limit(1);
			expect(afterUnblock?.isBlocked).toBe(false);

			const actionLogs = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.adminUserId, fixture.adminUserId));
			expect(actionLogs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						action: "set_blocked:true",
						targetId: fixture.chatRoomId,
						targetType: "chat_room",
					}),
					expect.objectContaining({
						action: "set_blocked:false",
						targetId: fixture.chatRoomId,
						targetType: "chat_room",
					}),
				])
			);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});
});

describe("bambi moderation management: createReport guards", () => {
	it("blocks self reports", async () => {
		const fixture = await createManagementFixture();

		try {
			const createReport = createProcedureClient(
				moderationRouter.createReport,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "moderation", "createReport"],
				}
			);

			await expectOrpcCode(
				createReport({
					reason: "harassment",
					targetId: fixture.jobSeekerUserId,
					targetType: "user",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});

	it("inserts a fresh report and rejects a repeat pending report", async () => {
		const fixture = await createManagementFixture();

		try {
			const createReport = createProcedureClient(
				moderationRouter.createReport,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "moderation", "createReport"],
				}
			);

			const first = await createReport({
				details: "허위 리뷰로 보입니다.",
				reason: "other",
				targetId: fixture.reviewId,
				targetType: "review",
			});
			expect(first).toMatchObject({
				reporterUserId: fixture.jobSeekerUserId,
				targetId: fixture.reviewId,
				targetType: "review",
			});

			await expect(
				createReport({
					details: "다시 신고합니다.",
					reason: "harassment",
					targetId: fixture.reviewId,
					targetType: "review",
				})
			).rejects.toMatchObject({
				code: "CONFLICT",
				message: "이미 신고된 대상입니다. 처리결과를 기다려주세요.",
			});

			const rows = await db
				.select({ id: report.id })
				.from(report)
				.where(
					and(
						eq(report.reporterUserId, fixture.jobSeekerUserId),
						eq(report.targetType, "review"),
						eq(report.targetId, fixture.reviewId)
					)
				);
			expect(rows).toHaveLength(1);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});
});

describe("bambi moderation management: report target context", () => {
	it("returns typed target context for job_post, review, and chat_room reports", async () => {
		const fixture = await createManagementFixture();

		try {
			const listReports = createProcedureClient(moderationRouter.listReports, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "moderation", "listReports"],
			});

			const reports = await listReports({ limit: 100 });

			const jobPostReport = reports.find(
				(row) => row.id === fixture.jobPostReportId
			);
			expect(jobPostReport?.targetContext).toMatchObject({
				jobPost: {
					description: "관리 테스트용 공고입니다.",
					id: fixture.jobPostId,
					organizationDisplayName: "밤비 라운지",
					riskFlags: ["manual_review"],
					status: "published",
					title: "관리 테스트 공고",
				},
			});

			const reviewReport = reports.find(
				(row) => row.id === fixture.reviewReportId
			);
			expect(reviewReport?.targetContext).toMatchObject({
				review: {
					body: "면접 분위기가 좋았어요.",
					id: fixture.reviewId,
					jobPostId: fixture.jobPostId,
					rating: 5,
					status: "published",
				},
			});

			const chatRoomReport = reports.find(
				(row) => row.id === fixture.chatRoomReportId
			);
			expect(chatRoomReport?.targetContext).toMatchObject({
				chatRoom: {
					id: fixture.chatRoomId,
					isBlocked: false,
					jobPostTitle: "관리 테스트 공고",
				},
			});
			const recentMessages =
				(
					chatRoomReport?.targetContext as {
						chatRoom?: { recentMessages?: Array<{ id: string }> };
					}
				)?.chatRoom?.recentMessages ?? [];
			expect(recentMessages).toHaveLength(2);
			expect(recentMessages.map((message) => message.id).sort()).toEqual(
				[...fixture.messageIds].sort()
			);
			expect(JSON.stringify(chatRoomReport?.targetContext)).not.toContain(
				"storageKey"
			);
		} finally {
			await cleanupManagementFixture(fixture);
		}
	});
});
