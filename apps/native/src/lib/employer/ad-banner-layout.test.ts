import { describe, expect, it } from "vitest";

import {
	addTextBlock,
	createEmptyBannerLayout,
	findBannerLayoutIssue,
	isLowContrast,
	removeTextBlock,
	updateTextBlock,
	withSlot,
} from "./ad-banner-layout";

describe("addTextBlock", () => {
	it("문구를 추가할 때마다 좌표를 어긋나게 놓고 id가 겹치지 않는다", () => {
		const first = addTextBlock(null, "horizontal");
		const second = addTextBlock(first.layout, "horizontal");

		// 첫 블록은 중앙(50), 둘째는 6% 어긋나 겹치지 않는다.
		expect(first.block.x).toBe(50);
		expect(first.block.y).toBe(50);
		expect(second.block.x).toBe(56);
		expect(second.block.y).toBe(56);
		expect(second.block.id).not.toBe(first.block.id);
		expect(second.layout.horizontal.texts).toHaveLength(2);
	});
});

describe("updateTextBlock", () => {
	it("숫자 범위를 접는다(fontSize 99→20, x −5→0)", () => {
		const added = addTextBlock(null, "horizontal");
		const next = updateTextBlock(added.layout, "horizontal", added.block.id, {
			fontSize: 99,
			x: -5,
		});

		expect(next.horizontal.texts[0].fontSize).toBe(20);
		expect(next.horizontal.texts[0].x).toBe(0);
	});

	it("이미지 배경에서 글리치를 고르면 꺼져 있던 스크림을 자동으로 켠다", () => {
		const withScrimOff = withSlot(createEmptyBannerLayout(), "horizontal", {
			scrim: { enabled: false, opacity: 50 },
		});
		const added = addTextBlock(withScrimOff, "horizontal");
		const next = updateTextBlock(added.layout, "horizontal", added.block.id, {
			animation: "glitch",
		});

		expect(next.horizontal.scrim.enabled).toBe(true);
	});
});

describe("removeTextBlock", () => {
	it("id로 블록을 지운다", () => {
		const added = addTextBlock(null, "horizontal");
		const next = removeTextBlock(added.layout, "horizontal", added.block.id);

		expect(next.horizontal.texts).toHaveLength(0);
	});
});

describe("findBannerLayoutIssue", () => {
	const required = ["ad_horizontal"] as const;

	it("레이아웃이 없으면 null이다", () => {
		expect(findBannerLayoutIssue(null, required)).toBeNull();
	});

	it("빈 문구가 있으면 그 슬롯 결함을 짚는다", () => {
		const added = addTextBlock(null, "horizontal");
		const blank = updateTextBlock(added.layout, "horizontal", added.block.id, {
			content: "   ",
		});

		expect(findBannerLayoutIssue(blank, required)?.slot).toBe("horizontal");
	});

	it("단색 배경에 문구가 하나도 없으면 결함이다", () => {
		const colorOnly = withSlot(createEmptyBannerLayout(), "horizontal", {
			background: { color: "#1f2937", type: "color" },
		});

		expect(findBannerLayoutIssue(colorOnly, required)?.slot).toBe("horizontal");
	});

	it("요구 슬롯이 아닌 곳의 결함은 무시한다", () => {
		// 세로형에만 단색+문구 0 결함이 있지만 요구 슬롯은 가로형뿐이라 통과한다.
		const verticalIssue = withSlot(createEmptyBannerLayout(), "vertical", {
			background: { color: "#1f2937", type: "color" },
		});

		expect(findBannerLayoutIssue(verticalIssue, required)).toBeNull();
	});
});

describe("isLowContrast", () => {
	it("어두운 배경 위 흰 글자는 저대비가 아니다", () => {
		expect(isLowContrast("#1f2937", "#ffffff")).toBe(false);
	});

	it("어두운 배경 위 어두운 글자는 저대비다", () => {
		expect(isLowContrast("#1f2937", "#111827")).toBe(true);
	});
});
