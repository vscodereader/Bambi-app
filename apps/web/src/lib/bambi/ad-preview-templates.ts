import type { JobAdBannerUsage } from "./job-ad-banner-spec";

// 광고 상품의 노출 영역(previewTemplate) 값 — 서버의
// packages/api/src/services/bambi-ad-exposure.ts AdPreviewTemplate과 값이 1:1로 일치해야 한다.
// side-horizontal·side-vertical은 프리미엄 광고로 통합돼 신규 선택지에서는 빠졌지만,
// 이미 그 값으로 팔린 레거시 상품 표시를 위해 타입·라벨에는 그대로 남긴다.
export type AdPreviewTemplateValue =
	| "premium-top"
	| "special-list"
	| "urgent-list"
	| "recommended-list"
	| "side-vertical"
	| "side-horizontal"
	| "none";

// 운영자가 신규 상품에 고를 수 있는 노출 영역. 좌/우 사이드 배너는 프리미엄 광고로 통합돼
// 더는 개별 선택할 수 없으므로 목록에서 뺐다(레거시 side 상품은 아래 라벨 레코드로만 표시).
export const AD_PREVIEW_TEMPLATE_OPTIONS = [
	{ label: "프리미엄 광고(상단·좌/우 사이드 배너)", value: "premium-top" },
	{ label: "스페셜 채용 리스팅", value: "special-list" },
	{ label: "급구 채용 리스팅", value: "urgent-list" },
	{ label: "추천 채용 리스팅", value: "recommended-list" },
	{ label: "노출 영역 없음(일반)", value: "none" },
] as const;

// 레거시 side 상품도 표시해야 하므로 옵션 파생이 아니라 7개 값 전체를 명시한다.
export const AD_PREVIEW_TEMPLATE_LABELS: Record<
	AdPreviewTemplateValue,
	string
> = {
	none: "노출 영역 없음(일반)",
	"premium-top": "프리미엄 광고(상단·좌/우 사이드 배너)",
	"recommended-list": "추천 채용 리스팅",
	"side-horizontal": "(구) 좌측 사이드 배너(가로형)",
	"side-vertical": "(구) 우측 사이드 배너(세로형)",
	"special-list": "스페셜 채용 리스팅",
	"urgent-list": "급구 채용 리스팅",
};

// 노출 영역별로 실제 사용하는 광고 배너 슬롯. 프리미엄 광고는 상단·좌측 레일에 가로형(ad_horizontal),
// 우측 레일에 세로형(ad_vertical)을 쓰므로 둘 다 필요하다. 레거시 side-horizontal·side-vertical은
// 서버 PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE에서 premium-banner로 흡수돼 프리미엄 풀에 합류하므로
// 동일하게 두 슬롯을 요구한다. 리스팅 계열(special/urgent/recommended)과 none은 배너 이미지를
// 쓰지 않으므로 빈 배열이다. 여기가 틀리면 구인자가 쓸 수 없는 슬롯에 이미지를 올리거나, 산 슬롯을 못 채운다.
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

// 상품 미선택(무료 공고)이나 카탈로그 로딩 중이면 배너 슬롯이 없다.
export const getAdBannerUsagesForPreviewTemplate = (
	previewTemplate: AdPreviewTemplateValue | null | undefined
): JobAdBannerUsage[] =>
	previewTemplate ? AD_BANNER_USAGES_BY_PREVIEW_TEMPLATE[previewTemplate] : [];
