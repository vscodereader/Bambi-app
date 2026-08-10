import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	PREMIUM_BANNER_MAX_SLOTS,
	SIDE_BANNER_MAX_SLOTS,
} from "@/services/bambi-ad-exposure";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { jobsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/jobs"),
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
		industryCategory: "룸싸롱" as const,
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

// 광고 통합 후 상단·좌·우 세 슬롯은 하나의 프리미엄 풀(배너 3종 전부)을 공유해, 좌→중간(상단
// 프리미엄)→우 순서로 도는 컨베이어(밀어내기) 순환으로 채운다 — 한 광고는 언제나 정확히 한
// 칸에만 존재하고, 광고가 8개 이상이면 8칸 전부 서로 다른 광고로 채워진다(순환 상세는
// bambi-ad-exposure.test.ts가 유닛으로 커버). 이 테스트는 실 dev DB를 쓰고 DB에 기존 배너
// 공고가 있어 어떤 공고가 이번 버킷에 노출되는지 절대적으로는 검증할 수 없다. 여기서는 기존
// 데이터와 공존하는 안정적 술어만 검증한다: 그룹은 고정 길이 배열이고, non-null 칸은 최대 8개·
// 서로 다른 공고이며, 미결제·만료 공고는 절대 노출되지 않는다. 활성 칸의 광고는 슬롯 방향
// 배너를 가진 경우에만 노출된다.
describe("bambi jobs.listAdBanners", () => {
	let fixture: AdBannerFixture;

	beforeAll(async () => {
		fixture = await createAdBannerFixture();
	});

	afterAll(async () => {
		await cleanupAdBannerFixture(fixture);
	});

	// 세 슬롯 중 실제 노출된(non-null) 공고 id의 집합. 컨베이어라 최대 8칸까지 채워질 수 있다.
	const shownIds = (result: {
		leftBanner: ({ id: string } | null)[];
		premiumBanner: ({ id: string } | null)[];
		rightBanner: ({ id: string } | null)[];
	}): Set<string> =>
		new Set(
			[...result.premiumBanner, ...result.leftBanner, ...result.rightBanner]
				.filter((job): job is { id: string } => job !== null)
				.map((job) => job.id)
		);

	it("상단·좌·우 세 슬롯을 고정 길이 배열로 반환한다", async () => {
		const result = await listAdBanners();
		expect(result.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(result.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(result.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});

	it("배너는 최대 8칸까지 노출되고 같은 공고가 두 칸에 겹치지 않는다", async () => {
		const result = await listAdBanners();
		const filledCount = [
			...result.premiumBanner,
			...result.leftBanner,
			...result.rightBanner,
		].filter((job) => job !== null).length;
		expect(filledCount).toBeLessThanOrEqual(8);
		// 한 광고는 언제나 정확히 한 칸에만 존재한다(중복 부재) — 고유 id 수 = 채워진 칸 수.
		expect(shownIds(result).size).toBe(filledCount);
	});

	it("미결제·만료 배너 공고는 어떤 슬롯에도 포함되지 않는다", async () => {
		const result = await listAdBanners();
		const shown = shownIds(result);

		expect(shown.has(fixture.unpaidPremiumJobId)).toBe(false);
		expect(shown.has(fixture.expiredLeftJobId)).toBe(false);
	});

	it("노출되면 슬롯 방향 광고 배너 원본을 커버와 함께 내려준다", async () => {
		const result = await listAdBanners();
		const union = [
			...result.premiumBanner,
			...result.leftBanner,
			...result.rightBanner,
		].filter((job) => job !== null);
		const premium = union.find((j) => j.id === fixture.premiumJobId);
		const right = union.find((j) => j.id === fixture.rightJobId);
		const left = union.find((j) => j.id === fixture.leftJobId);

		// 회귀 방지: 예전에는 usage='cover' 서브쿼리만 있어 배너 행이 아예 선택되지 않았다.
		// 링 순환상 픽스처가 이번 버킷 응답에 없을 수 있어, 노출된 경우에만 원본을 검증한다.
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

		// 배너(가로형)를 안 올린 좌측 픽스처는 방향 이미지가 없어 어떤 슬롯에도 노출되지 않는다.
		expect(left).toBeUndefined();
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
		// 통합 후 레거시 좌/우 공고가 프리미엄 슬롯에 배치되면 section≠exposureType이 정상이다.
		for (const [section, items] of shownBySlot) {
			for (const item of items) {
				// 응답에는 수집 배너도 섞일 수 있다(exposureType이 없는 행). 픽스처 id로 이미
				// 걸러지지만 타입상으로도 결제 광고 행임을 좁힌다.
				if (
					item === null ||
					!("exposureType" in item) ||
					!fixture.jobPostIds.includes(item.id)
				) {
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
