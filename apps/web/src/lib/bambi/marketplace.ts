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

// 업종별 세부 카테고리 — 선택한 업종에 따라 세부 업종 옵션이 바뀐다(연동형).
// 각 목록 첫 항목은 "필터 없음"을 뜻하는 전체(ALL_OPTION)다.
export const MARKETPLACE_SUBCATEGORIES: Record<string, readonly string[]> = {
	전체: ["전체"],
	라운지: ["전체", "룸", "홀", "미러룸"],
	바: ["전체", "칵테일바", "스탠딩바", "와인바"],
	클럽: ["전체", "게스트", "부킹", "MD"],
	호스트바: ["전체", "선수", "매니저", "실장"],
	카페: ["전체", "홀", "주방", "바리스타"],
};

export const MARKETPLACE_QUICK_FILTERS = [
	{ id: "verified", label: "검증 완료" },
	{ id: "today", label: "오늘 면접 가능" },
	{ id: "beginner", label: "초보 가능" },
] as const;

// 축 미적용(전체) 옵션 — 지역/업종 필터에서 "필터 없음"을 뜻한다.
export const ALL_OPTION = "전체";

// 선택한 업종에서 고를 수 있는 세부 업종 목록(정의 없으면 전체만).
export function subcategoriesForCategory(category: string): readonly string[] {
	return MARKETPLACE_SUBCATEGORIES[category] ?? [ALL_OPTION];
}

export interface MarketplaceFilters {
	category: string;
	minimumPay: number;
	onlyBeginnerFriendly: boolean;
	onlyToday: boolean;
	onlyVerified: boolean;
	query: string;
	region: string;
	subcategory: string;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
	category: ALL_OPTION,
	minimumPay: 0,
	onlyBeginnerFriendly: false,
	onlyToday: false,
	onlyVerified: false,
	query: "",
	region: ALL_OPTION,
	subcategory: ALL_OPTION,
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

function jobMatchesSubcategory(job: Job, subcategory: string): boolean {
	if (subcategory === "전체") {
		return true;
	}
	const text = `${job.title} ${job.company} ${job.type} ${job.desc} ${job.tags.join(" ")}`;
	return text.includes(subcategory);
}

function jobMatchesRegion(job: Job, region: string): boolean {
	return region === "전체" || job.location.includes(region);
}

function jobMatchesBeginner(job: Job): boolean {
	const text = `${job.title} ${job.desc} ${job.tags.join(" ")}`;
	return text.includes("초보");
}

function jobMatchesToday(job: Job): boolean {
	const text = `${job.desc} ${job.pref} ${job.tags.join(" ")}`;
	return text.includes("오늘 면접");
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
		if (!jobMatchesSubcategory(job, filters.subcategory)) {
			return false;
		}
		if (filters.onlyVerified && !job.verified) {
			return false;
		}
		if (filters.onlyBeginnerFriendly && !jobMatchesBeginner(job)) {
			return false;
		}
		if (filters.onlyToday && !jobMatchesToday(job)) {
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
		return { ...filters, category: ALL_OPTION, subcategory: ALL_OPTION };
	}
	if (axis === "category") {
		return { ...filters, region: ALL_OPTION };
	}
	return {
		...filters,
		category: ALL_OPTION,
		region: ALL_OPTION,
		subcategory: ALL_OPTION,
	};
}

// discovery 탭 id를 필터 축으로 매핑한다(비활성 map/recent 탭은 방어적으로 all).
export function discoveryAxisForTab(tabId: string): MarketplaceDiscoveryAxis {
	if (tabId === "region" || tabId === "category") {
		return tabId;
	}
	return "all";
}
