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
import { JOBS } from "./data";

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

// mock 폴백 경로에서 urgent는 special/recommended의 부분집합이라 그대로 이으면 같은
// 공고가 2번 들어가 개수 카운트가 부풀 수 있다. id 기준으로 첫 등장만 남겨 중복을 제거한다
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

const getBoostTime = (job: Job): number => {
	if (!job.lastBoostedAt) {
		return 0;
	}

	const value = new Date(job.lastBoostedAt).getTime();
	return Number.isFinite(value) ? value : 0;
};

const buildFallbackSections = (
	filters: MarketplaceFilters
): MarketplaceJobSections => {
	const special = JOBS.filter((job) => job.promotionTier === "premium");
	const recommended = JOBS.filter((job) => job.promotionTier === "recommended");
	const urgent = [...special, ...recommended]
		.filter((job) => getBoostTime(job) > 0)
		.toSorted((left, right) => getBoostTime(right) - getBoostTime(left));
	// 전체 공고는 광고 상품 적용 여부와 무관하게 모든 공고를 담는다(서버 동작과 일치).
	const organic = JOBS;

	return {
		organic: filterMarketplaceJobs(organic, filters),
		recommended: filterMarketplaceJobs(recommended, filters),
		special: filterMarketplaceJobs(special, filters),
		urgent: filterMarketplaceJobs(urgent, filters),
	};
};

export function useMarketplaceJobs(
	filters: MarketplaceFilters
): UseMarketplaceJobsResult {
	const jobsQuery = useQuery(
		orpc.bambi.jobs.list.queryOptions({ input: toApiListInput(filters) })
	);
	const apiSections = jobsQuery.data
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
	const fallbackSections = buildFallbackSections(filters);
	const hasApiJobs = flattenSections(apiSections).length > 0;
	const sections =
		jobsQuery.isSuccess && hasApiJobs ? apiSections : fallbackSections;
	const jobs = flattenSections(sections);

	return {
		isApiBacked: jobsQuery.isSuccess && hasApiJobs,
		isError: jobsQuery.isError,
		isLoading:
			jobsQuery.isLoading && flattenSections(fallbackSections).length === 0,
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
	const fallbackJob = JOBS.find((job) => job.id === id);
	const apiJob = jobQuery.data ? toMarketplaceJob(jobQuery.data) : undefined;

	return {
		isApiBacked: Boolean(apiJob),
		isError: jobQuery.isError,
		isLoading: canUseApi && jobQuery.isLoading && !fallbackJob,
		job: apiJob ?? fallbackJob,
		refetch: () => {
			jobQuery.refetch().catch(() => undefined);
		},
	};
}

export interface AdBannerJobGroups {
	leftBanner: AdBannerItem[];
	premiumBanner: AdBannerItem[];
	rightBanner: AdBannerItem[];
}

export function useAdBannerJobs(): AdBannerJobGroups {
	const bannersQuery = useQuery(orpc.bambi.jobs.listAdBanners.queryOptions());
	// 슬롯→배너 규격 매핑은 렌더러 비율과 한 몸이다: 좌측·상단 프리미엄은 가로형(7:3),
	// 우측 레일은 세로형(4:9). 슬롯마다 맞는 usage를 넘겨야 구인자가 올린 배너가 뜬다.
	return {
		leftBanner: (bannersQuery.data?.leftBanner ?? []).map((job) =>
			toAdBannerItem(job, "ad_horizontal")
		),
		premiumBanner: (bannersQuery.data?.premiumBanner ?? []).map((job) =>
			toAdBannerItem(job, "ad_horizontal")
		),
		rightBanner: (bannersQuery.data?.rightBanner ?? []).map((job) =>
			toAdBannerItem(job, "ad_vertical")
		),
	};
}
