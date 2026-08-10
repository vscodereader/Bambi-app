import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/ad-price-tag.tsx"),
	"utf8"
);

describe("AdPriceTag 할인 표현", () => {
	it("빨강(destructive) 배지를 쓰지 않는다", () => {
		expect(source).not.toContain('variant="destructive"');
		expect(source).not.toContain("Badge");
	});
	it("원가 취소선과 차분한 할인율 텍스트를 유지한다", () => {
		expect(source).toContain("line-through");
		expect(source).toContain("% 할인");
	});
});
