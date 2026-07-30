"use client";

import { useQuery } from "@tanstack/react-query";
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

interface UseMarketplaceJobsResult {
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	jobs: Job[];
	refetch: () => void;
	sections: MarketplaceJobSections;
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
	limit: 30,
	minPayAmount: filters.minimumPay > 0 ? filters.minimumPay : undefined,
	region:
		filters.region === DEFAULT_MARKETPLACE_FILTERS.region
			? undefined
			: filters.region,
});

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

export function useMarketplaceJobs(
	filters: MarketplaceFilters
): UseMarketplaceJobsResult {
	const jobsQuery = useQuery(
		orpc.bambi.jobs.list.queryOptions({ input: toApiListInput(filters) })
	);
	const sections = jobsQuery.data
		? filterSections(
				{
					organic: jobsQuery.data.sections.organic.map(toMarketplaceJob),
					recommended:
						jobsQuery.data.sections.recommended.map(toMarketplaceJob),
					special: jobsQuery.data.sections.special.map(toMarketplaceJob),
					urgent: jobsQuery.data.sections.urgent.map(toMarketplaceJob),
				},
				filters
			)
		: EMPTY_SECTIONS;
	const jobs = flattenSections(sections);
	const hasApiJobs = jobs.length > 0;

	return {
		isApiBacked: jobsQuery.isSuccess && hasApiJobs,
		isError: jobsQuery.isError,
		isLoading: jobsQuery.isLoading,
		jobs,
		refetch: () => {
			jobsQuery.refetch().catch(() => undefined);
		},
		sections,
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
