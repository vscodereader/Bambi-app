import type { Route } from "next";

export const CRAWLED_JOB_PAGE_SIZE = 10;

export const CRAWLED_JOB_STATUS_FILTERS = [
	"all",
	"active",
	"needs_review",
	"expired",
	"removed",
] as const;

export type CrawledJobStatusFilter =
	(typeof CRAWLED_JOB_STATUS_FILTERS)[number];

export interface CrawledJobListState {
	page: number;
	status: CrawledJobStatusFilter;
}

const POSITIVE_INTEGER_RE = /^\d+$/;

const isStatusFilter = (
	value: string | null
): value is CrawledJobStatusFilter =>
	CRAWLED_JOB_STATUS_FILTERS.some((status) => status === value);

const parsePage = (value: string | null): number => {
	if (!(value && POSITIVE_INTEGER_RE.test(value))) {
		return 1;
	}
	const page = Number(value);
	return Number.isSafeInteger(page) && page > 0 ? page : 1;
};

export const parseCrawledJobListState = (
	params: Pick<URLSearchParams, "get">,
	prefix = "job"
): CrawledJobListState => {
	const status = params.get(`${prefix}Status`);
	return {
		page: parsePage(params.get(`${prefix}Page`)),
		status: isStatusFilter(status) ? status : "all",
	};
};

export const crawledJobListHref = ({
	page,
	status,
}: CrawledJobListState): Route => {
	const params = new URLSearchParams();
	params.set("jobPage", String(page));
	params.set("jobStatus", status);
	return `/moderator/crawler?${params.toString()}` as Route;
};

export const crawledJobImageEditHref = (
	id: string,
	state: CrawledJobListState
): Route => {
	const params = new URLSearchParams();
	params.set("returnPage", String(state.page));
	params.set("returnStatus", state.status);
	return `/moderator/crawler/jobs/${id}/edit?${params.toString()}` as Route;
};

export const withCrawledJobListState = (
	current: URLSearchParams,
	state: CrawledJobListState
): string => {
	const params = new URLSearchParams(current);
	params.set("jobPage", String(state.page));
	params.set("jobStatus", state.status);
	return `?${params.toString()}`;
};

// 커뮤니티 글에는 상태 enum이 없고 removedAt 하나뿐이라 필터 축이 셋이다(전체/노출/삭제됨).
export const CRAWLED_TOPIC_FILTERS = ["all", "active", "removed"] as const;

export type CrawledTopicStatusFilter = (typeof CRAWLED_TOPIC_FILTERS)[number];

export interface CrawledTopicListState {
	page: number;
	status: CrawledTopicStatusFilter;
}

const isTopicFilter = (
	value: string | null
): value is CrawledTopicStatusFilter =>
	CRAWLED_TOPIC_FILTERS.some((status) => status === value);

// job 헬퍼를 미러링하되 쿼리키만 topicPage/topicStatus로 둔다(같은 URL을 두 카드가 공유).
export const parseCrawledTopicListState = (
	params: Pick<URLSearchParams, "get">,
	prefix = "topic"
): CrawledTopicListState => {
	const status = params.get(`${prefix}Status`);
	return {
		page: parsePage(params.get(`${prefix}Page`)),
		status: isTopicFilter(status) ? status : "all",
	};
};

export const withCrawledTopicListState = (
	current: URLSearchParams,
	state: CrawledTopicListState
): string => {
	const params = new URLSearchParams(current);
	params.set("topicPage", String(state.page));
	params.set("topicStatus", state.status);
	return `?${params.toString()}`;
};
