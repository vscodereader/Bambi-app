// 광고 상품(구인자 프로모션 등급) 안내 데이터.
// 밤비 백엔드 promotionTier(premium/recommended/standard = 프리미엄/추천/일반)에 대응한다.
// 광고비 데이터는 코드/DB에 아직 없으므로 여기 상수로 정의한다(추후 실값 교체 지점).

export type AdProductTier = "premium" | "recommended" | "standard";

export interface AdProductPrice {
	amount: number;
	days: number;
}

export interface AdPlacementDiagram {
	// 강조 슬롯 배경 유틸(등급 accent). 예: "bg-coral-500".
	accentClassName: string;
	// 강조할 행 인덱스(0=최상단).
	highlightRows: number[];
	totalRows: number;
}

export interface AdProduct {
	// 등급 배지 accent 유틸(soft 톤). 예: "bg-coral-50 text-coral-600".
	badgeClassName: string;
	benefits: string[];
	diagram: AdPlacementDiagram;
	name: string;
	// 노출 위치 미리보기 캡션.
	placementCaption: string;
	prices: AdProductPrice[];
	tagline: string;
	tier: AdProductTier;
}

// 등급 라벨(백엔드 promotionLabels와 정합): 프리미엄 / 추천 / 일반.
export const AD_PRODUCTS: AdProduct[] = [
	{
		tier: "premium",
		name: "프리미엄 광고",
		tagline: "가장 빠른 노출, 메인 최상단 고정",
		badgeClassName: "bg-coral-50 text-coral-600",
		diagram: {
			accentClassName: "bg-coral-500",
			highlightRows: [0],
			totalRows: 5,
		},
		placementCaption: "메인 최상단 · 스페셜 채용 슬롯에 고정 노출",
		benefits: [
			"메인 상단 프리미엄 슬롯 고정 노출",
			"스페셜 채용 배지 부여",
			"지역·직종 상단 추천 노출",
			"자동 끌어올림 1일 8회",
			"수동 끌어올림 1일 20회",
			"구직자 열람 우선 노출",
		],
		prices: [
			{ days: 30, amount: 330_000 },
			{ days: 60, amount: 620_000 },
			{ days: 90, amount: 890_000 },
		],
	},
	{
		tier: "recommended",
		name: "추천 광고",
		tagline: "합리적 비용, 두 배 노출 효과",
		badgeClassName: "bg-sky-50 text-sky-600",
		diagram: {
			accentClassName: "bg-sky-400",
			highlightRows: [2],
			totalRows: 5,
		},
		placementCaption: "메인 중단 · 추천 채용 슬롯에 노출",
		benefits: [
			"메인 중단 추천 슬롯 노출",
			"추천 채용 배지 부여",
			"지역·직종 상단 추천 노출",
			"자동 끌어올림 1일 6회",
			"수동 끌어올림 1일 10회",
			"구직자 열람 노출",
		],
		prices: [
			{ days: 30, amount: 230_000 },
			{ days: 60, amount: 430_000 },
			{ days: 90, amount: 620_000 },
		],
	},
	{
		tier: "standard",
		name: "일반 광고",
		tagline: "가장 저렴한 기본 노출",
		badgeClassName: "bg-secondary text-muted-foreground",
		diagram: {
			accentClassName: "bg-gray-400",
			highlightRows: [4],
			totalRows: 5,
		},
		placementCaption: "전체 공고 목록 · 최신순 노출",
		benefits: [
			"전체 공고 목록 노출(최신순)",
			"구인정보 리스트 노출",
			"수동 끌어올림 1일 5회",
			"구직자 열람 노출",
		],
		prices: [
			{ days: 30, amount: 66_000 },
			{ days: 60, amount: 125_000 },
			{ days: 90, amount: 178_000 },
		],
	},
];

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR");

// 광고비 금액을 천단위 구분 + "원"으로 포맷한다(로케일 고정 → hydration 안전).
export function formatAdPrice(amount: number): string {
	return `${KRW_FORMATTER.format(amount)}원`;
}
