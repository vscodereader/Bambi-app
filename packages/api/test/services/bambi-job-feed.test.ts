import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config({
	path: "../../apps/server/.env",
});

// jobs.list의 수집 주입 테스트가 이 파일에 함께 있는 이유: 두 테스트 모두 사이트 설정 한 행
// (crawled_job_feed_enabled)을 켜고 끄는데, vitest는 **파일 단위로 병렬** 실행한다. 다른
// 파일에 두면 서로의 스위치를 덮어써 둘 다 간헐적으로 깨진다(같은 파일 안에서는 순차 실행).
const [
	{ db },
	authSchema,
	bambiSchema,
	feed,
	{ jobsRouter },
	{ createTestRegion, deleteTestRegion },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/services/bambi-job-feed"),
	import("@/routers/bambi/jobs"),
	import("@/services/__fixtures__/test-region"),
]);

const { organization, user } = authSchema;
const {
	bambiProfile,
	bambiSiteSettings,
	crawledJobPost,
	employerOrganizationProfile,
	jobPerformanceEvent,
	jobPost,
	review,
} = bambiSchema;
const {
	crawledJobFeedSelection,
	jobPostFeedSelection,
	listCrawledSectionRows,
	listJobFeed,
	minHourlyPayFilter,
} = feed;

interface Fixture {
	convertedCrawledId: string;
	crawledId: string;
	jobPostIds: string[];
	organizationId: string;
	regionCode: string;
	sourceExternalIds: string[];
	specialCrawledIds: string[];
	specialJobPostId: string;
	specialRegionCode: string;
	thinCrawledId: string;
	userId: string;
}

let fixture: Fixture;

const HOUR_MS = 60 * 60 * 1000;

const createFixture = async (): Promise<Fixture> => {
	const now = new Date();
	// job_post·crawled_job_post 모두 전역 조회라, 일회용 지역으로만 걸러 병렬 테스트와 격리한다.
	const testRegion = await createTestRegion();
	// 섹션 조회 전용 지역 — 기존 합친 목록 단언(행 수·출처 집합)에 새 행이 끼지 않게 나눈다.
	const specialTestRegion = await createTestRegion();
	const organizationId = `org_test_${randomUUID()}`;
	const userId = `user_test_employer_${randomUUID()}`;
	const jobPostId = randomUUID();
	const convertedJobPostId = randomUUID();
	const specialJobPostId = randomUUID();
	const crawledId = randomUUID();
	const convertedCrawledId = randomUUID();
	const thinCrawledId = randomUUID();
	const specialCrawledIds = [randomUUID(), randomUUID()];
	const sourceExternalIds = Array.from(
		{ length: 5 },
		() => `feed-${randomUUID()}`
	);

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
		region: testRegion.label,
		regionCode: testRegion.code,
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
		region: testRegion.label,
		regionCode: testRegion.code,
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
		// 스페셜 자리 라벨이 붙은 원본 둘(섹션 주입·상한 검증용). 기존 listJobFeed 단언을
		// 흔들지 않도록 별도 지역으로 격리하고, 게시일을 벌려 정렬을 고정한다.
		collected(specialCrawledIds[0] as string, sourceExternalIds[3] as string, {
			listingType: "special",
			region: specialTestRegion.label,
			regionCode: specialTestRegion.code,
			sourcePostedAt: new Date(now.getTime() - HOUR_MS),
			title: "스페셜 수집 공고 최신",
		}),
		collected(specialCrawledIds[1] as string, sourceExternalIds[4] as string, {
			listingType: "special",
			region: specialTestRegion.label,
			regionCode: specialTestRegion.code,
			sourcePostedAt: new Date(now.getTime() - 3 * HOUR_MS),
			title: "스페셜 수집 공고 이전",
		}),
	]);

	await db.insert(jobPost).values([
		ourPost(jobPostId),
		ourPost(convertedJobPostId, {
			crawledFromId: convertedCrawledId,
			source: "converted" as const,
			title: "전환된 공고",
		}),
		// 스페셜 섹션의 유료 공고. 수집 행이 이 뒤에 붙는지(우선순위 규칙) 검증한다.
		ourPost(specialJobPostId, {
			exposureType: "special" as const,
			publishedAt: now,
			region: specialTestRegion.label,
			regionCode: specialTestRegion.code,
			title: "우리 스페셜 공고",
		}),
	]);

	return {
		convertedCrawledId,
		crawledId,
		jobPostIds: [jobPostId, convertedJobPostId, specialJobPostId],
		organizationId,
		regionCode: testRegion.code,
		sourceExternalIds,
		specialCrawledIds,
		specialJobPostId,
		specialRegionCode: specialTestRegion.code,
		thinCrawledId,
		userId,
	};
};

const cleanupFixture = async (target: Fixture): Promise<void> => {
	await db
		.delete(jobPerformanceEvent)
		.where(inArray(jobPerformanceEvent.jobPostId, target.jobPostIds));
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
	await deleteTestRegion(target.regionCode);
	await deleteTestRegion(target.specialRegionCode);
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
			regionCode: fixture.regionCode,
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
			regionCode: fixture.regionCode,
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
			regionCode: fixture.regionCode,
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
			regionCode: fixture.regionCode,
		});

		expect(barOnly.map((row) => row.source)).toEqual(["crawled"]);

		// 일급 150,000원 = 시급 18,750원. 하한을 그 위로 올리면 수집 공고만 걸러진다.
		const wellPaid = await listJobFeed({
			includeCrawled: true,
			limit: 20,
			minPayAmount: 20_000,
			regionCode: fixture.regionCode,
		});

		expect(wellPaid.every((row) => row.source !== "crawled")).toBe(true);
	});

	// 노출 스위치가 꺼져 있으면 수집 공고가 한 건도 나오지 않아야 한다. 호출부가 플래그를
	// 잊었을 때 남의 공고가 그대로 공개되는 것이 이 기능에서 가장 비싼 실수다.
	it("수집 노출이 꺼져 있으면 우리 공고만 내린다", async () => {
		const rows = await listJobFeed({
			includeCrawled: false,
			limit: 20,
			regionCode: fixture.regionCode,
		});

		expect(rows.every((row) => row.source !== "crawled")).toBe(true);
		expect(rows).toHaveLength(2);
	});

	// 플래그를 생략하면 운영자 설정을 읽는다. 설정값을 직접 만들어 확인한다 — 개발 DB의
	// 현재 값에 기대면 운영자가 콘솔에서 스위치를 켠 순간 이 테스트가 깨진다(실제로 깨졌다).
	it("플래그를 생략하면 운영자 설정을 따른다", async () => {
		const [before] = await db
			.select({ enabled: bambiSiteSettings.crawledJobFeedEnabled })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"));

		await db
			.insert(bambiSiteSettings)
			.values({ crawledJobFeedEnabled: false, id: "default" })
			.onConflictDoUpdate({
				set: { crawledJobFeedEnabled: false },
				target: bambiSiteSettings.id,
			});

		try {
			const rows = await listJobFeed({
				limit: 20,
				regionCode: fixture.regionCode,
			});

			expect(rows.every((row) => row.source !== "crawled")).toBe(true);
		} finally {
			await db
				.update(bambiSiteSettings)
				.set({ crawledJobFeedEnabled: before?.enabled ?? false })
				.where(eq(bambiSiteSettings.id, "default"));
		}
	});
});

// 섹션 주입용 조회. 함수 자체는 순수 조회라 노출 스위치를 보지 않는다(스위치는 호출부인
// jobs.list가 본다) — 여기서 두 번 보면 한쪽만 켜진 상태가 만들어진다.
describe("listCrawledSectionRows", () => {
	beforeAll(async () => {
		fixture = await createFixture();
	});

	afterAll(async () => {
		await cleanupFixture(fixture);
	});

	it("타입을 주면 그 라벨의 행만 뽑고 노출 어휘를 그 자리로 승격한다", async () => {
		const rows = await listCrawledSectionRows({
			limit: 20,
			regionCode: fixture.specialRegionCode,
			type: "special",
		});

		expect(rows.map((row) => row.id)).toEqual(fixture.specialCrawledIds);
		expect(rows.every((row) => row.exposureType === "special")).toBe(true);
		expect(rows.every((row) => row.source === "crawled")).toBe(true);
	});

	it("다른 자리 라벨은 그 섹션에 들어가지 않는다", async () => {
		const rows = await listCrawledSectionRows({
			limit: 20,
			// 이 지역의 수집 행 라벨은 'premium'(우리 자리 어휘가 아닌 레거시)뿐이다.
			regionCode: fixture.regionCode,
			type: "special",
		});

		expect(rows).toHaveLength(0);
	});

	it("상한을 넘겨 뽑지 않는다", async () => {
		const rows = await listCrawledSectionRows({
			limit: 1,
			regionCode: fixture.specialRegionCode,
			type: "special",
		});

		// 최신(원본 게시일) 한 건만 남는다.
		expect(rows.map((row) => row.id)).toEqual([fixture.specialCrawledIds[0]]);
	});

	it("타입을 생략하면 라벨과 무관하게 뽑고 'standard'를 유지한다", async () => {
		const rows = await listCrawledSectionRows({
			limit: 20,
			regionCode: fixture.regionCode,
		});
		const ids = rows.map((row) => row.id);

		expect(ids).toContain(fixture.crawledId);
		expect(rows.every((row) => row.exposureType === "standard")).toBe(true);
		// 공개 필터는 합친 목록과 같다 — 전환된 원본·지역 없는 원본은 여기서도 빠진다.
		expect(ids).not.toContain(fixture.convertedCrawledId);
		expect(ids).not.toContain(fixture.thinCrawledId);
	});
});

const listJobs = (input: { limit: number; regionCode: string }) =>
	createProcedureClient(jobsRouter.list, {
		context: {} as never,
		path: ["bambi", "jobs", "list"],
	})(input as never);

const setCrawledJobFeedEnabled = async (enabled: boolean): Promise<void> => {
	await db
		.insert(bambiSiteSettings)
		.values({ crawledJobFeedEnabled: enabled, id: "default" })
		.onConflictDoUpdate({
			set: { crawledJobFeedEnabled: enabled },
			target: bambiSiteSettings.id,
		});
};

describe("jobs.list 수집 공고 주입", () => {
	// 개발 DB를 공유하므로 스위치 원래 값을 저장했다가 되돌린다(사용자가 켜 둔 상태일 수 있다).
	let previousEnabled = false;

	beforeAll(async () => {
		const [before] = await db
			.select({ enabled: bambiSiteSettings.crawledJobFeedEnabled })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"));

		previousEnabled = before?.enabled ?? false;
		fixture = await createFixture();
	});

	afterAll(async () => {
		await cleanupFixture(fixture);
		await setCrawledJobFeedEnabled(previousEnabled);
	});

	it("스위치가 꺼져 있으면 수집 공고를 한 건도 주입하지 않는다", async () => {
		await setCrawledJobFeedEnabled(false);

		const result = await listJobs({
			limit: 20,
			regionCode: fixture.specialRegionCode,
		});
		const ids = [
			...result.sections.special,
			...result.sections.organic,
			...result.sections.urgent,
			...result.sections.recommended,
		].map((item) => item.id);

		expect(ids).toEqual([fixture.specialJobPostId, fixture.specialJobPostId]);
		expect(result.totalCount).toBe(1);
	});

	it("스위치가 켜지면 섹션·전체 공고의 유료 공고 뒤에 붙인다", async () => {
		await setCrawledJobFeedEnabled(true);

		const result = await listJobs({
			limit: 20,
			regionCode: fixture.specialRegionCode,
		});

		// 1순위 우리 순수 공고가 최상단, 2순위 크롤링(원본 게시일 최신순).
		expect(result.sections.special.map((item) => item.id)).toEqual([
			fixture.specialJobPostId,
			...fixture.specialCrawledIds,
		]);
		expect(result.sections.organic.map((item) => item.id)).toEqual([
			fixture.specialJobPostId,
			...fixture.specialCrawledIds,
		]);
		// 섹션에 실린 수집 행은 우리 자리 라벨을 단다. 전체 공고 쪽은 승격 라벨이 없다.
		expect(result.sections.special.at(-1)?.promotionLabel).toBe("스페셜 채용");
		expect(result.sections.organic.at(-1)?.promotionLabel).toBeNull();
		// 유료 1건 + 수집 2건(섹션·전체 중복은 한 번만).
		expect(result.totalCount).toBe(3);
	});

	// job_performance_event는 job_post를 FK로 잡는다. 수집 id가 섞이면 배치 insert가 막혀
	// 유료 공고의 노출 기록까지 통째로 사라진다(FK 위반은 삼켜지므로 조용히 비어 버린다).
	it("수집 행은 impression에 기록하지 않고 유료 행 기록은 남는다", async () => {
		await setCrawledJobFeedEnabled(true);
		await listJobs({ limit: 20, regionCode: fixture.specialRegionCode });

		const events = await db
			.select({ jobPostId: jobPerformanceEvent.jobPostId })
			.from(jobPerformanceEvent)
			.where(
				inArray(jobPerformanceEvent.jobPostId, [
					fixture.specialJobPostId,
					...fixture.specialCrawledIds,
				])
			);
		const recorded = new Set(events.map((event) => event.jobPostId));

		expect(recorded.has(fixture.specialJobPostId)).toBe(true);

		for (const crawledId of fixture.specialCrawledIds) {
			expect(recorded.has(crawledId)).toBe(false);
		}
	});
});
