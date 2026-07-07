import { NextResponse } from "next/server";
import {
	GUEST_COOKIE_MAX_AGE,
	GUEST_COOKIE_NAME,
	GUEST_COOKIE_VALUE,
} from "@/lib/bambi/guest";

export function POST() {
	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, GUEST_COOKIE_VALUE, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: GUEST_COOKIE_MAX_AGE,
	});
	return response;
}

// 게스트 쿠키 만료. 회원가입·로그인으로 세션이 생기거나 로그아웃할 때 호출해,
// 로그아웃·세션 만료 후에도 게스트 열람 권한이 남는 문제를 막는다.
export function DELETE() {
	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, GUEST_COOKIE_VALUE, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
	return response;
}
