// 게스트 본인인증 토큰 — "base64url(payload).base64url(HMAC-SHA256)" 서명 쿠키 값.
// 이전의 평문 bambi_guest=1 쿠키는 devtools에서 document.cookie 한 줄로 위조돼 성인
// 게이트가 그대로 뚫렸다. 페이로드는 클라이언트도 읽을 수 있게 두고(성별 UI·가입 시 이관),
// 진위 판정은 서명을 아는 서버(미들웨어·라우트)만 한다. Web Crypto만 사용해 edge
// 미들웨어와 Node 라우트 핸들러 양쪽에서 동작한다.

import type { BambiGenderValue } from "./guest";

export interface GuestTokenPayload {
	// 만료(Unix 초). 쿠키 maxAge와 별개로 토큰 자체에도 만료를 박아, 훔친 쿠키를
	// 무기한 재사용하는 것을 막는다.
	exp: number;
	// 인증에서 확인된 성별. 가입 시 프로필로 이관한다.
	gender: BambiGenderValue | null;
	// 포트원 인증 건 식별자. 가입 폼 단계에서 서버로 되돌려 프로필에 인증 결과를
	// 기록하는 데 쓴다. 그 자체로는 개인정보가 아니며 서버 조회 없이는 의미가 없다.
	ivId?: string;
	// 1 = ivId 이전 버전(계속 유효), 2 = 현재.
	v: 1 | 2;
}

const encoder = new TextEncoder();

const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /=+$/;
const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;

const toBase64Url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes))
		.replace(BASE64_PLUS, "-")
		.replace(BASE64_SLASH, "_")
		.replace(BASE64_PADDING, "");

const fromBase64Url = (value: string): Uint8Array | null => {
	try {
		const base64 = value
			.replace(BASE64URL_DASH, "+")
			.replace(BASE64URL_UNDERSCORE, "/");
		const binary = atob(base64);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
};

const importHmacKey = (secret: string): Promise<CryptoKey> =>
	crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"]
	);

export async function createGuestToken({
	gender,
	ivId,
	maxAgeSeconds,
	now,
	secret,
}: {
	gender: BambiGenderValue | null;
	ivId?: string;
	maxAgeSeconds: number;
	now: Date;
	secret: string;
}): Promise<string> {
	const payload: GuestTokenPayload = {
		exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
		gender,
		v: 2,
	};
	if (ivId) {
		payload.ivId = ivId;
	}
	const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await importHmacKey(secret);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(payloadPart)
	);
	return `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`;
}

const parsePayload = (payloadPart: string): GuestTokenPayload | null => {
	const bytes = fromBase64Url(payloadPart);
	if (!bytes) {
		return null;
	}
	try {
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}
		const { exp, gender, ivId, v } = parsed as Record<string, unknown>;
		if ((v !== 1 && v !== 2) || typeof exp !== "number") {
			return null;
		}
		if (gender !== "male" && gender !== "female" && gender !== null) {
			return null;
		}
		if (ivId !== undefined && typeof ivId !== "string") {
			return null;
		}
		return ivId === undefined ? { exp, gender, v } : { exp, gender, ivId, v };
	} catch {
		return null;
	}
};

// 서명·만료를 검증하고 페이로드를 돌려준다. 실패는 전부 null — 게이트는 null이면 닫힌다.
export async function verifyGuestToken(
	token: string,
	secret: string,
	now: Date
): Promise<GuestTokenPayload | null> {
	const [payloadPart, signaturePart, extra] = token.split(".");
	if (!(payloadPart && signaturePart) || extra !== undefined) {
		return null;
	}
	const signature = fromBase64Url(signaturePart);
	if (!signature) {
		return null;
	}
	const key = await importHmacKey(secret);
	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature as BufferSource,
		encoder.encode(payloadPart)
	);
	if (!isValid) {
		return null;
	}
	const payload = parsePayload(payloadPart);
	if (!payload || payload.exp <= Math.floor(now.getTime() / 1000)) {
		return null;
	}
	return payload;
}

// 클라이언트에서 서명 검증 없이 성별만 읽는다(UI 분기·가입 이관용). 게이트 판정에는
// 절대 쓰지 않는다 — 위조 가능한 값이다.
export function decodeGuestTokenGender(token: string): BambiGenderValue | null {
	const payloadPart = token.split(".")[0];
	if (!payloadPart) {
		return null;
	}
	return parsePayload(payloadPart)?.gender ?? null;
}

// 클라이언트에서 서명 검증 없이 인증 ID만 읽는다(가입 폼 단계 복원용). 게이트 판정에
// 절대 쓰지 않는다 — 위조 가능한 값이며, 서버가 포트원 조회로 다시 검증한다.
export function decodeGuestTokenIvId(token: string): string | null {
	const payloadPart = token.split(".")[0];
	if (!payloadPart) {
		return null;
	}
	return parsePayload(payloadPart)?.ivId ?? null;
}
