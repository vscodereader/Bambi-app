import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

// 내 정보(마이페이지) 메뉴는 사이드바 내비(공용 셸)와 데스크톱 허브 카드(구직자 화면)
// 두 곳에 나뉘어 있다. 역할별 숨김이 한쪽에만 걸려 다른 쪽으로 되살아나는 회귀를 막는다.
const read = (path: string) =>
	readFileSync(srcPath(`components/bambi/${path}`), "utf8");
const shell = read("./my-page-shell.tsx");
const seeker = read("./screens/seeker.tsx");
const employerMe = read("../../app/employer/me/page.tsx");

describe("내 정보 메뉴 역할별 숨김", () => {
	// 숨김 표의 키는 역할명 뒤에 배열이 온다(ROLE_LABELS의 employer 라벨과 구분).
	it("구인자는 감추는 항목이 없다", () => {
		expect(shell).not.toContain("employer: [");
	});

	it("운영자는 신고·면접·차단·고객센터를 감춘다", () => {
		for (const href of [
			"/seeker/me/reports",
			"/seeker/me/interviews",
			"/seeker/me/blocks",
			"/support",
		]) {
			expect(shell).toContain(`\t\t"${href}",`);
		}
	});

	it("숨김 판정은 역할(useBambiAuth)로 하고 두 화면이 같은 표를 쓴다", () => {
		expect(shell).toContain("const { role } = useBambiAuth();");
		expect(shell).toContain("isMyPageItemVisible(item.href, role)");
		expect(seeker).toContain("const { role } = useBambiAuth();");
		expect(seeker).toContain("isMyPageItemVisible(section.href, role)");
	});

	it("구인자 전용 업체 정보 화면에도 신고·면접·차단 링크가 모두 있다", () => {
		expect(employerMe).toContain("/seeker/me/reports");
		expect(employerMe).toContain("/seeker/me/interviews");
		expect(employerMe).toContain("예정된 면접");
		expect(employerMe).toContain("/seeker/me/blocks");
	});
});
