import { describe, expect, it } from "vitest";
import {
	createGuestToken,
	decodeGuestTokenGender,
	decodeGuestTokenIvId,
	verifyGuestToken,
} from "./guest-token";

const SECRET = "test-secret-key-with-enough-length-123456";
const NOW = new Date("2026-07-21T03:00:00Z");
const BASE64_PADDING = /=+$/;
const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;

const toBase64Url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes))
		.replace(BASE64_PLUS, "-")
		.replace(BASE64_SLASH, "_")
		.replace(BASE64_PADDING, "");

const makeToken = () =>
	createGuestToken({
		gender: "female",
		maxAgeSeconds: 3600,
		now: NOW,
		secret: SECRET,
	});

describe("guest token", () => {
	it("서명한 토큰은 검증을 통과하고 페이로드를 돌려준다", async () => {
		const token = await makeToken();
		const payload = await verifyGuestToken(token, SECRET, NOW);

		expect(payload?.gender).toBe("female");
	});

	it("페이로드를 변조하면 서명 검증에 실패한다", async () => {
		const token = await makeToken();
		const [, signature] = token.split(".");
		const forgedPayload = btoa(
			JSON.stringify({ exp: 9_999_999_999, gender: "male", v: 1 })
		).replace(BASE64_PADDING, "");

		expect(
			await verifyGuestToken(`${forgedPayload}.${signature}`, SECRET, NOW)
		).toBeNull();
	});

	it("다른 시크릿으로 서명한 토큰은 거부한다", async () => {
		const token = await createGuestToken({
			gender: "female",
			maxAgeSeconds: 3600,
			now: NOW,
			secret: "another-secret-key-with-enough-length-99",
		});

		expect(await verifyGuestToken(token, SECRET, NOW)).toBeNull();
	});

	it("만료된 토큰은 거부한다", async () => {
		const token = await makeToken();
		const afterExpiry = new Date(NOW.getTime() + 3601 * 1000);

		expect(await verifyGuestToken(token, SECRET, afterExpiry)).toBeNull();
	});

	it("예전 평문 쿠키 값(1)은 토큰이 아니므로 거부한다", async () => {
		expect(await verifyGuestToken("1", SECRET, NOW)).toBeNull();
	});

	it("클라이언트는 서명 없이 성별만 읽을 수 있다", async () => {
		const token = await makeToken();

		expect(decodeGuestTokenGender(token)).toBe("female");
		expect(decodeGuestTokenGender("1")).toBeNull();
	});
});

describe("게스트 토큰 v2 — 인증 ID", () => {
	it("ivId를 실어 왕복한다", async () => {
		const token = await createGuestToken({
			gender: "female",
			ivId: "iv-abc",
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		const payload = await verifyGuestToken(token, SECRET, NOW);

		expect(payload).toMatchObject({ gender: "female", ivId: "iv-abc", v: 2 });
		expect(decodeGuestTokenIvId(token)).toBe("iv-abc");
	});

	it("ivId 없이 발급하면 v2이되 ivId는 없다", async () => {
		const token = await createGuestToken({
			gender: null,
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});

		expect(decodeGuestTokenIvId(token)).toBeNull();
		expect(await verifyGuestToken(token, SECRET, NOW)).toMatchObject({ v: 2 });
	});

	it("기존 v1 토큰도 계속 유효하다", async () => {
		// v1 페이로드를 직접 만들어 서명한다(구 버전이 발급한 토큰 재현).
		const encoder = new TextEncoder();
		const payloadPart = toBase64Url(
			encoder.encode(
				JSON.stringify({
					exp: Math.floor(NOW.getTime() / 1000) + 3600,
					gender: "male",
					v: 1,
				})
			)
		);
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
		const signature = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(payloadPart)
		);
		const token = `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`;

		expect(await verifyGuestToken(token, SECRET, NOW)).toMatchObject({
			gender: "male",
			v: 1,
		});
		expect(decodeGuestTokenIvId(token)).toBeNull();
	});
});
