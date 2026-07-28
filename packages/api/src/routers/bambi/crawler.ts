import { db } from "@bambi-app/db";
import {
	bambiSiteSettings,
	crawledJobPost,
	crawlRun,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { and, count, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import { runCrawlTick } from "../../services/bambi-crawl-ingest";
import {
	AVAILABLE_CRAWL_TARGETS,
	DEFAULT_CRAWL_INTERVAL_HOURS,
	IMPLEMENTED_CRAWL_TARGETS,
	isCrawlTargetImplemented,
	isRunStale,
} from "../../services/bambi-crawl-policy";

const SETTINGS_ROW_ID = "default";

// 목록에 내려보내는 컬럼. 연락처·담당자명·카톡아이디·사업자명·주소는 **의도적으로 빠져 있다** —
// 원본에 연락처를 올린 담당자는 그 사이트 이용자에게 연락받는 데 동의했을 뿐 다른 서비스에서의
// 재공개에 동의한 적이 없다. 리드가 필요한 화면은 getLead로 한 건씩 열람하고, 그 호출만
// 감사 로그에 남길 수 있다. 목록에 섞어두면 화면 한 번 여는 것만으로 수천 건이 흘러나간다.
const LIST_COLUMNS = {
	detailFetchedAt: crawledJobPost.detailFetchedAt,
	district: crawledJobPost.district,
	firstSeenAt: crawledJobPost.firstSeenAt,
	id: crawledJobPost.id,
	industryCategory: crawledJobPost.industryCategory,
	industryRaw: crawledJobPost.industryRaw,
	lastSeenAt: crawledJobPost.lastSeenAt,
	payAmount: crawledJobPost.payAmount,
	payRaw: crawledJobPost.payRaw,
	payUnit: crawledJobPost.payUnit,
	region: crawledJobPost.region,
	shopName: crawledJobPost.shopName,
	sourceExternalId: crawledJobPost.sourceExternalId,
	sourceSite: crawledJobPost.sourceSite,
	sourceUrl: crawledJobPost.sourceUrl,
	status: crawledJobPost.status,
	title: crawledJobPost.title,
	workSchedule: crawledJobPost.workSchedule,
} as const;

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 30;

const listInput = z.object({
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
	offset: z.number().int().min(0).default(0),
	status: z.enum(["active", "needs_review", "expired"]).nullish(),
});

// 주기 상한은 30일. 그보다 길면 사실상 꺼둔 것이므로 토글을 쓰는 게 맞다.
const MAX_INTERVAL_HOURS = 720;

const sourceSiteInput = z.enum(["foxalba", "queenalba"]);
const contentTypeInput = z.enum(["job_post", "community"]);

const updateSettingsInput = z.object({
	contentType: contentTypeInput,
	enabled: z.boolean(),
	intervalHours: z
		.number()
		.int("수집 주기는 시간 단위 정수로 입력해 주세요.")
		.min(1, "수집 주기는 1시간 이상으로 설정해 주세요.")
		.max(MAX_INTERVAL_HOURS, "수집 주기는 720시간(30일) 이하로 설정해 주세요.")
		.nullable(),
	sourceSite: sourceSiteInput,
});

const RECENT_RUN_LIMIT = 20;

export const crawlerRouter = {
	// 수집 목록. 운영자 전용이며 연락처 계열은 포함하지 않는다(LIST_COLUMNS 주석 참고).
	list: adminProcedure.input(listInput).handler(async ({ input }) => {
		const where = input.status
			? eq(crawledJobPost.status, input.status)
			: undefined;

		const [rows, [total]] = await Promise.all([
			db
				.select(LIST_COLUMNS)
				.from(crawledJobPost)
				.where(where)
				.orderBy(desc(crawledJobPost.lastSeenAt))
				.limit(input.limit)
				.offset(input.offset),
			db.select({ value: count() }).from(crawledJobPost).where(where),
		]);

		return { items: rows, total: total?.value ?? 0 };
	}),

	// 영업 리드 한 건 열람. 목록과 분리한 이유는 접근을 한 건씩으로 좁혀 두기 위해서다 —
	// 어떤 공고의 연락처를 언제 봤는지가 호출 단위로 남아야 나중에 감사할 수 있다.
	getLead: adminProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ input }) => {
			const [row] = await db
				.select({
					address: crawledJobPost.address,
					bizName: crawledJobPost.bizName,
					body: crawledJobPost.body,
					contactKakao: crawledJobPost.contactKakao,
					contactName: crawledJobPost.contactName,
					contactPhone: crawledJobPost.contactPhone,
					id: crawledJobPost.id,
					shopName: crawledJobPost.shopName,
					sourceUrl: crawledJobPost.sourceUrl,
					title: crawledJobPost.title,
				})
				.from(crawledJobPost)
				.where(eq(crawledJobPost.id, input.id))
				.limit(1);

			return row ?? null;
		}),

	// 업종 수동 매핑. 원본 직종이 우리 8종에 안 맞아 needs_review로 남은 공고를 운영자가 잇는다.
	setIndustryCategory: adminProcedure
		.input(
			z.object({
				id: z.uuid(),
				industryCategory: z.enum([
					"룸싸롱",
					"텐프로/쩜오",
					"노래주점",
					"단란주점",
					"다방",
					"BAR",
					"마사지",
					"요정",
				]),
			})
		)
		.handler(async ({ input }) => {
			const [saved] = await db
				.update(crawledJobPost)
				.set({
					industryCategory: input.industryCategory,
					// 매핑이 끝났으니 검토 대기에서 풀어준다. 이미 만료된 행은 되살리지 않는다.
					status: sql`case when ${crawledJobPost.status} = 'needs_review' then 'active' else ${crawledJobPost.status} end`,
				})
				.where(eq(crawledJobPost.id, input.id))
				.returning(LIST_COLUMNS);

			return saved ?? null;
		}),

	// 수집 설정 조회. defaultIntervalHours는 코드 기본값으로, 운영자 폼 placeholder가
	// 실제 폴백값을 보게 한다.
	getSettings: adminProcedure.handler(async () => {
		const [row] = await db
			.select({
				contentType: bambiSiteSettings.crawlContentType,
				enabled: bambiSiteSettings.crawlEnabled,
				intervalHours: bambiSiteSettings.crawlIntervalHours,
				lastRunAt: bambiSiteSettings.crawlLastRunAt,
				sourceSite: bambiSiteSettings.crawlSourceSite,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);

		return {
			// 사이트가 제공하는 (사이트 × 데이터 종류) 조합. 화면이 사이트별로 고를 수 있는
			// 데이터 종류를 이 목록으로 그린다(여우알바=공고, 퀸알바=공고·커뮤니티).
			availableTargets: [...AVAILABLE_CRAWL_TARGETS],
			contentType: row?.contentType ?? "job_post",
			defaultIntervalHours: DEFAULT_CRAWL_INTERVAL_HOURS,
			// 행이 없으면 꺼진 상태로 본다. 설정이 없다는 이유로 수집이 시작되면 안 된다.
			enabled: row?.enabled ?? false,
			// 파서가 구현된 조합. 화면이 "준비 중" 배지·즉시수집 잠금 판단에 쓴다.
			implementedTargets: [...IMPLEMENTED_CRAWL_TARGETS],
			intervalHours: row?.intervalHours ?? null,
			lastRunAt: row?.lastRunAt ?? null,
			sourceSite: row?.sourceSite ?? "foxalba",
		};
	}),

	// 수집 On/Off·주기 저장. 스케줄러는 이 값을 매 틱 읽으므로 재배포 없이 즉시 반영된다.
	updateSettings: adminProcedure
		.input(updateSettingsInput)
		.handler(async ({ input }) => {
			const values = {
				crawlContentType: input.contentType,
				crawlEnabled: input.enabled,
				crawlIntervalHours: input.intervalHours,
				crawlSourceSite: input.sourceSite,
			};

			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...values })
				.onConflictDoUpdate({ set: values, target: bambiSiteSettings.id })
				.returning({
					contentType: bambiSiteSettings.crawlContentType,
					enabled: bambiSiteSettings.crawlEnabled,
					intervalHours: bambiSiteSettings.crawlIntervalHours,
					sourceSite: bambiSiteSettings.crawlSourceSite,
				});

			return saved ?? null;
		}),

	// 즉시 수집. 한 회차는 목록 수십 페이지와 상세 수백 건이라 최대 10분쯤 걸리므로 응답을
	// 붙잡고 기다리지 않고 시작만 시킨 뒤 돌려준다 — 화면은 최근 회차 목록을 다시 불러
	// 진행 상황을 본다. 주기 판정만 건너뛰고 마스터 스위치·중복 방지·수율 판정·만료 규칙은
	// 예약 실행과 완전히 같은 경로를 지난다.
	runNow: adminProcedure.handler(async () => {
		const [settings] = await db
			.select({
				contentType: bambiSiteSettings.crawlContentType,
				enabled: bambiSiteSettings.crawlEnabled,
				sourceSite: bambiSiteSettings.crawlSourceSite,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);

		// 꺼둔 수집이 버튼 하나로 되살아나면 "껐다"는 말이 거짓이 된다.
		if (!settings?.enabled) {
			return { reason: "disabled" as const, started: false };
		}

		// 파서가 없는 (사이트 × 데이터 종류) 조합을 골랐으면 회차를 띄우지 않고 화면에 바로 알린다.
		// runCrawlTick도 not_implemented로 빠지지만, 여기서 먼저 걸러야 "시작됨" 토스트가 잘못 뜨지 않는다.
		if (!isCrawlTargetImplemented(settings.sourceSite, settings.contentType)) {
			return { reason: "not_implemented" as const, started: false };
		}

		const [active] = await db
			.select({ startedAt: crawlRun.startedAt })
			.from(crawlRun)
			.where(eq(crawlRun.status, "running"))
			.limit(1);

		// 여기서 걸러내는 건 화면에 바로 알려주기 위해서다. 진짜 직렬화는 crawl_run의
		// 부분 유니크 인덱스가 하므로, 이 검사를 두 요청이 동시에 통과해도 한쪽만 실행된다.
		if (active && !isRunStale(active.startedAt, new Date())) {
			return { reason: "already_running" as const, started: false };
		}

		// 응답을 기다리지 않고 띄운다. 스케줄러 틱과 같은 프로세스라 수명도 같고, 실패는
		// crawl_run에 기록되므로 여기서는 미처리 거부만 막는다.
		runCrawlTick(new Date(), undefined, { force: true }).catch(() => {
			// 실패 사유는 crawl_run.error에 남는다. 화면은 최근 회차 목록에서 확인한다.
		});

		return { reason: "started" as const, started: true };
	}),

	// 최근 수집 회차. aborted_low_yield가 보이면 상대 마크업이 바뀐 것이므로 파서 점검이 필요하다 —
	// 이 화면이 셀렉터 파손을 알아채는 유일한 창구다.
	listRuns: adminProcedure.handler(() =>
		db
			.select()
			.from(crawlRun)
			.orderBy(desc(crawlRun.startedAt))
			.limit(RECENT_RUN_LIMIT)
	),

	// 상태별 건수. 운영자 화면 상단 요약과 needs_review 잔량 확인에 쓴다.
	getSummary: adminProcedure.handler(async () => {
		const rows = await db
			.select({ status: crawledJobPost.status, value: count() })
			.from(crawledJobPost)
			.groupBy(crawledJobPost.status);

		const [converted] = await db
			.select({ value: count() })
			.from(jobPost)
			.where(and(eq(jobPost.source, "converted")));

		return {
			byStatus: Object.fromEntries(rows.map((row) => [row.status, row.value])),
			converted: converted?.value ?? 0,
		};
	}),
};
