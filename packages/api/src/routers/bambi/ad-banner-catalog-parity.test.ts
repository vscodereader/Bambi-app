import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATIONS,
	AD_BANNER_TEXT_ALIGNS,
	AD_BANNER_TEXT_WEIGHTS,
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

// 선언 마커부터 끝까지 자른다. 같은 문자열이 앞쪽 선언에도 있을 때(예: 인터페이스의
// `version: 1;`) 원하는 선언 안의 값을 읽기 위한 것이다. 못 찾으면 던진다.
const sourceAfter = (marker: string): string => {
	const start = CATALOG_SOURCE.indexOf(marker);

	if (start < 0) {
		throw new Error(`웹 카탈로그에서 "${marker}"를 찾지 못했습니다.`);
	}

	return CATALOG_SOURCE.slice(start);
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

	// 정렬·굵기도 같은 이유로 순서까지 맞대본다. 폼에 값을 하나 늘리면(예: "justify")
	// 구인자가 그걸 고르는 순간 배너가 아니라 프리미엄 공고 저장 전체가 반려된다.
	it("mirrors the text align catalog values in order", () => {
		expect(catalogValues("AD_BANNER_TEXT_ALIGN_VALUES")).toEqual([
			...AD_BANNER_TEXT_ALIGNS,
		]);
	});

	it("mirrors the text weight catalog values in order", () => {
		expect(catalogValues("AD_BANNER_TEXT_WEIGHT_VALUES")).toEqual([
			...AD_BANNER_TEXT_WEIGHTS,
		]);
	});

	// 웹이 편집을 시작할 때 만드는 버전이 서버가 받는 버전이어야 한다. 갈리면 저장 자체가
	// 되지 않는데 폼에는 아무 표시가 없다.
	it("accepts the version literal the web factory creates", () => {
		const version = numberAfter(
			sourceAfter("createEmptyAdBannerLayout = ()"),
			"version: "
		);

		expect(accepts({ ...createLayout(), version })).toBe(true);
		// 리터럴이 아니라 아무 숫자나 받는 상태면 위 단언은 아무것도 보장하지 않는다.
		expect(accepts({ ...createLayout(), version: version + 1 })).toBe(false);
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
		// 하한도 본다. 서버가 더 빡빡하면 폼의 최소값이 반려되고, 더 느슨하면 에디터가 막는
		// 값을 API로는 저장할 수 있다.
		expect(
			accepts(createLayout({ texts: [createBlock({ fontSize: min - 1 })] }))
		).toBe(false);
		expect(
			accepts(createLayout({ texts: [createBlock({ fontSize: max + 1 })] }))
		).toBe(false);
	});

	// 스크림 불투명도는 0~100 백분율이다. 서버가 CSS의 0~1 스케일로 잡히면 기본값 65가
	// 저장 단계에서 통째로 반려된다.
	it("mirrors the scrim opacity scale", () => {
		const min = numberAfter(CATALOG_SOURCE, "AD_BANNER_SCRIM_OPACITY_MIN = ");
		const max = numberAfter(CATALOG_SOURCE, "AD_BANNER_SCRIM_OPACITY_MAX = ");
		const fallback = numberAfter(
			CATALOG_SOURCE,
			"AD_BANNER_DEFAULT_SCRIM_OPACITY = "
		);
		const withOpacity = (opacity: number) =>
			accepts(createLayout({ scrim: { enabled: true, opacity } }));

		expect(withOpacity(fallback)).toBe(true);
		expect(withOpacity(min)).toBe(true);
		expect(withOpacity(max)).toBe(true);
		expect(withOpacity(min - 1)).toBe(false);
		expect(withOpacity(max + 1)).toBe(false);
	});
});
