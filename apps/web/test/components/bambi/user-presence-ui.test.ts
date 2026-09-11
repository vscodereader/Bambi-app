import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const usersPage = readFileSync(srcPath("app/moderator/users/page.tsx"), "utf8");
const attendancePage = readFileSync(
	srcPath("app/moderator/attendance/page.tsx"),
	"utf8"
);
const detailSource = readFileSync(
	srcPath("components/bambi/screens/moderator.tsx"),
	"utf8"
);
const indicatorSource = readFileSync(
	srcPath("components/bambi/user-presence-indicator.tsx"),
	"utf8"
);
const RAW_HEX_COLOR_PATTERN = /#[0-9a-f]{3,8}/i;

describe("운영자 사용자 접속 상태 UI", () => {
	it("검색과 같은 첫 번째 행 오른쪽에 분 단위 설정을 둔다", () => {
		expect(usersPage).toContain(
			'<div className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm">'
		);
		expect(usersPage).toContain("오프라인 기준 : 마지막 활동기준");
		expect(usersPage.indexOf("오프라인 기준 : 마지막 활동기준")).toBeLessThan(
			usersPage.indexOf('htmlFor="filter-role"')
		);
		expect(usersPage).toContain("updatePresencePolicy.mutate");
	});

	it("상태 원은 체크박스와 같은 디자인 크기이며 색상 외 이름을 제공한다", () => {
		expect(indicatorSource).toContain("size-4 gap-0 p-0");
		expect(indicatorSource).toContain("[&>span]:size-4");
		expect(indicatorSource).toContain("aria-label={label}");
		expect(indicatorSource).toContain('isOnline ? "success" : "secondary"');
		expect(indicatorSource).not.toMatch(RAW_HEX_COLOR_PATTERN);
	});

	it("출석 표도 선택과 회원 사이에 접속 열을 두고 회원을 한 줄로 만든다", () => {
		const presenceHeader = attendancePage.indexOf(">접속</TableHead>");
		const memberHeader = attendancePage.indexOf(">회원</TableHead>");
		expect(presenceHeader).toBeGreaterThan(-1);
		expect(presenceHeader).toBeLessThan(memberHeader);
		expect(attendancePage).toContain(
			"flex min-w-0 max-w-40 items-center gap-1.5 whitespace-nowrap"
		);
		expect(attendancePage).not.toContain('className="flex flex-col gap-0.5"');
		expect(attendancePage).toContain('className="h-14 cursor-pointer"');
	});

	it("사용자 상세에 별도 접속 배지와 마지막 활동을 표시한다", () => {
		expect(detailSource).toContain("<UserPresenceIndicator");
		expect(detailSource).toContain("withLabel");
		expect(detailSource).toContain('label="마지막 활동"');
		expect(detailSource).toContain("마지막 활동 기록 없음");
	});
});
