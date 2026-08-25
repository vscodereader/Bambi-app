import {
	GUEST_COOKIE_NAME,
	resolveGuestTokenSecret,
	verifyGuestToken,
} from "@bambi-app/api/services/bambi-guest-token";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { resolveGate } from "@/lib/bambi/resolve-gate";

export const config = {
	matcher: [
		// 마지막 세그먼트에 확장자가 있는 경로(icon.svg, og-image.png, favicon.ico,
		// robots.txt, sitemap.xml 등 정적·메타데이터 파일)는 프록시를 아예 거치지 않는다.
		// 게이트 리다이렉트 대상은 페이지 경로뿐이다.
		"/((?!_next/static|_next/image|.*\\.[^/]+$).*)",
		// 예외: IndexNow 키 파일(/{key}.txt)만 통과시킨다. 키가 동적(env)이라 정적 라우트로
		// 둘 수 없어 여기서 가로챈다 — 아래 proxy() 최상단이 200 text로 응답한다. robots.txt
		// 등 다른 .txt도 이 패턴에 걸리지만 키가 아니면 평소 흐름(게이트=통과)으로 흘러간다.
		"/((?!_next/static|_next/image).*\\.txt$)",
	],
};

// /api/guest 라우트·api 서버의 서명 키와 같은 값이어야 한다. edge 미들웨어라
// @bambi-app/env를 거치지 않고 process.env를 직접 읽는다(개발 폴백은 공용 상수).
const guestTokenSecret = (): string =>
	resolveGuestTokenSecret(
		process.env.BAMBI_GUEST_TOKEN_SECRET,
		process.env.NODE_ENV
	);

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// IndexNow 검증 파일(/{key}.txt): 키 그대로를 text/plain 200으로 돌려준다. resolve-gate의
	// 미존재 경로 처리보다 먼저, 세션·게스트 판정 전에 응답해 크롤러(비로그인)도 읽게 한다.
	// edge라 @bambi-app/env 대신 process.env를 직접 읽는다(guestTokenSecret와 동일).
	const indexNowKey = process.env.INDEXNOW_KEY;
	if (indexNowKey && pathname === `/${indexNowKey}.txt`) {
		return new NextResponse(indexNowKey, {
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	}

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
	const guest = guestToken
		? await verifyGuestToken(guestToken, guestTokenSecret(), new Date())
		: null;
	// 수다방 입장은 gid까지 있는 여성 토큰만 — api의 게스트 액터 판정
	// (bambi-community-authz의 resolveCommunityActor)과 같은 축이다.
	const isCommunityGuest = Boolean(guest?.gender && guest.gid);

	const decision = resolveGate({
		hasSession,
		isCommunityGuest,
		isGuest: guest !== null,
		pathname,
	});

	if (decision.type === "redirect") {
		return NextResponse.redirect(
			new URL(decision.to, request.url),
			decision.permanent ? 308 : 307
		);
	}

	return NextResponse.next();
}
