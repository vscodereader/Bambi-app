import type { Job } from "./types";

export const MARKETPLACE_REGIONS = [
	"전체",
	"강남",
	"서초",
	"송파",
	"마포",
	"부천",
	"인천",
] as const;

export const MARKETPLACE_CATEGORIES = [
	"전체",
	"라운지",
	"바",
	"클럽",
	"호스트바",
	"카페",
] as const;

export const MARKETPLACE_QUICK_FILTERS = [
	{ id: "verified", label: "검증 완료" },
	{ id: "today", label: "오늘 면접 가능" },
	{ id: "beginner", label: "초보 가능" },
	{ id: "nearby", label: "내 주변" },
] as const;

export interface MarketplaceFilters {
	category: string;
	minimumPay: number;
	onlyBeginnerFriendly: boolean;
	onlyVerified: boolean;
	query: string;
	region: string;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
	category: "전체",
	minimumPay: 0,
	onlyBeginnerFriendly: false,
	onlyVerified: false,
	query: "",
	region: "전체",
};

const NUMBER_RE = /\d[\d,]*/;

export function parsePayAmount(pay: string): number {
	const match = NUMBER_RE.exec(pay);
	if (!match) {
		return 0;
	}
	return Number(match[0].replaceAll(",", ""));
}

function normalizeSearchValue(value: string): string {
	return value.trim().toLocaleLowerCase("ko-KR");
}

function jobMatchesQuery(job: Job, query: string): boolean {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) {
		return true;
	}
	const haystack = [
		job.title,
		job.company,
		job.location,
		job.pay,
		job.type,
		job.hours,
		job.pref,
		...job.tags,
	]
		.join(" ")
		.toLocaleLowerCase("ko-KR");
	return haystack.includes(normalizedQuery);
}

function jobMatchesCategory(job: Job, category: string): boolean {
	if (category === "전체") {
		return true;
	}
	const text = `${job.title} ${job.company} ${job.type} ${job.tags.join(" ")}`;
	return text.includes(category);
}

function jobMatchesRegion(job: Job, region: string): boolean {
	return region === "전체" || job.location.includes(region);
}

function jobMatchesBeginner(job: Job): boolean {
	const text = `${job.title} ${job.desc} ${job.tags.join(" ")}`;
	return text.includes("초보");
}

export function filterMarketplaceJobs(
	jobs: Job[],
	filters: MarketplaceFilters
): Job[] {
	return jobs.filter((job) => {
		if (!jobMatchesQuery(job, filters.query)) {
			return false;
		}
		if (!jobMatchesRegion(job, filters.region)) {
			return false;
		}
		if (!jobMatchesCategory(job, filters.category)) {
			return false;
		}
		if (filters.onlyVerified && !job.verified) {
			return false;
		}
		if (filters.onlyBeginnerFriendly && !jobMatchesBeginner(job)) {
			return false;
		}
		return parsePayAmount(job.pay) >= filters.minimumPay;
	});
}

export function getSelectedMarketplaceJob(
	jobs: Job[],
	selectedJobId?: string
): Job | undefined {
	return jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
}
