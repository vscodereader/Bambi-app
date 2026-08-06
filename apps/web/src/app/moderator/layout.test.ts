import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("moderator nav 재편", () => {
	it("채용정보(/seeker) 외부 링크를 제거한다", () => {
		expect(source).not.toContain("채용정보");
		expect(source).not.toContain('"/seeker"');
	});
	it("신고·사용자를 회원 관리 그룹으로 묶는다", () => {
		expect(source).toContain('label: "회원 관리"');
	});
	it("회원 관리 그룹에 채팅 관리 nav를 추가한다", () => {
		expect(source).toContain('label: "채팅"');
		expect(source).toContain("/moderator/chats");
	});
	it("회원 관리 그룹에 면접 일정 nav를 추가한다", () => {
		expect(source).toContain('label: "면접 일정"');
		expect(source).toContain("/moderator/interviews");
	});
	it("콘텐츠·고객센터 그룹명을 콘텐츠로 정리한다", () => {
		expect(source).toContain('label: "콘텐츠"');
		expect(source).not.toContain("콘텐츠·고객센터");
	});
});
