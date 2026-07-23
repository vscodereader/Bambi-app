import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "responsive-shell.tsx"),
	"utf8"
);

describe("ResponsiveAppShell brand lockup", () => {
	it("pins the brand link so header overflow never squeezes it", () => {
		// 헤더 행에서 줄어들 수 있는 유일한 항목이 브랜드 링크였다: 내비는 w-max,
		// 우측 버튼·배지는 shrink-0이라 압축이 전부 브랜드로 몰렸다. 구인자·운영자는
		// RoleSwitchLink(구인 관리·운영자 모드)가 더 붙고 내비도 길어 먼저 터졌다.
		// 데스크톱·모바일 두 헤더 모두 고정한다.
		expect(source.match(/className="shrink-0 no-underline"/g)).toHaveLength(2);
		// 압축 대상이 되던 원래 형태가 남아 있으면 안 된다.
		expect(source).not.toContain('className="no-underline"');
	});

	it("scrolls the nav instead of overflowing the header row", () => {
		// 항목이 많은 역할(운영자 7개)은 내비 최소폭이 헤더 폭을 넘어 행 전체가 가로로
		// 넘쳤다. 내비만 줄어들고 스크롤되게 해 브랜드·우측 액션은 제자리를 지킨다.
		expect(source).toContain('<NavigationMenu className="min-w-0">');
		expect(source).toContain("overflow-x-auto");
		// 넘칠 때 앞쪽 항목이 스크롤로도 닿지 않는 justify-center 기본값을 덮는다.
		expect(source).toContain("justify-start");
	});
});
