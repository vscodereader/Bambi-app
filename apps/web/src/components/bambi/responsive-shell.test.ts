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
});
