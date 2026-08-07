import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
	new URL("./layout.tsx", import.meta.url),
	"utf8"
);
const navigationSource = readFileSync(
	new URL("../../lib/bambi/moderator-navigation.ts", import.meta.url),
	"utf8"
);

describe("moderator nav 재편", () => {
	it("채용정보(/seeker) 외부 링크를 제거한다", () => {
		expect(navigationSource).not.toContain("채용정보");
		expect(navigationSource).not.toContain('"/seeker"');
	});
	it("신고·사용자를 회원 관리 그룹으로 묶는다", () => {
		expect(navigationSource).toContain('label: "회원 관리"');
	});
	it("회원 관리 그룹에 채팅 관리 nav를 추가한다", () => {
		expect(navigationSource).toContain('label: "채팅"');
		expect(navigationSource).toContain("/moderator/chats");
	});
	it("회원 관리 그룹에 면접 일정 nav를 추가한다", () => {
		expect(navigationSource).toContain('label: "면접 일정"');
		expect(navigationSource).toContain("/moderator/interviews");
	});
	it("콘텐츠·고객센터 그룹명을 콘텐츠로 정리한다", () => {
		expect(navigationSource).toContain('label: "콘텐츠"');
		expect(navigationSource).not.toContain("콘텐츠·고객센터");
	});

	it("레이아웃과 모바일 더보기에서 같은 내비게이션 정의를 쓴다", () => {
		expect(layoutSource).toContain("MODERATOR_NAV_ITEMS");
	});
});
