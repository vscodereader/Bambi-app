import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	AD_BANNER_EXPOSURE_TYPES,
	EXPOSURE_TYPE_LABELS,
} from "@bambi-app/api/services/bambi-ad-exposure";

type AnalyticsSummary = Awaited<
	ReturnType<AppRouterClient["bambi"]["analytics"]["summary"]>
>[number];

export type { AnalyticsSummary };

// 계산 함수는 응답 전체가 아니라 실제로 읽는 축만 받는다 — 테스트가 서버 응답을 통째로
// 흉내 내지 않아도 되고, 응답에 필드가 늘어도 여기가 깨지지 않는다.
export type AnalyticsSummaryMetrics = Pick<
	AnalyticsSummary,
	"metrics" | "sectionMetrics"
>;
export type AnalyticsSummaryPlacement = Pick<
	AnalyticsSummary,
	"exposureType" | "sectionMetrics"
>;

export type PlacementKey =
	| "leftBanner"
	| "organic"
	| "premiumBanner"
	| "recommended"
	| "rightBanner"
	| "special"
	| "urgent";

// 게재 구분 라벨은 서버 라벨 맵만 거친다 — DB enum(exposure_type) 원값이 화면에 새는 것을
// 막고, 라벨이 바뀌면 서버 한 곳만 고치면 된다.
export const PLACEMENT_LABELS: Record<PlacementKey, string> = {
	leftBanner: EXPOSURE_TYPE_LABELS["left-banner"],
	organic: EXPOSURE_TYPE_LABELS.standard,
	premiumBanner: EXPOSURE_TYPE_LABELS["premium-banner"],
	recommended: EXPOSURE_TYPE_LABELS.recommended,
	rightBanner: EXPOSURE_TYPE_LABELS["right-banner"],
	special: EXPOSURE_TYPE_LABELS.special,
	urgent: EXPOSURE_TYPE_LABELS.urgent,
};

const PLACEMENT_FIELDS: Record<
	PlacementKey,
	keyof AnalyticsSummary["sectionMetrics"]
> = {
	leftBanner: "leftBannerImpressions",
	organic: "organicImpressions",
	premiumBanner: "premiumBannerImpressions",
	recommended: "recommendedImpressions",
	rightBanner: "rightBannerImpressions",
	special: "specialImpressions",
	urgent: "urgentImpressions",
};

// 배지 노출 순서. 리스팅 3종 → 일반 → 배너 3슬롯.
const PLACEMENT_ORDER: readonly PlacementKey[] = [
	"special",
	"urgent",
	"recommended",
	"organic",
	"premiumBanner",
	"leftBanner",
	"rightBanner",
];

const BANNER_EXPOSURE_TYPES: ReadonlySet<string> = new Set(
	AD_BANNER_EXPOSURE_TYPES
);

export const formatCount = (value: number): string =>
	value.toLocaleString("ko-KR");

// 분모가 0이면 나눗셈이 NaN이라 "NaN%"가 그대로 찍힌다 — 노출 전 공고는 0%로 떨어뜨린다.
export const formatRate = (numerator: number, denominator: number): string =>
	denominator === 0
		? "0.0%"
		: `${((numerator / denominator) * 100).toFixed(1)}%`;

export interface AnalyticsTotals {
	autoBoostFires: number;
	chatStarts: number;
	detailViews: number;
	impressions: number;
	leftBannerImpressions: number;
	organicImpressions: number;
	premiumBannerImpressions: number;
	recommendedImpressions: number;
	rightBannerImpressions: number;
	specialImpressions: number;
	urgentImpressions: number;
}

export const sumAnalyticsTotals = (
	summaries: readonly AnalyticsSummaryMetrics[]
): AnalyticsTotals => {
	const totals: AnalyticsTotals = {
		autoBoostFires: 0,
		chatStarts: 0,
		detailViews: 0,
		impressions: 0,
		leftBannerImpressions: 0,
		organicImpressions: 0,
		premiumBannerImpressions: 0,
		recommendedImpressions: 0,
		rightBannerImpressions: 0,
		specialImpressions: 0,
		urgentImpressions: 0,
	};

	for (const item of summaries) {
		totals.autoBoostFires += item.metrics.autoBoostFires;
		totals.chatStarts += item.metrics.chatStarts;
		totals.detailViews += item.metrics.detailViews;
		totals.impressions += item.metrics.impressions;
		totals.leftBannerImpressions += item.sectionMetrics.leftBannerImpressions;
		totals.organicImpressions += item.sectionMetrics.organicImpressions;
		totals.premiumBannerImpressions +=
			item.sectionMetrics.premiumBannerImpressions;
		totals.recommendedImpressions += item.sectionMetrics.recommendedImpressions;
		totals.rightBannerImpressions += item.sectionMetrics.rightBannerImpressions;
		totals.specialImpressions += item.sectionMetrics.specialImpressions;
		totals.urgentImpressions += item.sectionMetrics.urgentImpressions;
	}

	return totals;
};

// 공고가 산 광고 상품에 해당하는 게재 섹션. 배너 3종은 하나의 프리미엄 상품이 상단·좌측·
// 우측 슬롯을 순환하므로 세 슬롯을 함께 켠다. 일반(organic)은 상품과 무관하게 모든 공고가
// 노출되므로 여기가 아니라 getPlacementMetrics에서 항상 포함한다.
export const productSectionsFor = (
	exposureType: string
): ReadonlySet<PlacementKey> => {
	if (BANNER_EXPOSURE_TYPES.has(exposureType)) {
		return new Set<PlacementKey>([
			"premiumBanner",
			"leftBanner",
			"rightBanner",
		]);
	}

	// 리스팅 3종은 노출 타입 값이 곧 섹션 키다.
	if (
		exposureType === "special" ||
		exposureType === "urgent" ||
		exposureType === "recommended"
	) {
		return new Set<PlacementKey>([exposureType]);
	}

	return new Set<PlacementKey>();
};

export interface PlacementMetric {
	key: PlacementKey;
	label: string;
	value: number;
}

// 일반은 항상, 구매한 상품의 섹션은 0이어도(=아직 노출 전임을 보여 줘야 하므로), 나머지는
// 실제 노출이 잡혔을 때만 배지를 남긴다.
export const getPlacementMetrics = (
	summary: AnalyticsSummaryPlacement
): PlacementMetric[] => {
	const productSections = productSectionsFor(summary.exposureType);

	return PLACEMENT_ORDER.map((key) => ({
		key,
		label: PLACEMENT_LABELS[key],
		value: summary.sectionMetrics[PLACEMENT_FIELDS[key]],
	})).filter(
		(item) =>
			item.key === "organic" || productSections.has(item.key) || item.value > 0
	);
};

export interface PremiumSlotShare {
	key: "leftBanner" | "premiumBanner" | "rightBanner";
	label: string;
	value: number;
}

// 프리미엄 배너는 상품이 셋이 아니라 슬롯 위치가 셋이다 — 합계 하나에 위치별 내역을 붙인다.
export const getPremiumSlots = (
	totals: AnalyticsTotals
): PremiumSlotShare[] => [
	{
		key: "premiumBanner",
		label: "상단",
		value: totals.premiumBannerImpressions,
	},
	{ key: "leftBanner", label: "좌측", value: totals.leftBannerImpressions },
	{ key: "rightBanner", label: "우측", value: totals.rightBannerImpressions },
];

export const sumPremiumSlots = (slots: readonly PremiumSlotShare[]): number =>
	slots.reduce((total, slot) => total + slot.value, 0);

// 비중 막대 세그먼트. RN에는 퍼센트 폭이 없어 세그먼트의 flex 값에 노출 수를 그대로 실어
// 비율을 만든다 — 0인 슬롯을 남기면 폭 0짜리 View가 끼어 반올림 틈이 생기므로 걸러 낸다.
export const getPremiumBarSegments = (
	slots: readonly PremiumSlotShare[]
): PremiumSlotShare[] => slots.filter((slot) => slot.value > 0);
