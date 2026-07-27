import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATION_LABELS,
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_ANIMATION_VALUES,
	AD_BANNER_TEXT_ALIGN_OPTIONS,
	AD_BANNER_TEXT_WEIGHT_OPTIONS,
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

	it("describes every option so the editor never shows a bare value", () => {
		// OPTIONS는 VALUES.map으로 만들어져 value 일치 확인은 항등식이라 아무것도 못 잡는다.
		// 실제로 갈릴 수 있는 건 설명·라벨이 비는 쪽이다.
		for (const option of AD_BANNER_ANIMATION_OPTIONS) {
			expect(option.label).toBeTruthy();
			expect(option.description).toBeTruthy();
			expect(option.label).not.toBe(option.value);
		}
	});

	it("labels every weight and align option", () => {
		// 굵기·정렬 토글의 표시 경로도 이 라벨 맵뿐이다. 값이 늘고 라벨이 빠지면 토글에
		// 빈 칸이 뜬다.
		for (const option of [
			...AD_BANNER_TEXT_WEIGHT_OPTIONS,
			...AD_BANNER_TEXT_ALIGN_OPTIONS,
		]) {
			expect(option.label).toBeTruthy();
			expect(option.label).not.toBe(option.value);
		}
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

	it("gives each slot its own objects", () => {
		// 두 슬롯이 같은 객체를 가리키면 가로 편집이 세로에 그대로 반영된다. 슬롯 생성을
		// 상수 하나로 "최적화"하면 생기는 회귀라 대입이 아니라 push로 확인해야 잡힌다.
		const layout = createEmptyAdBannerLayout();
		layout.horizontal.texts.push(createAdBannerTextBlock("a"));
		layout.horizontal.scrim.enabled = false;

		expect(layout.vertical.texts).toHaveLength(0);
		expect(layout.vertical.scrim.enabled).toBe(true);
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

	it("falls back to the center for NaN and still clamps infinities", () => {
		// 캔버스 폭이 0인 순간의 드래그는 0/0 = NaN을 낸다. NaN이 좌표에 박히면
		// JSON.stringify가 말없이 null로 바꿔 저장이 깨진다.
		expect(clampPercent(Number.NaN)).toBe(50);
		expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(100);
		expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
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

	it("ignores surrounding whitespace instead of misreading it", () => {
		// parseInt는 선행 공백을 건너뛰므로 " #3f3f3f"가 NaN 없이 "그럴듯하지만 틀린" 휘도를 낸다.
		// 그러면 NaN 가드조차 걸리지 않아 대비 경고가 통째로 무력화된다.
		expect(contrastRatio(" #ffffff ", "#000000")).toBeCloseTo(21, 1);
		expect(isLowContrast("#333333", " #3f3f3f")).toBe(true);
	});

	it("reports no contrast for an unparsable color", () => {
		// NaN을 흘리면 모든 비교가 false가 되어 경고가 조용히 꺼진다. 모르면 경고하는 쪽으로.
		expect(contrastRatio("검정", "#ffffff")).toBe(1);
		expect(isLowContrast("검정", "#ffffff")).toBe(true);
		// 자릿수가 어긋난 hex를 조용히 3채널로 잘라 읽지 않는다.
		expect(contrastRatio("#12345", "#ffffff")).toBe(1);
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
});
