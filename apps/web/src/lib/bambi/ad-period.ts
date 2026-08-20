// 조직 단위 누적 광고일수 등급 정의(카드 배지·구인자 안내 등급표 공유 소스). 순수 모듈이라
// 아이콘 컴포넌트를 import하지 않고 종류만 "medal"|"crown"으로 노출한다 — 렌더 레이어가
// 이 판별자로 lucide 아이콘을 고른다. 색은 Tailwind 토큰 유틸(raw hex/oklch 금지).

export interface AdPeriodTier {
	// 티어 색(Tailwind 유틸).
	colorClass: string;
	// 카드·안내가 이 값으로 lucide 아이콘을 고른다.
	icon: "crown" | "medal";
	// 운영자가 올린 아이콘 이미지(GIF·PNG·WebP·JPG) URL. 있으면 icon 프리셋 대신 이걸 그린다.
	// 코드 상수 등급(AD_PERIOD_TIERS)은 이미지가 없으므로 선택 필드로 둔다.
	iconImageUrl?: null | string;
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

// 아이콘 판별자 → 화면 라벨(운영자 UI 선택지). enum 원값을 그대로 노출하지 않는다.
export const AD_PERIOD_TIER_ICON_LABELS: Record<AdPeriodTier["icon"], string> =
	{
		crown: "왕관",
		medal: "메달",
	};

// colorClass 프리셋(자유 입력 금지). 운영자는 이 중에서 고른다 — 카드 배지가 쓰는 Tailwind
// 텍스트 색 유틸이다. 기존 5등급 색(앰버·슬레이트)을 포함한다.
export const AD_PERIOD_TIER_COLOR_PRESETS: readonly {
	className: string;
	label: string;
}[] = [
	{ className: "text-primary", label: "브랜드(코럴)" },
	{ className: "text-amber-700", label: "브론즈" },
	{ className: "text-slate-400", label: "실버" },
	{ className: "text-amber-500", label: "골드" },
	{ className: "text-slate-500", label: "슬레이트" },
	{ className: "text-sky-500", label: "스카이" },
	{ className: "text-violet-500", label: "바이올렛" },
];

// 누적 일수 → 티어. tiers를 주입할 수 있고(운영자 설정값), 비었으면 상수로 폴백한다.
// 운영자가 상한 없는(maxDays=null) 최상위 없이 구성할 수 있으므로, 모든 구간을 넘긴 일수는
// 최하위가 아니라 최상위로 떨어뜨린다(오름차순 정렬된 목록 전제).
export const adPeriodTier = (
	totalDays: number,
	tiers: readonly AdPeriodTier[] = AD_PERIOD_TIERS
): AdPeriodTier => {
	const list = tiers.length > 0 ? tiers : AD_PERIOD_TIERS;
	return (
		list.find((tier) => tier.maxDays === null || totalDays <= tier.maxDays) ??
		list.at(-1) ??
		list[0]
	);
};

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
