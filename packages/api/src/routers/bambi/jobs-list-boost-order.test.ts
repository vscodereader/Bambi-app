import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [
	{ db },
	authSchema,
	bambiSchema,
	{ jobsRouter },
	{ createTestRegion, deleteTestRegion },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./jobs"),
	import("../../services/__fixtures__/test-region"),
]);

const { organization, user } = authSchema;
const {
	bambiProfile,
	employerOrganizationProfile,
	jobPerformanceEvent,
	jobPost,
} = bambiSchema;

interface BoostOrderFixture {
	jobPostIds: string[];
	organicNewId: string;
	organicOldId: string;
	organizationId: string;
	regionCode: string;
	seekerUserId: string;
	specialNewId: string;
	specialOldId: string;
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

const HOUR_MS = 60 * 60 * 1000;

const createBoostOrderFixture = async (): Promise<BoostOrderFixture> => {
	const now = new Date();
	const future = new Date(now.getTime() + 24 * HOUR_MS);
	const oneHourAgo = new Date(now.getTime() - HOUR_MS);
	const twoHoursAgo = new Date(now.getTime() - 2 * HOUR_MS);
	// 공개 jobs.list는 전역 조회라 병렬 테스트 픽스처가 서로의 결과·impression에 섞인다.
	// 픽스처마다 일회용 지역을 만들고 그 지역으로만 조회해 완전히 격리한다.
	const testRegion = await createTestRegion();
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const seekerUserId = `user_test_seeker_${randomUUID()}`;

	const specialOldId = randomUUID();
	const specialNewId = randomUUID();
	const organicOldId = randomUUID();
	const organicNewId = randomUUID();
	const jobPostIds = [specialOldId, specialNewId, organicOldId, organicNewId];

	await db.insert(user).values([
		{
			email: makeEmail("employer"),
			id: employerUserId,
			name: "채용 담당자",
		},
		{
			email: makeEmail("seeker"),
			id: seekerUserId,
			name: "구직자",
		},
	]);
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "끌어올리기 정렬 테스트 조직",
		slug: `list-boost-${randomUUID()}`,
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
			userId: seekerUserId,
		},
	]);
	await db.insert(employerOrganizationProfile).values({
		displayName: "끌어올리기 정렬 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});

	const baseJob = (overrides: {
		boostedAt: Date | null;
		exposureEndsAt: Date | null;
		exposureType: "special" | "standard";
		id: string;
		publishedAt: Date;
		title: string;
	}) => ({
		createdByUserId: employerUserId,
		description: "끌어올리기 노출 정렬을 검증하기 위한 공고입니다.",
		industryCategory: "룸싸롱" as const,
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		paymentStatus: "paid" as const,
		region: testRegion.label,
		regionCode: testRegion.code,
		status: "published" as const,
		workSchedule: "20:00-02:00",
		...overrides,
	});

	await db.insert(jobPost).values([
		baseJob({
			boostedAt: null,
			exposureEndsAt: future,
			exposureType: "special",
			id: specialOldId,
			publishedAt: twoHoursAgo,
			title: "스페셜 오래된 공고",
		}),
		baseJob({
			boostedAt: null,
			exposureEndsAt: future,
			exposureType: "special",
			id: specialNewId,
			publishedAt: oneHourAgo,
			title: "스페셜 최신 공고",
		}),
		baseJob({
			boostedAt: null,
			exposureEndsAt: null,
			exposureType: "standard",
			id: organicOldId,
			publishedAt: twoHoursAgo,
			title: "일반 오래된 공고",
		}),
		baseJob({
			boostedAt: null,
			exposureEndsAt: null,
			exposureType: "standard",
			id: organicNewId,
			publishedAt: oneHourAgo,
			title: "일반 최신 공고",
		}),
	]);

	return {
		jobPostIds,
		organicNewId,
		organicOldId,
		organizationId,
		regionCode: testRegion.code,
		seekerUserId,
		specialNewId,
		specialOldId,
		userIds: [employerUserId, seekerUserId],
	};
};

const cleanupBoostOrderFixture = async (
	fixture: BoostOrderFixture
): Promise<void> => {
	await db
		.delete(jobPerformanceEvent)
		.where(inArray(jobPerformanceEvent.jobPostId, fixture.jobPostIds));
	await db.delete(jobPost).where(inArray(jobPost.id, fixture.jobPostIds));
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

let fixture: BoostOrderFixture;

const listForFixtureRegion = () =>
	createProcedureClient(jobsRouter.list, {
		context: createContextForUser(fixture.seekerUserId),
		path: ["bambi", "jobs", "list"],
	})({ limit: 30, regionCode: fixture.regionCode });

const organicIds = (
	result: Awaited<ReturnType<typeof listForFixtureRegion>>
): string[] =>
	result.sections.organic
		.map((item) => item.id)
		.filter((id) => fixture.jobPostIds.includes(id));

describe("jobs.list boost ordering", () => {
	beforeAll(async () => {
		fixture = await createBoostOrderFixture();
	});

	afterAll(async () => {
		await cleanupBoostOrderFixture(fixture);
	});

	it("orders sections and organic by publishedAt when nothing is boosted", async () => {
		const result = await listForFixtureRegion();
		expect(result.sections.special.map((item) => item.id)).toEqual([
			fixture.specialNewId,
			fixture.specialOldId,
		]);
		expect(organicIds(result)).toEqual([
			fixture.organicNewId,
			fixture.organicOldId,
		]);
	});

	it("lifts a boosted job above newer publishedAt in its section and organic", async () => {
		const now = new Date();
		await db
			.update(jobPost)
			.set({ boostedAt: now })
			.where(eq(jobPost.id, fixture.specialOldId));
		await db
			.update(jobPost)
			.set({ boostedAt: now })
			.where(eq(jobPost.id, fixture.organicOldId));

		const result = await listForFixtureRegion();
		expect(result.sections.special.map((item) => item.id)).toEqual([
			fixture.specialOldId,
			fixture.specialNewId,
		]);
		expect(organicIds(result)).toEqual([
			fixture.organicOldId,
			fixture.organicNewId,
		]);
	});
});
