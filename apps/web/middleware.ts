import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/lib/bambi/guest";
import { resolveGate } from "@/lib/bambi/resolve-gate";

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const hasSession = Boolean(getSessionCookie(request));
	const isGuest = request.cookies.get(GUEST_COOKIE_NAME)?.value === "1";

	const decision = resolveGate({ pathname, hasSession, isGuest });

	if (decision.type === "redirect") {
		return NextResponse.redirect(new URL(decision.to, request.url));
	}

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-bambi-pathname", pathname);
	return NextResponse.next({ request: { headers: requestHeaders } });
}
