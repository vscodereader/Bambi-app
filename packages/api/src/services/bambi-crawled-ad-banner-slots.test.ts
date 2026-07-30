import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, slots] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-crawled-ad-banner-slots"),
]);

const { organization, user } = authSchema;
const {
	bambiProfile,
	bambiSiteSettings,
	crawledJobPost,
	employerOrganizationProfile,
	jobPost,
} = bambiSchema;
const { loadCrawledAdBannerPools } = slots;

interface Fixture {
	bothDirectionsId: string;
	convertedCrawledId: string;
	horizontalOnlyId: string;
	jobPostId: string;
	namelessId: string;
	organizationId: string;
	sectionLabeledId: string;
	sourceExternalIds: string[];
	thumbnailOnlyId: string;
	unlabeledId: string;
	userId: string;
}

let fixture: Fixture;

const HORIZONTAL_URL = "https://cdn.example/horizontal.jpg";
const VERTICAL_URL = "https://cdn.example/vertical.jpg";

const collected = (
	id: string,
	sourceExternalId: string,
	overrides: Record<string, unknown> = {}
) => ({
	body: "수집 공고 본문입니다.",
	contentHash: randomUUID(),
	id,
	region: "서울",
	shopName: "수집 업소",
	sourceExternalId,
	sourceSite: "queenalba" as const,
	status: "active" as const,
	sourceUrl: `https://queenalba.example/${sourceExternalId}`,
	title: "수집 공고",
	...overrides,
});

const createFixture = async (): Promise<Fixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const userId = `user_test_employer_${randomUUID()}`;
	const jobPostId = randomUUID();
	const bothDirectionsId = randomUUID();
	const horizontalOnlyId = randomUUID();
	const thumbnailOnlyId = randomUUID();
	const unlabeledId = randomUUID();
	const sectionLabeledId = randomUUID();
	const convertedCrawledId = randomUUID();
	const namelessId = randomUUID();
	const sourceExternalIds = Array.from(
		{ length: 7 },
		() => `slot-${randomUUID()}`
	);

	await db.insert(user).values({
		email: `employer-${randomUUID()}@bambi.test`,
		id: userId,
		name: "채용 담당자",
	});
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "배너 슬롯 테스트 조직",
		slug: `slot-${randomUUID()}`,
	});
	await db.insert(bambiProfile).values({
		isPhoneVerified: true,
		role: "employer",
		status: "active",
		userId,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "배너 슬롯 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});

	await db.insert(crawledJobPost).values([
		// 지정 컨테이너 배너 두 방향 — 두 풀 모두에 든다.
		collected(bothDirectionsId, sourceExternalIds[0] as string, {
			bannerHorizontalUrl: HORIZONTAL_URL,
			bannerVerticalUrl: VERTICAL_URL,
			listingType: "ad_banner",
		}),
		// 가로형만 걸린 배너 공고 — 세로형은 빌려오지 않으므로 세로 풀에 없어야 한다.
		collected(horizontalOnlyId, sourceExternalIds[1] as string, {
			bannerHorizontalUrl: HORIZONTAL_URL,
			listingType: "ad_banner",
		}),
		// 배너 라벨은 있지만 방향 배너가 없고 썸네일만 있는 공고 — 썸네일은 배너가 아니다.
		collected(thumbnailOnlyId, sourceExternalIds[2] as string, {
			listingType: "ad_banner",
			thumbnailUrl: "https://cdn.example/thumb.jpg",
		}),
		// 배너 URL이 있어도 라벨이 없으면 원본에서 광고 자리가 아니었다.
		collected(unlabeledId, sourceExternalIds[3] as string, {
			bannerHorizontalUrl: HORIZONTAL_URL,
			bannerVerticalUrl: VERTICAL_URL,
		}),
		// 섹션 라벨(스페셜)은 배너 자격이 아니다.
		collected(sectionLabeledId, sourceExternalIds[4] as string, {
			bannerHorizontalUrl: HORIZONTAL_URL,
			listingType: "special",
		}),
		// 전환이 끝난 원본 — 결제 광고 쪽에서 다뤄지므로 여기서는 빠진다.
		collected(convertedCrawledId, sourceExternalIds[5] as string, {
			bannerHorizontalUrl: HORIZONTAL_URL,
			listingType: "ad_banner",
		}),
		// 업소명이 없어 배너에 이름을 붙일 수 없는 공고.
		collected(namelessId, sourceExternalIds[6] as string, {
			bannerHorizontalUrl: HORIZONTAL_URL,
			listingType: "ad_banner",
			shopName: null,
		}),
	]);

	await db.insert(jobPost).values({
		crawledFromId: convertedCrawledId,
		createdByUserId: userId,
		description: "전환된 공고 본문입니다.",
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		paymentStatus: "paid",
		publishedAt: now,
		region: "서울",
		source: "converted",
		status: "published",
		title: "전환된 공고",
		workSchedule: "20:00-02:00",
	});

	return {
		bothDirectionsId,
		convertedCrawledId,
		horizontalOnlyId,
		jobPostId,
		namelessId,
		organizationId,
		sectionLabeledId,
		sourceExternalIds,
		thumbnailOnlyId,
		unlabeledId,
		userId,
	};
};

const cleanupFixture = async (target: Fixture): Promise<void> => {
	await db.delete(jobPost).where(eq(jobPost.id, target.jobPostId));
	await db
		.delete(crawledJobPost)
		.where(inArray(crawledJobPost.sourceExternalId, target.sourceExternalIds));
	await db
		.delete(employerOrganizationProfile)
		.where(
			eq(employerOrganizationProfile.organizationId, target.organizationId)
		);
	await db.delete(bambiProfile).where(eq(bambiProfile.userId, target.userId));
	await db.delete(user).where(eq(user.id, target.userId));
	await db
		.delete(organization)
		.where(eq(organization.id, target.organizationId));
};

// 풀 자격은 파서 라벨(listing_type='ad_banner')과 방향 배너 URL 둘 다를 요구한다. 예전 규칙
// ("이미지가 하나라도 있는 active 공고" + 썸네일 폴백 + 다른 공고 세로형 빌려오기)은 배너를
// 산 적 없는 일반 공고를 광고 자리에 올리는 통로였으므로, 그 통로가 닫혔는지 못박는다.
describe("loadCrawledAdBannerPools", () => {
	// 풀은 firstSeenAt 최신순으로 상한(운영자 설정, 기본 8)까지만 읽는다. 개발 DB를 공유하므로
	// 상한을 넉넉히 올려 픽스처가 다른 행에 밀려 잘리지 않게 하고, 끝나면 원래 값으로 되돌린다.
	let previousLimit: null | number = null;

	beforeAll(async () => {
		const [before] = await db
			.select({ limit: bambiSiteSettings.crawledAdBannerLimit })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"));

		previousLimit = before?.limit ?? null;
		await db
			.insert(bambiSiteSettings)
			.values({ crawledAdBannerLimit: 60, id: "default" })
			.onConflictDoUpdate({
				set: { crawledAdBannerLimit: 60 },
				target: bambiSiteSettings.id,
			});
		fixture = await createFixture();
	});

	afterAll(async () => {
		await cleanupFixture(fixture);
		await db
			.update(bambiSiteSettings)
			.set({ crawledAdBannerLimit: previousLimit })
			.where(eq(bambiSiteSettings.id, "default"));
	});

	it("배너 라벨이 붙고 그 방향 URL이 있는 공고만 풀에 담는다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const horizontal = new Map(
			pools.horizontal.map((row) => [row.id, row.adHorizontalUrl])
		);
		const vertical = new Map(
			pools.vertical.map((row) => [row.id, row.adVerticalUrl])
		);

		expect(horizontal.get(fixture.bothDirectionsId)).toBe(HORIZONTAL_URL);
		expect(vertical.get(fixture.bothDirectionsId)).toBe(VERTICAL_URL);
		expect(horizontal.get(fixture.horizontalOnlyId)).toBe(HORIZONTAL_URL);
	});

	it("세로형이 없는 공고에 다른 공고의 세로형을 빌려주지 않는다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const verticalIds = new Set(pools.vertical.map((row) => row.id));

		expect(verticalIds.has(fixture.horizontalOnlyId)).toBe(false);
	});

	it("썸네일만 있는 공고는 어느 풀에도 넣지 않는다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const ids = new Set(
			[...pools.horizontal, ...pools.vertical].map((row) => row.id)
		);

		expect(ids.has(fixture.thumbnailOnlyId)).toBe(false);
	});

	it("배너 라벨이 없거나 섹션 라벨인 공고는 배너 자격이 없다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const ids = new Set(
			[...pools.horizontal, ...pools.vertical].map((row) => row.id)
		);

		expect(ids.has(fixture.unlabeledId)).toBe(false);
		expect(ids.has(fixture.sectionLabeledId)).toBe(false);
	});

	it("전환된 원본·업소명 없는 원본은 뺀다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const ids = new Set(
			[...pools.horizontal, ...pools.vertical].map((row) => row.id)
		);

		expect(ids.has(fixture.convertedCrawledId)).toBe(false);
		expect(ids.has(fixture.namelessId)).toBe(false);
	});
});

// 상한은 수집 쪽(capBannersByDirection)과 같이 방향별로 걸린다. 합쳐서 한 번 자르던 시절엔
// 최근 행이 가로로 치우친 순간 세로 풀이 통째로 비어, 우측 세로 배너 칸(3칸)이 그대로 굶었다.
describe("loadCrawledAdBannerPools — 방향별 상한", () => {
	// 픽스처가 항상 최신 행이 되도록 firstSeenAt을 먼 미래로 둔다(공유 dev DB의 실제 행은
	// 수집 시각이 모두 과거다). 가로를 세로보다 더 최근으로 두면, 상한 1을 합쳐서 자를 때
	// 가로 한 건이 그 한 칸을 다 먹고 세로가 밀려나던 상황이 그대로 재현된다.
	const VERTICAL_SEEN_AT = new Date("2099-01-01T00:00:00.000Z");
	const HORIZONTAL_SEEN_AT = new Date(VERTICAL_SEEN_AT.getTime() + 1000);
	const horizontalOnlyId = randomUUID();
	const verticalOnlyId = randomUUID();
	const sourceExternalIds = [`cap-${randomUUID()}`, `cap-${randomUUID()}`];
	let savedLimit: null | number = null;

	beforeAll(async () => {
		const [before] = await db
			.select({ limit: bambiSiteSettings.crawledAdBannerLimit })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"));

		savedLimit = before?.limit ?? null;
		await db
			.insert(bambiSiteSettings)
			.values({ crawledAdBannerLimit: 1, id: "default" })
			.onConflictDoUpdate({
				set: { crawledAdBannerLimit: 1 },
				target: bambiSiteSettings.id,
			});
		await db.insert(crawledJobPost).values([
			collected(horizontalOnlyId, sourceExternalIds[0] as string, {
				bannerHorizontalUrl: HORIZONTAL_URL,
				firstSeenAt: HORIZONTAL_SEEN_AT,
				listingType: "ad_banner",
			}),
			collected(verticalOnlyId, sourceExternalIds[1] as string, {
				bannerVerticalUrl: VERTICAL_URL,
				firstSeenAt: VERTICAL_SEEN_AT,
				listingType: "ad_banner",
			}),
		]);
	});

	afterAll(async () => {
		await db
			.delete(crawledJobPost)
			.where(inArray(crawledJobPost.sourceExternalId, sourceExternalIds));
		await db
			.update(bambiSiteSettings)
			.set({ crawledAdBannerLimit: savedLimit })
			.where(eq(bambiSiteSettings.id, "default"));
	});

	it("한 방향이 상한을 다 써도 다른 방향 풀은 남는다", async () => {
		const pools = await loadCrawledAdBannerPools();

		expect(pools.horizontal.map((row) => row.id)).toEqual([horizontalOnlyId]);
		expect(pools.vertical.map((row) => row.id)).toEqual([verticalOnlyId]);
	});
});
