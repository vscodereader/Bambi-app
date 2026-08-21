import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/grade-badge.tsx"),
	"utf8"
);

describe("등급 아이콘 레이아웃", () => {
	it("아이콘 크기와 contain을 유지하고 배지 overflow로 자르지 않는다", () => {
		expect(source).toContain('"size-6 shrink-0 object-contain"');
		expect(source).toContain("h-auto min-h-7");
		expect(source).toContain("overflow-visible");
	});
});
