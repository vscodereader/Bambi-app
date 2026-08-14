import { industryOptions, PAY_UNIT_HOURS } from "../bambi-options";
import type { Job } from "./types";

// 축 미적용(전체) 옵션 — 지역/업종 필터에서 "필터 없음"을 뜻한다.
export const ALL_OPTION = "전체";

export const MARKETPLACE_CATEGORIES = [ALL_OPTION, ...industryOptions] as const;

export interface MarketplaceFilters {
	category: string;
	// 지역 축은 표시 문자열이 아니라 지역 마스터 코드로 들고 다닌다(서버 필터 입력도 코드다).
	// ALL_OPTION이면 축 미적용.
	districtCode: string;
	minimumPay: number;
	onlyBeginnerFriendly: boolean;
	onlyToday: boolean;
	onlyVerified: boolean;
	regionCode: string;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
	category: ALL_OPTION,
	districtCode: ALL_OPTION,
	minimumPay: 0,
	onlyBeginnerFriendly: false,
	onlyToday: false,
	onlyVerified: false,
	regionCode: ALL_OPTION,
};

const NUMBER_RE = /\d[\d,]*/;

function parsePayAmount(pay: string): number {
	const match = NUMBER_RE.exec(pay);
	if (!match) {
		return 0;
	}
	return Number(match[0].replaceAll(",", ""));
}

// 표시 문자열("일급 150,000원")의 단위를 읽어 시급 환산 근로시간을 고른다.
// 단위 접두어가 없으면(예: "급여 협의") 시급으로 본다.
function payUnitHours(pay: string): number {
	const unit = Object.keys(PAY_UNIT_HOURS).find((option) =>
		pay.startsWith(option)
	);
	return unit ? (PAY_UNIT_HOURS[unit] ?? 1) : 1;
}

// 최소 시급 필터는 단위가 섞인 공고를 시급 기준으로 비교한다. 나눗셈(환산 시급) 대신
// 곱셈으로 비교해야 서버 SQL의 정수 연산과 경계값에서 결과가 어긋나지 않는다.
// 금액을 못 읽는 공고("급여 협의")는 하한을 걸면 빠지고, 하한 0이면 그대로 남는다.
function jobMatchesMinimumPay(job: Job, minimumPay: number): boolean {
	if (minimumPay <= 0) {
		return true;
	}
	const amount = parsePayAmount(job.pay);
	return amount > 0 && amount >= minimumPay * payUnitHours(job.pay);
}

function jobMatchesCategory(job: Job, category: string): boolean {
	return category === ALL_OPTION || job.type === category;
}

function jobMatchesRegion(job: Job, regionCode: string): boolean {
	return regionCode === ALL_OPTION || job.regionCode === regionCode;
}

function jobMatchesDistrict(job: Job, districtCode: string): boolean {
	return districtCode === ALL_OPTION || job.districtCode === districtCode;
}

export function filterMarketplaceJobs(
	jobs: Job[],
	filters: MarketplaceFilters
): Job[] {
	return jobs.filter((job) => {
		if (!jobMatchesRegion(job, filters.regionCode)) {
			return false;
		}
		if (!jobMatchesDistrict(job, filters.districtCode)) {
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
		return jobMatchesMinimumPay(job, filters.minimumPay);
	});
}

export function getSelectedMarketplaceJob(
	jobs: Job[],
	selectedJobId?: string
): Job | undefined {
	return jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
}
