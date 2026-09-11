import { describe, expect, it } from "vitest";
import {
	createGuestToken,
	DEV_GUEST_TOKEN_SECRET,
	decodeGuestTokenGender,
	GUEST_TOKEN_MAX_AGE_MS,
	GUEST_TOKEN_MAX_AGE_SECONDS,
	isGuestIdentityFresh,
	readGuestTokenFromCookieString,
	resolveGuestTokenSecret,
	verifyGuestToken,
} from "@/services/bambi-guest-token";

const SECRET = "test-secret-key-with-enough-length-123456";
const NOW = new Date("2026-07-21T03:00:00Z");
const BASE64_PADDING = /=+$/;
const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;

const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;

const toBase64Url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes))
		.replace(BASE64_PLUS, "-")
		.replace(BASE64_SLASH, "_")
		.replace(BASE64_PADDING, "");

// 쿠키에 실제로 담기는 평문 페이로드. parsePayload는 모르는 필드를 버리므로,
// "쿠키에 무엇이 들어 있는가"는 원문을 직접 봐야 알 수 있다.
const rawPayload = (token: string): Record<string, unknown> =>
	JSON.parse(
		atob(
			(token.split(".")[0] ?? "")
				.replace(BASE64URL_DASH, "+")
				.replace(BASE64URL_UNDERSCORE, "/")
		)
	) as Record<string, unknown>;

const makeToken = () =>
	createGuestToken({
		gender: "female",
		maxAgeSeconds: 3600,
		now: NOW,
		secret: SECRET,
	});

describe("guest token", () => {
	it("개발 환경에서는 프로세스별 env 설정과 관계없이 공통 개발 키를 쓴다", () => {
		expect(resolveGuestTokenSecret("web-only-secret", "development")).toBe(
			DEV_GUEST_TOKEN_SECRET
		);
		expect(resolveGuestTokenSecret(undefined, "test")).toBe(
			DEV_GUEST_TOKEN_SECRET
		);
	});

	it("운영 환경에서는 설정된 운영 키를 쓴다", () => {
		expect(resolveGuestTokenSecret(SECRET, "production")).toBe(SECRET);
	});

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

	it("게스트 토큰 유효기간은 30일(2592000초)이다 — 웹 쿠키 maxAge와 동일", () => {
		expect(GUEST_TOKEN_MAX_AGE_SECONDS).toBe(2_592_000);
		expect(GUEST_TOKEN_MAX_AGE_MS).toBe(GUEST_TOKEN_MAX_AGE_SECONDS * 1000);
	});

	it("게스트 인증 기록도 토큰 수명과 같은 경계 안에서만 재사용한다", () => {
		const now = new Date("2026-09-08T03:00:00.000Z");
		expect(
			isGuestIdentityFresh(
				new Date(now.getTime() - GUEST_TOKEN_MAX_AGE_MS + 1),
				now
			)
		).toBe(true);
		expect(
			isGuestIdentityFresh(
				new Date(now.getTime() - GUEST_TOKEN_MAX_AGE_MS),
				now
			)
		).toBe(false);
	});

	it("Cookie 헤더 문자열에서 토큰만 뽑는다", async () => {
		const token = await makeToken();

		expect(
			readGuestTokenFromCookieString(`other=1; bambi_guest=${token}; a=b`)
		).toBe(token);
		expect(readGuestTokenFromCookieString("bambi_guest=")).toBeNull();
		expect(readGuestTokenFromCookieString("other=1")).toBeNull();
	});
});

// 구 버전이 발급한 토큰을 재현한다(현재 createGuestToken으로는 만들 수 없는 페이로드).
const signLegacyPayload = async (payload: unknown) => {
	const encoder = new TextEncoder();
	const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
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
	return `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`;
};

describe("게스트 토큰 — 게스트 식별자(gid)", () => {
	it("발급 토큰에는 gid가 실리고 인증 건 ID는 실리지 않는다", async () => {
		const token = await makeToken();
		// 쿠키는 httpOnly:false라 document.cookie로 그대로 읽힌다 — 원문 키 목록이
		// 성별·만료·버전·gid뿐이어야 인증 건 ID가 새지 않는다.
		expect(Object.keys(rawPayload(token)).sort()).toEqual([
			"exp",
			"gender",
			"gid",
			"v",
		]);
		const payload = await verifyGuestToken(token, SECRET, NOW);
		expect(payload).toMatchObject({ gender: "female", v: 2 });
		expect(payload?.gid).toEqual(expect.any(String));
	});

	it("발급마다 다른 gid를 준다", async () => {
		const [first, second] = await Promise.all([makeToken(), makeToken()]);

		expect(rawPayload(first).gid).not.toBe(rawPayload(second).gid);
	});

	it("기존 v1 토큰도 계속 유효하되 gid가 없다", async () => {
		const token = await signLegacyPayload({
			exp: Math.floor(NOW.getTime() / 1000) + 3600,
			gender: "male",
			v: 1,
		});
		const payload = await verifyGuestToken(token, SECRET, NOW);

		expect(payload).toMatchObject({ gender: "male", v: 1 });
		expect(payload?.gid).toBeUndefined();
	});

	it("ivId가 남아 있는 구 v2 토큰도 유효하되 ivId는 버려진다", async () => {
		const token = await signLegacyPayload({
			exp: Math.floor(NOW.getTime() / 1000) + 3600,
			gender: "female",
			ivId: "iv-abc",
			v: 2,
		});

		expect(await verifyGuestToken(token, SECRET, NOW)).toEqual({
			exp: Math.floor(NOW.getTime() / 1000) + 3600,
			gender: "female",
			v: 2,
		});
	});
});
