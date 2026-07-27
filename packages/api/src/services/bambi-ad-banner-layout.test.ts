import { describe, expect, it } from "vitest";

import {
	adBannerLayoutSchema,
	collectLayoutModerationText,
	collectLayoutTexts,
	parseStoredAdBannerLayout,
} from "./bambi-ad-banner-layout";

// width 도입 이전에 저장된 블록의 모양. jsonb라 백필 마이그레이션이 없으므로 운영 DB의
// 기존 행은 전부 이 형태다.
const legacyBlock = {
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

const validBlock = { ...legacyBlock, width: 60 };

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

const createLayoutWithoutWidth = () => {
	const slot = { ...validSlot, texts: [legacyBlock] };

	return { horizontal: slot, version: 1, vertical: { ...slot, texts: [] } };
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

	it("rejects duplicate block ids", () => {
		// id가 겹치면 렌더러의 key가 충돌하고, 에디터에서 한 블록을 고치면 같은 id를 가진
		// 블록에 전부 적용된다.
		const layout = {
			...validLayout,
			horizontal: {
				...validSlot,
				texts: [validBlock, { ...validBlock, content: "다른 문구" }],
			},
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("accepts the width bounds and rejects values outside them", () => {
		const withWidth = (width: number) =>
			adBannerLayoutSchema.safeParse({
				...validLayout,
				horizontal: { ...validSlot, texts: [{ ...validBlock, width }] },
			}).success;

		expect(withWidth(10)).toBe(true);
		expect(withWidth(100)).toBe(true);
		expect(withWidth(9)).toBe(false);
		expect(withWidth(101)).toBe(false);
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

describe("parseStoredAdBannerLayout", () => {
	it("returns the stored layout when it is well formed", () => {
		expect(parseStoredAdBannerLayout(validLayout)).toEqual(validLayout);
	});

	it("width가 없는 기존 레이아웃을 기본값으로 채워 통과시킨다", () => {
		// 이 스키마 변경 이전에 저장된 모든 레이아웃이 이 모양이다. 반려하면 읽기 경로가
		// null로 떨어뜨려 운영 중인 프리미엄 배너가 전부 사라진다.
		const parsed = parseStoredAdBannerLayout(createLayoutWithoutWidth());

		expect(parsed).not.toBeNull();
		expect(parsed?.horizontal.texts[0]?.width).toBe(60);
	});

	it("returns null for a stored row that lost its shape", () => {
		// 캐스팅만 하면 이런 행 하나가 렌더러의 layout[slot].texts에서 터진다. 이 배너 레일은
		// 마켓플레이스·공고상세·채팅목록에 붙어 있어 한 광고주의 행이 화면 전체를 내린다.
		expect(
			parseStoredAdBannerLayout({ horizontal: validSlot, version: 1 })
		).toBe(null);
		expect(parseStoredAdBannerLayout({ ...validLayout, version: 2 })).toBe(
			null
		);
		expect(parseStoredAdBannerLayout(null)).toBe(null);
	});
});

describe("collectLayoutModerationText", () => {
	it("joins blocks in reading order, not array order", () => {
		// "미성"과 "년"을 나란히 놓으면 배너에는 "미성년"으로 보이지만 블록별로만 검사하면
		// 금칙어에 걸리지 않는다. 배열 순서(=추가 순서)로 이으면 나중에 추가한 블록을 앞으로
		// 끌어다 놓는 것만으로 다시 빠져나간다.
		const layout = {
			...validLayout,
			horizontal: {
				...validSlot,
				texts: [
					{ ...validBlock, content: "년", id: "added-first", x: 60 },
					{ ...validBlock, content: "미성", id: "added-second", x: 20 },
				],
			},
		};

		expect(collectLayoutModerationText(layout)).toContain("미성년");
	});

	it("covers the vertical slot too", () => {
		// 한쪽 슬롯만 조립하면 그 슬롯 문구가 금칙어 검사를 통째로 빠져나간다.
		const layout = {
			...validLayout,
			vertical: {
				...validSlot,
				texts: [{ ...validBlock, content: "세로 문구", id: "block-2" }],
			},
		};

		expect(collectLayoutModerationText(layout)).toContain("세로 문구");
	});

	it("returns an empty string for a malformed value", () => {
		expect(collectLayoutModerationText({ nope: true })).toBe("");
	});
});
