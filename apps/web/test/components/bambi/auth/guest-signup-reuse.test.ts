import { describe, expect, it } from "vitest";
import { resolveGuestSignupRestoration } from "@/lib/bambi/guest-signup";

describe("비회원 인증 회원가입 복원", () => {
	it("유효한 비회원 인증은 가입 정보 입력 단계에서 재사용한다", () => {
		expect(resolveGuestSignupRestoration("available")).toEqual({
			reuseGuestVerification: true,
			step: "form",
		});
	});

	it("만료되거나 불완전한 인증은 본인인증 단계로 돌린다", () => {
		expect(resolveGuestSignupRestoration("reauthenticate")).toEqual({
			reuseGuestVerification: false,
			step: "verify",
		});
	});

	it("기존 계정과 일치하면 폼을 복원하지 않는다", () => {
		expect(resolveGuestSignupRestoration("account_exists")).toBeNull();
	});
});
