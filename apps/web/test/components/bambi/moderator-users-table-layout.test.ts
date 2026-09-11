import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/moderator-users-table.tsx"),
	"utf8"
);
const USER_CHECKBOX_ARIA_PATTERN = /aria-label=\{`\$\{user\.name\} 선택`\}/;

describe("운영자 사용자 테이블 선택 열", () => {
	it("출석 관리처럼 체크박스 열에 선 없이 고정 여백을 둔다", () => {
		expect(source).toContain(
			'const SELECT_COLUMN_CLASS = "w-10 !p-2 align-middle"'
		);
		expect(source).toContain("headerClassName: SELECT_COLUMN_CLASS");
		expect(source).toContain("cellClassName: SELECT_COLUMN_CLASS");
		expect(source).toContain('aria-label="전체 선택"');
		expect(source).toMatch(USER_CHECKBOX_ARIA_PATTERN);
		expect(source).not.toContain("border-r");
	});

	it("접속 열을 선택 열과 이름 사이에 두고 기존 표 높이를 유지한다", () => {
		expect(source.indexOf('id: "select"')).toBeLessThan(
			source.indexOf('id: "presence"')
		);
		expect(source.indexOf('id: "presence"')).toBeLessThan(
			source.indexOf('id: "name"')
		);
		expect(source).toContain('initialSort={{ dir: "desc", id: "presence" }}');
		expect(source).toContain('rowClassName="h-14"');
		expect(source).toContain('reservedPageRowHeight="3.5rem"');
	});

	it("문자 수 하드코딩 없이 실제 셀 폭에서 말줄임한다", () => {
		expect(source).not.toContain("truncateName");
		expect(source).not.toContain("truncateEmail");
		expect(source).toContain("max-w-28 truncate whitespace-nowrap");
		expect(source).toContain("max-w-36 truncate");
		expect(source).toContain("max-w-44 truncate");
	});
});
