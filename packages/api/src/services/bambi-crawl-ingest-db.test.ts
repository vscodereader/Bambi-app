import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 수집기의 DB 쓰기 경로를 실제 DB로 확인한다. 파서·정책은 순수 함수라 픽스처로 검증되지만,
// upsert 충돌 대상·enum 값·부분 유니크 인덱스는 실제로 붙여봐야 알 수 있다.
// 네트워크는 스텁으로 막고 저장해 둔 픽스처만 돌려준다(상대 사이트를 두드리지 않는다).
dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, bambiSchema, { runCrawlTick }, { createCrawlClient }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/bambi"),
		import("./bambi-crawl-ingest"),
		import("./bambi-crawl-fetch"),
	]);

const { bambiSiteSettings, crawledCommunityTopic, crawledJobPost, crawlRun } =
	bambiSchema;
const { and, desc, eq, like } = await import("drizzle-orm");

const {
	foxalbaDetailHtml: detailHtml,
	foxalbaListHtml: listHtml,
	queenalbaBbsDetailHtml: queenalbaBbsDetail,
	queenalbaBbsListHtml: queenalbaBbsHtml,
	queenalbaGuinDetailHtml: queenalbaGuinDetail,
	queenalbaGuinListHtml: queenalbaGuinList,
} = await import("./__fixtures__/crawl-html");

// 이 테스트는 공유 dev DB를 쓴다. 픽스처의 원본 ID를 그대로 저장하면 운영자가 실제로 수집해
// 둔 행과 같은 키가 되고, 정리 단계에서 그 실제 데이터까지 지운다(실제로 한 번 날렸다).
// 그래서 저장 전에 모든 외부 ID에 접두사를 붙여 테스트 전용 키 공간으로 밀어낸다.
// 숫자여야 한다 — 파서가 ID를 \d+로 뽑는다. 실제 ID보다 3자리 길어져 충돌하지 않는다.
const TEST_ID_PREFIX = "999";

const withTestIds = (html: string): string =>
	html
		.replaceAll("o_idx=", `o_idx=${TEST_ID_PREFIX}`)
		.replaceAll('data-id="', `data-id="${TEST_ID_PREFIX}`)
		.replaceAll("bbs_num=", `bbs_num=${TEST_ID_PREFIX}`)
		.replaceAll("?num=", `?num=${TEST_ID_PREFIX}`)
		.replaceAll("&num=", `&num=${TEST_ID_PREFIX}`);

// 앞선 실행이 중간에 끊기면 status='running' 회차가 남고, 부분 유니크 인덱스가 다음 실행의
// 첫 회차를 막아 "첫 실행만 실패"하는 유령 실패를 만든다(스스로 풀리는 데 30분 걸린다).
// 진행 중 잔해만 치운다 — 완료된 회차는 운영자 이력이라 건드리지 않는다.
const reapRunningRuns = () =>
	db.delete(crawlRun).where(eq(crawlRun.status, "running"));

// 정리는 테스트가 심은 키만 지운다. 사이트 단위로 지우면 실제 수집분이 함께 날아간다.
const deleteTestJobPosts = () =>
	db
		.delete(crawledJobPost)
		.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

const deleteTestCommunityTopics = () =>
	db
		.delete(crawledCommunityTopic)
		.where(
			like(
				crawledCommunityTopic.sourceExternalId,
				`comm_board2:${TEST_ID_PREFIX}%`
			)
		);

// 목록 픽스처의 총 건수(3,283)를 그대로 두면 66페이지를 요청한다. 테스트에서는 한 페이지만
// 돌면 충분하므로 카운터만 낮춘 사본을 쓴다.
const singlePageListHtml = withTestIds(listHtml).replace(
	/(<span class="num">총 <b>)[\d,]+(<\/b>)/,
	"$150$2"
);

const ROBOTS = "User-agent: *\nAllow: /\n";

const COMMUNITY_ID_PATTERN = /^comm_board2:\d+$/;
const GATE_ERROR_PATTERN = /성인인증 게이트/;

// 네트워크 스텁. 요청 간격·재시도를 타지 않도록 createCrawlClient 대신 직접 구현한다.
const createStubClient = (): ReturnType<typeof createCrawlClient> => ({
	fetchHtml: (url: string) => {
		if (url.endsWith("/robots.txt")) {
			return Promise.resolve(ROBOTS);
		}
		if (url.includes("view.asp")) {
			return Promise.resolve(detailHtml);
		}
		return Promise.resolve(singlePageListHtml);
	},
	isAllowed: () => Promise.resolve(true),
});

// 운영자가 골라둔 수집 대상. 테스트가 사이트·종류를 갈아끼우므로 끝나면 되돌린다.
let savedTarget: {
	contentType: "community" | "job_post";
	sourceSite: "foxalba" | "queenalba";
} | null = null;

beforeAll(async () => {
	const [current] = await db
		.select({
			contentType: bambiSiteSettings.crawlContentType,
			sourceSite: bambiSiteSettings.crawlSourceSite,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"));

	savedTarget = current ?? null;

	// 앞선 실행이 중간에 끊기면 status='running' 회차가 남고, 부분 유니크 인덱스가 다음
	// 실행의 첫 회차를 막아 "already_running"으로 떨어뜨린다(30분이 지나야 스스로 정리된다).
	// 그래서 "첫 실행만 실패하고 두 번째부터 통과"하는 유령 실패가 생긴다 — 시작할 때 치운다.
	await reapRunningRuns();
	await deleteTestJobPosts();
	await deleteTestCommunityTopics();

	// 이 테스트는 공유 dev DB를 쓴다. (여우알바 × 공고)를 대상으로 수집을 켜서 돌린다 —
	// 사이트·데이터 종류를 명시해 컬럼 기본값과 무관하게 구현된 조합의 경로를 타게 한다.
	const target = {
		crawlContentType: "job_post" as const,
		crawlEnabled: true,
		crawlSourceSite: "foxalba" as const,
	};
	await db
		.insert(bambiSiteSettings)
		.values({ id: "default", ...target })
		.onConflictDoUpdate({ set: target, target: bambiSiteSettings.id });
});

afterAll(async () => {
	await deleteTestJobPosts();
	await deleteTestCommunityTopics();
	// 회차 기록은 지우지 않는다. 운영자 콘솔의 「최근 수집 회차」가 보는 이력이라,
	// 테스트가 남긴 몇 줄보다 실제 이력을 날리는 쪽이 훨씬 아프다.
	await reapRunningRuns();

	// 켬/끔은 무조건 off로 끝낸다(켠 채로 두면 스케줄러가 실제 사이트를 긁는다).
	// 사이트·종류는 운영자가 골라둔 값으로 되돌린다 — 테스트를 한 번 돌렸다고 콘솔의
	// 선택이 바뀌어 있으면 다음에 「즉시 수집」을 눌렀을 때 엉뚱한 걸 긁는다.
	await db
		.update(bambiSiteSettings)
		.set({
			crawlEnabled: false,
			...(savedTarget
				? {
						crawlContentType: savedTarget.contentType,
						crawlSourceSite: savedTarget.sourceSite,
					}
				: {}),
		})
		.where(eq(bambiSiteSettings.id, "default"));
});

describe("runCrawlTick against the database", () => {
	it("inserts parsed listings and records the run", async () => {
		const result = await runCrawlTick(new Date(), createStubClient(), {
			force: true,
		});

		expect(result.reason).toBe("completed");
		expect(result.itemsNew).toBeGreaterThan(0);

		const rows = await db
			.select({
				contactPhone: crawledJobPost.contactPhone,
				body: crawledJobPost.body,
				payUnit: crawledJobPost.payUnit,
				status: crawledJobPost.status,
			})
			.from(crawledJobPost)
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		// 목록에 같은 o_idx가 두 번 실리는 경우가 있어(50칸 중 고유 49건) 수집기가 중복을
		// 걷어낸다. 걷어내지 않으면 같은 상세를 두 번 받고 신규 건수도 부풀려진다.
		expect(rows.length).toBe(result.itemsNew);
		expect(rows.length).toBe(49);

		// 상세 픽스처가 하나라 모든 행이 같은 내용으로 들어간다. 값이 실제로 저장됐는지만 본다.
		const [first] = rows;
		expect(first?.payUnit).toBe("TC");
		expect(first?.contactPhone).toBe("010-0000-0000");
		// 본문 마스킹이 저장 단계까지 살아 있어야 한다.
		expect(first?.body).toContain("[연락처 비공개]");
		expect(first?.body).not.toContain("010-1234-5678");

		const [run] = await db
			.select({ itemsNew: crawlRun.itemsNew, status: crawlRun.status })
			.from(crawlRun)
			.where(eq(crawlRun.sourceSite, "foxalba"))
			.orderBy(desc(crawlRun.startedAt))
			.limit(1);

		expect(run?.status).toBe("success");
	});

	it("is idempotent — a second run changes nothing", async () => {
		const before = await db
			.select({ id: crawledJobPost.id })
			.from(crawledJobPost)
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		const result = await runCrawlTick(new Date(), createStubClient(), {
			force: true,
		});

		// 내용이 그대로면 content_hash가 같아 UPDATE를 건너뛴다.
		expect(result.itemsNew).toBe(0);
		expect(result.itemsUpdated).toBe(0);

		const after = await db
			.select({ id: crawledJobPost.id })
			.from(crawledJobPost)
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		expect(after.length).toBe(before.length);
	});

	it("refuses to start while another run is in flight", async () => {
		// 부분 유니크 인덱스(status='running')가 두 번째 회차를 막는지 본다.
		// 즉시 수집 버튼 연타와 스케줄러 틱이 겹치는 상황이 이 경로로 들어온다.
		const [blocker] = await db
			.insert(crawlRun)
			.values({ sourceSite: "foxalba", status: "running" })
			.returning({ id: crawlRun.id });

		try {
			const result = await runCrawlTick(new Date(), createStubClient(), {
				force: true,
			});

			expect(result.reason).toBe("already_running");
		} finally {
			if (blocker) {
				await db.delete(crawlRun).where(eq(crawlRun.id, blocker.id));
			}
		}
	});

	it("stays off when the master switch is off, even when forced", async () => {
		await db
			.update(bambiSiteSettings)
			.set({ crawlEnabled: false })
			.where(eq(bambiSiteSettings.id, "default"));

		try {
			const result = await runCrawlTick(new Date(), createStubClient(), {
				force: true,
			});

			// 꺼둔 수집이 버튼 하나로 되살아나면 "껐다"는 말이 거짓이 된다.
			expect(result.reason).toBe("not_due");
		} finally {
			await db
				.update(bambiSiteSettings)
				.set({ crawlEnabled: true })
				.where(eq(bambiSiteSettings.id, "default"));
		}
	});
});

// 커뮤니티는 테이블도 수집 흐름도 공고와 다르다(만료 처리 없음, 본문은 글마다 상세 한 번).
const createCommunityStubClient = (): ReturnType<typeof createCrawlClient> => ({
	fetchHtml: (url: string) => {
		if (url.endsWith("/robots.txt")) {
			return Promise.resolve(ROBOTS);
		}
		if (url.includes("bbs_detail.php")) {
			return Promise.resolve(queenalbaBbsDetail);
		}
		return Promise.resolve(withTestIds(queenalbaBbsHtml));
	},
	isAllowed: () => Promise.resolve(true),
});

describe("runCrawlTick — 커뮤니티(퀸알바)", () => {
	// 첫 테스트가 저장한 행을 뒤 테스트들이 이어서 본다(같은 회차 결과를 여러 각도로 검사).
	let storedRows: {
		body: string | null;
		viewCount: number | null;
	}[] = [];

	beforeAll(async () => {
		const target = {
			crawlContentType: "community" as const,
			crawlEnabled: true,
			crawlSourceSite: "queenalba" as const,
		};

		await db
			.update(bambiSiteSettings)
			.set(target)
			.where(eq(bambiSiteSettings.id, "default"));
	});

	it("stores board topics and records the run", async () => {
		const result = await runCrawlTick(new Date(), createCommunityStubClient(), {
			force: true,
		});

		expect(result.reason).toBe("completed");
		expect(result.itemsNew).toBeGreaterThan(0);

		const rows = await db
			.select({
				boardName: crawledCommunityTopic.boardName,
				body: crawledCommunityTopic.body,
				commentCount: crawledCommunityTopic.commentCount,
				sourceExternalId: crawledCommunityTopic.sourceExternalId,
				title: crawledCommunityTopic.title,
				viewCount: crawledCommunityTopic.viewCount,
			})
			.from(crawledCommunityTopic)
			.where(
				like(
					crawledCommunityTopic.sourceExternalId,
					`comm_board2:${TEST_ID_PREFIX}%`
				)
			);

		storedRows = rows;

		expect(rows.length).toBe(result.itemsNew);
		expect(rows[0]?.boardName).toBe("밤문화이야기");
		// 게시판이 여럿이 되어도 bbs_num이 겹치지 않도록 게시판을 앞에 붙여 저장한다.
		expect(rows[0]?.sourceExternalId).toMatch(COMMUNITY_ID_PATTERN);

		const [run] = await db
			.select({ itemsSeen: crawlRun.itemsSeen, status: crawlRun.status })
			.from(crawlRun)
			.where(eq(crawlRun.sourceSite, "queenalba"))
			.orderBy(desc(crawlRun.startedAt))
			.limit(1);

		expect(run?.status).toBe("success");
		expect(run?.itemsSeen).toBe(rows.length);
	});

	// 본문과 조회수는 목록에 없다. 상세 패스가 돌지 않으면 둘 다 영영 null로 남는다.
	it("fills in the body and view count from the topic detail", () => {
		expect(storedRows.every((row) => (row.body ?? "").length > 0)).toBe(true);
		expect(storedRows.every((row) => row.viewCount === 2377)).toBe(true);
	});

	// 목록 패스가 매 회차 도는데, 거기에 viewCount를 넣으면 상세가 채운 값을 null로 되돌린다.
	it("does not let the list pass wipe the detail-only fields", async () => {
		await runCrawlTick(new Date(), createCommunityStubClient(), {
			force: true,
		});

		const rows = await db
			.select({
				body: crawledCommunityTopic.body,
				viewCount: crawledCommunityTopic.viewCount,
			})
			.from(crawledCommunityTopic)
			.where(
				like(
					crawledCommunityTopic.sourceExternalId,
					`comm_board2:${TEST_ID_PREFIX}%`
				)
			);

		expect(rows.every((row) => (row.body ?? "").length > 0)).toBe(true);
		expect(rows.every((row) => row.viewCount === 2377)).toBe(true);
	});

	// 같은 주제를 다시 봐도 행이 늘면 안 된다(sourceSite + sourceExternalId 유니크).
	it("is idempotent — a second run adds no rows", async () => {
		const before = await db
			.select({ id: crawledCommunityTopic.id })
			.from(crawledCommunityTopic)
			.where(
				like(
					crawledCommunityTopic.sourceExternalId,
					`comm_board2:${TEST_ID_PREFIX}%`
				)
			);

		const result = await runCrawlTick(new Date(), createCommunityStubClient(), {
			force: true,
		});

		expect(result.itemsNew).toBe(0);

		const after = await db
			.select({ id: crawledCommunityTopic.id })
			.from(crawledCommunityTopic)
			.where(
				like(
					crawledCommunityTopic.sourceExternalId,
					`comm_board2:${TEST_ID_PREFIX}%`
				)
			);

		expect(after.length).toBe(before.length);
	});

	// 게이트에 막힌 응답을 "게시글 없음"으로 읽고 성공으로 남기면 파손을 알아챌 방법이 없다.
	it("fails the run when the age gate blocks the fetch", async () => {
		const gateStub =
			'<script type="text/javascript">document.location.replace("/adult_index.php");</script>';

		await expect(
			runCrawlTick(
				new Date(),
				{
					fetchHtml: (url: string) =>
						Promise.resolve(url.endsWith("/robots.txt") ? ROBOTS : gateStub),
					isAllowed: () => Promise.resolve(true),
				},
				{ force: true }
			)
		).rejects.toThrow(GATE_ERROR_PATTERN);

		const [run] = await db
			.select({ error: crawlRun.error, status: crawlRun.status })
			.from(crawlRun)
			.where(
				and(eq(crawlRun.sourceSite, "queenalba"), eq(crawlRun.status, "failed"))
			)
			.orderBy(desc(crawlRun.startedAt))
			.limit(1);

		expect(run?.status).toBe("failed");
	});
});

// 같은 공고 파이프라인을 퀸알바로도 태운다. 여우알바만 통과시키면 어댑터 분기(JOB_ADAPTERS)와
// sourceSite를 실제로 갈아끼우는지가 검증되지 않는다 — 저장까지 가서 확인한다.
const createQueenalbaJobStubClient = (): ReturnType<
	typeof createCrawlClient
> => ({
	fetchHtml: (url: string) => {
		if (url.endsWith("/robots.txt")) {
			return Promise.resolve(ROBOTS);
		}
		if (url.includes("guin_detail.php")) {
			return Promise.resolve(queenalbaGuinDetail);
		}
		return Promise.resolve(withTestIds(queenalbaGuinList));
	},
	isAllowed: () => Promise.resolve(true),
});

describe("runCrawlTick — 공고(퀸알바)", () => {
	beforeAll(async () => {
		await reapRunningRuns();
		await deleteTestJobPosts();

		const target = {
			crawlContentType: "job_post" as const,
			crawlEnabled: true,
			crawlSourceSite: "queenalba" as const,
		};

		await db
			.update(bambiSiteSettings)
			.set(target)
			.where(eq(bambiSiteSettings.id, "default"));
	});

	afterAll(async () => {
		await deleteTestJobPosts();
	});

	it("stores queenalba listings under its own source site", async () => {
		const result = await runCrawlTick(
			new Date(),
			createQueenalbaJobStubClient(),
			{ force: true }
		);

		expect(result.reason).toBe("completed");
		expect(result.itemsNew).toBeGreaterThan(0);

		const rows = await db
			.select({
				body: crawledJobPost.body,
				contactPhone: crawledJobPost.contactPhone,
				district: crawledJobPost.district,
				industryCategory: crawledJobPost.industryCategory,
				payAmount: crawledJobPost.payAmount,
				payUnit: crawledJobPost.payUnit,
				region: crawledJobPost.region,
				sourceUrl: crawledJobPost.sourceUrl,
				status: crawledJobPost.status,
			})
			.from(crawledJobPost)
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		expect(rows.length).toBe(result.itemsNew);

		const [first] = rows;

		// 여우알바 행으로 새지 않았는지 — 어댑터가 URL까지 갈아끼웠는지 본다.
		expect(first?.sourceUrl).toContain("queenalba.net/guin_detail.php");
		expect(first?.region).toBe("서울");
		expect(first?.district).toBe("송파구");
		// 최저임금 안내를 잘라낸 뒤의 금액이어야 한다(안 자르면 10,320이 들어온다).
		expect(first?.payAmount).toBe(150_000);
		// 원문에 단위 표기가 없으면 비운다 — 금액이 있는데 "협의"라고 적으면 모순이다.
		expect(first?.payUnit).toBeNull();
		expect(first?.industryCategory).toBe("룸싸롱");
		expect(first?.status).toBe("active");
		expect(first?.body).toContain("[연락처 비공개]");
	});

	it("is idempotent — a second run changes nothing", async () => {
		const result = await runCrawlTick(
			new Date(),
			createQueenalbaJobStubClient(),
			{ force: true }
		);

		expect(result.itemsNew).toBe(0);
		expect(result.itemsUpdated).toBe(0);
	});

	// 쿠키가 자리표시자이거나 만료되면 목록부터 게이트 스텁이 온다. 그걸 "공고 0건"으로 읽어
	// 만료 처리가 돌면 수집분이 통째로 날아간다.
	it("fails the run when the age gate blocks the list", async () => {
		const gateStub =
			'<script type="text/javascript">document.location.replace("/adult_index.php");</script>';

		await expect(
			runCrawlTick(
				new Date(),
				{
					fetchHtml: (url: string) =>
						Promise.resolve(url.endsWith("/robots.txt") ? ROBOTS : gateStub),
					isAllowed: () => Promise.resolve(true),
				},
				{ force: true }
			)
		).rejects.toThrow(GATE_ERROR_PATTERN);
	});
});
