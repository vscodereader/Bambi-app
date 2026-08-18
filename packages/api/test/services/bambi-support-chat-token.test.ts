import { describe, expect, it } from "vitest";

import { createGuestToken } from "@/services/bambi-guest-token";
import {
	createSupportChatToken,
	readSupportChatTokenFromCookieString,
	SUPPORT_CHAT_COOKIE_NAME,
	verifySupportChatToken,
} from "@/services/bambi-support-chat-token";

const SECRET = "test-secret";
const NOW = new Date("2026-08-18T00:00:00Z");
const UUID_RE = /[0-9a-f-]{36}/;

describe("support chat token", () => {
	it("생성한 토큰은 검증을 통과하고 sid를 돌려준다", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		const payload = await verifySupportChatToken(token, SECRET, NOW);
		expect(payload?.sid).toMatch(UUID_RE);
		expect(payload?.v).toBe(1);
	});

	it("만료된 토큰은 null", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 60,
			now: NOW,
			secret: SECRET,
		});
		const later = new Date(NOW.getTime() + 61_000);
		expect(await verifySupportChatToken(token, SECRET, later)).toBeNull();
	});

	it("서명이 다르면 null", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		expect(await verifySupportChatToken(token, "other-secret", NOW)).toBeNull();
	});

	it("게스트 토큰(gid 페이로드)은 문의 토큰으로 인정하지 않는다", async () => {
		// 같은 시크릿으로 서명돼도 sid 필드가 없으면 거부 — 쿠키 상호 오용(성인인증
		// 게이트 우회의 역방향) 차단의 핵심.
		const guestToken = await createGuestToken({
			gender: null,
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		expect(await verifySupportChatToken(guestToken, SECRET, NOW)).toBeNull();
	});

	it("쿠키 문자열에서 토큰을 뽑는다", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		const cookie = `a=1; ${SUPPORT_CHAT_COOKIE_NAME}=${token}; b=2`;
		expect(readSupportChatTokenFromCookieString(cookie)).toBe(token);
		expect(readSupportChatTokenFromCookieString("a=1")).toBeNull();
	});
});
