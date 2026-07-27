import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATIONS,
	adBannerLayoutSchema,
} from "../../services/bambi-ad-banner-layout";

// 각 소스의 내부 정합성만 보면 "blur"를 카탈로그·서버 양쪽에 똑같이 "blurr"로 잘못 적었을 때
// 모든 테스트가 통과해버린다. 그래서 두 소스를 실제로 맞대본다.
//
// 대조 대상이 DB enum에서 웹 카탈로그로 바뀐 이유: 레이아웃이 jsonb로 옮겨가면서 배너 연출·
// 테마 pgEnum이 사라졌다. 이제 값의 원본은 웹 카탈로그이고 서버 zod가 그 사본이다.
//
// 웹 카탈로그를 모듈로 import 하지 않는 이유: apps/web은 packages/api의 tsconfig rootDir
// 밖이라(composite 프로젝트) tsc가 거부한다. 대신 이 레포의 기존 소스 스캔 테스트
// 패턴(apps/web/src/components/bambi/visual-job-components.test.ts)대로 소스를 읽어 값을 뽑는다.
const CATALOG_SOURCE = fs.readFileSync(
	path.join(
		import.meta.dirname,
		"../../../../../apps/web/src/lib/bambi/ad-banner-layout.ts"
	),
	"utf8"
);

const QUOTED_VALUE_PATTERN = /"([^"]+)"/g;

// 선언 마커 바로 뒤의 숫자를 뽑는다(`... = 20;`). 못 찾으면 던진다 — 조용히 undefined를
// 반환하면 상수 이름이 바뀌었을 때 대조가 통과해버린다.
const numberAfter = (source: string, marker: string): number => {
	const start = source.indexOf(marker);
	const value =
		start < 0
			? Number.NaN
			: Number.parseInt(source.slice(start + marker.length), 10);

	if (Number.isNaN(value)) {
		throw new Error(`소스에서 "${marker}" 뒤의 숫자를 찾지 못했습니다.`);
	}

	return value;
};

// `export const <NAME> = [ ... ]`의 배열 리터럴에서 문자열 값을 선언 순서대로 뽑는다.
const catalogValues = (constantName: string): string[] => {
	const start = CATALOG_SOURCE.indexOf(`${constantName} = [`);
	const end = CATALOG_SOURCE.indexOf("]", start);

	if (start < 0 || end < 0) {
		throw new Error(`웹 카탈로그에서 ${constantName} 배열을 찾지 못했습니다.`);
	}

	return [
		...CATALOG_SOURCE.slice(start, end).matchAll(QUOTED_VALUE_PATTERN),
	].map((match) => match[1] ?? "");
};

const createBlock = (overrides: Record<string, unknown> = {}) => ({
	align: "center",
	animation: null,
	color: "#ffffff",
	content: "주말 알바 급구",
	fontSize: 8,
	id: "block-1",
	weight: "bold",
	x: 50,
	y: 50,
	...overrides,
});

const createLayout = (slot: Record<string, unknown> = {}) => {
	const horizontal = {
		background: { type: "image" },
		scrim: { enabled: true, opacity: 65 },
		texts: [createBlock()],
		...slot,
	};

	return {
		horizontal,
		version: 1,
		vertical: { ...horizontal, texts: [] },
	};
};

const accepts = (layout: unknown): boolean =>
	adBannerLayoutSchema.safeParse(layout).success;

describe("ad banner catalog ↔ server zod parity", () => {
	// 순서까지 비교한다. 값 집합이 같아도 순서가 다르면 폼 선택지 노출 순서와 서버 목록이
	// 갈려, 로그·에러 메시지를 읽을 때 서로 다른 목록처럼 보인다.
	it("mirrors the animation catalog values in order", () => {
		expect(catalogValues("AD_BANNER_ANIMATION_VALUES")).toEqual([
			...AD_BANNER_ANIMATIONS,
		]);
	});

	// 아래 상한들이 갈리면 "폼은 통과했는데 서버가 반려"라는 사용자에게 보이는 사고가 난다.
	// 상수 이름 대조가 아니라 경계값을 실제로 넣어 본다 — 서버가 더 느슨해지는 쪽도 잡는다.
	it("mirrors the text length cap", () => {
		const cap = numberAfter(CATALOG_SOURCE, "AD_BANNER_TEXT_MAX_LENGTH = ");

		expect(
			accepts(
				createLayout({ texts: [createBlock({ content: "가".repeat(cap) })] })
			)
		).toBe(true);
		expect(
			accepts(
				createLayout({
					texts: [createBlock({ content: "가".repeat(cap + 1) })],
				})
			)
		).toBe(false);
	});

	it("mirrors the block count cap", () => {
		const cap = numberAfter(CATALOG_SOURCE, "AD_BANNER_MAX_BLOCKS = ");
		const blocks = (count: number) =>
			Array.from({ length: count }, (_, index) =>
				createBlock({ id: `block-${index}` })
			);

		expect(accepts(createLayout({ texts: blocks(cap) }))).toBe(true);
		expect(accepts(createLayout({ texts: blocks(cap + 1) }))).toBe(false);
	});

	it("mirrors the font size range", () => {
		const min = numberAfter(CATALOG_SOURCE, "AD_BANNER_FONT_SIZE_MIN = ");
		const max = numberAfter(CATALOG_SOURCE, "AD_BANNER_FONT_SIZE_MAX = ");

		expect(
			accepts(createLayout({ texts: [createBlock({ fontSize: min })] }))
		).toBe(true);
		expect(
			accepts(createLayout({ texts: [createBlock({ fontSize: max })] }))
		).toBe(true);
		expect(
			accepts(createLayout({ texts: [createBlock({ fontSize: max + 1 })] }))
		).toBe(false);
	});

	// 스크림 불투명도는 0~100 백분율이다. 서버가 CSS의 0~1 스케일로 잡히면 기본값 65가
	// 저장 단계에서 통째로 반려된다.
	it("mirrors the scrim opacity scale", () => {
		const max = numberAfter(CATALOG_SOURCE, "AD_BANNER_SCRIM_OPACITY_MAX = ");
		const fallback = numberAfter(
			CATALOG_SOURCE,
			"AD_BANNER_DEFAULT_SCRIM_OPACITY = "
		);
		const withOpacity = (opacity: number) =>
			accepts(createLayout({ scrim: { enabled: true, opacity } }));

		expect(withOpacity(fallback)).toBe(true);
		expect(withOpacity(max)).toBe(true);
		expect(withOpacity(max + 1)).toBe(false);
	});
});
