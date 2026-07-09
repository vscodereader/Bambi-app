import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/lib/bambi/guest";
import { resolveGate } from "@/lib/bambi/resolve-gate";

export const config = {
	// 마지막 세그먼트에 확장자가 있는 경로(icon.svg, og-image.png, favicon.ico,
	// robots.txt, sitemap.xml 등 정적·메타데이터 파일)는 프록시를 아예 거치지 않는다.
	// 게이트 리다이렉트 대상은 페이지 경로뿐이다.
	matcher: ["/((?!_next/static|_next/image|.*\\.[^/]+$).*)"],
};

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// RSC prefetch 요청은 게이트 리다이렉트를 건너뛴다. 한 화면에 있는 다수의 <Link>가
	// 게이트된 경로를 prefetch 하면 요청마다 307 리다이렉트가 쏟아져 "과다 리다이렉트"를
	// 유발한다. 실제 이동(클릭)에는 prefetch 헤더가 없어 게이트가 정상 동작한다.
	const isPrefetch =
		request.headers.get("next-router-prefetch") !== null ||
		request.headers.get("purpose") === "prefetch";
	if (isPrefetch) {
		return NextResponse.next();
	}

	const hasSession = Boolean(getSessionCookie(request));
	const isGuest = request.cookies.get(GUEST_COOKIE_NAME)?.value === "1";

	const decision = resolveGate({ pathname, hasSession, isGuest });

	if (decision.type === "redirect") {
		return NextResponse.redirect(new URL(decision.to, request.url));
	}

	return NextResponse.next();
}
