import { NextResponse } from "next/server";
import {
	ADULT_BIRTH_COOKIE,
	ADULT_CODE_COOKIE,
	ADULT_COOKIE_NAMES,
	ADULT_NAME_COOKIE,
	ADULT_PHONE_COOKIE,
	ADULT_SEX_COOKIE,
	GUEST_COOKIE_MAX_AGE,
	GUEST_COOKIE_NAME,
	GUEST_COOKIE_VALUE,
	genderToAdultSex,
	type MockPhoneVerifyInput,
} from "@/lib/bambi/guest";

// 이름·생년월일·휴대폰은 개인정보라 클라이언트 JS에서 읽지 못하도록 httpOnly로 둔다.
// adultsex(성별)만 향후 클라이언트 성별 UI 분기를 위해 읽기를 허용한다(httpOnly:false).
const PII_COOKIE_OPTIONS = {
	httpOnly: true,
	sameSite: "lax",
	path: "/",
	maxAge: GUEST_COOKIE_MAX_AGE,
} as const;

const CLIENT_READABLE_COOKIE_OPTIONS = {
	httpOnly: false,
	sameSite: "lax",
	path: "/",
	maxAge: GUEST_COOKIE_MAX_AGE,
} as const;

// 목 인증 폼 입력 검증. 실인증 API 도입 시 이 라우트와 목 폼을 함께 걷어낸다.
const parseVerifyInput = (value: unknown): MockPhoneVerifyInput | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const { name, birth, phone, gender } = value as Record<string, unknown>;
	if (
		typeof name !== "string" ||
		typeof birth !== "string" ||
		typeof phone !== "string" ||
		(gender !== "male" && gender !== "female")
	) {
		return null;
	}
	if (name.trim() === "" || birth.trim() === "" || phone.trim() === "") {
		return null;
	}
	return {
		name: name.trim(),
		birth: birth.trim(),
		phone: phone.trim(),
		gender,
	};
};

// adultcode(CI/DI)는 실제 인증기관이 발급하는 고유 식별자. 목 단계에서는 랜덤 문자열로 대체한다.
const createMockAdultCode = (): string =>
	`${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ ok: false }, { status: 400 });
	}

	const input = parseVerifyInput(body);
	if (!input) {
		return NextResponse.json({ ok: false }, { status: 400 });
	}

	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, GUEST_COOKIE_VALUE, {
		...CLIENT_READABLE_COOKIE_OPTIONS,
	});
	response.cookies.set(
		ADULT_NAME_COOKIE,
		encodeURIComponent(input.name),
		PII_COOKIE_OPTIONS
	);
	response.cookies.set(
		ADULT_BIRTH_COOKIE,
		encodeURIComponent(input.birth),
		PII_COOKIE_OPTIONS
	);
	response.cookies.set(
		ADULT_PHONE_COOKIE,
		encodeURIComponent(input.phone),
		PII_COOKIE_OPTIONS
	);
	response.cookies.set(
		ADULT_SEX_COOKIE,
		genderToAdultSex(input.gender),
		CLIENT_READABLE_COOKIE_OPTIONS
	);
	response.cookies.set(
		ADULT_CODE_COOKIE,
		createMockAdultCode(),
		PII_COOKIE_OPTIONS
	);
	return response;
}

// 게스트 쿠키 만료. 회원가입·로그인으로 세션이 생기거나 로그아웃할 때 호출해,
// 로그아웃·세션 만료 후에도 게스트 열람 권한이 남는 문제를 막는다. 인증 결과 쿠키도
// 함께 만료시켜 잔존 개인정보를 남기지 않는다.
export function DELETE() {
	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, GUEST_COOKIE_VALUE, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
	for (const cookieName of ADULT_COOKIE_NAMES) {
		response.cookies.set(cookieName, "", {
			sameSite: "lax",
			path: "/",
			maxAge: 0,
		});
	}
	return response;
}
