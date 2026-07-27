import fs from "node:fs";
import path from "node:path";

import { adBannerAnimation, adBannerTheme } from "@bambi-app/db/schema/bambi";
import { describe, expect, it } from "vitest";

// 각 소스의 내부 정합성만 보면 "blur-in"을 카탈로그·DB 양쪽에 똑같이 "blurin"으로 잘못
// 적었을 때 모든 테스트가 통과해버린다. 그래서 두 소스를 실제로 맞대본다.
// 웹 카탈로그를 모듈로 import 하지 않는 이유: apps/web은 packages/api의 tsconfig rootDir
// 밖이라(composite 프로젝트) tsc가 거부한다. 대신 이 레포의 기존 소스 스캔 테스트
// 패턴(apps/web/src/components/bambi/visual-job-components.test.ts)대로 소스를 읽어 값을 뽑는다.
const CATALOG_SOURCE = fs.readFileSync(
	path.join(
		import.meta.dirname,
		"../../../../../apps/web/src/lib/bambi/ad-banner-animations.ts"
	),
	"utf8"
);

const QUOTED_VALUE_PATTERN = /"([^"]+)"/g;

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

describe("ad banner catalog ↔ DB enum parity", () => {
	// 순서까지 비교한다. 값 집합이 같아도 순서가 다르면 폼 선택지 노출 순서와 DB enum
	// 순서가 갈려, 마이그레이션·덤프를 읽을 때 서로 다른 목록처럼 보인다.
	it("mirrors the animation pgEnum values in order", () => {
		expect(catalogValues("AD_BANNER_ANIMATION_VALUES")).toEqual([
			...adBannerAnimation.enumValues,
		]);
	});

	it("mirrors the theme pgEnum values in order", () => {
		expect(catalogValues("AD_BANNER_THEME_VALUES")).toEqual([
			...adBannerTheme.enumValues,
		]);
	});
});
