import type { IncomingHttpHeaders } from "node:http";

import { auth } from "@bambi-app/auth";
import { env } from "@bambi-app/env/server";
import { fromNodeHeaders } from "better-auth/node";

import {
	DEV_GUEST_TOKEN_SECRET,
	readGuestTokenFromCookieString,
	verifyGuestToken,
} from "./services/bambi-guest-token";

// 레이트리밋 버킷 키로 쓸 클라이언트 IP. 프록시가 기록한 x-forwarded-for의 첫 항목이
// 원 클라이언트다(web의 /api/guest 라우트와 같은 규칙 — 두 곳이 어긋나면 한도가 달라진다).
// 헤더에서 파생하므로 createContext의 시그니처는 그대로 두고 호출부 3곳이 영향받지 않는다.
const clientIpFromHeaders = (req: IncomingHttpHeaders): string => {
	const forwarded = req["x-forwarded-for"];
	const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
	return raw?.split(",")[0]?.trim() || "unknown";
};

// 비회원(게스트) 신원. 본인인증을 통과한 게스트만 값이 있고, gid는 게스트 글·댓글의
// 소유자 키이자 추천 중복방지·레이트리밋 버킷 키다.
export interface GuestIdentity {
	gender: "female" | "male" | null;
	gid: string;
}

const guestTokenSecret = (): string =>
	env.BAMBI_GUEST_TOKEN_SECRET ?? DEV_GUEST_TOKEN_SECRET;

const headerValue = (
	req: IncomingHttpHeaders,
	name: string
): string | undefined => {
	const raw = req[name];
	return Array.isArray(raw) ? raw[0] : raw;
};

// 게스트 쿠키는 host-only라 다른 호스트인 이 서버에 자동으로 실리지 않는다. 브라우저
// 클라이언트는 쿠키 값을 x-bambi-guest 헤더로 옮겨 보내고(web utils/orpc), SSR 경유
// 호출은 요청 헤더를 통째로 전달하므로 Cookie 헤더에 그대로 들어온다 — 둘 다 받는다.
const resolveGuest = async (
	req: IncomingHttpHeaders
): Promise<GuestIdentity | null> => {
	const token =
		headerValue(req, "x-bambi-guest") ||
		readGuestTokenFromCookieString(headerValue(req, "cookie") ?? "");
	if (!token) {
		return null;
	}
	const payload = await verifyGuestToken(token, guestTokenSecret(), new Date());
	// gid가 없는 구 토큰(v1·gid 도입 이전 v2)은 읽기 게이트 전용이다 — 쓰기 주체로
	// 세울 수 없으므로 게스트로 잡지 않는다(호출부는 재인증을 유도한다).
	if (!payload?.gid) {
		return null;
	}
	return { gender: payload.gender, gid: payload.gid };
};

export async function createContext(req: IncomingHttpHeaders) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req),
	});
	return {
		auth: null,
		clientIp: clientIpFromHeaders(req),
		guest: await resolveGuest(req),
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
