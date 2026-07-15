"use client";

import { useQuery } from "@tanstack/react-query";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";
import { toMarketplaceJob } from "./api-job-mapper";
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
	industryCategory:
		filters.category === DEFAULT_MARKETPLACE_FILTERS.category
			? undefined
			: filters.category,
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

const flattenSections = (sections: MarketplaceJobSections): Job[] => [
	...sections.special,
	...sections.urgent,
	...sections.recommended,
	...sections.organic,
];

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
		.toSorted((left, right) => getBoostTime(right) - getBoostTime(left))
		.slice(0, 6);
	const organic = JOBS.filter(
		(job) =>
			job.promotionTier !== "premium" && job.promotionTier !== "recommended"
	);

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
