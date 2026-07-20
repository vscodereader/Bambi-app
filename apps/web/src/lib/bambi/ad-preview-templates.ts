import type { JobAdBannerUsage } from "./job-ad-banner-spec";

// 광고 상품의 노출 영역(previewTemplate) 선택지 — 서버의
// packages/api/src/services/bambi-ad-exposure.ts AdPreviewTemplate과 값이 1:1로 일치해야 한다.
export const AD_PREVIEW_TEMPLATE_OPTIONS = [
	{ label: "상단 프리미엄 배너", value: "premium-top" },
	{ label: "좌측 사이드 배너(가로형)", value: "side-horizontal" },
	{ label: "우측 사이드 배너(세로형)", value: "side-vertical" },
	{ label: "스페셜 채용 리스팅", value: "special-list" },
	{ label: "급구 채용 리스팅", value: "urgent-list" },
	{ label: "추천 채용 리스팅", value: "recommended-list" },
	{ label: "노출 영역 없음(일반)", value: "none" },
] as const;

export type AdPreviewTemplateValue =
	(typeof AD_PREVIEW_TEMPLATE_OPTIONS)[number]["value"];

export const AD_PREVIEW_TEMPLATE_LABELS: Record<
	AdPreviewTemplateValue,
	string
> = Object.fromEntries(
	AD_PREVIEW_TEMPLATE_OPTIONS.map((option) => [option.value, option.label])
) as Record<AdPreviewTemplateValue, string>;

// 노출 영역별로 실제 사용하는 광고 배너 슬롯. 서버의 PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE
// (premium-top→프리미엄 배너, side-horizontal→좌측 배너, side-vertical→우측 배너)와 1:1이며,
// 리스팅 계열(special/urgent/recommended)과 none은 배너 이미지를 쓰지 않으므로 빈 배열이다.
// 여기가 틀리면 구인자가 쓸 수 없는 슬롯에 이미지를 올리거나, 산 슬롯을 못 채운다.
const AD_BANNER_USAGES_BY_PREVIEW_TEMPLATE: Record<
	AdPreviewTemplateValue,
	JobAdBannerUsage[]
> = {
	none: [],
	"premium-top": ["ad_horizontal"],
	"recommended-list": [],
	"side-horizontal": ["ad_horizontal"],
	"side-vertical": ["ad_vertical"],
	"special-list": [],
	"urgent-list": [],
};

// 상품 미선택(무료 공고)이나 카탈로그 로딩 중이면 배너 슬롯이 없다.
export const getAdBannerUsagesForPreviewTemplate = (
	previewTemplate: AdPreviewTemplateValue | null | undefined
): JobAdBannerUsage[] =>
	previewTemplate ? AD_BANNER_USAGES_BY_PREVIEW_TEMPLATE[previewTemplate] : [];
