import { describe, expect, it } from "vitest";

import {
	getLoginIdErrorMessage,
	isValidLoginId,
	LOGIN_ID_MAX_LENGTH,
	normalizeLoginId,
} from "@/login-id";

describe("login id 규칙", () => {
	it.each([
		"bambi",
		"bambi-alba",
		"bambi_alba",
		"bambi.alba",
		"BambiAlba",
		"a-1",
		"a".repeat(LOGIN_ID_MAX_LENGTH),
	])("%s는 허용한다", (value) => {
		expect(getLoginIdErrorMessage(value)).toBeNull();
		expect(isValidLoginId(value)).toBe(true);
	});

	it.each([
		"",
		"ab",
		"a".repeat(LOGIN_ID_MAX_LENGTH + 1),
		"bambi alba",
		"bambi@alba",
		"밤비알바",
		"bambi!",
		"bambi/alba",
	])("%s는 거부한다", (value) => {
		expect(getLoginIdErrorMessage(value)).not.toBeNull();
		expect(isValidLoginId(value)).toBe(false);
	});

	it("거부 사유를 한국어로 알려준다", () => {
		expect(getLoginIdErrorMessage("ab")).toContain("3자 이상");
		expect(getLoginIdErrorMessage("a".repeat(31))).toContain("30자");
		expect(getLoginIdErrorMessage("bambi@alba")).toContain("하이픈(-)");
	});

	// 이메일과 한 칸으로 받는 로그인 입력이 "@" 하나로 갈리는 전제(web login-id.ts)를
	// 규칙 쪽에서 못 박아 둔다 — 아이디에 "@"가 허용되면 그 분기가 무너진다.
	it("아이디에 @는 들어갈 수 없다", () => {
		expect(isValidLoginId("a@b")).toBe(false);
	});

	it("대문자는 소문자로 정규화한다", () => {
		expect(normalizeLoginId("BambiAlba-1")).toBe("bambialba-1");
	});
});
