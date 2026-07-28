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
	type CrawlSettings,
	DAY_MS,
	DETAIL_REFRESH_HOURS,
	EXPIRE_AFTER_DAYS,
	HOUR_MS,
	isCrawlDue,
	isYieldTrustworthy,
	MAX_DETAIL_FETCHES_PER_RUN,
	resolveListPageCount,
} from "./bambi-crawl-policy";

const SOURCE_SITE = "foxalba" as const;

export interface CrawlTickResult {
	itemsFailed: number;
	itemsNew: number;
	itemsUpdated: number;
	pendingDetails: number;
	reason: "aborted_low_yield" | "completed" | "not_due";
}

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

const readSettings = async (): Promise<CrawlSettings> => {
	const [row] = await db
		.select({
			crawlEnabled: bambiSiteSettings.crawlEnabled,
			crawlIntervalHours: bambiSiteSettings.crawlIntervalHours,
			crawlLastRunAt: bambiSiteSettings.crawlLastRunAt,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"));

	return (
		row ?? {
			crawlEnabled: false,
			crawlIntervalHours: null,
			crawlLastRunAt: null,
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

	return { items, pagesFetched };
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

// 수집 한 회차. 예외는 crawl_run에 기록한 뒤 다시 던지고, 호출자(스케줄러 플러그인)가
// 로그만 남긴다 — 틱 하나가 서버를 죽이면 안 된다.
export const runCrawlTick = async (
	now: Date,
	client: CrawlClient = createCrawlClient()
): Promise<CrawlTickResult> => {
	const settings = await readSettings();

	if (!isCrawlDue(settings, now)) {
		return {
			itemsFailed: 0,
			itemsNew: 0,
			itemsUpdated: 0,
			pendingDetails: 0,
			reason: "not_due",
		};
	}

	const [run] = await db
		.insert(crawlRun)
		.values({ sourceSite: SOURCE_SITE, startedAt: now, status: "running" })
		.returning({ id: crawlRun.id });

	if (!run) {
		throw new Error("crawl_run 생성 실패");
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
