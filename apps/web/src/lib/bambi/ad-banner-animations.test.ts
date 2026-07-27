import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATION_LABELS,
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_ANIMATION_VALUES,
	AD_BANNER_THEME_LABELS,
	AD_BANNER_THEME_OPTIONS,
	AD_BANNER_THEME_VALUES,
	DEFAULT_AD_BANNER_THEME,
} from "./ad-banner-animations";

describe("ad banner animation catalog", () => {
	it("labels every animation value", () => {
		// DB enum 원값이 화면에 새면 구인자가 "blur-in" 같은 값을 그대로 본다.
		for (const value of AD_BANNER_ANIMATION_VALUES) {
			expect(AD_BANNER_ANIMATION_LABELS[value]).toBeTruthy();
		}
	});

	it("labels every theme value", () => {
		for (const value of AD_BANNER_THEME_VALUES) {
			expect(AD_BANNER_THEME_LABELS[value]).toBeTruthy();
		}
	});

	it("offers exactly the catalog values as options", () => {
		// 옵션과 값 목록이 어긋나면 고를 수 없는 값이 DB에 저장되거나 그 반대가 된다.
		expect(AD_BANNER_ANIMATION_OPTIONS.map((option) => option.value)).toEqual([
			...AD_BANNER_ANIMATION_VALUES,
		]);
		expect(AD_BANNER_THEME_OPTIONS.map((option) => option.value)).toEqual([
			...AD_BANNER_THEME_VALUES,
		]);
	});

	it("describes every animation so the employer can pick without previewing", () => {
		for (const option of AD_BANNER_ANIMATION_OPTIONS) {
			expect(option.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults the theme to a value in the catalog", () => {
		expect(AD_BANNER_THEME_VALUES).toContain(DEFAULT_AD_BANNER_THEME);
	});
});
