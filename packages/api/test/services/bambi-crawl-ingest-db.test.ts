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
		import("@/services/bambi-crawl-ingest"),
		import("@/services/bambi-crawl-fetch"),
	]);

const { bambiSiteSettings, crawledCommunityTopic, crawledJobPost, crawlRun } =
	bambiSchema;
const { and, desc, eq, isNotNull, like, notLike } = await import("drizzle-orm");

const {
	queenalbaBbsDetailHtml: queenalbaBbsDetail,
	queenalbaBbsListHtml: queenalbaBbsHtml,
	queenalbaGuinDetailHtml: queenalbaGuinDetail,
	queenalbaGuinListHtml: queenalbaGuinList,
	queenalbaMainHtml: queenalbaMain,
} = await import("@/services/__fixtures__/crawl-html");

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

const ROBOTS = "User-agent: *\nAllow: /\n";

const COMMUNITY_ID_PATTERN = /^comm_board2:\d+$/;
const GATE_ERROR_PATTERN = /성인인증 게이트/;

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

	// 이 테스트는 공유 dev DB를 쓴다. (퀸알바 × 공고)를 대상으로 스케줄러를 켜서 돌린다 —
	// 사이트·데이터 종류를 명시해 컬럼 기본값과 무관하게 구현된 조합의 경로를 타게 한다.
	const target = {
		crawlContentType: "job_post" as const,
		crawlEnabled: true,
		crawlSourceSite: "queenalba" as const,
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

// 커뮤니티는 테이블도 수집 흐름도 공고와 다르다(만료 처리 없음, 본문은 글마다 상세 한 번).
const createCommunityStubClient = (): ReturnType<typeof createCrawlClient> => ({
	fetchBinary: () => Promise.reject(new Error("이미지를 받지 않는다")),
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

	// 커뮤니티 글 삭제도 재수집을 견뎌야 한다. 목록 패스의 upsert set 목록에 removed_at이 없어야
	// 운영자가 찍은 시각이 남고, 상세 백필도 내린 글을 다시 받지 않아야 한다.
	it("keeps an operator-removed topic removed across a re-ingest", async () => {
		// 행 하나만 골라 내린다 — 뒤 테스트들이 나머지 행을 그대로 이어서 본다.
		const [target] = await db
			.select({
				body: crawledCommunityTopic.body,
				sourceExternalId: crawledCommunityTopic.sourceExternalId,
			})
			.from(crawledCommunityTopic)
			.where(
				like(
					crawledCommunityTopic.sourceExternalId,
					`comm_board2:${TEST_ID_PREFIX}%`
				)
			)
			.limit(1);

		expect(target).toBeDefined();

		const targetId = target?.sourceExternalId ?? "";
		const whereTarget = and(
			eq(crawledCommunityTopic.sourceSite, "queenalba"),
			eq(crawledCommunityTopic.sourceExternalId, targetId)
		);
		const readRow = async () => {
			const [row] = await db
				.select({
					body: crawledCommunityTopic.body,
					removedAt: crawledCommunityTopic.removedAt,
				})
				.from(crawledCommunityTopic)
				.where(whereTarget);

			return row;
		};

		// 운영자가 글을 내린다(crawler.removeTopic). body를 비워 상세 백필 조건을 일부러
		// 만족시킨다 — 그래도 내린 글은 상세를 다시 받지 않아야 한다.
		await db
			.update(crawledCommunityTopic)
			.set({ body: null, removedAt: new Date() })
			.where(whereTarget);

		await runCrawlTick(new Date(), createCommunityStubClient(), {
			force: true,
		});

		const after = await readRow();

		expect(after?.removedAt).not.toBeNull();
		// 상세를 받지 않았다는 증거. 채워졌다면 백필의 removed 제외가 풀린 것이다.
		expect(after?.body).toBeNull();

		// 뒤 테스트가 본문을 확인하므로 원래 값으로 되돌린다.
		await db
			.update(crawledCommunityTopic)
			.set({ body: target?.body ?? null, removedAt: null })
			.where(whereTarget);
	});

	// 게이트에 막힌 응답을 "게시글 없음"으로 읽고 성공으로 남기면 파손을 알아챌 방법이 없다.
	it("fails the run when the age gate blocks the fetch", async () => {
		const gateStub =
			'<script type="text/javascript">document.location.replace("/adult_index.php");</script>';

		await expect(
			runCrawlTick(
				new Date(),
				{
					fetchBinary: () => Promise.reject(new Error("이미지를 받지 않는다")),
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

// 공고 파이프라인 전체를 퀸알바로 태운다(현재 유일한 수집 대상). 어댑터 분기(JOB_ADAPTERS)가
// sourceSite를 실제로 갈아끼우는지까지 저장 결과로 확인한다.
const createQueenalbaJobStubClient = (): ReturnType<
	typeof createCrawlClient
> => ({
	fetchBinary: () => Promise.reject(new Error("이미지를 받지 않는다")),
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
				sourceDeadlineAt: crawledJobPost.sourceDeadlineAt,
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
		// 급여 단위는 텍스트가 아니라 급여 칸의 gif(WantMoneyArrImg2=시급)로만 온다.
		// 파서가 그 이미지를 읽기 때문에 여기까지 단위가 살아 들어온다.
		expect(first?.payUnit).toBe("시급");
		// 직통 번호("전화번호" 라벨)와 마감일자도 상세에서만 얻는 값이라 이 경로로만 채워진다.
		expect(first?.contactPhone).toBe("010-9876-5432");
		expect(first?.sourceDeadlineAt?.toISOString()).toBe(
			"2026-08-05T00:00:00.000Z"
		);
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

	// crawlEnabled는 스케줄러(주기 실행) 스위치일 뿐이다. 이게 즉시 수집까지 막으면 운영자는
	// 자동 수집을 켜지 않고는 파서를 확인할 방법이 없다.
	it("still runs when the scheduler switch is off but the run is forced", async () => {
		await db
			.update(bambiSiteSettings)
			.set({ crawlEnabled: false })
			.where(eq(bambiSiteSettings.id, "default"));

		try {
			const result = await runCrawlTick(
				new Date(),
				createQueenalbaJobStubClient(),
				{ force: true }
			);

			expect(result.reason).toBe("completed");
		} finally {
			await db
				.update(bambiSiteSettings)
				.set({ crawlEnabled: true })
				.where(eq(bambiSiteSettings.id, "default"));
		}
	});

	// 반대로 강제하지 않으면 스케줄러 스위치가 그대로 막아야 한다. 껐는데도 주기 실행이
	// 돌면 "껐다"는 말이 거짓이 된다.
	it("stays off for a scheduled tick while the switch is off", async () => {
		await db
			.update(bambiSiteSettings)
			.set({ crawlEnabled: false })
			.where(eq(bambiSiteSettings.id, "default"));

		try {
			const result = await runCrawlTick(
				new Date(),
				createQueenalbaJobStubClient()
			);

			expect(result.reason).toBe("not_due");
		} finally {
			await db
				.update(bambiSiteSettings)
				.set({ crawlEnabled: true })
				.where(eq(bambiSiteSettings.id, "default"));
		}
	});

	it("refuses to start while another run is in flight", async () => {
		// 부분 유니크 인덱스(status='running')가 두 번째 회차를 막는지 본다.
		// 즉시 수집 버튼 연타와 스케줄러 틱이 겹치는 상황이 이 경로로 들어온다.
		const [blocker] = await db
			.insert(crawlRun)
			.values({ sourceSite: "queenalba", status: "running" })
			.returning({ id: crawlRun.id });

		try {
			const result = await runCrawlTick(
				new Date(),
				createQueenalbaJobStubClient(),
				{ force: true }
			);

			expect(result.reason).toBe("already_running");
		} finally {
			if (blocker) {
				await db.delete(crawlRun).where(eq(crawlRun.id, blocker.id));
			}
		}
	});

	// 메인 파싱이 0건인 회차(여기서는 메인 URL에도 목록 HTML이 온다)는 낡은 라벨 리셋을
	// 건너뛴다. 게이트 만료로 0건이 온 회차에 리셋이 돌면 라벨이 통째로 날아간다.
	it("does not reset listing labels when the main page parses nothing", async () => {
		await db
			.update(crawledJobPost)
			.set({
				bannerHorizontalUrl: "data:image/gif;base64,AAA",
				listingType: "ad_banner",
			})
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		await runCrawlTick(new Date(), createQueenalbaJobStubClient(), {
			force: true,
		});

		const rows = await db
			.select({ listingType: crawledJobPost.listingType })
			.from(crawledJobPost)
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row.listingType === "ad_banner")).toBe(true);
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
					fetchBinary: () => Promise.reject(new Error("이미지를 받지 않는다")),
					fetchHtml: (url: string) =>
						Promise.resolve(url.endsWith("/robots.txt") ? ROBOTS : gateStub),
					isAllowed: () => Promise.resolve(true),
				},
				{ force: true }
			)
		).rejects.toThrow(GATE_ERROR_PATTERN);
	});
});

// ---------------------------------------------------------------------------
// 메인페이지 유료 노출: 섹션별 리미트 · 낡은 라벨 리셋 · 업종 보존
// ---------------------------------------------------------------------------

// 배너 리다이렉터가 가리키는 공고 번호. 칸마다 다른 공고로 보내야 "상한만큼만 해석했는가"가
// 저장된 ad_banner 행 수로 드러난다.
const bannerTargetId = (linkNumber: string): string =>
	`${TEST_ID_PREFIX}7${linkNumber}`;

const BANNER_LINK_PATTERN = /banner_link\.php\?number=(\d+)/;
const EMBEDDED_GIF_PATTERN = /^data:image\/gif;base64,/;

// GIF 매직 넘버 + 패딩. 12바이트 미만이면 이미지 판정 자체가 안 돼서 배너 칸이 null로 남는다.
const GIF_BYTES = new Uint8Array([
	0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0,
]);

// 업종이 우리 8종에 안 맞는 공고. 재수집이 운영자 지정을 지우지 않는지 이 행으로 본다.
const UNMAPPED_INDUSTRY_ID = `${TEST_ID_PREFIX}40001`;

const unmappedIndustryDetail = (bodyMark: string): string =>
	queenalbaGuinDetail
		.replace("룸싸롱 - 클럽", "미분류업종 - 미분류")
		.replace("송파1등업소!!", `송파1등업소!! ${bodyMark}`);

// 다음 회차의 메인. 광고가 전부 내려가고 카드 한 칸만 남은 상태다(0건이 아니라 리셋이 돈다).
const shrunkMainHtml = `<!DOCTYPE html><html><body><div id="content1"><div><table><tbody><tr>
	<td><dl><dd><a href="./guin_detail.php?num=${UNMAPPED_INDUSTRY_ID}&pg=" class="title_ellipse"><span>남은 카드</span></a></dd></dl></td>
</tr></tbody></table></div></div></body></html>`;

const createQueenalbaMainStubClient = (
	options: { bodyMark?: string; calls?: string[]; mainHtml?: string } = {}
): ReturnType<typeof createCrawlClient> => ({
	fetchBinary: (url: string) =>
		Promise.resolve({ bytes: GIF_BYTES, contentType: "text/plain", url }),
	fetchHtml: (url: string) => {
		options.calls?.push(url);

		if (url.endsWith("/robots.txt")) {
			return Promise.resolve(ROBOTS);
		}

		// 리다이렉터 응답은 90바이트짜리 스크립트 한 줄이다.
		const linkNumber = url.match(BANNER_LINK_PATTERN)?.[1];

		if (linkNumber) {
			return Promise.resolve(
				`<script>window.location.href = '/guin_detail.php?num=${bannerTargetId(linkNumber)}';</script>`
			);
		}

		if (url.includes(`num=${UNMAPPED_INDUSTRY_ID}`)) {
			return Promise.resolve(unmappedIndustryDetail(options.bodyMark ?? ""));
		}

		if (url.includes("guin_detail.php")) {
			return Promise.resolve(queenalbaGuinDetail);
		}

		if (url.includes("guin_list.php")) {
			return Promise.resolve(withTestIds(queenalbaGuinList));
		}

		return Promise.resolve(options.mainHtml ?? withTestIds(queenalbaMain));
	},
	isAllowed: () => Promise.resolve(true),
});

const countTestListingTypes = async (): Promise<Record<string, number>> => {
	const rows = await db
		.select({ listingType: crawledJobPost.listingType })
		.from(crawledJobPost)
		.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));
	const counts: Record<string, number> = {};

	for (const row of rows) {
		const key = row.listingType ?? "none";

		counts[key] = (counts[key] ?? 0) + 1;
	}

	return counts;
};

describe("runCrawlTick — 메인 유료 노출(퀸알바)", () => {
	// 운영자가 넣어둔 상한. 테스트가 갈아끼우므로 끝나면 되돌린다.
	let savedLimits: {
		crawledAdBannerLimit: null | number;
		crawledRecommendedLimit: null | number;
		crawledSpecialLimit: null | number;
		crawledUrgentLimit: null | number;
	} | null = null;

	// 낡은 라벨 리셋은 설계상 사이트 단위로 돈다(메인에서 내려간 광고를 전부 내려야 한다).
	// 공유 dev DB라 운영자가 실제로 수집해 둔 행의 라벨·배너까지 함께 지워지므로, 테스트 키가
	// 아닌 행은 스냅샷을 떠 두고 끝나면 되돌린다.
	let savedLabels: {
		bannerHorizontalUrl: null | string;
		bannerVerticalUrl: null | string;
		id: string;
		listingType: null | string;
	}[] = [];

	beforeAll(async () => {
		await reapRunningRuns();
		await deleteTestJobPosts();

		const [current] = await db
			.select({
				crawledAdBannerLimit: bambiSiteSettings.crawledAdBannerLimit,
				crawledRecommendedLimit: bambiSiteSettings.crawledRecommendedLimit,
				crawledSpecialLimit: bambiSiteSettings.crawledSpecialLimit,
				crawledUrgentLimit: bambiSiteSettings.crawledUrgentLimit,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"));

		savedLimits = current ?? null;
		savedLabels = await db
			.select({
				bannerHorizontalUrl: crawledJobPost.bannerHorizontalUrl,
				bannerVerticalUrl: crawledJobPost.bannerVerticalUrl,
				id: crawledJobPost.id,
				listingType: crawledJobPost.listingType,
			})
			.from(crawledJobPost)
			.where(
				and(
					eq(crawledJobPost.sourceSite, "queenalba"),
					isNotNull(crawledJobPost.listingType),
					notLike(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`)
				)
			);

		// 상한을 작게 잡아 초과분이 실제로 잘리는지 본다. 배너 상한은 **방향별**이라 2는
		// "가로 2 + 세로 2" = 4칸을 뜻한다(픽스처는 가로 2 · 세로 3칸이라 세로에서 1칸 잘린다).
		// 섹션은 타입별 1건.
		await db
			.update(bambiSiteSettings)
			.set({
				crawlContentType: "job_post",
				crawlEnabled: true,
				crawledAdBannerLimit: 2,
				crawledRecommendedLimit: 1,
				crawledSpecialLimit: 1,
				crawledUrgentLimit: 1,
				crawlSourceSite: "queenalba",
			})
			.where(eq(bambiSiteSettings.id, "default"));
	});

	afterAll(async () => {
		await deleteTestJobPosts();

		for (const row of savedLabels) {
			await db
				.update(crawledJobPost)
				.set({
					bannerHorizontalUrl: row.bannerHorizontalUrl,
					bannerVerticalUrl: row.bannerVerticalUrl,
					listingType: row.listingType,
				})
				.where(eq(crawledJobPost.id, row.id));
		}

		await db
			.update(bambiSiteSettings)
			.set({
				crawlEnabled: false,
				crawledAdBannerLimit: savedLimits?.crawledAdBannerLimit ?? null,
				crawledRecommendedLimit: savedLimits?.crawledRecommendedLimit ?? null,
				crawledSpecialLimit: savedLimits?.crawledSpecialLimit ?? null,
				crawledUrgentLimit: savedLimits?.crawledUrgentLimit ?? null,
			})
			.where(eq(bambiSiteSettings.id, "default"));
	});

	it("resolves only as many banners as the limit allows in each direction", async () => {
		const calls: string[] = [];
		const result = await runCrawlTick(
			new Date(),
			createQueenalbaMainStubClient({ calls }),
			{ force: true }
		);

		expect(result.reason).toBe("completed");
		// 배너 한 칸이 요청 한 번이다. 상한을 리다이렉터 해석 전에 잘라야 초과분 요청이 안 나간다.
		// 가로 2칸(77·78) + 세로 상한 2칸(53·74) = 4건. 세로 세 번째 칸(60)은 잘려 요청이 없다.
		const bannerCalls = calls.filter((url) => url.includes("banner_link.php"));

		expect(bannerCalls).toHaveLength(4);
		expect(bannerCalls.some((url) => url.includes("number=60"))).toBe(false);
	});

	it("labels the paid slots with our own vocabulary up to each limit", async () => {
		const counts = await countTestListingTypes();

		// 배너 상한 2는 방향별이라 가로 2 + 세로 2 = 4행이다.
		expect(counts.ad_banner).toBe(4);
		expect(counts.recommended).toBe(1);
		expect(counts.urgent).toBe(1);
		expect(counts.special).toBe(1);
		// 상한을 넘은 섹션 카드는 라벨만 떼여 일반 카드로 남는다(행 자체는 수집된다).
		expect(counts.none).toBeGreaterThan(0);
	});

	// 배너 이미지가 행에 실제로 담겨야 우리 화면의 배너 자리에 올릴 수 있다. 세로형까지 함께
	// 보는 이유: 전체에 한 번 자르던 시절엔 가로가 상한을 다 먹어 세로 칸이 통째로 비었다.
	it("stores the banner image on the job the redirector pointed at", async () => {
		const readRow = async (linkNumber: string) => {
			const [row] = await db
				.select({
					bannerHorizontalUrl: crawledJobPost.bannerHorizontalUrl,
					bannerVerticalUrl: crawledJobPost.bannerVerticalUrl,
				})
				.from(crawledJobPost)
				.where(
					and(
						eq(crawledJobPost.sourceSite, "queenalba"),
						eq(crawledJobPost.sourceExternalId, bannerTargetId(linkNumber))
					)
				);

			return row;
		};

		expect((await readRow("77"))?.bannerHorizontalUrl).toMatch(
			EMBEDDED_GIF_PATTERN
		);
		expect((await readRow("53"))?.bannerVerticalUrl).toMatch(
			EMBEDDED_GIF_PATTERN
		);
	});

	// 메인에서 내려간 광고를 우리 화면이 계속 밀어주면 그건 이미 시장 신호가 아니다.
	it("clears labels and banners for ads that fell off the main page", async () => {
		await runCrawlTick(
			new Date(),
			createQueenalbaMainStubClient({ mainHtml: shrunkMainHtml }),
			{ force: true }
		);

		const rows = await db
			.select({
				bannerHorizontalUrl: crawledJobPost.bannerHorizontalUrl,
				bannerVerticalUrl: crawledJobPost.bannerVerticalUrl,
				listingType: crawledJobPost.listingType,
			})
			.from(crawledJobPost)
			.where(like(crawledJobPost.sourceExternalId, `${TEST_ID_PREFIX}%`));

		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row.listingType === null)).toBe(true);
		expect(rows.every((row) => row.bannerHorizontalUrl === null)).toBe(true);
		expect(rows.every((row) => row.bannerVerticalUrl === null)).toBe(true);
	});

	// 재수집이 운영자가 지정한 업종을 지우고 공고를 다시 검토 대기로 떨어뜨리던 버그.
	it("keeps the industry category an operator assigned", async () => {
		const readRow = async () => {
			const [row] = await db
				.select({
					industryCategory: crawledJobPost.industryCategory,
					status: crawledJobPost.status,
				})
				.from(crawledJobPost)
				.where(
					and(
						eq(crawledJobPost.sourceSite, "queenalba"),
						eq(crawledJobPost.sourceExternalId, UNMAPPED_INDUSTRY_ID)
					)
				);

			return row;
		};

		// 원본 업종이 우리 8종에 안 맞으면 공고를 버리지 않고 검토 대기로 남긴다.
		expect(await readRow()).toEqual({
			industryCategory: null,
			status: "needs_review",
		});

		// 운영자가 손으로 업종을 잇는다(crawler.setIndustryCategory가 하는 일).
		// detail_fetched_at을 비우는 건 다음 회차가 이 공고의 상세를 다시 받게 하려는 것이다.
		await db
			.update(crawledJobPost)
			.set({
				detailFetchedAt: null,
				industryCategory: "룸싸롱",
				status: "active",
			})
			.where(
				and(
					eq(crawledJobPost.sourceSite, "queenalba"),
					eq(crawledJobPost.sourceExternalId, UNMAPPED_INDUSTRY_ID)
				)
			);

		// 본문이 바뀐 회차여야 upsert가 돈다(내용이 같으면 UPDATE를 건너뛴다).
		await runCrawlTick(
			new Date(),
			createQueenalbaMainStubClient({ bodyMark: "재수집" }),
			{ force: true }
		);

		expect(await readRow()).toEqual({
			industryCategory: "룸싸롱",
			status: "active",
		});
	});

	// 삭제는 재수집을 견뎌야 한다. 원본에 글이 살아 있으면 이 공고는 매 회차 목록에 그대로
	// 실리는데, 그때 upsert가 status를 다시 계산하면 삭제 버튼이 하루도 못 버틴다.
	// 방어는 둘이다 — 상세 대상 선정에서 removed를 빼고(요청 낭비 차단), 그래도 upsert에
	// 닿는 경우(회차 도중 운영자가 삭제)에는 CASE가 removed를 유지한다.
	it("keeps an operator-removed post removed across a re-ingest", async () => {
		const readRow = async () => {
			const [row] = await db
				.select({
					detailFetchedAt: crawledJobPost.detailFetchedAt,
					status: crawledJobPost.status,
				})
				.from(crawledJobPost)
				.where(
					and(
						eq(crawledJobPost.sourceSite, "queenalba"),
						eq(crawledJobPost.sourceExternalId, UNMAPPED_INDUSTRY_ID)
					)
				);

			return row;
		};

		// 운영자가 공고를 내린다(crawler.removePost가 하는 일). detail_fetched_at을 비워
		// 다음 회차의 상세 대상 조건(미수집)을 일부러 만족시킨다 — 그래도 건너뛰어야 한다.
		await db
			.update(crawledJobPost)
			.set({ detailFetchedAt: null, status: "removed" })
			.where(
				and(
					eq(crawledJobPost.sourceSite, "queenalba"),
					eq(crawledJobPost.sourceExternalId, UNMAPPED_INDUSTRY_ID)
				)
			);

		await runCrawlTick(
			new Date(),
			createQueenalbaMainStubClient({ bodyMark: "삭제후재수집" }),
			{ force: true }
		);

		const row = await readRow();

		expect(row?.status).toBe("removed");
		// 상세를 받지 않았다는 증거. 이 값이 채워졌다면 대상 선정의 removed 제외가 풀린 것이다.
		expect(row?.detailFetchedAt).toBeNull();
	});
});
