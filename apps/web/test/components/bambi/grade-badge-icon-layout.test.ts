import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/grade-badge.tsx"),
	"utf8"
);

describe("회원 등급 뱃지 아이콘 배치", () => {
	it("고정 높이를 해제해 아이콘이 뱃지 높이를 결정한다", () => {
		expect(source).toContain('className="h-auto min-h-5 gap-1 text-sm"');
		expect(source).toContain('"size-6 shrink-0 object-contain"');
	});
});
