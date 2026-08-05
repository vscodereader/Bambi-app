import {
	DEV_GUEST_TOKEN_SECRET,
	GUEST_COOKIE_NAME,
	verifyGuestToken,
} from "@bambi-app/api/services/bambi-guest-token";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { resolveGate } from "@/lib/bambi/resolve-gate";

export const config = {
	// 마지막 세그먼트에 확장자가 있는 경로(icon.svg, og-image.png, favicon.ico,
	// robots.txt, sitemap.xml 등 정적·메타데이터 파일)는 프록시를 아예 거치지 않는다.
	// 게이트 리다이렉트 대상은 페이지 경로뿐이다.
	matcher: ["/((?!_next/static|_next/image|.*\\.[^/]+$).*)"],
};

// /api/guest 라우트·api 서버의 서명 키와 같은 값이어야 한다. edge 미들웨어라
// @bambi-app/env를 거치지 않고 process.env를 직접 읽는다(개발 폴백은 공용 상수).
const guestTokenSecret = (): string =>
	process.env.BAMBI_GUEST_TOKEN_SECRET ?? DEV_GUEST_TOKEN_SECRET;

export async function proxy(request: NextRequest) {
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

	// 쿠키 prefix를 서버(auth advanced.cookiePrefix)와 맞춘다. dev/prod가 같은 apex를
	// 공유하므로 prefix가 어긋나면 세션 판정이 틀어진다. edge라 @bambi-app/env 대신
	// process.env를 직접 읽는다(guestTokenSecret와 동일). 미설정(로컬)이면 undefined →
	// better-auth 기본 prefix.
	const hasSession = Boolean(
		getSessionCookie(request, {
			cookiePrefix: process.env.BAMBI_COOKIE_PREFIX,
		})
	);
	// 게스트 여부는 쿠키 존재가 아니라 HMAC 서명 검증으로 판정한다. 평문 값 비교였을 때는
	// devtools에서 document.cookie 한 줄로 성인 게이트가 뚫렸다.
	const guestToken = request.cookies.get(GUEST_COOKIE_NAME)?.value;
	const isGuest = guestToken
		? (await verifyGuestToken(guestToken, guestTokenSecret(), new Date())) !==
			null
		: false;

	const decision = resolveGate({ pathname, hasSession, isGuest });

	if (decision.type === "redirect") {
		return NextResponse.redirect(new URL(decision.to, request.url));
	}

	return NextResponse.next();
}
