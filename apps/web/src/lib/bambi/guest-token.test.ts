import { describe, expect, it } from "vitest";
import {
	createGuestToken,
	decodeGuestTokenGender,
	verifyGuestToken,
} from "./guest-token";

const SECRET = "test-secret-key-with-enough-length-123456";
const NOW = new Date("2026-07-21T03:00:00Z");
const BASE64_PADDING = /=+$/;

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
