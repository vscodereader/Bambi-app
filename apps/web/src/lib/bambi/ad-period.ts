// 조직 단위 누적 광고일수 등급 정의(카드 배지·구인자 안내 등급표 공유 소스). 순수 모듈이라
// 아이콘 컴포넌트를 import하지 않고 종류만 "medal"|"crown"으로 노출한다 — 렌더 레이어가
// 이 판별자로 lucide 아이콘을 고른다. 색은 Tailwind 토큰 유틸(raw hex/oklch 금지).

export interface AdPeriodTier {
	// 티어 색(Tailwind 유틸).
	colorClass: string;
	// 카드·안내가 이 값으로 lucide 아이콘을 고른다.
	icon: "crown" | "medal";
	// 등급 이름(등급표·툴팁).
	label: string;
	// 티어 최대 누적 일수. 최상위는 상한 없음(null).
	maxDays: null | number;
	// 티어 최소 누적 일수(범위 라벨용).
	minDays: number;
}

// 5구간: ≤90 / 91–180 / 181–360 / 361–720 / ≥721. 고정 하드코딩(운영자 설정화는 YAGNI).
export const AD_PERIOD_TIERS: readonly AdPeriodTier[] = [
	{
		icon: "medal",
		colorClass: "text-amber-700",
		label: "브론즈",
		minDays: 0,
		maxDays: 90,
	},
	{
		icon: "medal",
		colorClass: "text-slate-400",
		label: "실버",
		minDays: 91,
		maxDays: 180,
	},
	{
		icon: "medal",
		colorClass: "text-amber-500",
		label: "골드",
		minDays: 181,
		maxDays: 360,
	},
	{
		icon: "crown",
		colorClass: "text-slate-500",
		label: "플래티넘",
		minDays: 361,
		maxDays: 720,
	},
	{
		icon: "crown",
		colorClass: "text-amber-500",
		label: "다이아",
		minDays: 721,
		maxDays: null,
	},
];

// 누적 일수 → 티어. 배열이 상한 없는 최상위로 끝나 항상 매칭되지만, 타입 좁힘용 최저 폴백.
export const adPeriodTier = (totalDays: number): AdPeriodTier =>
	AD_PERIOD_TIERS.find(
		(tier) => tier.maxDays === null || totalDays <= tier.maxDays
	) ?? AD_PERIOD_TIERS[0];

// "22회 900일". totalDays가 0이어도(백필 기간 null 행) 정직하게 그대로 노출한다.
export const formatAdPeriod = ({
	count,
	totalDays,
}: {
	count: number;
	totalDays: number;
}): string =>
	`${count.toLocaleString("ko-KR")}회 ${totalDays.toLocaleString("ko-KR")}일`;

// 등급표 구간 문구. 최상위는 상한이 없어 "이상"으로 끝낸다.
export const formatAdPeriodTierRange = (tier: AdPeriodTier): string =>
	tier.maxDays === null
		? `누적 ${tier.minDays.toLocaleString("ko-KR")}일 이상`
		: `누적 ${tier.minDays.toLocaleString("ko-KR")}~${tier.maxDays.toLocaleString("ko-KR")}일`;
