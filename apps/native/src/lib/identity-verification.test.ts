import { describe, expect, it } from "vitest";

import {
	buildIdentityRelayUrl,
	IDENTITY_RETURN_URL,
	parseIdentityReturnUrl,
} from "./identity-verification";

describe("buildIdentityRelayUrl", () => {
	it("복귀 스킴만 쿼리로 실어 릴레이 주소를 만든다(인증 건은 싣지 않는다)", () => {
		expect(buildIdentityRelayUrl("https://bambialba.com")).toBe(
			"https://bambialba.com/app-verify?redirect=bambi-app%3A%2F%2F%2Fme%2Fsettings"
		);
	});

	it("env의 trailing slash를 정리해 // 를 만들지 않는다", () => {
		expect(buildIdentityRelayUrl("https://bambialba.com/")).toContain(
			"https://bambialba.com/app-verify?"
		);
	});
});

describe("IDENTITY_RETURN_URL", () => {
	// host가 붙으면 expo-router가 그것을 경로로 읽어(+not-found) 복귀가 깨진다.
	it("host 없는 절대 경로라 expo-router의 실제 라우트에 매칭된다", () => {
		expect(new URL(IDENTITY_RETURN_URL).host).toBe("");
		expect(new URL(IDENTITY_RETURN_URL).pathname).toBe("/me/settings");
	});
});

describe("parseIdentityReturnUrl", () => {
	it("인증 건이 실려 돌아오면 그 ID와 함께 verified다", () => {
		expect(
			parseIdentityReturnUrl(
				`${IDENTITY_RETURN_URL}?identityVerificationId=iv123`
			)
		).toEqual({ identityVerificationId: "iv123", status: "verified" });
	});

	it("code가 실리면 실패이고 message를 그대로 쓴다", () => {
		expect(
			parseIdentityReturnUrl(
				`${IDENTITY_RETURN_URL}?code=FAILURE_TYPE_A&message=${encodeURIComponent("취소했어요")}`
			)
		).toEqual({ message: "취소했어요", status: "failed" });
	});

	it("code만 있고 message가 비면 기본 문구로 채운다", () => {
		expect(
			parseIdentityReturnUrl(`${IDENTITY_RETURN_URL}?code=X&message=`)
		).toEqual({ message: "인증이 완료되지 않았어요.", status: "failed" });
	});

	it("identityVerificationId가 2개 이상이면(스머글링 조작) 통째로 버린다", () => {
		expect(
			parseIdentityReturnUrl(
				`${IDENTITY_RETURN_URL}?identityVerificationId=evil&identityVerificationId=real`
			)
		).toEqual({ status: "unknown" });
	});

	it("딥링크가 없거나 다른 주소이거나 파라미터가 없으면 unknown이다", () => {
		expect(parseIdentityReturnUrl(null)).toEqual({ status: "unknown" });
		expect(
			parseIdentityReturnUrl("https://evil.example/me/settings?code=1")
		).toEqual({ status: "unknown" });
		expect(parseIdentityReturnUrl(IDENTITY_RETURN_URL)).toEqual({
			status: "unknown",
		});
	});
});
