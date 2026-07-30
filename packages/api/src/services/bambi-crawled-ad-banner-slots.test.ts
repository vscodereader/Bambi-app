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
const { bambiProfile, crawledJobPost, employerOrganizationProfile, jobPost } =
	bambiSchema;
const { loadCrawledAdBannerPools } = slots;

interface Fixture {
	convertedCrawledId: string;
	horizontalOnlyId: string;
	jobPostId: string;
	namelessId: string;
	organizationId: string;
	sourceExternalIds: string[];
	userId: string;
	verticalOwnerId: string;
}

let fixture: Fixture;

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
	sourceUrl: `https://queenalba.example/${sourceExternalId}`,
	status: "active" as const,
	title: "수집 공고",
	...overrides,
});

const createFixture = async (): Promise<Fixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const userId = `user_test_employer_${randomUUID()}`;
	const jobPostId = randomUUID();
	const horizontalOnlyId = randomUUID();
	const verticalOwnerId = randomUUID();
	const convertedCrawledId = randomUUID();
	const namelessId = randomUUID();
	const noImageId = randomUUID();
	const sourceExternalIds = Array.from(
		{ length: 5 },
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
		// 썸네일만 있는 공고 — 가로형은 썸네일로 대체되고 세로형은 아래 공고에서 빌려온다.
		collected(horizontalOnlyId, sourceExternalIds[0] as string, {
			thumbnailUrl: "https://cdn.example/thumb.jpg",
		}),
		collected(verticalOwnerId, sourceExternalIds[1] as string, {
			bannerVerticalUrl: "https://cdn.example/vertical.jpg",
		}),
		// 전환이 끝난 원본 — 결제 광고 쪽에서 다뤄지므로 여기서는 빠진다.
		collected(convertedCrawledId, sourceExternalIds[2] as string, {
			thumbnailUrl: "https://cdn.example/converted.jpg",
		}),
		// 업소명이 없어 배너에 이름을 붙일 수 없는 공고.
		collected(namelessId, sourceExternalIds[3] as string, {
			shopName: null,
			thumbnailUrl: "https://cdn.example/nameless.jpg",
		}),
		// 이미지가 하나도 없는 공고.
		collected(noImageId, sourceExternalIds[4] as string),
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
		convertedCrawledId,
		horizontalOnlyId,
		jobPostId,
		namelessId,
		organizationId,
		sourceExternalIds,
		userId,
		verticalOwnerId,
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

describe("loadCrawledAdBannerPools", () => {
	beforeAll(async () => {
		fixture = await createFixture();
	});

	afterAll(async () => {
		await cleanupFixture(fixture);
	});

	it("방향별 풀에 그 방향 이미지가 있는 공고만 담는다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const horizontal = new Map(
			pools.horizontal.map((row) => [row.id, row.adHorizontalUrl])
		);
		const vertical = new Map(
			pools.vertical.map((row) => [row.id, row.adVerticalUrl])
		);

		// 가로형이 없으면 썸네일로 대체된다.
		expect(horizontal.get(fixture.horizontalOnlyId)).toBe(
			"https://cdn.example/thumb.jpg"
		);
		// 세로형이 없으면 다른 공고의 세로형을 빌린다.
		expect(vertical.get(fixture.horizontalOnlyId)).toBe(
			"https://cdn.example/vertical.jpg"
		);
		expect(vertical.get(fixture.verticalOwnerId)).toBe(
			"https://cdn.example/vertical.jpg"
		);
	});

	it("빌린 세로형은 출처 공고를 함께 알려준다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const borrower = pools.vertical.find(
			(row) => row.id === fixture.horizontalOnlyId
		);
		const owner = pools.vertical.find(
			(row) => row.id === fixture.verticalOwnerId
		);

		// 이미지 주인과 배너가 걸린 공고가 다르다는 사실이 응답에 남아야 한다.
		expect(borrower?.verticalBorrowedFrom).not.toBeNull();
		expect(owner?.verticalBorrowedFrom).toBeNull();
	});

	it("전환된 원본·업소명 없는 원본·이미지 없는 원본은 뺀다", async () => {
		const pools = await loadCrawledAdBannerPools();
		const ids = new Set(
			[...pools.horizontal, ...pools.vertical].map((row) => row.id)
		);

		expect(ids.has(fixture.convertedCrawledId)).toBe(false);
		expect(ids.has(fixture.namelessId)).toBe(false);
	});
});
