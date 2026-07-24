import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
} = bambiSchema;

interface ListExposureFixture {
	expiredJobId: string;
	freeJobId: string;
	jobPostIds: string[];
	organizationId: string;
	recommendedJobId: string;
	region: string;
	seekerUserId: string;
	specialJobId: string;
	unpaidJobId: string;
	urgentJobId: string;
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

const createListExposureFixture = async (): Promise<ListExposureFixture> => {
	const now = new Date();
	const future = new Date(now.getTime() + 24 * HOUR_MS);
	const past = new Date(now.getTime() - 24 * HOUR_MS);
	// 공개 jobs.list는 전역 조회라 병렬 테스트 픽스처가 서로의 결과·impression에 섞인다.
	// 픽스처마다 고유 region을 부여하고 그 region으로만 조회해 완전히 격리한다.
	const region = `list-exposure-${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const seekerUserId = `user_test_seeker_${randomUUID()}`;

	const specialJobId = randomUUID();
	const urgentJobId = randomUUID();
	const recommendedJobId = randomUUID();
	const freeJobId = randomUUID();
	const unpaidJobId = randomUUID();
	const expiredJobId = randomUUID();
	const jobPostIds = [
		specialJobId,
		urgentJobId,
		recommendedJobId,
		freeJobId,
		unpaidJobId,
		expiredJobId,
	];

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
		name: "노출 위치 테스트 조직",
		slug: `list-exposure-${randomUUID()}`,
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
		displayName: "노출 위치 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});

	const baseJob = (overrides: {
		exposureEndsAt: Date | null;
		exposureType: "recommended" | "special" | "standard" | "urgent";
		id: string;
		paymentStatus: "paid" | "unpaid";
		title: string;
	}) => ({
		createdByUserId: employerUserId,
		description: "노출 위치 섹션 배치를 검증하기 위한 공고입니다.",
		industryCategory: "룸싸롱" as const,
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		publishedAt: now,
		region,
		status: "published" as const,
		workSchedule: "20:00-02:00",
		...overrides,
	});

	await db.insert(jobPost).values([
		baseJob({
			exposureEndsAt: future,
			exposureType: "special",
			id: specialJobId,
			paymentStatus: "paid",
			title: "스페셜 노출 공고",
		}),
		baseJob({
			exposureEndsAt: future,
			exposureType: "urgent",
			id: urgentJobId,
			paymentStatus: "paid",
			title: "급구 노출 공고",
		}),
		baseJob({
			exposureEndsAt: future,
			exposureType: "recommended",
			id: recommendedJobId,
			paymentStatus: "paid",
			title: "추천 노출 공고",
		}),
		baseJob({
			exposureEndsAt: null,
			exposureType: "standard",
			id: freeJobId,
			paymentStatus: "paid",
			title: "무료 일반 공고",
		}),
		baseJob({
			exposureEndsAt: future,
			exposureType: "special",
			id: unpaidJobId,
			paymentStatus: "unpaid",
			title: "미결제 스페셜 공고",
		}),
		baseJob({
			exposureEndsAt: past,
			exposureType: "special",
			id: expiredJobId,
			paymentStatus: "paid",
			title: "만료 스페셜 공고",
		}),
	]);

	return {
		expiredJobId,
		freeJobId,
		jobPostIds,
		organizationId,
		recommendedJobId,
		region,
		seekerUserId,
		specialJobId,
		unpaidJobId,
		urgentJobId,
		userIds: [employerUserId, seekerUserId],
	};
};

const cleanupListExposureFixture = async (
	fixture: ListExposureFixture
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
};

// 공개 jobs.list는 조직 필터가 없는 전역 조회라, 병렬로 도는 다른 DB 테스트 픽스처의
// 공고까지 impression으로 기록한다. 픽스처 생성·목록 호출·정리를 한 번씩만 수행해 이
// 파일이 유발하는 교차 파일 경쟁(다른 테스트의 hard delete와 겹치는 FK 창)을 최소화한다.
let sharedFixture: ListExposureFixture;
let sharedResult: Awaited<ReturnType<typeof runList>>;

const runList = (input: { limit: number; region: string }) =>
	createProcedureClient(jobsRouter.list, {
		context: createContextForUser(sharedFixture.seekerUserId),
		path: ["bambi", "jobs", "list"],
	})(input);

describe("bambi jobs.list exposure sections", () => {
	beforeAll(async () => {
		sharedFixture = await createListExposureFixture();
		sharedResult = await runList({ limit: 30, region: sharedFixture.region });
	});

	afterAll(async () => {
		await cleanupListExposureFixture(sharedFixture);
	});

	it("결제완료된 유료 공고가 상품의 노출 위치 섹션에 배치된다", () => {
		expect(sharedResult.sections.special.map((j) => j.id)).toContain(
			sharedFixture.specialJobId
		);
		expect(sharedResult.sections.urgent.map((j) => j.id)).toContain(
			sharedFixture.urgentJobId
		);
		expect(sharedResult.sections.recommended.map((j) => j.id)).toContain(
			sharedFixture.recommendedJobId
		);
		expect(sharedResult.sections.organic.map((j) => j.id)).toContain(
			sharedFixture.freeJobId
		);
	});

	it("섹션 item에 노출 상품 라벨과 exposureType이 실린다", () => {
		const special = sharedResult.sections.special.find(
			(j) => j.id === sharedFixture.specialJobId
		);
		const organic = sharedResult.sections.organic.find(
			(j) => j.id === sharedFixture.freeJobId
		);

		expect(special).toMatchObject({
			exposureType: "special",
			isPromoted: true,
			promotionLabel: "스페셜 채용",
		});
		expect(organic).toMatchObject({
			exposureType: "standard",
			isPromoted: false,
			promotionLabel: null,
		});
	});

	it("미결제 유료 공고는 어느 섹션에도 노출되지 않는다", () => {
		const allIds = [
			...sharedResult.sections.special,
			...sharedResult.sections.urgent,
			...sharedResult.sections.recommended,
			...sharedResult.sections.organic,
		].map((j) => j.id);

		expect(allIds).not.toContain(sharedFixture.unpaidJobId);
	});

	it("만료된 유료 공고는 섹션에서 빠지고 전체 공고로 강등된다", () => {
		expect(sharedResult.sections.special.map((j) => j.id)).not.toContain(
			sharedFixture.expiredJobId
		);
		expect(sharedResult.sections.organic.map((j) => j.id)).toContain(
			sharedFixture.expiredJobId
		);
	});

	it("결제완료 유료 공고의 노출 위치 섹션 impression이 exposureType과 함께 기록된다", async () => {
		const [event] = await db
			.select()
			.from(jobPerformanceEvent)
			.where(eq(jobPerformanceEvent.jobPostId, sharedFixture.specialJobId))
			.limit(1);

		expect(event).toMatchObject({
			actorUserId: sharedFixture.seekerUserId,
			eventType: "impression",
			jobPostId: sharedFixture.specialJobId,
			organizationId: sharedFixture.organizationId,
		});
		expect(event?.metadata).toMatchObject({
			exposureType: "special",
			section: "special",
		});
	});
});
