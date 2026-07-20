import { describe, expect, it } from "vitest";

import {
	AD_PREVIEW_TEMPLATE_OPTIONS,
	getAdBannerUsagesForPreviewTemplate,
} from "./ad-preview-templates";

describe("getAdBannerUsagesForPreviewTemplate", () => {
	it("maps banner templates to the banner slot they actually use", () => {
		// 서버 PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE와 같은 대응: 프리미엄·좌측은 가로형,
		// 우측만 세로형이다.
		expect(getAdBannerUsagesForPreviewTemplate("premium-top")).toEqual([
			"ad_horizontal",
		]);
		expect(getAdBannerUsagesForPreviewTemplate("side-horizontal")).toEqual([
			"ad_horizontal",
		]);
		expect(getAdBannerUsagesForPreviewTemplate("side-vertical")).toEqual([
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

	it("gives a banner slot to exactly the three banner templates", () => {
		// 노출 영역이 추가·변경되면 이 목록이 먼저 깨져 매핑 누락을 잡는다.
		const withBanner = AD_PREVIEW_TEMPLATE_OPTIONS.filter(
			(option) => getAdBannerUsagesForPreviewTemplate(option.value).length > 0
		).map((option) => option.value);

		expect(withBanner).toEqual([
			"premium-top",
			"side-horizontal",
			"side-vertical",
		]);
	});
});
