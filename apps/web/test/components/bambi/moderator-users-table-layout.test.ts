import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/moderator-users-table.tsx"),
	"utf8"
);

describe("운영자 사용자 테이블 선택 열", () => {
	it("체크박스 열과 이름 열 사이에 세로 구분선을 둔다", () => {
		expect(source).toContain(
			'const SELECT_COLUMN_BORDER = "border-border border-r"'
		);
		expect(source).toContain("headerClassName: SELECT_COLUMN_BORDER");
		expect(source).toContain("cellClassName: SELECT_COLUMN_BORDER");
	});
});
