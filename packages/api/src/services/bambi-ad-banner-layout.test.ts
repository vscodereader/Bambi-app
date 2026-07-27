import { describe, expect, it } from "vitest";

import {
	adBannerLayoutSchema,
	collectLayoutTexts,
} from "./bambi-ad-banner-layout";

const validBlock = {
	align: "center",
	animation: "blur",
	color: "#ffffff",
	content: "주말 알바 급구",
	fontSize: 8,
	id: "block-1",
	weight: "bold",
	x: 50,
	y: 50,
};

const validSlot = {
	background: { type: "image" },
	scrim: { enabled: true, opacity: 65 },
	texts: [validBlock],
};

const validLayout = {
	horizontal: validSlot,
	version: 1,
	vertical: { ...validSlot, texts: [] },
};

describe("adBannerLayoutSchema", () => {
	it("accepts a well-formed layout", () => {
		expect(adBannerLayoutSchema.safeParse(validLayout).success).toBe(true);
	});

	it("accepts the default scrim opacity", () => {
		// 불투명도는 0~100 백분율이다. CSS의 0~1로 잡으면 기본값 65가 전부 반려된다.
		expect(
			adBannerLayoutSchema.safeParse({
				...validLayout,
				horizontal: { ...validSlot, scrim: { enabled: true, opacity: 100 } },
			}).success
		).toBe(true);
	});

	it("rejects coordinates outside the canvas", () => {
		// 좌표는 백분율이라 범위를 벗어나면 렌더에서 슬롯 밖으로 나간다.
		const layout = {
			...validLayout,
			horizontal: { ...validSlot, texts: [{ ...validBlock, x: 140 }] },
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects a malformed color", () => {
		const layout = {
			...validLayout,
			horizontal: { ...validSlot, texts: [{ ...validBlock, color: "red" }] },
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects an alpha hex color", () => {
		// 8자리를 통과시키면 웹 대비 계산이 알파를 무시해 "완전 투명인데 대비 21"로 읽고
		// 저대비 경고가 조용히 꺼진다.
		const layout = {
			...validLayout,
			horizontal: {
				...validSlot,
				texts: [{ ...validBlock, color: "#ffffff00" }],
			},
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects more blocks than the cap", () => {
		const texts = Array.from({ length: 6 }, (_, index) => ({
			...validBlock,
			id: `block-${index}`,
		}));

		expect(
			adBannerLayoutSchema.safeParse({
				...validLayout,
				horizontal: { ...validSlot, texts },
			}).success
		).toBe(false);
	});

	it("rejects unknown keys", () => {
		// JSON 저장이라 DB 제약이 없다. 클라이언트가 임의 필드를 실어 보내면 그대로 들어간다.
		const layout = {
			...validLayout,
			horizontal: {
				...validSlot,
				texts: [{ ...validBlock, script: "alert(1)" }],
			},
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects an unknown animation value", () => {
		const layout = {
			...validLayout,
			horizontal: {
				...validSlot,
				texts: [{ ...validBlock, animation: "shiny" }],
			},
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});
});

describe("collectLayoutTexts", () => {
	it("collects text from both slots", () => {
		const layout = {
			...validLayout,
			vertical: {
				...validSlot,
				texts: [{ ...validBlock, content: "세로 문구", id: "block-2" }],
			},
		};

		expect(collectLayoutTexts(layout)).toEqual(["주말 알바 급구", "세로 문구"]);
	});

	it("returns an empty array for a malformed value", () => {
		// 검수 경로가 저장된 JSON을 다시 읽을 때 형태를 신뢰할 수 없다.
		expect(collectLayoutTexts(null)).toEqual([]);
		expect(collectLayoutTexts({ nope: true })).toEqual([]);
	});
});
