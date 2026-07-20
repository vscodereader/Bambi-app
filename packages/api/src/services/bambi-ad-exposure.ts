// 광고 상품의 미리보기 템플릿(preview_template)을 공고 노출 타입(exposure_type)으로
// 변환하는 단일 소스. 운영자가 등록한 광고 상품이 어떤 노출 영역을 구동하는지 서버에서
// 도출할 때 사용한다.

export type AdPreviewTemplate =
	| "premium-top"
	| "special-list"
	| "urgent-list"
	| "recommended-list"
	| "side-vertical"
	| "side-horizontal"
	| "none";

export type JobExposureType =
	| "premium-banner"
	| "left-banner"
	| "right-banner"
	| "special"
	| "urgent"
	| "recommended"
	| "standard";

const PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE: Record<
	AdPreviewTemplate,
	JobExposureType
> = {
	none: "standard",
	"premium-top": "premium-banner",
	"recommended-list": "recommended",
	"side-horizontal": "left-banner",
	"side-vertical": "right-banner",
	"special-list": "special",
	"urgent-list": "urgent",
};

export function previewTemplateToExposureType(
	template: AdPreviewTemplate
): JobExposureType {
	return PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE[template] ?? "standard";
}
