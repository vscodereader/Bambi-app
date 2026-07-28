import { db } from "@bambi-app/db";
import {
	bambiSiteSettings,
	crawledJobPost,
	crawlRun,
} from "@bambi-app/db/schema/bambi";
import { and, eq, inArray, lt, or } from "drizzle-orm";

import { type CrawlClient, createCrawlClient } from "./bambi-crawl-fetch";
import {
	type FoxalbaListItem,
	foxalbaDetailUrl,
	foxalbaListUrl,
	parseFoxalbaDetail,
	parseFoxalbaList,
	parseFoxalbaTotalCount,
} from "./bambi-crawl-foxalba";
import { computeContentHash } from "./bambi-crawl-normalize";
import {
	type CrawlContentType,
	type CrawlSettings,
	type CrawlSourceSite,
	DAY_MS,
	DETAIL_REFRESH_HOURS,
	EXPIRE_AFTER_DAYS,
	HOUR_MS,
	isCrawlDue,
	isCrawlTargetImplemented,
	isYieldTrustworthy,
	MAX_DETAIL_FETCHES_PER_RUN,
	RUN_STALE_AFTER_MS,
	resolveListPageCount,
} from "./bambi-crawl-policy";

const SOURCE_SITE = "foxalba" as const;

export interface CrawlTickResult {
	itemsFailed: number;
	itemsNew: number;
	itemsUpdated: number;
	pendingDetails: number;
	reason:
		| "aborted_low_yield"
		| "already_running"
		| "completed"
		| "not_due"
		// 운영자가 파서 미구현 사이트(예: queenalba)를 골랐을 때. 회차를 만들지 않는다.
		| "not_implemented";
}

// readSettings는 사이트·데이터 종류까지 읽어야 하지만, isCrawlDue는 그 둘을 보지 않는다
// (주기 판정만). CrawlSettings에 넣으면 정책 테스트의 객체 리터럴이 전부 깨지므로 확장 타입으로 둔다.
type CrawlTickSettings = CrawlSettings & {
	crawlContentType: CrawlContentType;
	crawlSourceSite: CrawlSourceSite;
};

export interface CrawlTickOptions {
	// 운영자가 "즉시 수집"을 누른 경우. 주기 판정만 건너뛰고 나머지(중복 방지·수율 판정·
	// 만료 규칙)는 예약 실행과 완전히 동일하게 지난다.
	force?: boolean;
}

const emptyResult = (reason: CrawlTickResult["reason"]): CrawlTickResult => ({
	itemsFailed: 0,
	itemsNew: 0,
	itemsUpdated: 0,
	pendingDetails: 0,
	reason,
});

interface ExistingRow {
	contentHash: string;
	detailFetchedAt: Date | null;
	id: string;
	sourceExternalId: string;
}

// 상세 한 건의 처리 결과. 이 구분이 있어야 "바뀐 게 없어서 건너뜀"과 "파싱에 실패함"을
// 수율 판정에서 다르게 셀 수 있다.
type DetailOutcome =
	| "failed"
	| "inserted"
	| "robots_skipped"
	| "unchanged"
	| "updated";

const readSettings = async (): Promise<CrawlTickSettings> => {
	const [row] = await db
		.select({
			crawlContentType: bambiSiteSettings.crawlContentType,
			crawlEnabled: bambiSiteSettings.crawlEnabled,
			crawlIntervalHours: bambiSiteSettings.crawlIntervalHours,
			crawlLastRunAt: bambiSiteSettings.crawlLastRunAt,
			crawlSourceSite: bambiSiteSettings.crawlSourceSite,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"));

	return (
		row ?? {
			crawlContentType: "job_post",
			crawlEnabled: false,
			crawlIntervalHours: null,
			crawlLastRunAt: null,
			crawlSourceSite: "foxalba",
		}
	);
};

const touchLastRunAt = (now: Date) =>
	db
		.update(bambiSiteSettings)
		.set({ crawlLastRunAt: now })
		.where(eq(bambiSiteSettings.id, "default"));

// 목록에서 본 ID의 생존 표시를 갱신한다. 파라미터 개수 상한에 걸리지 않도록 나눠 보낸다.
const MARK_SEEN_CHUNK = 500;

const markSeen = async (ids: string[], now: Date): Promise<void> => {
	for (let start = 0; start < ids.length; start += MARK_SEEN_CHUNK) {
		const chunk = ids.slice(start, start + MARK_SEEN_CHUNK);

		if (chunk.length === 0) {
			continue;
		}

		await db
			.update(crawledJobPost)
			.set({ lastSeenAt: now })
			.where(
				and(
					eq(crawledJobPost.sourceSite, SOURCE_SITE),
					inArray(crawledJobPost.sourceExternalId, chunk)
				)
			);
	}
};

// 원본 목록에서 오래 안 보인 공고를 만료시킨다. 수율이 신뢰할 만한 회차에서만 호출해야 한다.
const expireStale = (now: Date) =>
	db
		.update(crawledJobPost)
		.set({ status: "expired" })
		.where(
			and(
				eq(crawledJobPost.sourceSite, SOURCE_SITE),
				lt(
					crawledJobPost.lastSeenAt,
					new Date(now.getTime() - EXPIRE_AFTER_DAYS * DAY_MS)
				),
				or(
					eq(crawledJobPost.status, "active"),
					eq(crawledJobPost.status, "needs_review")
				)
			)
		);

interface ListPass {
	items: FoxalbaListItem[];
	pagesFetched: number;
}

const collectListItems = async (client: CrawlClient): Promise<ListPass> => {
	// robots.txt를 먼저 확인한다. 못 받으면 전부 금지로 보므로 여기서 멈춘다.
	if (!(await client.isAllowed(foxalbaListUrl(1)))) {
		throw new Error("robots.txt가 목록 수집을 허용하지 않는다");
	}

	const firstPage = await client.fetchHtml(foxalbaListUrl(1));
	const pageCount = resolveListPageCount(parseFoxalbaTotalCount(firstPage));
	const items = parseFoxalbaList(firstPage);
	let pagesFetched = 1;

	for (let page = 2; page <= pageCount; page += 1) {
		items.push(
			...parseFoxalbaList(await client.fetchHtml(foxalbaListUrl(page)))
		);
		pagesFetched += 1;
	}

	// 같은 o_idx가 목록에 두 번 실리는 경우가 실제로 있다(한 페이지 50칸 중 49건만 고유했다).
	// 중복을 두면 같은 상세 페이지를 두 번 받아 상대 서버를 괜히 두드리고, 신규 건수도
	// 실제 행 수보다 부풀려 집계된다. 첫 등장만 남긴다.
	const byExternalId = new Map<string, FoxalbaListItem>();
	for (const item of items) {
		if (!byExternalId.has(item.sourceExternalId)) {
			byExternalId.set(item.sourceExternalId, item);
		}
	}

	return { items: [...byExternalId.values()], pagesFetched };
};

const ingestDetail = async (
	client: CrawlClient,
	item: FoxalbaListItem,
	existingRow: ExistingRow | undefined,
	now: Date
): Promise<DetailOutcome> => {
	const url = foxalbaDetailUrl(item.sourceExternalId);

	// 개별 URL을 robots에서 막아둔 경우다(삭제 요청이 들어간 글 등). 실패가 아니라
	// 존중해야 할 의사표시이므로 수율 판정에 실패로 세지 않는다.
	if (!(await client.isAllowed(url))) {
		return "robots_skipped";
	}

	const record = parseFoxalbaDetail(
		await client.fetchHtml(url),
		item.sourceExternalId
	);

	if (!record) {
		return "failed";
	}

	const contentHash = computeContentHash(record);

	// 내용이 그대로면 UPDATE를 건너뛴다. 생존 표시는 목록 패스에서 이미 갱신된다.
	if (existingRow?.contentHash === contentHash) {
		await db
			.update(crawledJobPost)
			.set({ detailFetchedAt: now })
			.where(eq(crawledJobPost.id, existingRow.id));

		return "unchanged";
	}

	const values = {
		address: record.address,
		ageRange: record.ageRange,
		bizName: record.bizName,
		body: record.body,
		contactKakao: record.contactKakao,
		contactName: record.contactName,
		contactPhone: record.contactPhone,
		contentHash,
		detailFetchedAt: now,
		district: record.district,
		gender: record.gender,
		industryCategory: record.industryCategory,
		industryRaw: record.industryRaw,
		lastSeenAt: now,
		payAmount: record.payAmount,
		payRaw: record.payRaw,
		payUnit: record.payUnit,
		region: record.region,
		shopName: record.shopName,
		sourceExternalId: record.sourceExternalId,
		sourcePostedAt: record.sourcePostedAt,
		sourceSite: SOURCE_SITE,
		sourceUrl: record.sourceUrl,
		// 업종 매핑에 실패하면 공고를 버리지 않고 운영자 손을 기다린다.
		status: record.industryCategory
			? ("active" as const)
			: ("needs_review" as const),
		title: record.title,
		workSchedule: record.workSchedule,
	};

	await db
		.insert(crawledJobPost)
		.values(values)
		.onConflictDoUpdate({
			set: values,
			target: [crawledJobPost.sourceSite, crawledJobPost.sourceExternalId],
		});

	return existingRow ? "updated" : "inserted";
};

interface DetailStats {
	detailAttempts: number;
	detailFailures: number;
	itemsNew: number;
	itemsUpdated: number;
}

const processDetails = async (
	client: CrawlClient,
	targets: FoxalbaListItem[],
	existingByExternalId: Map<string, ExistingRow>,
	now: Date
): Promise<DetailStats> => {
	const stats: DetailStats = {
		detailAttempts: 0,
		detailFailures: 0,
		itemsNew: 0,
		itemsUpdated: 0,
	};

	for (const item of targets) {
		let outcome: DetailOutcome;

		try {
			outcome = await ingestDetail(
				client,
				item,
				existingByExternalId.get(item.sourceExternalId),
				now
			);
		} catch {
			// 개별 공고 실패는 삼키고 다음으로 넘어간다. 다음 회차가 다시 시도한다.
			outcome = "failed";
		}

		if (outcome === "robots_skipped") {
			continue;
		}

		stats.detailAttempts += 1;

		if (outcome === "failed") {
			stats.detailFailures += 1;
		} else if (outcome === "inserted") {
			stats.itemsNew += 1;
		} else if (outcome === "updated") {
			stats.itemsUpdated += 1;
		}
	}

	return stats;
};

const loadExisting = async (): Promise<Map<string, ExistingRow>> => {
	const rows = await db
		.select({
			contentHash: crawledJobPost.contentHash,
			detailFetchedAt: crawledJobPost.detailFetchedAt,
			id: crawledJobPost.id,
			sourceExternalId: crawledJobPost.sourceExternalId,
		})
		.from(crawledJobPost)
		.where(eq(crawledJobPost.sourceSite, SOURCE_SITE));

	return new Map(rows.map((row) => [row.sourceExternalId, row]));
};

// 상세를 다시 받을 대상: 처음 보는 공고와, 상세가 낡은 공고.
const selectDetailTargets = (
	items: FoxalbaListItem[],
	existingByExternalId: Map<string, ExistingRow>,
	now: Date
): FoxalbaListItem[] => {
	const cutoff = new Date(now.getTime() - DETAIL_REFRESH_HOURS * HOUR_MS);

	return items.filter((item) => {
		const row = existingByExternalId.get(item.sourceExternalId);

		return !row?.detailFetchedAt || row.detailFetchedAt < cutoff;
	});
};

// 서버가 회차 도중 죽으면 running 행이 남아 부분 유니크 인덱스가 새 수집을 영원히 막는다.
// 오래된 진행 중 회차를 실패로 정리해 스스로 풀리게 한다.
const reapStaleRuns = (now: Date) =>
	db
		.update(crawlRun)
		.set({
			error: "진행 중 상태로 방치돼 정리됨(프로세스 중단 추정)",
			finishedAt: now,
			status: "failed",
		})
		.where(
			and(
				eq(crawlRun.status, "running"),
				lt(crawlRun.startedAt, new Date(now.getTime() - RUN_STALE_AFTER_MS))
			)
		);

// 회차를 연다. 이미 진행 중이면 부분 유니크 인덱스가 INSERT를 막으므로 null을 돌려준다.
const startRun = async (now: Date): Promise<{ id: string } | null> => {
	const [run] = await db
		.insert(crawlRun)
		.values({ sourceSite: SOURCE_SITE, startedAt: now, status: "running" })
		.onConflictDoNothing()
		.returning({ id: crawlRun.id });

	return run ?? null;
};

// 수집 한 회차. 예외는 crawl_run에 기록한 뒤 다시 던지고, 호출자(스케줄러 플러그인)가
// 로그만 남긴다 — 틱 하나가 서버를 죽이면 안 된다.
export const runCrawlTick = async (
	now: Date,
	client: CrawlClient = createCrawlClient(),
	options: CrawlTickOptions = {}
): Promise<CrawlTickResult> => {
	const settings = await readSettings();

	// 강제 실행이라도 마스터 스위치는 존중한다. 꺼둔 수집이 버튼 하나로 되살아나면
	// "껐다"는 말이 거짓이 된다.
	if (!settings.crawlEnabled) {
		return emptyResult("not_due");
	}

	// 파서가 없는 (사이트 × 데이터 종류) 조합을 골랐으면 회차를 만들지 않고 빠져나온다. 여기서
	// 회차를 열면 빈 결과가 "공고 없음"으로 읽혀 만료 처리가 돌 수 있다. 파서가 생기면
	// IMPLEMENTED_CRAWL_TARGETS에 조합을 추가하는 것만으로 이 가드가 풀린다.
	if (
		!isCrawlTargetImplemented(
			settings.crawlSourceSite,
			settings.crawlContentType
		)
	) {
		return emptyResult("not_implemented");
	}

	if (!(options.force || isCrawlDue(settings, now))) {
		return emptyResult("not_due");
	}

	await reapStaleRuns(now);

	const run = await startRun(now);

	// 진행 중 회차가 이미 있다. 부분 유니크 인덱스가 두 번째 INSERT를 막은 것이라,
	// 애플리케이션 검사만 있을 때 남는 경쟁 창이 여기서는 없다.
	if (!run) {
		return emptyResult("already_running");
	}

	try {
		const listPass = await collectListItems(client);

		// 목록이 0건이면 "공고가 사라졌다"가 아니라 "셀렉터가 깨졌다"로 본다. 만료 처리도
		// 생존 표시 갱신도 하지 않고 즉시 중단한다 — 이 분기가 전량 만료 사고를 막는다.
		if (
			!isYieldTrustworthy({
				detailAttempts: 0,
				detailFailures: 0,
				listItems: listPass.items.length,
			})
		) {
			await db
				.update(crawlRun)
				.set({
					error: "목록 파싱 0건 — 셀렉터 파손으로 보고 중단",
					finishedAt: new Date(),
					pagesFetched: listPass.pagesFetched,
					status: "aborted_low_yield",
				})
				.where(eq(crawlRun.id, run.id));
			await touchLastRunAt(now);

			return {
				itemsFailed: 0,
				itemsNew: 0,
				itemsUpdated: 0,
				pendingDetails: 0,
				reason: "aborted_low_yield",
			};
		}

		const existingByExternalId = await loadExisting();
		const targets = selectDetailTargets(
			listPass.items,
			existingByExternalId,
			now
		);
		const pendingDetails = Math.max(
			0,
			targets.length - MAX_DETAIL_FETCHES_PER_RUN
		);

		const stats = await processDetails(
			client,
			targets.slice(0, MAX_DETAIL_FETCHES_PER_RUN),
			existingByExternalId,
			now
		);

		const trustworthy = isYieldTrustworthy({
			detailAttempts: stats.detailAttempts,
			detailFailures: stats.detailFailures,
			listItems: listPass.items.length,
		});

		if (trustworthy) {
			// 목록에서 본 공고는 살아 있다는 뜻이다. 상세를 못 받은 공고까지 여기서 생존
			// 표시가 올라가야 요청 상한에 걸린 공고가 만료로 오해받지 않는다.
			await markSeen(
				listPass.items.map((item) => item.sourceExternalId),
				now
			);
			await expireStale(now);
		}

		await db
			.update(crawlRun)
			.set({
				error: trustworthy ? null : "상세 파싱 실패율 초과 — 만료 처리 생략",
				finishedAt: new Date(),
				itemsFailed: stats.detailFailures,
				itemsNew: stats.itemsNew,
				itemsSeen: listPass.items.length,
				itemsUpdated: stats.itemsUpdated,
				pagesFetched: listPass.pagesFetched,
				status: trustworthy ? "success" : "aborted_low_yield",
			})
			.where(eq(crawlRun.id, run.id));
		await touchLastRunAt(now);

		return {
			itemsFailed: stats.detailFailures,
			itemsNew: stats.itemsNew,
			itemsUpdated: stats.itemsUpdated,
			pendingDetails,
			reason: trustworthy ? "completed" : "aborted_low_yield",
		};
	} catch (error) {
		await db
			.update(crawlRun)
			.set({
				error: error instanceof Error ? error.message : String(error),
				finishedAt: new Date(),
				status: "failed",
			})
			.where(eq(crawlRun.id, run.id));

		// 실패해도 마지막 실행 시각은 갱신한다. 갱신하지 않으면 장애가 이어지는 동안
		// 매 틱마다 재시도해 상대 서버를 두드리게 된다.
		await touchLastRunAt(now);

		throw error;
	}
};
