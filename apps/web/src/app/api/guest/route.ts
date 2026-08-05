import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	createGuestToken,
	DEV_GUEST_TOKEN_SECRET,
	GUEST_COOKIE_NAME,
} from "@bambi-app/api/services/bambi-guest-token";
import {
	isAdultBirth8,
	UNDERAGE_MESSAGE,
} from "@bambi-app/api/services/portone-identity";
import { takeRateLimit } from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/web";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { NextResponse } from "next/server";
import {
	type BambiGenderValue,
	GUEST_COOKIE_MAX_AGE,
	LEGACY_ADULT_COOKIE_NAMES,
	type MockPhoneVerifyInput,
} from "@/lib/bambi/guest";

const guestTokenSecret = (): string =>
	env.BAMBI_GUEST_TOKEN_SECRET ?? DEV_GUEST_TOKEN_SECRET;

// 본인인증은 건당 과금이라 봇이 라우트를 두드리면 비용이 샌다. IP당 시간당 10회.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const clientIp = (request: Request): string =>
	request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

const badRequest = (message?: string) =>
	NextResponse.json(message ? { message, ok: false } : { ok: false }, {
		status: 400,
	});

// 실인증 검증은 서버(@bambi-app/api)에 맡긴다. 인증 건의 발급 기록·유효시간·소진 여부는
// DB에 있는데 web은 @bambi-app/db 의존성이 없어(전송 계층만 가진 앱) 직접 볼 수 없다.
// 여기서 포트원을 다시 조회해 봐야 "이 ID를 우리가 발급했는가"는 알 수 없으므로,
// 진위·연령·재사용 판정을 한 곳(onboarding.checkIdentityForSignup)에 모은다.
// utils/orpc의 공용 client를 쓰지 않는 이유: 그 링크는 들어온 요청 헤더를 통째로
// 전달하는데(SSR 쿠키 전달용), 라우트 핸들러에서는 원 요청의 content-type·content-length가
// 딸려가 RPC 본문이 깨진다. 이 호출은 로그인 전이라 쿠키도 필요 없다.
const rpc: AppRouterClient = createORPCClient(
	new RPCLink({ url: `${env.NEXT_PUBLIC_SERVER_URL}/rpc` })
);

const underageResponse = () =>
	NextResponse.json(
		{ code: "underage", message: UNDERAGE_MESSAGE, ok: false },
		{ status: 403 }
	);

// 인증 통과 응답 — 서명 토큰 한 개만 세팅한다. httpOnly:false는 의도된 것: 클라이언트가
// 성별을 읽어 가입 시 프로필로 옮긴다. 값 위조는 서명 검증(미들웨어)에서 걸린다.
// secure는 본인확인 결과 토큰의 평문 전송을 막기 위해 무조건 켠다(세션 쿠키와 동일 정책 —
// packages/auth advanced.defaultCookieAttributes). localhost는 secure 컨텍스트라 개발 무영향.
// 인증 건 ID는 싣지 않는다: 유효시간이 30분인 값을 30일짜리 쿠키에 JS로 읽히게 두면
// 공용 PC·XSS에서 그대로 새어 나가고, 만료 뒤엔 어차피 쓸 수도 없다(자체점검 항목 4).
// 대신 게스트 식별자(gid)가 실린다 — 수다방 게스트 글·댓글·추천의 소유·중복방지 키이며,
// 발급 시점에 만들어지므로 이 라우트를 다시 타면(재인증) 새 게스트로 취급된다.
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
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: GUEST_COOKIE_MAX_AGE,
	});
	return response;
};

// 실인증 흐름 — 클라이언트가 보낸 identityVerificationId를 그대로 믿지 않는다.
// 서버가 (1) 우리가 발급한 인증 건인지 (2) 아직 소진되지 않았고 유효시간 안인지
// (3) 포트원 단건조회로 인증이 실제 완료됐고 성인인지를 확인한다. 여기서는 소진시키지
// 않는다 — 같은 인증 건으로 곧이어 프로필 생성이 이어지고, 그쪽이 최종 소비자다.
const handleRealVerification = async (identityVerificationId: string) => {
	if (!env.PORTONE_API_SECRET) {
		return NextResponse.json({ ok: false }, { status: 503 });
	}
	try {
		const { gender } = await rpc.bambi.onboarding.checkIdentityForSignup({
			identityVerificationId,
			// 비회원 인증 흐름 — 수집 로그의 구분을 guest로 남긴다(가입하면 역할로 덮인다).
			source: "guest",
		});
		return await verifiedResponse(gender);
	} catch (error) {
		if (error instanceof ORPCError) {
			// 미성년(FORBIDDEN)은 전용 코드로 안내하고, 재사용·미완료 인증(BAD_REQUEST)은
			// 서버 문구를 그대로 내려 "다시 인증해 주세요"가 사용자에게 보이게 한다.
			if (error.code === "FORBIDDEN") {
				return underageResponse();
			}
			if (error.code === "BAD_REQUEST") {
				return badRequest(error.message);
			}
		}
		// 포트원·서버 장애 등 — 상세를 흘리지 않고 POST의 502 폴백에 맡긴다.
		throw error;
	}
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
		secure: true,
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
