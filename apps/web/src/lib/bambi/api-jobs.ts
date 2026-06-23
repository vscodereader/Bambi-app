"use client";

import { useQuery } from "@tanstack/react-query";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";
import { JOBS } from "./data";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ApiMarketplaceJob {
	description?: string | null;
	employerDisplayName?: string | null;
	employerVerificationStatus?: string | null;
	id: string;
	industryCategory: string;
	payAmount: number;
	payUnit: string;
	region: string;
	status: string;
	teamDisplayName?: string | null;
	title: string;
	workSchedule?: string | null;
}

interface UseMarketplaceJobsResult {
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	jobs: Job[];
	refetch: () => void;
}

interface UseMarketplaceJobResult {
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	job?: Job;
	refetch: () => void;
}

export const isApiJobId = (id: string): boolean => UUID_RE.test(id);

export const getMarketplaceJobCompany = (job: ApiMarketplaceJob): string =>
	job.teamDisplayName ?? job.employerDisplayName ?? "검증 업체";

export const formatMarketplacePay = ({
	payAmount,
	payUnit,
}: Pick<ApiMarketplaceJob, "payAmount" | "payUnit">): string =>
	`${payUnit} ${payAmount.toLocaleString("ko-KR")}원`;

export const toMarketplaceJob = (job: ApiMarketplaceJob): Job => {
	const company = getMarketplaceJobCompany(job);
	const tags = [
		job.industryCategory,
		job.region,
		job.employerVerificationStatus === "verified" ? "검증 완료" : "검수 완료",
	].filter((tag) => tag.length > 0);

	return {
		company,
		desc:
			job.description ??
			"공고 상세와 면접 안내는 밤비 채팅에서 안전하게 확인할 수 있어요.",
		featured: job.employerVerificationStatus === "verified",
		hours: job.workSchedule ?? "채팅으로 확인",
		id: job.id,
		location: job.region,
		pay: formatMarketplacePay(job),
		pref: "면접 전 연락처 보호",
		rating: 4.8,
		reviews: 0,
		status: job.status,
		tags,
		title: job.title,
		type: job.industryCategory,
		verified: job.employerVerificationStatus === "verified",
	};
};

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

export function useMarketplaceJobs(
	filters: MarketplaceFilters
): UseMarketplaceJobsResult {
	const jobsQuery = useQuery(
		orpc.bambi.jobs.list.queryOptions({ input: toApiListInput(filters) })
	);
	const apiJobs = jobsQuery.data?.map(toMarketplaceJob) ?? [];
	const fallbackJobs = filterMarketplaceJobs(JOBS, filters);
	const jobs =
		jobsQuery.isSuccess && apiJobs.length > 0
			? filterMarketplaceJobs(apiJobs, filters)
			: fallbackJobs;

	return {
		isApiBacked: jobsQuery.isSuccess && apiJobs.length > 0,
		isError: jobsQuery.isError,
		isLoading: jobsQuery.isLoading && fallbackJobs.length === 0,
		jobs,
		refetch: () => {
			jobsQuery.refetch().catch(() => undefined);
		},
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
