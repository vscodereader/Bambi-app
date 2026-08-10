import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [
	{ db },
	authSchema,
	bambiSchema,
	{ jobsRouter },
	{ reviewsRouter },
	{ createTestRegion, deleteTestRegion },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/jobs"),
	import("@/routers/bambi/reviews"),
	import("@/services/__fixtures__/test-region"),
]);

const { organization, user } = authSchema;
const {
	bambiProfile,
	chatRoom,
	employerOrganizationProfile,
	interviewSchedule,
	jobPost,
	review,
} = bambiSchema;

interface ReviewFixture {
	alternateChatRoomId: string;
	alternateSeekerUserId: string;
	chatRoomId: string;
	employerUserId: string;
	jobPostId: string;
	jobSeekerUserId: string;
	organizationId: string;
	regionCode: string;
	scheduleId: string;
	userIds: string[];
}

const REVIEW_BODY =
	"면접 안내가 명확했고 실제 근무 조건도 공고 내용과 잘 맞아서 신뢰할 수 있었어요.";

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

const createReviewFixture = async (): Promise<ReviewFixture> => {
	const now = new Date();
	// 공개 jobs.list는 전역 조회라, 병렬 테스트 픽스처가 섞이지 않도록 일회용 지역으로 격리한다.
	const testRegion = await createTestRegion();
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const jobSeekerUserId = `user_test_seeker_${randomUUID()}`;
	const alternateSeekerUserId = `user_test_seeker_${randomUUID()}`;
	const jobPostId = randomUUID();
	const chatRoomId = randomUUID();
	const alternateChatRoomId = randomUUID();
	const scheduleId = randomUUID();
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
			email: makeEmail("alt-seeker"),
			id: alternateSeekerUserId,
			name: "다른 구직자",
		},
	];

	await db.insert(user).values(userRows);
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "후기 테스트 조직",
		slug: `review-test-${randomUUID()}`,
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
			userId: alternateSeekerUserId,
		},
	]);
	await db.insert(employerOrganizationProfile).values({
		displayName: "후기 테스트 라운지",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(jobPost).values({
		createdByUserId: employerUserId,
		description: "후기 집계 테스트를 위한 공고입니다.",
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		// 공개 목록·상세 조회는 published + paid를 함께 요구한다(jobs.ts의 결제 게이트).
		paymentStatus: "paid",
		publishedAt: now,
		region: testRegion.label,
		regionCode: testRegion.code,
		status: "published",
		title: "후기 테스트 공고",
		workSchedule: "20:00-02:00",
	});
	await db.insert(chatRoom).values([
		{
			employerUserId,
			id: chatRoomId,
			jobPostId,
			jobSeekerUserId,
			organizationId,
		},
		{
			employerUserId,
			id: alternateChatRoomId,
			jobPostId,
			jobSeekerUserId: alternateSeekerUserId,
			organizationId,
		},
	]);
	await db.insert(interviewSchedule).values({
		chatRoomId,
		id: scheduleId,
		proposedByUserId: employerUserId,
		scheduledAt: now,
		status: "confirmed",
	});

	return {
		alternateChatRoomId,
		alternateSeekerUserId,
		chatRoomId,
		employerUserId,
		jobPostId,
		jobSeekerUserId,
		organizationId,
		regionCode: testRegion.code,
		scheduleId,
		userIds: [employerUserId, jobSeekerUserId, alternateSeekerUserId],
	};
};

const cleanupReviewFixture = async (fixture: ReviewFixture): Promise<void> => {
	await db.delete(review).where(eq(review.jobPostId, fixture.jobPostId));
	await db
		.delete(interviewSchedule)
		.where(eq(interviewSchedule.chatRoomId, fixture.chatRoomId));
	await db
		.delete(chatRoom)
		.where(
			inArray(chatRoom.id, [fixture.chatRoomId, fixture.alternateChatRoomId])
		);
	await db.delete(jobPost).where(eq(jobPost.id, fixture.jobPostId));
	await db
		.delete(employerOrganizationProfile)
		.where(
			eq(employerOrganizationProfile.organizationId, fixture.organizationId)
		);
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
	await db
		.delete(organization)
		.where(eq(organization.id, fixture.organizationId));
	await deleteTestRegion(fixture.regionCode);
};

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi reviews router", () => {
	it("allows a job seeker to create and list a review after a confirmed interview", async () => {
		const fixture = await createReviewFixture();

		try {
			const createReview = createProcedureClient(reviewsRouter.create, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "reviews", "create"],
			});
			const listMine = createProcedureClient(reviewsRouter.listMine, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "reviews", "listMine"],
			});

			const created = await createReview({
				body: REVIEW_BODY,
				chatRoomId: fixture.chatRoomId,
				rating: 5,
			});

			if (!created) {
				throw new Error("Review was not created.");
			}

			const mine = await listMine();

			expect(created).toMatchObject({
				body: REVIEW_BODY,
				chatRoomId: fixture.chatRoomId,
				jobPostId: fixture.jobPostId,
				organizationId: fixture.organizationId,
				rating: 5,
				reviewerUserId: fixture.jobSeekerUserId,
				riskFlags: [],
				status: "published",
			});
			expect(mine.map((item) => item.id)).toContain(created.id);
		} finally {
			await cleanupReviewFixture(fixture);
		}
	});

	it("prevents duplicate reviews for the same chat room and reviewer", async () => {
		const fixture = await createReviewFixture();

		try {
			const createReview = createProcedureClient(reviewsRouter.create, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "reviews", "create"],
			});

			await createReview({
				body: REVIEW_BODY,
				chatRoomId: fixture.chatRoomId,
				rating: 4,
			});

			await expectOrpcCode(
				createReview({
					body: `${REVIEW_BODY} 다음에도 같은 조건이면 지원할 것 같아요.`,
					chatRoomId: fixture.chatRoomId,
					rating: 5,
				}),
				"CONFLICT"
			);
		} finally {
			await cleanupReviewFixture(fixture);
		}
	});

	it("rejects employers even when they are chat participants", async () => {
		const fixture = await createReviewFixture();

		try {
			const createReview = createProcedureClient(reviewsRouter.create, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "reviews", "create"],
			});

			await expectOrpcCode(
				createReview({
					body: REVIEW_BODY,
					chatRoomId: fixture.chatRoomId,
					rating: 5,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupReviewFixture(fixture);
		}
	});
});

describe("bambi reviews.listByJobPost", () => {
	it("returns only published reviews with masked or anonymous authors and no reviewer id", async () => {
		const fixture = await createReviewFixture();

		try {
			const earlier = new Date(Date.now() - 60_000);
			const later = new Date();

			await db.insert(review).values([
				// 게시됨 · 비익명 → 마스킹된 표시명("구직자" → "구*자")
				{
					body: REVIEW_BODY,
					chatRoomId: fixture.chatRoomId,
					createdAt: earlier,
					isAnonymous: false,
					jobPostId: fixture.jobPostId,
					organizationId: fixture.organizationId,
					rating: 5,
					reviewerUserId: fixture.jobSeekerUserId,
					status: "published",
				},
				// 게시됨 · 익명 → "익명"
				{
					body: `${REVIEW_BODY} 분위기도 좋았어요.`,
					chatRoomId: fixture.alternateChatRoomId,
					createdAt: later,
					isAnonymous: true,
					jobPostId: fixture.jobPostId,
					organizationId: fixture.organizationId,
					rating: 4,
					reviewerUserId: fixture.alternateSeekerUserId,
					status: "published",
				},
				// 숨김 → 응답에서 제외
				{
					body: `${REVIEW_BODY} 숨김 처리된 후기입니다.`,
					chatRoomId: fixture.chatRoomId,
					isAnonymous: false,
					jobPostId: fixture.jobPostId,
					organizationId: fixture.organizationId,
					rating: 2,
					reviewerUserId: fixture.employerUserId,
					status: "hidden",
				},
				// 검수 대기 → 응답에서 제외
				{
					body: `${REVIEW_BODY} 검수 대기 후기입니다.`,
					chatRoomId: fixture.alternateChatRoomId,
					isAnonymous: false,
					jobPostId: fixture.jobPostId,
					organizationId: fixture.organizationId,
					rating: 3,
					reviewerUserId: fixture.employerUserId,
					riskFlags: ["external_messenger"],
					status: "pending_review",
				},
			]);

			const listByJobPost = createProcedureClient(reviewsRouter.listByJobPost, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "reviews", "listByJobPost"],
			});

			const result = await listByJobPost({
				jobPostId: fixture.jobPostId,
				limit: 10,
				offset: 0,
			});

			expect(result.hasMore).toBe(false);
			expect(result.items).toHaveLength(2);
			// createdAt desc → 익명(later)이 먼저.
			expect(result.items[0]?.reviewerDisplayName).toBe("익명");
			expect(result.items[1]?.reviewerDisplayName).toBe("구*자");
			// 게시되지 않은 후기 본문은 노출되지 않는다.
			for (const item of result.items) {
				expect(item.body).not.toContain("숨김 처리된");
				expect(item.body).not.toContain("검수 대기");
				// 작성자 식별 정보는 응답에 포함되지 않는다.
				expect(item).not.toHaveProperty("reviewerUserId");
			}
		} finally {
			await cleanupReviewFixture(fixture);
		}
	});
});

describe("bambi jobs review aggregates", () => {
	it("includes published review averages in job list and detail responses", async () => {
		const fixture = await createReviewFixture();

		try {
			await db.insert(review).values([
				{
					body: REVIEW_BODY,
					chatRoomId: fixture.chatRoomId,
					jobPostId: fixture.jobPostId,
					organizationId: fixture.organizationId,
					rating: 5,
					reviewerUserId: fixture.jobSeekerUserId,
					status: "published",
				},
				{
					body: `${REVIEW_BODY} 다만 외부 연락 안내는 검수가 필요해 보였어요.`,
					chatRoomId: fixture.alternateChatRoomId,
					jobPostId: fixture.jobPostId,
					organizationId: fixture.organizationId,
					rating: 1,
					reviewerUserId: fixture.alternateSeekerUserId,
					riskFlags: ["external_messenger"],
					status: "pending_review",
				},
			]);

			const listJobs = createProcedureClient(jobsRouter.list, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "jobs", "list"],
			});
			const getJobById = createProcedureClient(jobsRouter.getById, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "jobs", "getById"],
			});

			const listResult = await listJobs({
				limit: 20,
				regionCode: fixture.regionCode,
			});
			const listedJob = [
				...listResult.sections.special,
				...listResult.sections.urgent,
				...listResult.sections.recommended,
				...listResult.sections.organic,
			].find((job) => job.id === fixture.jobPostId);
			const detail = await getJobById({ id: fixture.jobPostId });

			expect(listedJob).toMatchObject({
				ratingAverage: 5,
				ratingCount: 1,
			});
			expect(detail).toMatchObject({
				ratingAverage: 5,
				ratingCount: 1,
			});
		} finally {
			await cleanupReviewFixture(fixture);
		}
	});
});
