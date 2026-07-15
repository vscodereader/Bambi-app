import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
const { bambiProfile, employerOrganizationProfile, jobPost } = bambiSchema;

interface AdBannerFixture {
	expiredLeftJobId: string;
	jobPostIds: string[];
	leftJobId: string;
	organizationId: string;
	premiumJobId: string;
	rightJobId: string;
	unpaidPremiumJobId: string;
	userIds: string[];
}

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

const HOUR_MS = 60 * 60 * 1000;

const createAdBannerFixture = async (): Promise<AdBannerFixture> => {
	const now = new Date();
	const future = new Date(now.getTime() + 24 * HOUR_MS);
	const past = new Date(now.getTime() - 24 * HOUR_MS);
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;

	const premiumJobId = randomUUID();
	const leftJobId = randomUUID();
	const rightJobId = randomUUID();
	const unpaidPremiumJobId = randomUUID();
	const expiredLeftJobId = randomUUID();
	const jobPostIds = [
		premiumJobId,
		leftJobId,
		rightJobId,
		unpaidPremiumJobId,
		expiredLeftJobId,
	];

	await db.insert(user).values({
		email: makeEmail("employer"),
		id: employerUserId,
		name: "채용 담당자",
	});
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "배너 노출 테스트 조직",
		slug: `ad-banners-${randomUUID()}`,
	});
	await db.insert(bambiProfile).values({
		displayName: "채용 담당자",
		isPhoneVerified: true,
		role: "employer",
		status: "active",
		userId: employerUserId,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "배너 노출 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});

	const baseJob = (overrides: {
		exposureEndsAt: Date | null;
		exposureType: "left-banner" | "premium-banner" | "right-banner";
		id: string;
		paymentStatus: "paid" | "unpaid";
		title: string;
	}) => ({
		createdByUserId: employerUserId,
		description: "배너 슬롯 그룹핑을 검증하기 위한 공고입니다.",
		industryCategory: "라운지",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		// 전역 조회라 병렬 픽스처가 섞인다 — 최신 publishedAt으로 슬롯 한도 정렬에서 밀리지 않게 한다.
		publishedAt: now,
		region: `ad-banners-${randomUUID()}`,
		status: "published" as const,
		workSchedule: "20:00-02:00",
		...overrides,
	});

	await db.insert(jobPost).values([
		baseJob({
			exposureEndsAt: future,
			exposureType: "premium-banner",
			id: premiumJobId,
			paymentStatus: "paid",
			title: "프리미엄 배너 공고",
		}),
		baseJob({
			exposureEndsAt: future,
			exposureType: "left-banner",
			id: leftJobId,
			paymentStatus: "paid",
			title: "좌측 배너 공고",
		}),
		baseJob({
			exposureEndsAt: future,
			exposureType: "right-banner",
			id: rightJobId,
			paymentStatus: "paid",
			title: "우측 배너 공고",
		}),
		baseJob({
			exposureEndsAt: future,
			exposureType: "premium-banner",
			id: unpaidPremiumJobId,
			paymentStatus: "unpaid",
			title: "미결제 프리미엄 배너 공고",
		}),
		baseJob({
			exposureEndsAt: past,
			exposureType: "left-banner",
			id: expiredLeftJobId,
			paymentStatus: "paid",
			title: "만료 좌측 배너 공고",
		}),
	]);

	return {
		expiredLeftJobId,
		jobPostIds,
		leftJobId,
		organizationId,
		premiumJobId,
		rightJobId,
		unpaidPremiumJobId,
		userIds: [employerUserId],
	};
};

const cleanupAdBannerFixture = async (
	fixture: AdBannerFixture
): Promise<void> => {
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

const listAdBanners = () =>
	createProcedureClient(jobsRouter.listAdBanners, {
		context: {} as never,
		path: ["bambi", "jobs", "listAdBanners"],
	})(undefined as never);

describe("bambi jobs.listAdBanners", () => {
	let fixture: AdBannerFixture;

	beforeAll(async () => {
		fixture = await createAdBannerFixture();
	});

	afterAll(async () => {
		await cleanupAdBannerFixture(fixture);
	});

	it("결제완료·미만료 배너 공고를 노출 위치별로 그룹핑해 반환한다", async () => {
		const result = await listAdBanners();
		expect(result.premiumBanner.map((j) => j.id)).toContain(
			fixture.premiumJobId
		);
		expect(result.leftBanner.map((j) => j.id)).toContain(fixture.leftJobId);
		expect(result.rightBanner.map((j) => j.id)).toContain(fixture.rightJobId);
	});

	it("미결제·만료 배너 공고는 제외한다", async () => {
		const result = await listAdBanners();
		expect(result.premiumBanner.map((j) => j.id)).not.toContain(
			fixture.unpaidPremiumJobId
		);
		expect(result.leftBanner.map((j) => j.id)).not.toContain(
			fixture.expiredLeftJobId
		);
	});
});
