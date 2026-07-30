import { db } from "@bambi-app/db";
import {
	bambiSiteSettings,
	crawledCommunityTopic,
	crawledJobPost,
	crawlRun,
	jobIndustryCategory,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
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
	status: z.enum(["active", "needs_review", "expired", "removed"]).nullish(),
});

// 운영자 커뮤니티 글 목록. sourceUrl·본문은 내려보내지 않는다 — 원본 링크 한 줄이 원본
// 전체로 가는 우회로이고(crawled-jobs.ts PUBLIC_COLUMNS와 같은 원칙), 삭제·복구 판단에는
// 제목과 반응 지표만 있으면 된다.
const TOPIC_LIST_COLUMNS = {
	boardName: crawledCommunityTopic.boardName,
	commentCount: crawledCommunityTopic.commentCount,
	id: crawledCommunityTopic.id,
	removedAt: crawledCommunityTopic.removedAt,
	sourcePostedAt: crawledCommunityTopic.sourcePostedAt,
	title: crawledCommunityTopic.title,
	viewCount: crawledCommunityTopic.viewCount,
} as const;

const listTopicsInput = z.object({
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
	offset: z.number().int().min(0).default(0),
	// true면 내린 글만, false면 노출 중인 글만, 생략하면 전체. 공고 쪽 status 필터와 같은 축이다.
	removed: z.boolean().nullish(),
});

// 생략(undefined·null)은 "전체"다. 삼항을 겹치지 않으려고 함수로 뺀다.
const topicRemovedFilter = (removed: boolean | null | undefined) => {
	if (removed === null || removed === undefined) {
		return;
	}

	return removed
		? isNotNull(crawledCommunityTopic.removedAt)
		: isNull(crawledCommunityTopic.removedAt);
};

const idInput = z.object({ id: z.uuid() });

// 삭제·복구의 대상이 없으면 화면이 조용히 성공으로 읽지 않게 세운다 — 목록이 낡아 이미
// 지워진 행을 가리키는 경우가 실제로 있다.
const NOT_FOUND_MESSAGE = "대상을 찾을 수 없습니다.";

const requireRow = <T>(row: T | undefined): T => {
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: NOT_FOUND_MESSAGE });
	}

	return row;
};

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

	// 업종 수동 매핑. 원본 직종이 우리 업종 enum에 안 맞아 needs_review로 남은 공고를 운영자가 잇는다.
	// 허용값은 DB enum에서 그대로 끌어온다 — 손으로 나열하면 enum에 값을 더할 때마다 여기가
	// 빠져 화면의 Select에는 보이는 항목이 서버에서 거절된다(실제로 "기타" 추가 때 그랬다).
	setIndustryCategory: adminProcedure
		.input(
			z.object({
				id: z.uuid(),
				industryCategory: z.enum(jobIndustryCategory.enumValues),
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

	// 공고 삭제. 행을 지우지 않고 status='removed'로 세운다 — 원본 사이트에 글이 살아 있는 한
	// 다음 회차 upsert가 같은 (사이트, 원본ID)로 행을 되살리므로, 진짜 DELETE는 하루도 못 버틴다.
	// 이 상태를 재수집·만료 스윕이 덮지 않는 것이 삭제가 유지되는 근거다(bambi-crawl-ingest.ts).
	removePost: adminProcedure.input(idInput).handler(async ({ input }) => {
		const [saved] = await db
			.update(crawledJobPost)
			.set({ status: "removed" })
			.where(eq(crawledJobPost.id, input.id))
			.returning(LIST_COLUMNS);

		return requireRow(saved);
	}),

	// 공고 복구. 되돌릴 상태는 재수집 CASE와 같은 규칙으로 정한다 — 업종이 있으면 노출,
	// 없으면 검토 대기. 여기서 무조건 active로 두면 업종 없는 공고가 화면에 서고, 무조건
	// needs_review로 두면 이미 업종이 지정된 공고가 다시 검토 큐에 쌓인다.
	restorePost: adminProcedure.input(idInput).handler(async ({ input }) => {
		const [saved] = await db
			.update(crawledJobPost)
			.set({
				status: sql`case when ${crawledJobPost.industryCategory} is null then 'needs_review'::crawled_post_status else 'active'::crawled_post_status end`,
			})
			.where(
				and(
					eq(crawledJobPost.id, input.id),
					// 삭제되지 않은 공고에 복구를 걸면 status를 재계산해 운영자가 손댄 상태를
					// 흔든다(예: expired 공고가 active로 부활). 대상을 removed로 좁혀 둔다.
					eq(crawledJobPost.status, "removed")
				)
			)
			.returning(LIST_COLUMNS);

		return requireRow(saved);
	}),

	// 운영자 커뮤니티 글 목록. 삭제·복구 대상을 고르는 화면용이라 제목·반응 지표만 내려보낸다.
	listTopics: adminProcedure
		.input(listTopicsInput)
		.handler(async ({ input }) => {
			const where = topicRemovedFilter(input.removed);

			const [rows, [total]] = await Promise.all([
				db
					.select(TOPIC_LIST_COLUMNS)
					.from(crawledCommunityTopic)
					.where(where)
					// 원 게시일 최신순. nulls last를 명시하는 이유는 Postgres의 DESC 기본이
					// NULLS FIRST라, 날짜를 못 읽은 글이 최신 글 앞을 통째로 막기 때문이다.
					.orderBy(sql`${crawledCommunityTopic.sourcePostedAt} desc nulls last`)
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(crawledCommunityTopic).where(where),
			]);

			return { items: rows, total: total?.value ?? 0 };
		}),

	// 커뮤니티 글 삭제. 공고와 같은 이유로 행을 지우지 않는다 — 다만 이 표에는 상태 enum이
	// 없어 시각 컬럼 하나로 톰스톤을 세운다. 목록 재수집 upsert의 set 목록에 removed_at이
	// 없으므로 값이 그대로 살아남는다.
	removeTopic: adminProcedure.input(idInput).handler(async ({ input }) => {
		const [saved] = await db
			.update(crawledCommunityTopic)
			.set({ removedAt: new Date() })
			.where(eq(crawledCommunityTopic.id, input.id))
			.returning(TOPIC_LIST_COLUMNS);

		return requireRow(saved);
	}),

	// 커뮤니티 글 복구. 공고와 달리 되돌릴 상태 계산이 없다 — 시각을 비우면 곧 노출 중이다.
	restoreTopic: adminProcedure.input(idInput).handler(async ({ input }) => {
		const [saved] = await db
			.update(crawledCommunityTopic)
			.set({ removedAt: null })
			.where(eq(crawledCommunityTopic.id, input.id))
			.returning(TOPIC_LIST_COLUMNS);

		return requireRow(saved);
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
			// 수집 대상이 제공하는 (사이트 × 데이터 종류) 조합. 화면이 고를 수 있는 데이터
			// 종류를 이 목록으로 그린다(퀸알바=공고·커뮤니티).
			availableTargets: [...AVAILABLE_CRAWL_TARGETS],
			contentType: row?.contentType ?? "job_post",
			defaultIntervalHours: DEFAULT_CRAWL_INTERVAL_HOURS,
			// 행이 없으면 꺼진 상태로 본다. 설정이 없다는 이유로 수집이 시작되면 안 된다.
			enabled: row?.enabled ?? false,
			// 파서가 구현된 조합. 화면이 "준비 중" 배지·즉시수집 잠금 판단에 쓴다.
			implementedTargets: [...IMPLEMENTED_CRAWL_TARGETS],
			intervalHours: row?.intervalHours ?? null,
			lastRunAt: row?.lastRunAt ?? null,
			sourceSite: row?.sourceSite ?? "queenalba",
		};
	}),

	// 스케줄러 On/Off·주기 저장. 스케줄러는 이 값을 매 틱 읽으므로 재배포 없이 즉시 반영된다.
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
	// 진행 상황을 본다. 주기 판정과 스케줄러 스위치만 건너뛰고 중복 방지·수율 판정·만료 규칙은
	// 예약 실행과 완전히 같은 경로를 지난다.
	runNow: adminProcedure.handler(async () => {
		const [settings] = await db
			.select({
				contentType: bambiSiteSettings.crawlContentType,
				sourceSite: bambiSiteSettings.crawlSourceSite,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);

		// crawlEnabled는 보지 않는다. 그 스위치는 스케줄러(주기 실행)만 통제하므로, 꺼둔
		// 상태에서도 운영자가 파서를 확인할 수 있어야 한다.
		//
		// 파서가 없는 (사이트 × 데이터 종류) 조합을 골랐으면 회차를 띄우지 않고 화면에 바로 알린다.
		// runCrawlTick도 not_implemented로 빠지지만, 여기서 먼저 걸러야 "시작됨" 토스트가 잘못 뜨지 않는다.
		// 행이 없을 때의 폴백은 runCrawlTick(readSettings)과 같아야 한다 — 다르면 여기서 막은
		// 조합이 실제로는 돌거나, 그 반대가 된다.
		if (
			!isCrawlTargetImplemented(
				settings?.sourceSite ?? "queenalba",
				settings?.contentType ?? "job_post"
			)
		) {
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

	// 회차 기록 비우기. 파손 신호를 읽고 나면 실패·중단 기록이 계속 쌓여 최근 20건이 옛 사고로
	// 채워지므로, 훑고 나서 지울 수단이 필요하다. 여기서는 톰스톤을 세우지 않고 정말 지운다 —
	// crawl_run을 참조하는 FK가 없고(수집 공고·커뮤니티 글은 회차 id를 들고 있지 않다),
	// 재수집이 되살릴 원본도 없는 순수 운영 로그다.
	//
	// 단, 진행 중(running) 회차는 남긴다. 두 가지 이유가 다 치명적이다:
	// 1) runCrawlTick이 회차를 열어 id를 들고 있다가 끝날 때 그 id로 UPDATE하므로
	//    (bambi-crawl-ingest.ts), 지우면 그 UPDATE가 0행이 되어 수율이 어디에도 남지 않는다.
	// 2) 사이트당 진행 중 회차를 하나로 묶는 건 status='running' 부분 유니크 인덱스인데,
	//    그 행을 지우면 잠금이 풀려 같은 목록을 두 번 긁는 회차가 열린다.
	clearRuns: adminProcedure.handler(async () => {
		const removed = await db
			.delete(crawlRun)
			.where(ne(crawlRun.status, "running"))
			.returning({ id: crawlRun.id });

		return { removed: removed.length };
	}),

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
