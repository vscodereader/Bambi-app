import { FOXALBA_ITEMS_PER_PAGE } from "./bambi-crawl-foxalba";

// 수집 정책. DB도 네트워크도 건드리지 않는 순수 판정만 모아 둔다 — 이 결정들이 잘못되면
// 수집분 전체가 날아가는데, I/O에 묶여 있으면 그걸 검증할 방법이 없다.

export const DEFAULT_CRAWL_INTERVAL_HOURS = 6;

// 원본 목록에서 사라진 공고를 만료 처리하기까지 기다리는 기간. 즉시 만료시키면 상대 서버가
// 잠깐 흔들린 회차 한 번에 수집분 전체가 날아간다.
export const EXPIRE_AFTER_DAYS = 3;

// 상세를 다시 받는 주기. 목록만으로는 생존 여부만 알 수 있고 내용 변경은 알 수 없다.
export const DETAIL_REFRESH_HOURS = 72;

// 한 회차의 상세 요청 상한. 첫 회차에 3,000건을 다 받으면 요청 간격 1.5초 기준 80분이 넘는다.
// 상한을 넘긴 잔량은 다음 회차가 이어받고, 몇 건이 남았는지는 로그로 드러낸다(조용히 자르지 않는다).
export const MAX_DETAIL_FETCHES_PER_RUN = 300;

// 목록 페이지 절대 상한. 전체 건수로 계산하되, 상대가 이상한 값을 주더라도 요청이 폭주하지
// 않도록 천장을 둔다.
export const MAX_LIST_PAGES = 80;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

// 진행 중으로 남은 회차가 이 시간을 넘기면 죽은 프로세스가 남긴 잔해로 본다. 사이트당 진행
// 중 회차를 하나로 제한하는 부분 유니크 인덱스가 있어서, 이 정리가 없으면 서버가 회차 도중
// 죽었을 때 그 행이 영원히 새 수집을 막는다. 한 회차 최대 소요(목록 66페이지 + 상세 300건,
// 요청 간격 1.5초 기준 약 10분)보다 넉넉히 잡는다.
export const RUN_STALE_AFTER_MS = 30 * 60 * 1000;

export const isRunStale = (startedAt: Date, now: Date): boolean =>
	now.getTime() - startedAt.getTime() > RUN_STALE_AFTER_MS;

// 수집 대상 사이트. DB enum(crawl_source_site)과 값이 같아야 한다.
export type CrawlSourceSite = "foxalba" | "queenalba";

// 파서가 실제로 구현된 사이트. 이 목록에 없는 사이트를 골라도 수집기는 회차를 만들지 않고
// "준비 중"으로 빠져나온다 — 빈 결과를 "공고 없음"으로 읽어 만료 처리가 돌면 안 되기 때문이다.
export const IMPLEMENTED_CRAWL_SITES: readonly CrawlSourceSite[] = ["foxalba"];

export const isCrawlSiteImplemented = (site: CrawlSourceSite): boolean =>
	IMPLEMENTED_CRAWL_SITES.includes(site);

export interface CrawlSettings {
	crawlEnabled: boolean;
	crawlIntervalHours: number | null;
	crawlLastRunAt: Date | null;
}

// 이번 틱에 실제로 수집할 차례인지 판정한다. 틱 간격이 아니라 마지막 실행 시각을 기준으로
// 보므로, 서버를 재시작해도 주기가 앞당겨지거나 밀리지 않는다.
export const isCrawlDue = (settings: CrawlSettings, now: Date): boolean => {
	if (!settings.crawlEnabled) {
		return false;
	}

	if (!settings.crawlLastRunAt) {
		return true;
	}

	const intervalHours =
		settings.crawlIntervalHours ?? DEFAULT_CRAWL_INTERVAL_HOURS;

	return (
		now.getTime() - settings.crawlLastRunAt.getTime() >= intervalHours * HOUR_MS
	);
};

// 삭제된 공고를 상세에서 만나는 건 정상이라 실패 몇 건은 허용한다. 다만 표본이 쌓인 뒤에도
// 절반 넘게 실패하면 상세 마크업이 바뀐 것으로 본다.
const MIN_ATTEMPTS_TO_JUDGE = 5;
const MAX_FAILURE_RATIO = 0.5;

export interface CrawlYieldStats {
	detailAttempts: number;
	detailFailures: number;
	listItems: number;
}

// 이번 회차 결과를 믿을 수 있는지 판정한다. 상대가 마크업을 바꿔 목록이 0건으로 파싱되면
// 그건 "공고가 사라졌다"가 아니라 "우리 셀렉터가 깨졌다"다. 그 상태에서 만료 처리를 돌리면
// 수집분 전체가 한 회차에 날아간다 — 이 함수가 그 사고를 막는 단 하나의 장치다.
export const isYieldTrustworthy = (stats: CrawlYieldStats): boolean => {
	if (stats.listItems === 0) {
		return false;
	}

	if (stats.detailAttempts < MIN_ATTEMPTS_TO_JUDGE) {
		return true;
	}

	return stats.detailFailures / stats.detailAttempts <= MAX_FAILURE_RATIO;
};

// 수집할 목록 페이지 수. 페이저는 앞쪽 5개와 "다음"만 노출해서 마지막 페이지를 알려주지
// 않으므로, 페이저가 아니라 전체 건수로 계산한다.
export const resolveListPageCount = (totalCount: number | null): number => {
	if (!totalCount || totalCount <= 0) {
		return 1;
	}

	return Math.min(
		Math.ceil(totalCount / FOXALBA_ITEMS_PER_PAGE),
		MAX_LIST_PAGES
	);
};
