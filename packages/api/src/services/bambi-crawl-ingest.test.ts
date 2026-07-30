import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { queenalbaBbsListHtml } from "./__fixtures__/crawl-html";
import type { CrawlClient } from "./bambi-crawl-fetch";
import {
	AVAILABLE_CRAWL_TARGETS,
	COMMUNITY_ITEMS_PER_PAGE,
	COMMUNITY_LIST_PAGES,
	COMMUNITY_TOPICS_PER_RUN,
	DEFAULT_CRAWL_INTERVAL_HOURS,
	isCrawlDue,
	isCrawlSiteImplemented,
	isCrawlTargetImplemented,
	isYieldTrustworthy,
	MAX_LIST_PAGES,
	resolveListPageCount,
} from "./bambi-crawl-policy";

// selectDetailTargets는 db 결합 모듈(bambi-crawl-ingest)에 산다. 정적 import로 끌어오면 이 파일
// 전체가 env 검증(@bambi-app/env/server)을 타고 무너진다 — 그래서 나머지 순수 정책 테스트와
// 달리 여기만 env를 채운 뒤 동적으로 가져온다. selectDetailTargets는 순수 함수라 dev DB에 붙지
// 않는다(모듈 로드 시 pool 객체만 만들어지고 쿼리는 나가지 않아 db 테스트와 경쟁하지 않는다).
dotenv.config({ path: "../../apps/server/.env" });

const { collectCommunityTopics, selectDetailTargets } = await import(
	"./bambi-crawl-ingest"
);

const targetKey = (site: string, contentType: string) =>
	`${site}:${contentType}`;

const NOW = new Date("2026-07-28T12:00:00Z");
const hoursAgo = (hours: number): Date =>
	new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("isCrawlDue", () => {
	it("never runs while the master switch is off", () => {
		// 토글이 DB에 있어야 재배포 없이 즉시 멈출 수 있다.
		expect(
			isCrawlDue(
				{
					crawlEnabled: false,
					crawlIntervalHours: 1,
					crawlLastRunAt: hoursAgo(99),
				},
				NOW
			)
		).toBe(false);
	});

	it("runs immediately when it has never run", () => {
		expect(
			isCrawlDue(
				{ crawlEnabled: true, crawlIntervalHours: 6, crawlLastRunAt: null },
				NOW
			)
		).toBe(true);
	});

	it("waits for the configured interval to elapse", () => {
		const settings = {
			crawlEnabled: true,
			crawlIntervalHours: 6,
			crawlLastRunAt: hoursAgo(5),
		};

		expect(isCrawlDue(settings, NOW)).toBe(false);
		expect(isCrawlDue({ ...settings, crawlLastRunAt: hoursAgo(6) }, NOW)).toBe(
			true
		);
	});

	it("falls back to the code default when the interval is unset", () => {
		expect(
			isCrawlDue(
				{
					crawlEnabled: true,
					crawlIntervalHours: null,
					crawlLastRunAt: hoursAgo(DEFAULT_CRAWL_INTERVAL_HOURS - 1),
				},
				NOW
			)
		).toBe(false);
		expect(
			isCrawlDue(
				{
					crawlEnabled: true,
					crawlIntervalHours: null,
					crawlLastRunAt: hoursAgo(DEFAULT_CRAWL_INTERVAL_HOURS + 1),
				},
				NOW
			)
		).toBe(true);
	});
});

describe("isYieldTrustworthy", () => {
	it("rejects a run that parsed nothing from the listing", () => {
		// 상대가 마크업을 바꿔 0건이 나온 것을 "공고가 사라졌다"로 읽으면 수집분 전체가
		// 한 회차에 만료된다. 이 판정이 그 사고를 막는 장치다.
		expect(
			isYieldTrustworthy({
				detailAttempts: 0,
				detailFailures: 0,
				listItems: 0,
			})
		).toBe(false);
	});

	it("accepts a healthy run", () => {
		expect(
			isYieldTrustworthy({
				detailAttempts: 100,
				detailFailures: 3,
				listItems: 50,
			})
		).toBe(true);
	});

	it("rejects a run where most detail pages failed to parse", () => {
		expect(
			isYieldTrustworthy({
				detailAttempts: 100,
				detailFailures: 80,
				listItems: 50,
			})
		).toBe(false);
	});

	it("withholds judgement when the sample is too small", () => {
		// 상세 두 건이 실패한 것만으로 회차를 버리면, 삭제된 공고 몇 건에 수집이 멈춘다.
		expect(
			isYieldTrustworthy({
				detailAttempts: 2,
				detailFailures: 2,
				listItems: 50,
			})
		).toBe(true);
	});
});

describe("AVAILABLE_CRAWL_TARGETS", () => {
	it("offers both content types for queenalba and nothing else", () => {
		// 수집 대상은 퀸알바 하나뿐이다(공고·커뮤니티).
		const keys = new Set(
			AVAILABLE_CRAWL_TARGETS.map((target) =>
				targetKey(target.site, target.contentType)
			)
		);
		expect(keys).toEqual(
			new Set([
				targetKey("queenalba", "job_post"),
				targetKey("queenalba", "community"),
			])
		);
	});
});

describe("isCrawlTargetImplemented", () => {
	it("allows every combination that has a parser", () => {
		// 파서가 없는 (사이트 × 데이터 종류) 조합을 골라도 회차를 만들지 않도록 이 판정이 게이트다.
		expect(isCrawlTargetImplemented("queenalba", "job_post")).toBe(true);
		expect(isCrawlTargetImplemented("queenalba", "community")).toBe(true);
	});

	// 파서 파일은 남아 있지만 대상에서 내렸다. 목록이 게이트라, 옛 설정 행이 foxalba를
	// 가리키고 있어도 회차가 열리면 안 된다.
	it("blocks foxalba now that it is off the target list", () => {
		expect(isCrawlTargetImplemented("foxalba", "job_post")).toBe(false);
		expect(isCrawlTargetImplemented("foxalba", "community")).toBe(false);
	});
});

describe("isCrawlSiteImplemented", () => {
	it("treats a site as ready when any of its combinations is built", () => {
		expect(isCrawlSiteImplemented("queenalba")).toBe(true);
		expect(isCrawlSiteImplemented("foxalba")).toBe(false);
	});
});

describe("selectDetailTargets", () => {
	const item = (sourceExternalId: string) => ({ sourceExternalId });
	const existingRow = (
		sourceExternalId: string,
		detailFetchedAt: Date | null,
		status: "active" | "removed" = "active"
	) => ({
		contentHash: "h",
		detailFetchedAt,
		id: sourceExternalId,
		sourceExternalId,
		status,
	});

	// 미수집(detailFetchedAt null)이 먼저, 그다음 오래된 순. 목록이 회차 상한을 넘으면 정렬이
	// 없을 때 목록 순서 그대로 잘려 신규 공고가 재수집 뒤로 밀리고, 상한에 걸린 신규는 영영
	// 미수집으로 남는다. 아직 갱신 주기(72h) 안인 건은 애초에 대상에서 빠진다.
	it("orders unfetched first, then oldest fetched, dropping the still-fresh", () => {
		const items = [
			item("fresh"), // 10h 전 수집 → 갱신 주기 안이라 제외
			item("old"), // 100h 전 수집
			item("new"), // 미수집(맵에 없음)
			item("older"), // 200h 전 수집
		];
		const existing = new Map([
			["fresh", existingRow("fresh", hoursAgo(10))],
			["old", existingRow("old", hoursAgo(100))],
			["older", existingRow("older", hoursAgo(200))],
		]);

		const order = selectDetailTargets(items, existing, NOW).map(
			(target) => target.sourceExternalId
		);

		expect(order).toEqual(["new", "older", "old"]);
	});

	// 운영자가 내린 공고는 원본에 살아 있어 매 회차 목록에 계속 실린다. 상세를 다시 받아도
	// upsert가 removed를 유지하므로 요청과 회차 상한(300칸)만 태운다.
	it("skips operator-removed posts even when their detail is stale", () => {
		const items = [item("removed"), item("kept")];
		const existing = new Map([
			["removed", existingRow("removed", hoursAgo(500), "removed")],
			["kept", existingRow("kept", hoursAgo(500))],
		]);

		const order = selectDetailTargets(items, existing, NOW).map(
			(target) => target.sourceExternalId
		);

		expect(order).toEqual(["kept"]);
	});
});

describe("collectCommunityTopics", () => {
	// 목록 픽스처는 일반 글 5건이다(상단 고정 공지 2건은 파서가 걸러낸다). 모든 페이지에 같은
	// HTML을 돌려주므로 중복 제거 뒤에도 5건이고, 받은 URL 수가 곧 페이지 요청 수다.
	const fakeClient = (): { client: CrawlClient; urls: string[] } => {
		const urls: string[] = [];

		return {
			client: {
				fetchBinary: () =>
					Promise.reject(new Error("게시판 목록은 바이너리를 받지 않는다")),
				fetchHtml: (url: string) => {
					urls.push(url);
					return Promise.resolve(queenalbaBbsListHtml);
				},
				isAllowed: () => Promise.resolve(true),
			},
			urls,
		};
	};

	// 상한을 채우면 남은 페이지를 받지 않는다 — 어차피 잘려 나갈 글 때문에 상대 서버를 두드리면
	// 요청 간격(1.5초)만 태운다.
	it("caps the topics and stops fetching once the limit is filled", async () => {
		const { client, urls } = fakeClient();

		const { pagesFetched, topics } = await collectCommunityTopics(
			client,
			"queenalba",
			3
		);

		expect(topics).toHaveLength(3);
		expect(pagesFetched).toBe(1);
		expect(urls).toHaveLength(1);
	});

	// 원본 목록은 글 번호 내림차순(최신순)이라 앞에서 자르면 최신 글이 남는다.
	it("keeps the newest topics the source listed first", async () => {
		const { client } = fakeClient();

		const { topics } = await collectCommunityTopics(client, "queenalba", 2);

		expect(topics.map((topic) => topic.sourceExternalId)).toEqual([
			"comm_board2:1370389",
			"comm_board2:1370243",
		]);
	});

	// 상한에 못 미치면 페이지 상한까지 훑는다. 상한을 붙였다고 수집 범위가 좁아지면 안 된다.
	it("still walks every listing page while under the limit", async () => {
		const { client, urls } = fakeClient();

		const { pagesFetched } = await collectCommunityTopics(
			client,
			"queenalba",
			COMMUNITY_TOPICS_PER_RUN
		);

		expect(pagesFetched).toBe(COMMUNITY_LIST_PAGES);
		expect(urls).toHaveLength(COMMUNITY_LIST_PAGES);
	});
});

// 커뮤니티 수집 상한의 코드 기본값이 곧 이 값이다(DEFAULT_CRAWLED_LIMITS.community). 상한이
// 붙는 것만으로 수집량이 달라지지 않도록 "지금까지의 실효 규모"에 못박는다 — 이 숫자를 바꾸면
// 회차당 수집량이 바뀐다는 뜻이라 의도한 변경일 때만 함께 고친다.
describe("COMMUNITY_TOPICS_PER_RUN", () => {
	it("stays the effective scale of one community run", () => {
		expect(COMMUNITY_TOPICS_PER_RUN).toBe(150);
		expect(COMMUNITY_TOPICS_PER_RUN).toBe(
			COMMUNITY_LIST_PAGES * COMMUNITY_ITEMS_PER_PAGE
		);
	});
});

describe("resolveListPageCount", () => {
	it("derives the page count from the total, not the pager widget", () => {
		expect(resolveListPageCount(3283, 50)).toBe(66);
		expect(resolveListPageCount(50, 50)).toBe(1);
		expect(resolveListPageCount(51, 50)).toBe(2);
	});

	it("still fetches one page when the total is unreadable", () => {
		expect(resolveListPageCount(null, 50)).toBe(1);
		expect(resolveListPageCount(0, 50)).toBe(1);
	});

	// 퀸알바처럼 목록이 전건을 한 번에 주는 사이트는 페이지 나눔 자체가 없다.
	it("fetches one page when the source does not paginate", () => {
		expect(resolveListPageCount(693, 0)).toBe(1);
	});

	it("caps the page count so a bad total cannot flood the source", () => {
		expect(resolveListPageCount(1_000_000, 50)).toBe(MAX_LIST_PAGES);
	});
});
