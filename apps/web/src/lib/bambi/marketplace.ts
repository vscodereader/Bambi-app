import {
	districtsForRegion,
	industryOptions,
	regionOptions,
} from "../bambi-options";
import type { Job } from "./types";

// 축 미적용(전체) 옵션 — 지역/업종 필터에서 "필터 없음"을 뜻한다.
export const ALL_OPTION = "전체";

export const MARKETPLACE_REGIONS = [ALL_OPTION, ...regionOptions] as const;

export const MARKETPLACE_CATEGORIES = [ALL_OPTION, ...industryOptions] as const;

// 선택한 시/도의 세부지역 필터 목록(맨 앞 전체 + 시/도 하위 세부지역).
export function districtOptionsForRegion(region: string): readonly string[] {
	return [ALL_OPTION, ...districtsForRegion(region)];
}

export const MARKETPLACE_QUICK_FILTERS = [
	{ id: "verified", label: "검증 완료" },
	{ id: "today", label: "당일면접 가능" },
	{ id: "beginner", label: "초보 가능" },
] as const;

export interface MarketplaceFilters {
	category: string;
	district: string;
	minimumPay: number;
	onlyBeginnerFriendly: boolean;
	onlyToday: boolean;
	onlyVerified: boolean;
	query: string;
	region: string;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
	category: ALL_OPTION,
	district: ALL_OPTION,
	minimumPay: 0,
	onlyBeginnerFriendly: false,
	onlyToday: false,
	onlyVerified: false,
	query: "",
	region: ALL_OPTION,
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
	return category === ALL_OPTION || job.type === category;
}

function jobMatchesRegion(job: Job, region: string): boolean {
	return region === ALL_OPTION || job.region === region;
}

function jobMatchesDistrict(job: Job, district: string): boolean {
	return district === ALL_OPTION || job.district === district;
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
		if (!jobMatchesDistrict(job, filters.district)) {
			return false;
		}
		if (!jobMatchesCategory(job, filters.category)) {
			return false;
		}
		if (filters.onlyVerified && !job.verified) {
			return false;
		}
		if (filters.onlyBeginnerFriendly && !job.beginnerFriendly) {
			return false;
		}
		if (filters.onlyToday && !job.instantInterview) {
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

export type MarketplaceDiscoveryAxis = "all" | "category" | "region";

// 탭 전환 시 비활성 축을 "전체"로 리셋한다(축 배타성) — 화면 칩과 결과가 항상 일치한다.
export function applyDiscoveryAxis(
	filters: MarketplaceFilters,
	axis: MarketplaceDiscoveryAxis
): MarketplaceFilters {
	if (axis === "region") {
		return { ...filters, category: ALL_OPTION };
	}
	if (axis === "category") {
		return { ...filters, district: ALL_OPTION, region: ALL_OPTION };
	}
	return {
		...filters,
		category: ALL_OPTION,
		district: ALL_OPTION,
		region: ALL_OPTION,
	};
}

// discovery 탭 id를 필터 축으로 매핑한다(비활성 map/recent 탭은 방어적으로 all).
export function discoveryAxisForTab(tabId: string): MarketplaceDiscoveryAxis {
	if (tabId === "region" || tabId === "category") {
		return tabId;
	}
	return "all";
}
