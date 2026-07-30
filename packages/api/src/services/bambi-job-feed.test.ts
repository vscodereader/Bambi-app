import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, feed] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-job-feed"),
]);

const { organization, user } = authSchema;
const {
	bambiProfile,
	crawledJobPost,
	employerOrganizationProfile,
	jobPost,
	review,
} = bambiSchema;
const {
	crawledJobFeedSelection,
	jobPostFeedSelection,
	listJobFeed,
	minHourlyPayFilter,
} = feed;

interface Fixture {
	convertedCrawledId: string;
	crawledId: string;
	jobPostIds: string[];
	organizationId: string;
	region: string;
	sourceExternalIds: string[];
	thinCrawledId: string;
	userId: string;
}

let fixture: Fixture;

const HOUR_MS = 60 * 60 * 1000;

const createFixture = async (): Promise<Fixture> => {
	const now = new Date();
	// job_post·crawled_job_post 모두 전역 조회라, 고유 region으로만 걸러 병렬 테스트와 격리한다.
	const region = `feed-${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const userId = `user_test_employer_${randomUUID()}`;
	const jobPostId = randomUUID();
	const convertedJobPostId = randomUUID();
	const crawledId = randomUUID();
	const convertedCrawledId = randomUUID();
	const thinCrawledId = randomUUID();
	const sourceExternalIds = [
		`feed-${randomUUID()}`,
		`feed-${randomUUID()}`,
		`feed-${randomUUID()}`,
	];

	await db.insert(user).values({
		email: `employer-${randomUUID()}@bambi.test`,
		id: userId,
		name: "채용 담당자",
	});
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "합친 목록 테스트 조직",
		slug: `feed-${randomUUID()}`,
	});
	await db.insert(bambiProfile).values({
		isPhoneVerified: true,
		role: "employer",
		status: "active",
		userId,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "합친 목록 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});

	const ourPost = (id: string, overrides: Record<string, unknown> = {}) => ({
		createdByUserId: userId,
		description: "우리 공고 본문입니다.",
		id,
		industryCategory: "룸싸롱" as const,
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		paymentStatus: "paid" as const,
		publishedAt: new Date(now.getTime() - HOUR_MS),
		region,
		status: "published" as const,
		title: "우리 공고",
		workSchedule: "20:00-02:00",
		...overrides,
	});

	const collected = (
		id: string,
		sourceExternalId: string,
		overrides: Record<string, unknown> = {}
	) => ({
		body: "수집 공고 본문입니다.",
		contentHash: randomUUID(),
		id,
		industryCategory: "BAR" as const,
		payAmount: 150_000,
		payUnit: "일급",
		region,
		shopName: "수집 업소",
		sourceExternalId,
		sourceSite: "queenalba" as const,
		sourceUrl: `https://queenalba.example/${sourceExternalId}`,
		title: "수집 공고",
		workSchedule: "19:00-01:00",
		...overrides,
	});

	await db.insert(crawledJobPost).values([
		collected(crawledId, sourceExternalIds[0] as string, {
			listingType: "premium",
			sourcePostedAt: new Date(now.getTime() - 2 * HOUR_MS),
			thumbnailUrl: "https://cdn.example/thumb.jpg",
		}),
		// 전환이 끝난 원본. 아래 job_post가 이 행을 가리키므로 목록에서 빠져야 한다.
		collected(convertedCrawledId, sourceExternalIds[1] as string),
		// 지역이 비어 카드로 세울 수 없는 원본.
		collected(thinCrawledId, sourceExternalIds[2] as string, { region: null }),
	]);

	await db.insert(jobPost).values([
		ourPost(jobPostId),
		ourPost(convertedJobPostId, {
			crawledFromId: convertedCrawledId,
			source: "converted" as const,
			title: "전환된 공고",
		}),
	]);

	return {
		convertedCrawledId,
		crawledId,
		jobPostIds: [jobPostId, convertedJobPostId],
		organizationId,
		region,
		sourceExternalIds,
		thinCrawledId,
		userId,
	};
};

const cleanupFixture = async (target: Fixture): Promise<void> => {
	await db.delete(review).where(inArray(review.jobPostId, target.jobPostIds));
	await db.delete(jobPost).where(inArray(jobPost.id, target.jobPostIds));
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

describe("공고 목록 투영", () => {
	// UNION ALL은 컬럼을 이름이 아니라 위치로 맞춘다. 키 순서가 어긋나면 title 자리에
	// workSchedule이 들어가는 식으로 조용히 뒤섞이므로 순서까지 비교한다.
	it("두 투영의 키와 순서가 같다", () => {
		expect(Object.keys(crawledJobFeedSelection)).toEqual(
			Object.keys(jobPostFeedSelection)
		);
	});

	it("최소 시급 환산표를 두 테이블에 같은 식으로 적용한다", () => {
		const ours = minHourlyPayFilter(10_000, jobPost.payAmount, jobPost.payUnit);
		const theirs = minHourlyPayFilter(
			10_000,
			crawledJobPost.payAmount,
			crawledJobPost.payUnit
		);

		expect(ours.queryChunks.length).toBe(theirs.queryChunks.length);
	});
});

describe("listJobFeed", () => {
	beforeAll(async () => {
		fixture = await createFixture();
	});

	afterAll(async () => {
		await cleanupFixture(fixture);
	});

	it("우리 공고와 수집 공고를 한 결과로 합쳐 내린다", async () => {
		const rows = await listJobFeed({
			includeCrawled: true,
			limit: 20,
			region: fixture.region,
		});
		const bySource = new Map(rows.map((row) => [row.source, row]));

		expect(rows).toHaveLength(3);
		expect([...bySource.keys()].toSorted()).toEqual([
			"converted",
			"crawled",
			"original",
		]);
		// 수집 공고가 먼저 오면 안 된다 — 정렬은 게시일 최신순이고 수집 원본이 더 오래됐다.
		expect(rows.at(-1)?.source).toBe("crawled");
	});

	it("수집 공고에 우리 보증·유료 노출·평점을 붙이지 않는다", async () => {
		const rows = await listJobFeed({
			includeCrawled: true,
			limit: 20,
			region: fixture.region,
		});
		const collected = rows.find((row) => row.source === "crawled");

		expect(collected).toMatchObject({
			beginnerFriendly: false,
			coverImage: null,
			coverImageUrl: "https://cdn.example/thumb.jpg",
			employerDisplayName: "수집 업소",
			employerVerificationStatus: "none",
			exposureType: "standard",
			id: fixture.crawledId,
			instantInterview: false,
			// 원본 사이트의 유료 자리는 신호로 남긴다(우리 노출 등급과는 별개).
			listingType: "premium",
			organizationId: null,
			ratingAverage: 0,
			ratingCount: 0,
			status: "published",
			teamDisplayName: null,
		});
	});

	it("이미 전환된 원본과 지역이 빈 원본은 목록에서 뺀다", async () => {
		const rows = await listJobFeed({
			includeCrawled: true,
			limit: 20,
			region: fixture.region,
		});
		const ids = rows.map((row) => row.id);

		expect(ids).not.toContain(fixture.convertedCrawledId);
		expect(ids).not.toContain(fixture.thinCrawledId);
	});

	it("업종·최소 시급 필터를 두 원천에 함께 적용한다", async () => {
		const barOnly = await listJobFeed({
			includeCrawled: true,
			industryCategory: "BAR",
			limit: 20,
			region: fixture.region,
		});

		expect(barOnly.map((row) => row.source)).toEqual(["crawled"]);

		// 일급 150,000원 = 시급 18,750원. 하한을 그 위로 올리면 수집 공고만 걸러진다.
		const wellPaid = await listJobFeed({
			includeCrawled: true,
			limit: 20,
			minPayAmount: 20_000,
			region: fixture.region,
		});

		expect(wellPaid.every((row) => row.source !== "crawled")).toBe(true);
	});

	// 노출 스위치가 꺼져 있으면 수집 공고가 한 건도 나오지 않아야 한다. 호출부가 플래그를
	// 잊었을 때 남의 공고가 그대로 공개되는 것이 이 기능에서 가장 비싼 실수다.
	it("수집 노출이 꺼져 있으면 우리 공고만 내린다", async () => {
		const rows = await listJobFeed({
			includeCrawled: false,
			limit: 20,
			region: fixture.region,
		});

		expect(rows.every((row) => row.source !== "crawled")).toBe(true);
		expect(rows).toHaveLength(2);
	});

	// 기본값 검증: 플래그를 생략하면 운영자 설정을 읽고, 그 기본은 꺼짐이다.
	it("플래그를 생략하면 운영자 설정을 따른다", async () => {
		const rows = await listJobFeed({ limit: 20, region: fixture.region });

		expect(rows.every((row) => row.source !== "crawled")).toBe(true);
	});
});
