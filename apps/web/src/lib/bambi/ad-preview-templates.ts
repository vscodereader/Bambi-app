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
