import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	PREMIUM_BANNER_MAX_SLOTS,
	SIDE_BANNER_MAX_SLOTS,
} from "../../services/bambi-ad-exposure";

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
	jobPostMedia,
} = bambiSchema;

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

	// 배너 슬롯이 커버가 아니라 업로드된 배너를 내려주는지 보기 위한 미디어 픽스처다.
	// 프리미엄=가로 배너+커버, 우측=세로 배너+커버, 좌측=커버만(배너 미업로드 폴백 케이스).
	const bannerMedia = (overrides: {
		jobPostId: string;
		storageKey: string;
		usage: "ad_horizontal" | "ad_vertical" | "cover";
	}) => ({
		byteSize: 2048,
		fileName: `${overrides.usage}.png`,
		mimeType: "image/png",
		organizationId,
		position: 0,
		uploadedByUserId: employerUserId,
		...overrides,
	});

	await db.insert(jobPostMedia).values([
		bannerMedia({
			jobPostId: premiumJobId,
			storageKey: `cover/${premiumJobId}.png`,
			usage: "cover",
		}),
		bannerMedia({
			jobPostId: premiumJobId,
			storageKey: `ad-h/${premiumJobId}.png`,
			usage: "ad_horizontal",
		}),
		bannerMedia({
			jobPostId: rightJobId,
			storageKey: `cover/${rightJobId}.png`,
			usage: "cover",
		}),
		bannerMedia({
			jobPostId: rightJobId,
			storageKey: `ad-v/${rightJobId}.png`,
			usage: "ad_vertical",
		}),
		bannerMedia({
			jobPostId: leftJobId,
			storageKey: `cover/${leftJobId}.png`,
			usage: "cover",
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

const listAdBanners = () =>
	createProcedureClient(jobsRouter.listAdBanners, {
		context: {} as never,
		path: ["bambi", "jobs", "listAdBanners"],
	})(undefined as never);

// 광고 통합 후 상단·좌·우 세 슬롯은 하나의 프리미엄 풀(배너 3종 전부)을 공유해 슬롯마다
// 독립 셔플·추첨한다. 이 테스트는 실 dev DB를 쓰고 DB에 기존 배너 공고가 있어 어떤 공고가
// 어느 슬롯에 뽑히는지 결정적으로 검증할 수 없다(셔플·추첨 상세는 bambi-ad-exposure.test.ts가
// 유닛으로 커버). 여기서는 기존 데이터와 공존하는 안정적 술어만 검증한다.
describe("bambi jobs.listAdBanners", () => {
	let fixture: AdBannerFixture;

	beforeAll(async () => {
		fixture = await createAdBannerFixture();
	});

	afterAll(async () => {
		await cleanupAdBannerFixture(fixture);
	});

	// 세 슬롯 노출 id의 합집합. 통합 풀에선 한 공고가 여러 슬롯에 동시에 뽑힐 수 있다.
	const shownIds = (result: {
		leftBanner: { id: string }[];
		premiumBanner: { id: string }[];
		rightBanner: { id: string }[];
	}): Set<string> =>
		new Set(
			[
				...result.premiumBanner,
				...result.leftBanner,
				...result.rightBanner,
			].map((job) => job.id)
		);

	// 모든 슬롯이 상한까지 찼는가 — 활성 후보(풀)가 슬롯보다 많다는 뜻이라, 이때는 특정
	// 활성 공고가 기존 데이터에 밀려 어느 슬롯에도 안 보일 수 있다. 슬롯에 여유가 있으면
	// (풀이 상한 이하이면) 활성 배너형 공고는 반드시 그 슬롯에 전원 노출된다.
	const slotsSaturated = (result: {
		leftBanner: unknown[];
		premiumBanner: unknown[];
		rightBanner: unknown[];
	}): boolean =>
		result.premiumBanner.length === PREMIUM_BANNER_MAX_SLOTS &&
		result.leftBanner.length === SIDE_BANNER_MAX_SLOTS &&
		result.rightBanner.length === SIDE_BANNER_MAX_SLOTS;

	it("상단·좌·우 세 슬롯 그룹을 배열로 반환한다", async () => {
		const result = await listAdBanners();
		expect(Array.isArray(result.premiumBanner)).toBe(true);
		expect(Array.isArray(result.leftBanner)).toBe(true);
		expect(Array.isArray(result.rightBanner)).toBe(true);
	});

	it("슬롯 상한(프리미엄 2, 좌 3, 우 3)을 넘지 않는다", async () => {
		const result = await listAdBanners();
		expect(result.premiumBanner.length).toBeLessThanOrEqual(
			PREMIUM_BANNER_MAX_SLOTS
		);
		expect(result.leftBanner.length).toBeLessThanOrEqual(SIDE_BANNER_MAX_SLOTS);
		expect(result.rightBanner.length).toBeLessThanOrEqual(
			SIDE_BANNER_MAX_SLOTS
		);
	});

	it("결제완료·게시·미만료 배너형(레거시 좌/우 포함) 공고는 통합 풀 후보가 된다", async () => {
		const result = await listAdBanners();
		const shown = shownIds(result);
		const saturated = slotsSaturated(result);

		// 프리미엄·레거시 좌·레거시 우 픽스처 모두 통합 풀 후보다. 슬롯에 여유가 있으면
		// 반드시 노출되고, 슬롯이 다 찼으면 기존 데이터에 밀려 빠질 수 있다.
		for (const id of [
			fixture.premiumJobId,
			fixture.leftJobId,
			fixture.rightJobId,
		]) {
			expect(shown.has(id) || saturated).toBe(true);
		}
	});

	it("미결제·만료 배너 공고는 어떤 슬롯에도 포함되지 않는다", async () => {
		const result = await listAdBanners();
		const shown = shownIds(result);

		expect(shown.has(fixture.unpaidPremiumJobId)).toBe(false);
		expect(shown.has(fixture.expiredLeftJobId)).toBe(false);
	});

	it("노출되면 슬롯별 광고 배너 원본을 커버와 함께 내려준다", async () => {
		const result = await listAdBanners();
		const union = [
			...result.premiumBanner,
			...result.leftBanner,
			...result.rightBanner,
		];
		const premium = union.find((j) => j.id === fixture.premiumJobId);
		const right = union.find((j) => j.id === fixture.rightJobId);
		const left = union.find((j) => j.id === fixture.leftJobId);

		// 회귀 방지: 예전에는 usage='cover' 서브쿼리만 있어 배너 행이 아예 선택되지 않았다.
		// 통합 풀 추첨상 픽스처가 이번 응답에 없을 수 있어, 노출된 경우에만 원본을 검증한다.
		if (premium) {
			expect(premium.adHorizontal?.storageKey).toBe(
				`ad-h/${fixture.premiumJobId}.png`
			);
			expect(premium.coverImage?.storageKey).toBe(
				`cover/${fixture.premiumJobId}.png`
			);
		}

		if (right) {
			expect(right.adVertical?.storageKey).toBe(
				`ad-v/${fixture.rightJobId}.png`
			);
		}

		// 배너를 안 올린 공고는 배너가 null이고 커버로 폴백한다.
		if (left) {
			expect(left.adHorizontal).toBeNull();
			expect(left.coverImage?.storageKey).toBe(
				`cover/${fixture.leftJobId}.png`
			);
		}
	});

	it("노출된 배너에 section=노출 슬롯·exposureType=공고 실제값 impression을 기록한다", async () => {
		const result = await listAdBanners();
		const shownBySlot = [
			["premium-banner", result.premiumBanner],
			["left-banner", result.leftBanner],
			["right-banner", result.rightBanner],
		] as const;

		const events = await db
			.select()
			.from(jobPerformanceEvent)
			.where(inArray(jobPerformanceEvent.jobPostId, fixture.jobPostIds));
		// jobPostId → 기록된 "section|exposureType" 집합.
		const recorded = new Map<string, Set<string>>();

		for (const event of events) {
			if (event.eventType !== "impression") {
				continue;
			}

			const metadata = event.metadata as {
				exposureType?: string;
				section?: string;
			} | null;
			const keys = recorded.get(event.jobPostId) ?? new Set<string>();
			keys.add(`${metadata?.section}|${metadata?.exposureType}`);
			recorded.set(event.jobPostId, keys);
		}

		// 이번 응답에 노출된 픽스처는 section=슬롯, exposureType=공고 실제값으로 기록돼야 한다.
		// 통합 후 레거시 좌/우 공고가 프리미엄 슬롯에 뽑히면 section≠exposureType이 정상이다.
		for (const [section, items] of shownBySlot) {
			for (const item of items) {
				if (!fixture.jobPostIds.includes(item.id)) {
					continue;
				}

				expect(
					recorded.get(item.id)?.has(`${section}|${item.exposureType}`)
				).toBe(true);
			}
		}

		// 미결제·만료 공고는 노출도 기록도 없다.
		expect(recorded.has(fixture.unpaidPremiumJobId)).toBe(false);
		expect(recorded.has(fixture.expiredLeftJobId)).toBe(false);
	});
});
