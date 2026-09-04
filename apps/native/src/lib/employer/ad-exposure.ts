// 할인가는 서버 스냅샷과 같은 순수 함수로 계산한다 — 화면에 보여 준 금액과 저장 금액이
// 어긋나면 입금액 분쟁이 된다(web ad-catalog가 쓰는 함수와 동일).
import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";
import { discountedAdAmount } from "@bambi-app/api/services/bambi-ad-pricing";

import { isBannerImageRequired } from "@/src/lib/employer/ad-banner-layout";

// 광고 상품의 노출 영역. 서버 bambi-ad-exposure의 AdPreviewTemplate과 값이 1:1이다.
export type AdPreviewTemplateValue =
	| "none"
	| "premium-top"
	| "recommended-list"
	| "side-horizontal"
	| "side-vertical"
	| "special-list"
	| "urgent-list";

export type JobAdBannerUsage = "ad_horizontal" | "ad_vertical";

// 노출 영역별로 실제 쓰는 광고 배너 슬롯. 프리미엄 광고는 상단·좌측 레일에 가로형,
// 우측 레일에 세로형을 쓰므로 둘 다 필요하다. 레거시 side-* 는 서버에서 프리미엄 배너 풀로
// 흡수되므로 같은 두 슬롯을 요구한다. 리스팅 계열·none은 배너 이미지를 쓰지 않는다.
// (web ad-preview-templates의 AD_BANNER_USAGES_BY_PREVIEW_TEMPLATE와 같은 표 — 여기가
// 어긋나면 구인자가 산 슬롯을 못 채우거나 쓰지도 않을 이미지를 요구받는다.)
const AD_BANNER_USAGES_BY_PREVIEW_TEMPLATE: Record<
	AdPreviewTemplateValue,
	JobAdBannerUsage[]
> = {
	none: [],
	"premium-top": ["ad_horizontal", "ad_vertical"],
	"recommended-list": [],
	"side-horizontal": ["ad_horizontal", "ad_vertical"],
	"side-vertical": ["ad_horizontal", "ad_vertical"],
	"special-list": [],
	"urgent-list": [],
};

export const AD_BANNER_USAGE_LABELS: Record<JobAdBannerUsage, string> = {
	ad_horizontal: "가로형 광고 배너",
	ad_vertical: "세로형 광고 배너",
};

// 업로드 안내 문구. 규격 검증 자체는 서버 정책(validateJobPostImageUpload)이 하고, 여기서는
// 고르기 전에 알려 주기만 한다 — 규격을 두 곳에서 판정하면 한쪽만 바뀌었을 때 어긋난다.
export const AD_BANNER_USAGE_HINTS: Record<JobAdBannerUsage, string> = {
	ad_horizontal: "가로형 7:3 비율 (최소 700×300, 권장 1400×600)",
	ad_vertical: "세로형 4:9 비율 (최소 400×900)",
};

// 상품 미선택(무료 공고)이나 카탈로그 로딩 중이면 배너 슬롯이 없다.
export const getRequiredBannerUsages = (
	previewTemplate: AdPreviewTemplateValue | null | undefined
): JobAdBannerUsage[] =>
	previewTemplate ? AD_BANNER_USAGES_BY_PREVIEW_TEMPLATE[previewTemplate] : [];

export interface JobAdBannerMedia {
	adHorizontal?: unknown;
	adVertical?: unknown;
}

// 필수 슬롯 중 이미지가 비어 있는 것. 단색 배경을 고른 슬롯은 렌더러가 색으로 덮어 이미지가
// 안 보이므로 필수에서 뺀다(웹 isAdBannerImageRequired와 같은 규칙). layout을 안 넘기면
// (또는 null이면) 종전대로 두 슬롯 모두 이미지를 요구한다.
export const getMissingBannerUsages = (
	media: JobAdBannerMedia,
	requiredUsages: readonly JobAdBannerUsage[],
	layout?: AdBannerLayoutInput | null
): JobAdBannerUsage[] =>
	requiredUsages.filter((usage) => {
		const hasImage =
			usage === "ad_horizontal"
				? Boolean(media.adHorizontal)
				: Boolean(media.adVertical);

		if (hasImage) {
			return false;
		}

		return isBannerImageRequired(layout ?? null, usage);
	});

export const REQUIRED_BANNER_ERROR =
	"프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두 등록해야 합니다.";

const wonFormatter = new Intl.NumberFormat("ko-KR");

export const formatAdPrice = (amount: number): string =>
	`${wonFormatter.format(amount)}원`;

// 할인 중이면 할인가와 할인율을 함께 적는다(취소선은 한 줄 문자열로 표현할 수 없다).
export const formatAdPriceLabel = (
	amount: number,
	discountPercent: null | number | undefined
): string => {
	const percent =
		discountPercent && discountPercent > 0
			? Math.min(100, Math.floor(discountPercent))
			: 0;
	const discounted = discountedAdAmount(amount, percent);

	return percent > 0 && discounted < amount
		? `${formatAdPrice(discounted)} (${percent}% 할인)`
		: formatAdPrice(amount);
};

// 화면에 보여 준 판매가 = 서버가 저장할 금액. 할인 적용 후 값을 그대로 exposureAmount로 보낸다.
export const resolveAdAmount = (
	amount: number,
	discountPercent: null | number | undefined
): number =>
	discountedAdAmount(
		amount,
		discountPercent && discountPercent > 0
			? Math.min(100, Math.floor(discountPercent))
			: 0
	);

// 폼이 들고 있는 노출 상품 선택. 무료(일반 구인)는 null이다.
export interface NativeAdSelection {
	adProductId: string;
	amount: number;
	durationDays: number;
	previewTemplate: AdPreviewTemplateValue;
	productName: string;
}

// 노출 상품·결제 화면이 들고 있는 선택 상태. 결제수단은 무통장입금만 가능하다(카드는 준비 중).
// 예전엔 job-exposure-section.tsx에 있었지만, 이제 초안 스토어·노출 화면이 함께 참조하므로
// NativeAdSelection과 같은 도메인 lib으로 옮겼다(컴포넌트→lib 역참조를 없앤다).
export interface NativeExposureState {
	// 신청 시 화면에 보여 준 옵션 가격(서버 재확인 값). 미신청이면 null.
	detailDesignAmount: null | number;
	// 상세이미지 디자인 제작 애드온 신청 여부. 상품이 옵션을 안 팔면 항상 false다.
	detailDesignRequested: boolean;
	paymentMethod: "bank_transfer";
	pointsToUse: number;
	selection: null | NativeAdSelection; // null = 일반 구인(무료)
}

// 상세 디자인 신청 상태를 상품 가격에 맞춘다. 옵션을 안 파는 상품(price null)으로 바꾸면
// 남아 있던 신청을 해제한다 — 서버도 상품 전환 시 스냅샷을 정리한다(keepOrClearJobDetailDesign).
export const resolveDetailDesignSelection = ({
	detailDesignPrice,
	requested,
}: {
	detailDesignPrice: null | number;
	requested: boolean;
}): { amount: null | number; requested: boolean } =>
	detailDesignPrice !== null && requested
		? { amount: detailDesignPrice, requested: true }
		: { amount: null, requested: false };

export const FREE_EXPOSURE_LABEL = "일반 구인 (무료)";

export const describeAdSelection = (
	selection: null | NativeAdSelection
): string =>
	selection
		? `${selection.productName} · ${selection.durationDays}일 · ${formatAdPrice(selection.amount)}`
		: FREE_EXPOSURE_LABEL;

// 신용카드는 결제 연동 전이라 고를 수 없다. 문구를 한 곳에 둬서 선택지·안내가 갈리지 않게 한다.
export const CARD_PAYMENT_NOTICE =
	"신용카드 결제는 준비 중이에요. 지금은 무통장입금으로만 결제할 수 있습니다.";

// 이번에 쓸 수 있는 포인트 상한. 보유·결제 예정 금액·운영자 설정 상한 중 가장 작은 값이다.
export const resolveUsablePoints = ({
	balance,
	grossAmount,
	maxPoints,
}: {
	balance: number;
	grossAmount: number;
	maxPoints: null | number | undefined;
}): number => Math.min(balance, grossAmount, maxPoints ?? grossAmount);

// 입력한 포인트가 쓸 수 있는 값인지. 0(미사용)은 언제나 통과이고, 그 외에는 운영자가 정한
// 최소 단위와 상한 사이의 정수여야 한다. 통과면 null, 아니면 화면에 그대로 띄울 사유다.
export const validatePointsToUse = (
	value: number,
	{ minPoints, usablePoints }: { minPoints: number; usablePoints: number }
): null | string => {
	if (value === 0) {
		return null;
	}

	if (minPoints <= 0 || usablePoints < minPoints) {
		return "지금은 포인트를 사용할 수 없어요.";
	}

	if (!Number.isInteger(value) || value < minPoints) {
		return `최소 ${wonFormatter.format(minPoints)}P부터 사용할 수 있어요.`;
	}

	if (value > usablePoints) {
		return `이번 결제에는 최대 ${wonFormatter.format(usablePoints)}P까지 사용할 수 있어요.`;
	}

	return null;
};

// 실제 입금할 금액. 포인트는 1P=1원으로 차감하고 음수로 내려가지 않는다.
export const resolvePayableAmount = (
	grossAmount: number,
	pointsToUse: number
): number => Math.max(0, grossAmount - pointsToUse);
