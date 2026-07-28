import { describe, expect, it } from "vitest";
import { isEmailLoginId } from "./login-id";

describe("isEmailLoginId", () => {
	it("이메일은 이메일로 판별한다", () => {
		expect(isEmailLoginId("seeker@bambialba.com")).toBe(true);
	});

	it("아이디는 이메일로 보지 않는다", () => {
		// username 플러그인 기본 검증이 허용하는 형태(영문·숫자·언더스코어).
		expect(isEmailLoginId("bambi_seeker01")).toBe(false);
	});

	it("빈 값은 아이디 쪽으로 둔다 — 미입력 오류는 검증이 따로 잡는다", () => {
		expect(isEmailLoginId("")).toBe(false);
	});
});
