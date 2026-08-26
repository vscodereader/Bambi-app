import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/moderator-users-table.tsx"),
	"utf8"
);

describe("운영자 사용자 테이블 선택 열", () => {
	it("출석 관리처럼 체크박스 열에 선 없이 고정 여백을 둔다", () => {
		expect(source).toContain(
			'const SELECT_COLUMN_CLASS = "w-10 !pl-2 !pr-0 text-center align-middle"'
		);
		expect(source).toContain("headerClassName: SELECT_COLUMN_CLASS");
		expect(source).toContain("cellClassName: SELECT_COLUMN_CLASS");
		expect(source).not.toContain("border-r");
	});
});
