import {
	fetchIdentityVerification,
	isAdultBirth8,
	mapPortOneGender,
	toBirth8,
	UNDERAGE_MESSAGE,
} from "@bambi-app/api/services/portone-identity";
import { env } from "@bambi-app/env/web";
import { NextResponse } from "next/server";
import {
	type BambiGenderValue,
	GUEST_COOKIE_MAX_AGE,
	GUEST_COOKIE_NAME,
	LEGACY_ADULT_COOKIE_NAMES,
	type MockPhoneVerifyInput,
} from "@/lib/bambi/guest";
import { createGuestToken } from "@/lib/bambi/guest-token";
import { takeRateLimit } from "@/lib/bambi/rate-limit";

// 서명 키가 없으면 게스트 토큰을 만들 수 없다. 개발 편의를 위한 폴백이며, 프로덕션은
// env(web.ts)의 부팅 가드가 누락을 막는다.
const DEV_GUEST_TOKEN_SECRET = "bambi-dev-guest-token-secret-not-for-prod";

const guestTokenSecret = (): string =>
	env.BAMBI_GUEST_TOKEN_SECRET ?? DEV_GUEST_TOKEN_SECRET;

// 본인인증은 건당 과금이라 봇이 라우트를 두드리면 비용이 샌다. IP당 시간당 10회.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const clientIp = (request: Request): string =>
	request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

const badRequest = () => NextResponse.json({ ok: false }, { status: 400 });

const underageResponse = () =>
	NextResponse.json(
		{ code: "underage", message: UNDERAGE_MESSAGE, ok: false },
		{ status: 403 }
	);

// 인증 통과 응답 — 서명 토큰 한 개만 세팅한다. httpOnly:false는 의도된 것: 클라이언트가
// 성별을 읽어 가입 시 프로필로 옮긴다. 값 위조는 서명 검증(미들웨어)에서 걸린다.
const verifiedResponse = async (gender: BambiGenderValue | null) => {
	const token = await createGuestToken({
		gender,
		maxAgeSeconds: GUEST_COOKIE_MAX_AGE,
		now: new Date(),
		secret: guestTokenSecret(),
	});
	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, token, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: GUEST_COOKIE_MAX_AGE,
	});
	return response;
};

// 실인증 흐름 — 클라이언트가 보낸 identityVerificationId의 진위를 포트원 단건조회로
// 서버가 직접 확인한다. 인증창 결과를 그대로 믿지 않는다.
const handleRealVerification = async (identityVerificationId: string) => {
	const apiSecret = env.PORTONE_API_SECRET;
	if (!apiSecret) {
		return NextResponse.json({ ok: false }, { status: 503 });
	}
	const verification = await fetchIdentityVerification(
		apiSecret,
		identityVerificationId
	);
	if (verification.status !== "VERIFIED") {
		return badRequest();
	}
	const birth8 = toBirth8(verification.verifiedCustomer?.birthDate);
	// 생년월일을 못 읽으면 성인임을 증명할 수 없으므로 차단한다(안전 기본값).
	if (!(birth8 && isAdultBirth8(birth8, new Date()))) {
		return underageResponse();
	}
	return await verifiedResponse(
		mapPortOneGender(verification.verifiedCustomer?.gender)
	);
};

const parseMockInput = (
	value: Record<string, unknown>
): MockPhoneVerifyInput | null => {
	const { name, birth, phone, gender } = value;
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

// 포트원 미구성 개발 환경 전용 목 흐름. 연령 검사는 실흐름과 동일하게 적용해 개발에서도
// 미성년 차단 UX를 검증할 수 있게 한다.
const handleMockVerification = async (body: Record<string, unknown>) => {
	const isMockAllowed =
		!env.PORTONE_API_SECRET && process.env.NODE_ENV !== "production";
	if (!isMockAllowed) {
		return badRequest();
	}
	const input = parseMockInput(body);
	if (!input) {
		return badRequest();
	}
	if (!isAdultBirth8(input.birth, new Date())) {
		return underageResponse();
	}
	return await verifiedResponse(input.gender);
};

export async function POST(request: Request) {
	if (
		!takeRateLimit({
			key: clientIp(request),
			limit: RATE_LIMIT,
			now: Date.now(),
			windowMs: RATE_WINDOW_MS,
		})
	) {
		return NextResponse.json({ ok: false }, { status: 429 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest();
	}
	if (typeof body !== "object" || body === null) {
		return badRequest();
	}
	const record = body as Record<string, unknown>;

	try {
		if (typeof record.identityVerificationId === "string") {
			return await handleRealVerification(record.identityVerificationId);
		}
		return await handleMockVerification(record);
	} catch {
		// 포트원 API 실패 등 — 상세를 클라이언트에 흘리지 않는다.
		return NextResponse.json({ ok: false }, { status: 502 });
	}
}

// 게스트 쿠키 만료. 회원가입·로그인으로 세션이 생기거나 로그아웃할 때 호출해,
// 로그아웃·세션 만료 후에도 게스트 열람 권한이 남는 문제를 막는다. 구 목 인증 쿠키도
// 함께 만료시켜 잔존 개인정보를 남기지 않는다.
export function DELETE() {
	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, "", {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
	for (const cookieName of LEGACY_ADULT_COOKIE_NAMES) {
		response.cookies.set(cookieName, "", {
			sameSite: "lax",
			path: "/",
			maxAge: 0,
		});
	}
	return response;
}
