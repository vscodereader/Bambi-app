import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/screens/moderator.tsx"),
	"utf8"
);

describe("운영자 공고 검수 상세 카드 폭", () => {
	it("데스크톱 카드가 헤더 콘텐츠의 좌우 여백 안에 배치된다", () => {
		expect(source).toContain(
			"lg:mx-6 lg:mb-6 lg:flex-none lg:gap-6 lg:overflow-visible lg:rounded-2xl"
		);
	});
});
