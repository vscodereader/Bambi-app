import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { jobsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./jobs"),
]);

const { organization, user } = authSchema;
const {
	bambiProfile,
	employerOrganizationProfile,
	jobPerformanceEvent,
	jobPost,
	jobPromotionCampaign,
} = bambiSchema;

interface JobsAnalyticsFixture {
	employerUserId: string;
	jobPostId: string;
	jobSeekerUserId: string;
	organizationId: string;
	promotionCampaignId: string;
	region: string;
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

const createJobsAnalyticsFixture = async (): Promise<JobsAnalyticsFixture> => {
	const now = new Date();
	// 공개 jobs.list는 전역 조회라, 병렬 테스트 픽스처가 섞이지 않도록 고유 region으로 격리한다.
	const region = `jobs-analytics-${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const jobSeekerUserId = `user_test_seeker_${randomUUID()}`;
	const jobPostId = randomUUID();
	const promotionCampaignId = randomUUID();
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
	];

	await db.insert(user).values(userRows);
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "상세 조회 테스트 조직",
		slug: `job-analytics-${randomUUID()}`,
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
	]);
	await db.insert(employerOrganizationProfile).values({
		displayName: "상세 조회 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(jobPost).values({
		createdByUserId: employerUserId,
		description: "상세 조회 이벤트를 검증하기 위한 공고입니다.",
		exposureEndsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		exposureType: "special",
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		paymentStatus: "paid",
		publishedAt: now,
		region,
		status: "published",
		title: "상세 조회 테스트 공고",
		workSchedule: "20:00-02:00",
	});
	await db.insert(jobPromotionCampaign).values({
		endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		id: promotionCampaignId,
		jobPostId,
		lastBoostedAt: now,
		manualBoostsTotal: 3,
		organizationId,
		startsAt: new Date(now.getTime() - 60 * 60 * 1000),
		status: "active",
		tier: "premium",
	});

	return {
		employerUserId,
		jobPostId,
		jobSeekerUserId,
		organizationId,
		promotionCampaignId,
		region,
		userIds: [employerUserId, jobSeekerUserId],
	};
};

const cleanupJobsAnalyticsFixture = async (
	fixture: JobsAnalyticsFixture
): Promise<void> => {
	await db
		.delete(jobPerformanceEvent)
		.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId));
	await db
		.delete(jobPromotionCampaign)
		.where(eq(jobPromotionCampaign.id, fixture.promotionCampaignId));
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
};

describe("bambi jobs analytics", () => {
	it("records a detail_view event when a published job is fetched", async () => {
		const fixture = await createJobsAnalyticsFixture();

		try {
			const getJobById = createProcedureClient(jobsRouter.getById, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "jobs", "getById"],
			});

			await getJobById({ id: fixture.jobPostId });

			const [event] = await db
				.select()
				.from(jobPerformanceEvent)
				.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId))
				.limit(1);

			expect(event).toMatchObject({
				actorUserId: fixture.jobSeekerUserId,
				eventType: "detail_view",
				jobPostId: fixture.jobPostId,
				organizationId: fixture.organizationId,
			});
		} finally {
			await cleanupJobsAnalyticsFixture(fixture);
		}
	});

	it("records paid listing impressions with exposure placement metadata", async () => {
		const fixture = await createJobsAnalyticsFixture();

		try {
			const listJobs = createProcedureClient(jobsRouter.list, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "jobs", "list"],
			});

			await listJobs({ limit: 10, region: fixture.region });

			const [event] = await db
				.select()
				.from(jobPerformanceEvent)
				.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId))
				.limit(1);

			expect(event).toMatchObject({
				actorUserId: fixture.jobSeekerUserId,
				eventType: "impression",
				jobPostId: fixture.jobPostId,
				organizationId: fixture.organizationId,
			});
			expect(event?.metadata).toMatchObject({
				exposureType: "special",
				position: 0,
				section: "special",
			});
		} finally {
			await cleanupJobsAnalyticsFixture(fixture);
		}
	});

	it("hides an unpaid published job from public detail (getById)", async () => {
		const fixture = await createJobsAnalyticsFixture();

		try {
			await db
				.update(jobPost)
				.set({ paymentStatus: "unpaid" })
				.where(eq(jobPost.id, fixture.jobPostId));

			const getJobById = createProcedureClient(jobsRouter.getById, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "jobs", "getById"],
			});

			await expect(getJobById({ id: fixture.jobPostId })).rejects.toThrow();
		} finally {
			await cleanupJobsAnalyticsFixture(fixture);
		}
	});

	it("excludes an unpaid published job from the public list", async () => {
		const fixture = await createJobsAnalyticsFixture();

		try {
			await db
				.update(jobPost)
				.set({ paymentStatus: "unpaid" })
				.where(eq(jobPost.id, fixture.jobPostId));

			const listJobs = createProcedureClient(jobsRouter.list, {
				context: createContextForUser(fixture.jobSeekerUserId),
				path: ["bambi", "jobs", "list"],
			});

			const result = await listJobs({ limit: 10, region: fixture.region });
			const allIds = [
				...result.sections.special,
				...result.sections.urgent,
				...result.sections.recommended,
				...result.sections.organic,
			].map((item) => item.id);

			expect(allIds).not.toContain(fixture.jobPostId);

			const [event] = await db
				.select()
				.from(jobPerformanceEvent)
				.where(eq(jobPerformanceEvent.jobPostId, fixture.jobPostId))
				.limit(1);

			expect(event).toBeUndefined();
		} finally {
			await cleanupJobsAnalyticsFixture(fixture);
		}
	});
});
