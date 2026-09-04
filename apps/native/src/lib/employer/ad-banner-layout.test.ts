import { describe, expect, it } from "vitest";

import {
	createEmptyBannerLayout,
	getSlotBackground,
	isBannerImageRequired,
	withSlotBackground,
} from "./ad-banner-layout";

describe("createEmptyBannerLayout", () => {
	// 서버 스키마가 strict라 슬롯마다 background·scrim·texts가 모두 있어야 한다.
	it("두 슬롯을 웹 기본값으로 만든다", () => {
		const layout = createEmptyBannerLayout();

		expect(layout.version).toBe(1);
		expect(layout.horizontal.background).toEqual({ type: "image" });
		expect(layout.horizontal.scrim).toEqual({ enabled: true, opacity: 65 });
		expect(layout.horizontal.texts).toEqual([]);
		expect(layout.vertical.texts).toEqual([]);
	});
});

describe("withSlotBackground", () => {
	it("고른 슬롯의 배경만 바꾼다", () => {
		const next = withSlotBackground(
			createEmptyBannerLayout(),
			"ad_horizontal",
			{
				color: "#ff0000",
				type: "color",
			}
		);

		expect(next.horizontal.background).toEqual({
			color: "#ff0000",
			type: "color",
		});
		expect(next.vertical.background).toEqual({ type: "image" });
	});

	// 앱에는 문구 편집기가 없다. 통째로 새 레이아웃을 보내면 웹에서 만든 문구가 사라진다.
	it("웹에서 만든 문구 블록을 보존한다", () => {
		const base = createEmptyBannerLayout();
		const withText = {
			...base,
			horizontal: {
				...base.horizontal,
				texts: [
					{
						align: "center" as const,
						animation: null,
						color: "#ffffff",
						content: "오픈 이벤트",
						fontSize: 8,
						id: "t1",
						weight: "bold" as const,
						width: 60,
						x: 50,
						y: 50,
					},
				],
			},
		};

		const next = withSlotBackground(withText, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});

		expect(next.horizontal.texts).toHaveLength(1);
		expect(next.horizontal.texts[0].content).toBe("오픈 이벤트");
	});

	it("레이아웃이 없던 공고는 기본값에서 시작한다", () => {
		const next = withSlotBackground(null, "ad_vertical", {
			color: "#1f2937",
			type: "color",
		});

		expect(next.vertical.background).toEqual({
			color: "#1f2937",
			type: "color",
		});
		expect(next.horizontal.background).toEqual({ type: "image" });
	});
});

describe("getSlotBackground", () => {
	it("레이아웃이 없으면 이미지 배경이 기본이다", () => {
		expect(getSlotBackground(null, "ad_horizontal")).toEqual({ type: "image" });
	});
});

describe("isBannerImageRequired", () => {
	it("이미지 배경이면 업로드가 필요하다", () => {
		expect(isBannerImageRequired(null, "ad_horizontal")).toBe(true);
	});

	// 단색으로 덮으면 업로드한 이미지가 보이지 않으므로 필수가 아니다(web과 같은 규칙).
	it("단색 배경이면 업로드가 필요 없다", () => {
		const layout = withSlotBackground(null, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});

		expect(isBannerImageRequired(layout, "ad_horizontal")).toBe(false);
		expect(isBannerImageRequired(layout, "ad_vertical")).toBe(true);
	});
});
