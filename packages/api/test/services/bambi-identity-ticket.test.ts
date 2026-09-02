import { describe, expect, it, vi } from "vitest";

vi.mock("@bambi-app/db", () => ({
	db: { insert: () => ({ values: async () => undefined }) },
}));

import { issueIdentityVerificationId } from "@/services/bambi-identity-ticket";

const KCP_ID_PATTERN = /^[A-Za-z0-9]{1,40}$/;

describe("issueIdentityVerificationId", () => {
	// KCP 인증창은 identityVerificationId에 "영문 대소문자·숫자만, 40자 이하"를 요구한다.
	// 운영 MID는 하이픈을 눈감아 주지만 테스트 MID는 500으로 거부해, 하이픈이 섞인
	// `iv-<uuid>` 형식은 테스트 채널에서 인증창 호출이 통째로 실패했다.
	it("KCP 제약(영문 대소문자·숫자만, 40자 이하)에 맞는 ID를 발급한다", async () => {
		const id = await issueIdentityVerificationId();
		expect(id).toMatch(KCP_ID_PATTERN);
	});

	it("발급마다 서로 다른 ID를 만든다", async () => {
		expect(await issueIdentityVerificationId()).not.toBe(
			await issueIdentityVerificationId()
		);
	});
});
