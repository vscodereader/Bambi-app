import { resolveGuestTokenSecret } from "@bambi-app/api/services/bambi-guest-token";
import {
	createSupportChatToken,
	SUPPORT_CHAT_COOKIE_MAX_AGE,
	SUPPORT_CHAT_COOKIE_NAME,
} from "@bambi-app/api/services/bambi-support-chat-token";
import { resolveClientIp } from "@bambi-app/api/services/client-ip";
import { takeRateLimit } from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/web";
import { NextResponse } from "next/server";

// 익명 문의 신원 발급. 본인인증 없이 열려 있으므로 IP당 발급 속도만 끊는다 —
// 발신 자체는 서버 sendMessage 리밋이 다시 막는다.
const ISSUE_LIMIT = 5;
const ISSUE_WINDOW_MS = 60_000;

const clientIp = (request: Request): string =>
	resolveClientIp({
		directIp: request.headers.get("x-vercel-forwarded-for"),
		forwardedFor: request.headers.get("x-forwarded-for"),
		trustedProxyHops: 0,
	});

export async function POST(request: Request) {
	const key = `supportChat.issue:ip:${clientIp(request)}`;
	if (
		!takeRateLimit({
			key,
			limit: ISSUE_LIMIT,
			now: Date.now(),
			windowMs: ISSUE_WINDOW_MS,
		})
	) {
		return NextResponse.json({ ok: false }, { status: 429 });
	}
	const token = await createSupportChatToken({
		maxAgeSeconds: SUPPORT_CHAT_COOKIE_MAX_AGE,
		now: new Date(),
		secret: resolveGuestTokenSecret(
			env.BAMBI_GUEST_TOKEN_SECRET,
			process.env.NODE_ENV
		),
	});
	const response = NextResponse.json({ ok: true });
	// httpOnly:false는 의도된 것 — 쿠키가 host-only라 api 서버에 안 실리므로 JS가
	// 읽어 x-bambi-support-chat 헤더로 옮긴다(게스트 쿠키와 동일 방식). 값 위조는
	// 서버의 HMAC 검증에서 걸린다.
	response.cookies.set({
		httpOnly: false,
		maxAge: SUPPORT_CHAT_COOKIE_MAX_AGE,
		name: SUPPORT_CHAT_COOKIE_NAME,
		path: "/",
		sameSite: "lax",
		secure: true,
		value: token,
	});
	return response;
}
