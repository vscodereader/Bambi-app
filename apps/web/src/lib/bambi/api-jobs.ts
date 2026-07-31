"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { isIndustryOption } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";
import {
	type AdBannerItem,
	toAdBannerItem,
	toMarketplaceJob,
} from "./api-job-mapper";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 첫 로드는 기존과 같은 30건. "더보기"는 서버 상한(50)까지 받아 클릭 수를 줄인다
// (자격 공고가 수백 건이라 30씩 끊으면 끝까지 보는 데만 열 번을 넘게 눌러야 한다).
const FIRST_PAGE_SIZE = 30;
const MORE_PAGE_SIZE = 50;

// 전체 공고(organic) 이어받기 커서. 자체 공고 블록과 수집 블록이 순서대로 이어붙는 구조라
// 위치가 블록별로 둘이다(서버 nextOrganicOffset을 그대로 되돌려준다).
interface OrganicOffset {
	crawled: number;
	jobPost: number;
}

interface UseMarketplaceJobsResult {
	hasMore: boolean;
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	isLoadingMore: boolean;
	jobs: Job[];
	loadMore: () => void;
	refetch: () => void;
	sections: MarketplaceJobSections;
	// 필터를 만족하는 전체 공고 수(로드된 수가 아니다). 헤더의 "N개" 표기용.
	totalCount: number;
}

interface UseMarketplaceJobResult {
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	job?: Job;
	refetch: () => void;
}

export const isApiJobId = (id: string): boolean => UUID_RE.test(id);

const toApiListInput = (filters: MarketplaceFilters) => ({
	// 서버 입력이 업종 enum이라 기본값("전체")이나 목록 밖 값은 필터 없음으로 보낸다.
	industryCategory:
		filters.category !== DEFAULT_MARKETPLACE_FILTERS.category &&
		isIndustryOption(filters.category)
			? filters.category
			: undefined,
	district:
		filters.district === DEFAULT_MARKETPLACE_FILTERS.district
			? undefined
			: filters.district,
	minPayAmount: filters.minimumPay > 0 ? filters.minimumPay : undefined,
	region:
		filters.region === DEFAULT_MARKETPLACE_FILTERS.region
			? undefined
			: filters.region,
});

// 서버 입력에 대응이 없어 화면에서만 거르는 필터들. 이게 켜져 있으면 응답의 전체 건수와
// 실제로 보이는 개수가 갈리므로, 헤더 표기를 전체 건수 대신 화면 개수로 떨어뜨린다.
const hasLocalOnlyFilters = (filters: MarketplaceFilters): boolean =>
	filters.onlyBeginnerFriendly || filters.onlyToday || filters.onlyVerified;

const EMPTY_SECTIONS: MarketplaceJobSections = {
	organic: [],
	recommended: [],
	special: [],
	urgent: [],
};

// urgent는 special/recommended의 부분집합이라 그대로 이으면 같은 공고가 2번 들어가
// 개수 카운트가 부풀 수 있다. id 기준으로 첫 등장만 남겨 중복을 제거한다
// (등장 순서 유지: special→urgent→recommended→organic).
const flattenSections = (sections: MarketplaceJobSections): Job[] => {
	const seen = new Set<string>();
	const merged = [
		...sections.special,
		...sections.urgent,
		...sections.recommended,
		...sections.organic,
	];
	return merged.filter((job) => {
		if (seen.has(job.id)) {
			return false;
		}
		seen.add(job.id);
		return true;
	});
};

const filterSections = (
	sections: MarketplaceJobSections,
	filters: MarketplaceFilters
): MarketplaceJobSections => ({
	organic: filterMarketplaceJobs(sections.organic, filters),
	recommended: filterMarketplaceJobs(sections.recommended, filters),
	special: filterMarketplaceJobs(sections.special, filters),
	urgent: filterMarketplaceJobs(sections.urgent, filters),
});

// 전체 공고는 "더보기"로 이어 받고(offset 누적), 스페셜·급구·추천 섹션은 첫 페이지 응답으로
// 고정한다 — 2페이지부터는 서버도 섹션을 다시 계산하지 않는다.
export function useMarketplaceJobs(
	filters: MarketplaceFilters
): UseMarketplaceJobsResult {
	const jobsQuery = useInfiniteQuery(
		orpc.bambi.jobs.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextOrganicOffset ?? undefined,
			initialPageParam: null as null | OrganicOffset,
			input: (organicOffset: null | OrganicOffset) => ({
				...toApiListInput(filters),
				limit: organicOffset ? MORE_PAGE_SIZE : FIRST_PAGE_SIZE,
				organicOffset: organicOffset ?? undefined,
			}),
		})
	);
	const pages = jobsQuery.data?.pages ?? [];
	const [firstPage] = pages;
	// 1페이지 전체 공고 꼬리에는 섹션 보강분이 정렬과 무관한 위치로 섞여 있어 다음 페이지와
	// 겹칠 수 있다(서버 커서는 정렬 창만큼만 전진하므로 누락은 없다). id 첫 등장만 남긴다.
	const organicRows = [
		...new Map(
			pages
				.flatMap((page) => page.sections.organic)
				.map((item) => [item.id, item] as const)
		).values(),
	];
	const sections = firstPage
		? filterSections(
				{
					organic: organicRows.map(toMarketplaceJob),
					recommended: firstPage.sections.recommended.map(toMarketplaceJob),
					special: firstPage.sections.special.map(toMarketplaceJob),
					urgent: firstPage.sections.urgent.map(toMarketplaceJob),
				},
				filters
			)
		: EMPTY_SECTIONS;
	const jobs = flattenSections(sections);
	const hasApiJobs = jobs.length > 0;

	return {
		hasMore: jobsQuery.hasNextPage,
		isApiBacked: jobsQuery.isSuccess && hasApiJobs,
		isError: jobsQuery.isError,
		isLoading: jobsQuery.isLoading,
		isLoadingMore: jobsQuery.isFetchingNextPage,
		jobs,
		loadMore: () => {
			jobsQuery.fetchNextPage().catch(() => undefined);
		},
		refetch: () => {
			jobsQuery.refetch().catch(() => undefined);
		},
		sections,
		totalCount:
			hasLocalOnlyFilters(filters) || firstPage === undefined
				? jobs.length
				: firstPage.availableCount,
	};
}

// 검색 모달 전용. 빈 검색어는 조회하지 않고, 타이핑 사이 이전 결과를 유지해 깜빡임을 줄인다.
export function useJobSearch(query: string): {
	isError: boolean;
	isFetching: boolean;
	jobs: Job[];
	refetch: () => void;
} {
	const trimmed = query.trim();
	const searchQuery = useQuery({
		...orpc.bambi.jobs.search.queryOptions({ input: { query: trimmed } }),
		enabled: trimmed.length > 0,
		placeholderData: keepPreviousData,
	});

	return {
		isError: searchQuery.isError,
		isFetching: searchQuery.isFetching,
		jobs:
			trimmed.length > 0
				? (searchQuery.data?.items ?? []).map(toMarketplaceJob)
				: [],
		refetch: () => {
			searchQuery.refetch().catch(() => undefined);
		},
	};
}

export function useMarketplaceJob(id: string): UseMarketplaceJobResult {
	const canUseApi = isApiJobId(id);
	const jobQuery = useQuery({
		...orpc.bambi.jobs.getById.queryOptions({ input: { id } }),
		enabled: canUseApi,
	});
	const apiJob = jobQuery.data ? toMarketplaceJob(jobQuery.data) : undefined;

	return {
		isApiBacked: Boolean(apiJob),
		isError: jobQuery.isError,
		isLoading: canUseApi && jobQuery.isLoading,
		job: apiJob,
		refetch: () => {
			jobQuery.refetch().catch(() => undefined);
		},
	};
}

// 수집 공고 상세. 우리 공고와 테이블·필드가 달라 목록 매퍼(toMarketplaceJob)를 거치지 않고
// 서버 응답을 그대로 화면에 넘긴다 — Job 모양으로 억지로 맞추면 없는 값(후기·검증)이 딸려온다.
export function useCrawledJob(id: string) {
	const canUseApi = isApiJobId(id);
	const jobQuery = useQuery({
		...orpc.bambi.crawledJobs.getById.queryOptions({ input: { id } }),
		enabled: canUseApi,
	});

	return {
		isError: jobQuery.isError,
		isLoading: canUseApi && jobQuery.isLoading,
		job: jobQuery.data,
		refetch: () => {
			jobQuery.refetch().catch(() => undefined);
		},
	};
}

export interface AdBannerJobGroups {
	// 로딩과 "광고 없음"을 구분 못 하면, 광고가 실제 있는 슬롯도 응답 대기 동안 빈 배열이
	// 되어 문의 배너가 번쩍였다가 광고로 바뀐다. 초기 로딩을 노출해 렌더러가 스켈레톤을 그린다.
	isLoading: boolean;
	// 각 그룹은 고정 길이(좌3·중2·우3) 배열이며 빈 칸은 null이다(렌더러가 자리표시로 채운다).
	leftBanner: (AdBannerItem | null)[];
	premiumBanner: (AdBannerItem | null)[];
	rightBanner: (AdBannerItem | null)[];
}

export function useAdBannerJobs(): AdBannerJobGroups {
	const bannersQuery = useQuery(orpc.bambi.jobs.listAdBanners.queryOptions());
	// 슬롯→배너 규격 매핑은 렌더러 비율과 한 몸이다: 좌측·상단 프리미엄은 가로형(7:3),
	// 우측 레일은 세로형(4:9). 슬롯마다 맞는 usage를 넘겨야 구인자가 올린 배너가 뜬다.
	// 빈 칸(null)은 그대로 null로 두고 렌더러가 자리표시로 채운다.
	return {
		// isLoading = 데이터 없는 첫 로딩(react-query v5). 로드 후 빈 배열("광고 없음")과 구분된다.
		isLoading: bannersQuery.isLoading,
		leftBanner: (bannersQuery.data?.leftBanner ?? []).map((job) =>
			job ? toAdBannerItem(job, "ad_horizontal") : null
		),
		premiumBanner: (bannersQuery.data?.premiumBanner ?? []).map((job) =>
			job ? toAdBannerItem(job, "ad_horizontal") : null
		),
		rightBanner: (bannersQuery.data?.rightBanner ?? []).map((job) =>
			job ? toAdBannerItem(job, "ad_vertical") : null
		),
	};
}
