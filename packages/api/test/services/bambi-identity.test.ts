import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveVerifiedIdentity } from "@/services/bambi-identity";

const NOT_READY = /본인인증이 아직 준비되지 않았어요/;

// 포트원 단건조회는 전역 fetch로만 나간다 — 이 모듈은 db·env를 쓰지 않으므로
// fetch만 스텁하면 네트워크·DB 없이 검증할 수 있다.
const stubVerification = (channelType?: string) => {
	const body = {
		channel: channelType ? { type: channelType } : undefined,
		status: "VERIFIED",
		verifiedCustomer: {
			birthDate: "1995-03-02",
			ci: "ci-sample",
			di: "di-sample",
			gender: "FEMALE",
			phoneNumber: "010-1234-5678",
		},
	};
	global.fetch = (async () => ({
		ok: true,
		json: async () => body,
	})) as unknown as typeof fetch;
};

beforeEach(() => {
	// 개발 진단 로그(allowTestChannel일 때만 남는다)가 테스트 출력을 더럽히지 않게 막는다.
	vi.spyOn(console, "log").mockImplementation(() => {
		// noop
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("resolveVerifiedIdentity — 채널 가드", () => {
	it("옵션을 생략하면 TEST 채널을 거부한다(안전 기본값)", async () => {
		stubVerification("TEST");

		await expect(resolveVerifiedIdentity("secret", "iv-1")).rejects.toThrow(
			NOT_READY
		);
	});

	it("allowTestChannel이면 TEST 채널도 통과한다(개발 환경)", async () => {
		stubVerification("TEST");

		const identity = await resolveVerifiedIdentity("secret", "iv-2", {
			allowTestChannel: true,
		});

		expect(identity.birth8).toBe("19950302");
		expect(identity.gender).toBe("female");
	});

	it("LIVE 채널은 옵션 없이도 통과한다", async () => {
		stubVerification("LIVE");

		const identity = await resolveVerifiedIdentity("secret", "iv-3");

		expect(identity.birth8).toBe("19950302");
	});
});
