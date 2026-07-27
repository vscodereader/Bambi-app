import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATION_LABELS,
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_ANIMATION_VALUES,
	AD_BANNER_MAX_BLOCKS,
	clampPercent,
	collectAdBannerLayoutTexts,
	contrastRatio,
	createAdBannerTextBlock,
	createEmptyAdBannerLayout,
	isLowContrast,
} from "./ad-banner-layout";

describe("ad banner layout catalog", () => {
	it("labels every animation value", () => {
		// DB enum이 사라져 라벨 맵이 유일한 표시 경로다. 값 하나라도 비면 화면에 원값이 샌다.
		for (const value of AD_BANNER_ANIMATION_VALUES) {
			expect(AD_BANNER_ANIMATION_LABELS[value]).toBeTruthy();
		}
	});

	it("offers exactly the catalog values as options", () => {
		expect(AD_BANNER_ANIMATION_OPTIONS.map((option) => option.value)).toEqual([
			...AD_BANNER_ANIMATION_VALUES,
		]);
	});
});

describe("createEmptyAdBannerLayout", () => {
	it("starts both slots with an image background and no text", () => {
		// 배너를 편집하지 않은 공고와 같은 상태여야 렌더러가 이미지만 그린다.
		const layout = createEmptyAdBannerLayout();

		expect(layout.version).toBe(1);
		expect(layout.horizontal.texts).toEqual([]);
		expect(layout.vertical.texts).toEqual([]);
		expect(layout.horizontal.background.type).toBe("image");
	});
});

describe("createAdBannerTextBlock", () => {
	it("places a new block at the center", () => {
		// 새 블록이 모서리에 생기면 구인자가 매번 끌어와야 한다.
		const block = createAdBannerTextBlock("block-1");

		expect(block.id).toBe("block-1");
		expect(block.x).toBe(50);
		expect(block.y).toBe(50);
	});
});

describe("clampPercent", () => {
	it("keeps a block inside the canvas", () => {
		expect(clampPercent(-12)).toBe(0);
		expect(clampPercent(140)).toBe(100);
		expect(clampPercent(42.5)).toBe(42.5);
	});
});

describe("contrastRatio", () => {
	it("returns the WCAG ratio for black on white", () => {
		expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
	});

	it("returns 1 for identical colors", () => {
		expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 2);
	});

	it("reads shorthand hex the same as its expanded form", () => {
		// 구인자가 #fff를 직접 입력할 수 있다. 축약형을 못 읽으면 NaN이 나온다.
		expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 1);
	});

	it("reports no contrast for an unparsable color", () => {
		// NaN을 흘리면 모든 비교가 false가 되어 경고가 조용히 꺼진다. 모르면 경고하는 쪽으로.
		expect(contrastRatio("검정", "#ffffff")).toBe(1);
		expect(isLowContrast("검정", "#ffffff")).toBe(true);
	});
});

describe("isLowContrast", () => {
	it("flags a combination below the AA threshold", () => {
		// 흰 배경 위 흰 글자는 읽을 수 없다.
		expect(isLowContrast("#ffffff", "#ffffff")).toBe(true);
	});

	it("passes a combination at or above the AA threshold", () => {
		expect(isLowContrast("#ffffff", "#000000")).toBe(false);
	});
});

describe("collectAdBannerLayoutTexts", () => {
	it("collects text from both slots for moderation", () => {
		// 한 슬롯이라도 빠지면 그 문구가 금칙어 검사를 통과해 버린다.
		const layout = createEmptyAdBannerLayout();
		layout.horizontal.texts = [
			{ ...createAdBannerTextBlock("a"), content: "가로 문구" },
		];
		layout.vertical.texts = [
			{ ...createAdBannerTextBlock("b"), content: "세로 문구" },
		];

		expect(collectAdBannerLayoutTexts(layout)).toEqual([
			"가로 문구",
			"세로 문구",
		]);
	});

	it("caps blocks per slot at the documented maximum", () => {
		expect(AD_BANNER_MAX_BLOCKS).toBe(5);
	});
});
