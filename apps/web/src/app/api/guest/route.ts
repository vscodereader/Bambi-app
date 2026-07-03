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
