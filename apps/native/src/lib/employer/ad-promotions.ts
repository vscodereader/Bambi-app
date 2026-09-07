import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	AD_BANNER_EXPOSURE_TYPES,
	EXPOSURE_TYPE_LABELS,
	isExposureActive,
} from "@bambi-app/api/services/bambi-ad-exposure";

// 광고 관리 화면의 순수 계산. 분류·한도·문구를 화면 밖으로 빼 vitest로 덮는다 —
// web /employer/promotions/page.tsx의 같은 이름 함수들을 그대로 이식했다. 규칙이 갈리면
// 같은 공고가 웹과 앱에서 다른 탭에 앉는다.

export type EmployerAd = Awaited<
	ReturnType<AppRouterClient["bambi"]["promotions"]["listMyAds"]>
>[number];

// 계산이 실제로 읽는 필드만 추린 모양. 화면은 서버 응답(EmployerAd)을 그대로 넘기고
// 테스트는 이만큼만 채운다 — 응답 전체를 손으로 만들면 필드가 하나 늘 때마다 깨진다.
export interface AdBoostFields {
	autoBoostsPerDay: number;
	autoBoostsUsedToday: number;
	boostCountRemaining: number;
	boostOptionAutoPerDay: number;
	boostOptionManualPerDay: number;
	boostsUsedToday: number;
	exposureEndsAt: Date | null;
	exposureType: string;
	manualBoostsPerDay: number;
	paymentStatus: string;
	status: string;
}

export type AdGroupFields = Pick<
	AdBoostFields,
	"exposureEndsAt" | "paymentStatus" | "status"
>;

// 아이콘을 달지 않는다 — 네 탭에 아이콘까지 넣으면 폭 합이 360dp 화면을 넘어
// 가로 스크롤이 강제되고, 그러면 탭 트랙이 넓은 화면에서 빈 채로 늘어난다.
export const AD_STATUS_GROUPS = [
	{ id: "all", label: "전체" },
	{ id: "active", label: "진행 중" },
	{ id: "pending_payment", label: "결제 대기" },
	{ id: "expired", label: "만료" },
] as const;

export type AdStatusGroupId = (typeof AD_STATUS_GROUPS)[number]["id"];

const BANNER_EXPOSURE_TYPES: ReadonlySet<string> = new Set(
	AD_BANNER_EXPOSURE_TYPES
);

export const isBannerExposureType = (exposureType: string): boolean =>
	BANNER_EXPOSURE_TYPES.has(exposureType);

// 라벨 맵을 넓은 키로 받아 폴백을 남긴다(web exposureLabel과 같은 규칙) — 맵이
// JobExposureType 전부를 덮고 있어 실제로 폴백까지 내려가지는 않는다.
const EXPOSURE_LABELS: Record<string, string | undefined> =
	EXPOSURE_TYPE_LABELS;

export const exposureLabel = (exposureType: string): string =>
	EXPOSURE_LABELS[exposureType] ?? exposureType;

// 하루 한도·자동 횟수는 상품 번들 + 활성 기간제 옵션 합이다(서버 resolveBoostEligibility·
// 자동 배치와 같은 계산). 옵션만 산 무료 공고도 여기서 한도가 잡힌다.
export const dailyBoostLimit = (ad: AdBoostFields): number =>
	ad.manualBoostsPerDay + ad.boostOptionManualPerDay;

export const autoBoostLimit = (ad: AdBoostFields): number =>
	ad.autoBoostsPerDay + ad.boostOptionAutoPerDay;

export const remainingBoosts = (ad: AdBoostFields): number =>
	Math.max(0, dailyBoostLimit(ad) - ad.boostsUsedToday);

export interface BoostState {
	canBoost: boolean;
	// 끌어올리기를 누를 수 없을 때 사유. 누를 수 있으면 null.
	disabledReason: null | string;
}

// 끌어올리기 버튼의 활성 여부와, 비활성일 때 왜 못 누르는지 사유를 함께 계산한다.
export const getBoostState = (ad: AdBoostFields, now: Date): BoostState => {
	if (isBannerExposureType(ad.exposureType)) {
		return {
			canBoost: false,
			disabledReason: "배너 광고는 끌어올리기 대상이 아니에요.",
		};
	}

	// 하루 한도(상품+옵션)도 없고 횟수권 잔여도 없으면 애초에 쓸 끌어올리기가 없다.
	// 카드의 "옵션 구매" 버튼으로 유도한다.
	if (dailyBoostLimit(ad) === 0 && ad.boostCountRemaining === 0) {
		return {
			canBoost: false,
			disabledReason:
				"사용할 수 있는 끌어올리기가 없어요. 끌어올리기 옵션을 구매해 보세요.",
		};
	}

	if (
		ad.status !== "published" ||
		ad.paymentStatus !== "paid" ||
		!isExposureActive(ad.exposureEndsAt, now)
	) {
		return {
			canBoost: false,
			disabledReason: "노출 중인 공고만 끌어올릴 수 있어요.",
		};
	}

	// 하루 한도를 다 썼어도 횟수권 잔여가 있으면 서버가 1회 차감으로 처리해 준다.
	if (remainingBoosts(ad) === 0 && ad.boostCountRemaining === 0) {
		return {
			canBoost: false,
			disabledReason: "오늘 끌어올리기를 모두 사용했어요.",
		};
	}

	return { canBoost: true, disabledReason: null };
};

// 탭 분류: 노출 만료가 최우선(과거 결제 이력이 있어야 만료가 생김), 그다음 미결제,
// 공개 중 광고가 "진행 중". 검수 대기·반려·숨김·임시 저장은 "전체"에서만 보인다.
export const getAdGroupId = (
	ad: AdGroupFields,
	now: Date
): "other" | Exclude<AdStatusGroupId, "all"> => {
	if (ad.exposureEndsAt !== null && !isExposureActive(ad.exposureEndsAt, now)) {
		return "expired";
	}

	if (ad.paymentStatus !== "paid") {
		return "pending_payment";
	}

	if (ad.status === "published") {
		return "active";
	}

	return "other";
};

export interface AdBadge {
	label: string;
	tone: "neutral" | "success" | "warning";
}

// 오늘 남은 수동 끌어올리기. 일일 한도와 횟수권은 서로 다른 지갑이라 배지를 나눠 단다.
export const manualBoostBadges = (ad: AdBoostFields): AdBadge[] => {
	if (isBannerExposureType(ad.exposureType)) {
		return [{ label: "대상 아님", tone: "neutral" }];
	}

	const limit = dailyBoostLimit(ad);

	if (limit === 0 && ad.boostCountRemaining === 0) {
		return [{ label: "미포함", tone: "neutral" }];
	}

	const badges: AdBadge[] = [];

	if (limit > 0) {
		badges.push({
			label: `남은 ${remainingBoosts(ad)}회 / 일일 ${limit}회`,
			tone: "success",
		});
	}

	if (ad.boostCountRemaining > 0) {
		badges.push({
			label: `횟수권 ${ad.boostCountRemaining}회`,
			tone: "success",
		});
	}

	return badges;
};

export const autoBoostBadge = (ad: AdBoostFields): AdBadge => {
	if (isBannerExposureType(ad.exposureType)) {
		return { label: "대상 아님", tone: "neutral" };
	}

	const limit = autoBoostLimit(ad);

	return limit === 0
		? { label: "미설정", tone: "neutral" }
		: {
				label: `오늘 ${ad.autoBoostsUsedToday}/${limit}회 실행`,
				tone: "success",
			};
};

// 배너·스페셜·추천 미결제 신청의 파생 큐(진행 가능 여부·대기 순번). 그 외엔 null.
export const premiumQueueBadge = (
	queue: EmployerAd["premiumQueue"]
): AdBadge | null => {
	if (queue === null) {
		return null;
	}

	return queue.progressable
		? { label: "진행 가능", tone: "success" }
		: { label: `대기열 ${queue.queuePosition}번째`, tone: "warning" };
};

// 노출 마감은 날짜만 본다 — 좁은 카드에서 시각까지 붙이면 줄이 접힌다.
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" });

export const formatAdDate = (value: Date | string): string =>
	dateFormatter.format(new Date(value));

// "진행 중 광고"는 광고 상품이 붙은 공고만 센다(구인자 홈 getAdSummary와 같은 정의).
// adProductName은 상품 leftJoin 결과라 무료 공고에서만 null이다.
export const countActiveAds = (
	ads: readonly (AdGroupFields & { adProductName: null | string })[],
	now: Date
): number =>
	ads.filter(
		(ad) => getAdGroupId(ad, now) === "active" && ad.adProductName !== null
	).length;
