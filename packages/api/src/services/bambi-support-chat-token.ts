import { fromBase64Url, importHmacKey, toBase64Url } from "./bambi-guest-token";

export const SUPPORT_CHAT_COOKIE_NAME = "bambi_support_chat";
// 문의 이력을 잇는 키라 게스트 쿠키(30일)보다 길게 잡는다.
export const SUPPORT_CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
// 쿠키는 host-only라 다른 호스트인 api 서버에 안 실린다 — 게스트 토큰과 같은 방식으로
// 클라이언트가 이 헤더에 옮겨 보낸다(web utils/orpc).
export const SUPPORT_CHAT_HEADER = "x-bambi-support-chat";

/**
 * 익명 문의 신원 토큰. 게스트 토큰(bambi_guest)과 같은 시크릿으로 서명하지만 필드명이
 * 다르다(sid vs gid) — 서로 상대 검증기를 통과할 수 없어, 본인인증 없이 발급되는 이
 * 토큰을 bambi_guest 자리에 옮겨 붙여 성인인증 게이트를 우회하는 길이 원천 차단된다.
 */
export interface SupportChatTokenPayload {
	exp: number;
	sid: string;
	v: 1;
}

const encoder = new TextEncoder();

export async function createSupportChatToken({
	maxAgeSeconds,
	now,
	secret,
}: {
	maxAgeSeconds: number;
	now: Date;
	secret: string;
}): Promise<string> {
	const payload: SupportChatTokenPayload = {
		exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
		sid: crypto.randomUUID(),
		v: 1,
	};
	const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await importHmacKey(secret);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(payloadPart)
	);
	return `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`;
}

const parsePayload = (payloadPart: string): SupportChatTokenPayload | null => {
	const bytes = fromBase64Url(payloadPart);
	if (!bytes) {
		return null;
	}
	try {
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}
		const { exp, sid, v } = parsed as Record<string, unknown>;
		if (v !== 1 || typeof exp !== "number") {
			return null;
		}
		if (typeof sid !== "string" || sid === "") {
			return null;
		}
		return { exp, sid, v };
	} catch {
		return null;
	}
};

// 서명·만료를 검증하고 페이로드를 돌려준다. 실패는 전부 null — 게이트는 null이면 닫힌다.
export async function verifySupportChatToken(
	token: string,
	secret: string,
	now: Date
): Promise<SupportChatTokenPayload | null> {
	const [payloadPart, signaturePart, extra] = token.split(".");
	if (!(payloadPart && signaturePart) || extra !== undefined) {
		return null;
	}
	const signature = fromBase64Url(signaturePart);
	if (!signature) {
		return null;
	}
	const key = await importHmacKey(secret);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature,
		encoder.encode(payloadPart)
	);
	if (!valid) {
		return null;
	}
	const payload = parsePayload(payloadPart);
	if (!payload || payload.exp <= Math.floor(now.getTime() / 1000)) {
		return null;
	}
	return payload;
}

export const readSupportChatTokenFromCookieString = (
	cookieString: string
): null | string => {
	for (const part of cookieString.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === SUPPORT_CHAT_COOKIE_NAME) {
			const value = rest.join("=");
			return value === "" ? null : value;
		}
	}
	return null;
};
