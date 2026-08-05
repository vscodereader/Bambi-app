import { describe, expect, it } from "vitest";

import {
	AD_PREVIEW_TEMPLATE_OPTIONS,
	getAdBannerUsagesForPreviewTemplate,
	getPreviewTemplateOptionsForPlacementKind,
	isPreviewTemplateKindMismatch,
} from "./ad-preview-templates";

describe("getAdBannerUsagesForPreviewTemplate", () => {
	it("requires both banner slots for the premium product", () => {
		// 프리미엄 광고는 상단·좌측(가로형)과 우측(세로형) 슬롯을 모두 구동하므로 두 이미지가 필요하다.
		expect(getAdBannerUsagesForPreviewTemplate("premium-top")).toEqual([
			"ad_horizontal",
			"ad_vertical",
		]);
	});

	it("absorbs legacy side products into the premium two-slot requirement", () => {
		// 좌/우 사이드 배너는 프리미엄으로 통합돼(서버에서 premium-banner로 흡수) 이미 side로 팔린
		// 레거시 상품도 프리미엄과 똑같이 가로형·세로형 두 슬롯을 요구한다.
		expect(getAdBannerUsagesForPreviewTemplate("side-horizontal")).toEqual([
			"ad_horizontal",
			"ad_vertical",
		]);
		expect(getAdBannerUsagesForPreviewTemplate("side-vertical")).toEqual([
			"ad_horizontal",
			"ad_vertical",
		]);
	});

	it("maps listing templates and none to no banner slot", () => {
		// 리스팅 계열·일반 상품은 배너 이미지를 쓰지 않으므로 업로드 슬롯 자체가 없어야 한다.
		expect(getAdBannerUsagesForPreviewTemplate("special-list")).toEqual([]);
		expect(getAdBannerUsagesForPreviewTemplate("urgent-list")).toEqual([]);
		expect(getAdBannerUsagesForPreviewTemplate("recommended-list")).toEqual([]);
		expect(getAdBannerUsagesForPreviewTemplate("none")).toEqual([]);
	});

	it("returns no slot when no product is selected yet", () => {
		// 무료 공고(상품 미선택)·카탈로그 로딩 중에는 배너 그룹을 감춘다.
		expect(getAdBannerUsagesForPreviewTemplate(null)).toEqual([]);
		expect(getAdBannerUsagesForPreviewTemplate(undefined)).toEqual([]);
	});

	it("offers premium as the only selectable banner product", () => {
		// 좌/우 사이드는 통합돼 신규 선택지에서 빠졌으므로, 옵션 중 배너 슬롯을 쓰는 상품은 프리미엄뿐이다.
		const withBanner = AD_PREVIEW_TEMPLATE_OPTIONS.filter(
			(option) => getAdBannerUsagesForPreviewTemplate(option.value).length > 0
		).map((option) => option.value);

		expect(withBanner).toEqual(["premium-top"]);
	});

	it("no longer lists the legacy side products as selectable options", () => {
		// 신규 등록 폼에서는 side-horizontal·side-vertical을 고를 수 없어야 한다(레거시 표시만 유지).
		const values = AD_PREVIEW_TEMPLATE_OPTIONS.map((option) => option.value);

		expect(values).not.toContain("side-horizontal");
		expect(values).not.toContain("side-vertical");
	});
});

describe("getPreviewTemplateOptionsForPlacementKind", () => {
	it("리스팅 위치에는 배너 노출 영역을 감춘다", () => {
		// QA: 리스팅 노출 위치인데 "프리미엄 광고 배너"가 선택지에 떠 있었다.
		const values = getPreviewTemplateOptionsForPlacementKind("listing").map(
			(option) => option.value
		);

		expect(values).toEqual([
			"special-list",
			"urgent-list",
			"recommended-list",
			"none",
		]);
	});

	it("배너 위치에는 리스팅 노출 영역을 감춘다", () => {
		const values = getPreviewTemplateOptionsForPlacementKind("banner").map(
			(option) => option.value
		);

		expect(values).toEqual(["premium-top", "none"]);
	});

	it("위치 유형을 모르면 좁히지 않는다", () => {
		expect(getPreviewTemplateOptionsForPlacementKind(undefined)).toEqual([
			...AD_PREVIEW_TEMPLATE_OPTIONS,
		]);
	});
});

describe("isPreviewTemplateKindMismatch", () => {
	it("유형과 어긋난 기존 값만 경고한다", () => {
		expect(isPreviewTemplateKindMismatch("premium-top", "listing")).toBe(true);
		expect(isPreviewTemplateKindMismatch("special-list", "banner")).toBe(true);
		expect(isPreviewTemplateKindMismatch("special-list", "listing")).toBe(
			false
		);
		// 레거시 side 값은 프리미엄 배너 풀로 흡수돼 배너 위치에서는 정상이다.
		expect(isPreviewTemplateKindMismatch("side-vertical", "banner")).toBe(
			false
		);
		// "노출 영역 없음"은 어느 위치에서도 유효하고, 유형을 모르면 판정하지 않는다.
		expect(isPreviewTemplateKindMismatch("none", "banner")).toBe(false);
		expect(isPreviewTemplateKindMismatch("premium-top", undefined)).toBe(false);
	});
});
