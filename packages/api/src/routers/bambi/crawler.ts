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
import { DEFAULT_CRAWL_INTERVAL_HOURS } from "../../services/bambi-crawl-policy";

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

const updateSettingsInput = z.object({
	enabled: z.boolean(),
	intervalHours: z
		.number()
		.int("수집 주기는 시간 단위 정수로 입력해 주세요.")
		.min(1, "수집 주기는 1시간 이상으로 설정해 주세요.")
		.max(MAX_INTERVAL_HOURS, "수집 주기는 720시간(30일) 이하로 설정해 주세요.")
		.nullable(),
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
				enabled: bambiSiteSettings.crawlEnabled,
				intervalHours: bambiSiteSettings.crawlIntervalHours,
				lastRunAt: bambiSiteSettings.crawlLastRunAt,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);

		return {
			defaultIntervalHours: DEFAULT_CRAWL_INTERVAL_HOURS,
			// 행이 없으면 꺼진 상태로 본다. 설정이 없다는 이유로 수집이 시작되면 안 된다.
			enabled: row?.enabled ?? false,
			intervalHours: row?.intervalHours ?? null,
			lastRunAt: row?.lastRunAt ?? null,
		};
	}),

	// 수집 On/Off·주기 저장. 스케줄러는 이 값을 매 틱 읽으므로 재배포 없이 즉시 반영된다.
	updateSettings: adminProcedure
		.input(updateSettingsInput)
		.handler(async ({ input }) => {
			const values = {
				crawlEnabled: input.enabled,
				crawlIntervalHours: input.intervalHours,
			};

			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...values })
				.onConflictDoUpdate({ set: values, target: bambiSiteSettings.id })
				.returning({
					enabled: bambiSiteSettings.crawlEnabled,
					intervalHours: bambiSiteSettings.crawlIntervalHours,
				});

			return saved ?? null;
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
