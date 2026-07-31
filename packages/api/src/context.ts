import type { IncomingHttpHeaders } from "node:http";

import { auth } from "@bambi-app/auth";
import { fromNodeHeaders } from "better-auth/node";

// 레이트리밋 버킷 키로 쓸 클라이언트 IP. 프록시가 기록한 x-forwarded-for의 첫 항목이
// 원 클라이언트다(web의 /api/guest 라우트와 같은 규칙 — 두 곳이 어긋나면 한도가 달라진다).
// 헤더에서 파생하므로 createContext의 시그니처는 그대로 두고 호출부 3곳이 영향받지 않는다.
const clientIpFromHeaders = (req: IncomingHttpHeaders): string => {
	const forwarded = req["x-forwarded-for"];
	const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
	return raw?.split(",")[0]?.trim() || "unknown";
};

export async function createContext(req: IncomingHttpHeaders) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req),
	});
	return {
		auth: null,
		clientIp: clientIpFromHeaders(req),
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
