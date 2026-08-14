import { describe, expect, it } from "vitest";

import { getPortOneReturnUrl } from "@/lib/bambi/portone-verification-return";

describe("PortOne 모바일 인증 복귀 URL", () => {
	it("인증 결과만 제거하고 회원가입 의도는 유지한다", () => {
		const params = new URLSearchParams({
			auth: "signup",
			identityVerificationId: "identity-id",
		});

		expect(getPortOneReturnUrl("/seeker", params)).toBe("/seeker?auth=signup");
	});

	it("오류 결과를 제거하면서 기존 화면 쿼리를 보존한다", () => {
		const params = new URLSearchParams({
			code: "FAILURE",
			guestBlocked: "1",
			message: "cancelled",
			mode: "sign-up",
		});

		expect(getPortOneReturnUrl("/seeker", params)).toBe(
			"/seeker?guestBlocked=1&mode=sign-up"
		);
	});
});
