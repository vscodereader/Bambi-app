import { describe, expect, it } from "vitest";

import { getAuthModeUrl } from "./auth-mode-url";

describe("인증 패널 모드 URL", () => {
	it("회원가입으로 바꾸면 auth=signup을 남긴다", () => {
		const params = new URLSearchParams({ auth: "login" });

		expect(getAuthModeUrl("/seeker", params, "sign-up")).toBe(
			"/seeker?auth=signup"
		);
	});

	it("로그인으로 바꾸면 auth=login을 남긴다", () => {
		const params = new URLSearchParams({ auth: "signup" });

		expect(getAuthModeUrl("/seeker", params, "sign-in")).toBe(
			"/seeker?auth=login"
		);
	});

	it("다른 화면 쿼리는 그대로 보존한다", () => {
		const params = new URLSearchParams({ guestBlocked: "1" });

		expect(getAuthModeUrl("/seeker", params, "sign-up")).toBe(
			"/seeker?guestBlocked=1&auth=signup"
		);
	});

	it("레거시 mode 파라미터는 제거한다", () => {
		const params = new URLSearchParams({ mode: "sign-up" });

		expect(getAuthModeUrl("/seeker", params, "sign-up")).toBe(
			"/seeker?auth=signup"
		);
	});

	it("쿼리가 비어 있어도 모드를 기록한다", () => {
		expect(getAuthModeUrl("/seeker", new URLSearchParams(), "sign-in")).toBe(
			"/seeker?auth=login"
		);
	});
});
