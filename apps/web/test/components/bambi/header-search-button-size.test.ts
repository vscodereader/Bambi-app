import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/job-search-command.tsx"),
	"utf8"
);

describe("공용 헤더 검색 버튼 크기", () => {
	it("별도 크기 override 없이 공통 icon-lg만 사용한다", () => {
		expect(source).toContain('size="icon-lg"');
		expect(source).not.toContain('className="size-10"');
	});
});
