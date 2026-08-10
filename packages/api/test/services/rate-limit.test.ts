import { describe, expect, it } from "vitest";
import { UNKNOWN_CLIENT_IP } from "@/services/client-ip";
import {
	CHAT_SEND_RATE_LIMIT_WINDOW_MS,
	DEFAULT_PUBLIC_RATE_LIMIT,
	GUEST_VERIFY_RATE_LIMIT_SCOPE,
	IDENTITY_RATE_LIMIT,
	PUBLIC_RATE_LIMIT_WINDOW_MS,
	REALTIME_CONNECT_RATE_LIMIT,
	resolveChatSendRateLimit,
	resolvePublicRateLimit,
	resolveRealtimeConnectRateLimit,
	takeRateLimit,
	UNKNOWN_IP_LIMIT_MULTIPLIER,
} from "@/services/rate-limit";

const WINDOW = 60_000;

describe("takeRateLimit", () => {
	it("한도까지 허용하고 초과분은 막는다", () => {
		const base = { key: "ip-a", limit: 3, windowMs: WINDOW };

		expect(takeRateLimit({ ...base, now: 0 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 1 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 2 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 3 })).toBe(false);
	});

	it("윈도가 지나면 다시 허용한다", () => {
		const base = { key: "ip-b", limit: 1, windowMs: WINDOW };

		expect(takeRateLimit({ ...base, now: 0 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 1 })).toBe(false);
		expect(takeRateLimit({ ...base, now: WINDOW + 1 })).toBe(true);
	});

	it("키가 다르면 서로 영향이 없다", () => {
		expect(
			takeRateLimit({ key: "ip-c", limit: 1, now: 0, windowMs: WINDOW })
		).toBe(true);
		expect(
			takeRateLimit({ key: "ip-d", limit: 1, now: 0, windowMs: WINDOW })
		).toBe(true);
	});
});

const IDENTITY_SCOPE = "bambi.onboarding.startIdentityVerification";
const RECOVERY_SCOPE = "bambi.accountRecovery.lookupAccountByIdentity";

describe("resolvePublicRateLimit", () => {
	it("버킷 키는 경로와 IP를 함께 쓴다", () => {
		expect(
			resolvePublicRateLimit({ clientIp: "203.0.113.9", scope: IDENTITY_SCOPE })
				.key
		).toBe(`${IDENTITY_SCOPE}:203.0.113.9`);
	});

	it("프로시저가 다르면 버킷이 나뉜다", () => {
		expect(
			resolvePublicRateLimit({ clientIp: "203.0.113.9", scope: IDENTITY_SCOPE })
				.key
		).not.toBe(
			resolvePublicRateLimit({ clientIp: "203.0.113.9", scope: RECOVERY_SCOPE })
				.key
		);
	});

	it("본인인증 경로는 한도를 올려 잡는다", () => {
		expect(
			resolvePublicRateLimit({ clientIp: "203.0.113.9", scope: IDENTITY_SCOPE })
				.limit
		).toBe(IDENTITY_RATE_LIMIT);
		expect(
			resolvePublicRateLimit({
				clientIp: "203.0.113.9",
				scope: GUEST_VERIFY_RATE_LIMIT_SCOPE,
			}).limit
		).toBe(IDENTITY_RATE_LIMIT);
		expect(IDENTITY_RATE_LIMIT).toBeGreaterThan(DEFAULT_PUBLIC_RATE_LIMIT);
	});

	it("그 밖의 공개 프로시저는 기본 한도를 유지한다", () => {
		expect(
			resolvePublicRateLimit({ clientIp: "203.0.113.9", scope: RECOVERY_SCOPE })
				.limit
		).toBe(DEFAULT_PUBLIC_RATE_LIMIT);
	});

	// IP를 못 구하면 모두가 한 버킷을 쓴다 — 1인 기준 한도를 그대로 걸면 몇 명이 전체를 잠근다.
	it("IP 미상 버킷은 한도를 완화하되 무제한은 아니다", () => {
		const unknown = resolvePublicRateLimit({
			clientIp: UNKNOWN_CLIENT_IP,
			scope: RECOVERY_SCOPE,
		});

		expect(unknown.limit).toBe(
			DEFAULT_PUBLIC_RATE_LIMIT * UNKNOWN_IP_LIMIT_MULTIPLIER
		);
		expect(Number.isFinite(unknown.limit)).toBe(true);
	});

	it("윈도는 1시간 고정", () => {
		expect(
			resolvePublicRateLimit({ clientIp: "203.0.113.9", scope: IDENTITY_SCOPE })
				.windowMs
		).toBe(PUBLIC_RATE_LIMIT_WINDOW_MS);
	});
});

describe("resolveChatSendRateLimit", () => {
	// 로그인 경로라 버킷 축은 IP가 아니라 계정이다(같은 IP의 다른 사용자를 잠그지 않는다).
	it("버킷 키는 동작과 계정을 함께 쓴다", () => {
		expect(
			resolveChatSendRateLimit({ action: "sendMessage", userId: "user-1" }).key
		).toBe("chats.sendMessage:user-1");
	});

	it("동작이 다르면 버킷이 나뉜다", () => {
		expect(
			resolveChatSendRateLimit({ action: "sendMessage", userId: "user-1" }).key
		).not.toBe(
			resolveChatSendRateLimit({ action: "proposeInterview", userId: "user-1" })
				.key
		);
	});

	it("계정이 다르면 버킷이 나뉜다", () => {
		expect(
			resolveChatSendRateLimit({ action: "sendMessage", userId: "user-1" }).key
		).not.toBe(
			resolveChatSendRateLimit({ action: "sendMessage", userId: "user-2" }).key
		);
	});

	it("비용이 큰 동작일수록 한도가 낮다", () => {
		const message = resolveChatSendRateLimit({
			action: "sendMessage",
			userId: "user-1",
		});
		const interview = resolveChatSendRateLimit({
			action: "proposeInterview",
			userId: "user-1",
		});

		expect(message.limit).toBeGreaterThan(interview.limit);
		expect(message.windowMs).toBe(CHAT_SEND_RATE_LIMIT_WINDOW_MS);
	});

	it("한도를 넘으면 같은 창에서 더 받지 않는다", () => {
		const { key, limit, windowMs } = resolveChatSendRateLimit({
			action: "sendMessage",
			userId: "rate-limited-user",
		});

		for (let attempt = 0; attempt < limit; attempt += 1) {
			expect(takeRateLimit({ key, limit, now: attempt, windowMs })).toBe(true);
		}

		expect(takeRateLimit({ key, limit, now: limit, windowMs })).toBe(false);
	});
});

describe("resolveRealtimeConnectRateLimit", () => {
	it("버킷 키는 채널과 IP를 함께 쓴다", () => {
		expect(
			resolveRealtimeConnectRateLimit({
				clientIp: "203.0.113.9",
				scope: "sse",
			}).key
		).toBe("realtime.sse:203.0.113.9");
	});

	it("채널이 다르면 버킷이 나뉜다", () => {
		expect(
			resolveRealtimeConnectRateLimit({ clientIp: "203.0.113.9", scope: "sse" })
				.key
		).not.toBe(
			resolveRealtimeConnectRateLimit({
				clientIp: "203.0.113.9",
				scope: "socket",
			}).key
		);
	});

	it("IP 미상 버킷은 완화하되 무제한은 아니다", () => {
		const unknown = resolveRealtimeConnectRateLimit({
			clientIp: UNKNOWN_CLIENT_IP,
			scope: "sse",
		});

		expect(unknown.limit).toBe(
			REALTIME_CONNECT_RATE_LIMIT * UNKNOWN_IP_LIMIT_MULTIPLIER
		);
		expect(Number.isFinite(unknown.limit)).toBe(true);
	});
});
