import { describe, expect, it } from "vitest";
import { resolveChatPreflight } from "./chat-preflight";

const ready = {
	blocked: false,
	profileRole: "job_seeker",
	verified: true,
	visitorState: "member" as const,
};

describe("chat preflight", () => {
	it("로그인 구직자 프로필과 휴대폰 인증이 있고 차단이 없을 때만 통과한다", () => {
		expect(resolveChatPreflight(ready).canContinue).toBe(true);
		expect(
			resolveChatPreflight({ ...ready, verified: false }).canContinue
		).toBe(false);
		expect(resolveChatPreflight({ ...ready, blocked: true }).canContinue).toBe(
			false
		);
	});
	it("비회원과 다른 역할은 통과하지 않는다", () => {
		expect(
			resolveChatPreflight({ ...ready, visitorState: "guest" }).canContinue
		).toBe(false);
		expect(
			resolveChatPreflight({ ...ready, profileRole: "employer" }).canContinue
		).toBe(false);
	});
});
