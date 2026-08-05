import {
	decodeGuestTokenGender,
	readGuestTokenFromCookieString,
} from "@bambi-app/api/services/bambi-guest-token";

// 쿠키 이름(GUEST_COOKIE_NAME)은 토큰 모듈이 소유한다 — api 서버도 Cookie 헤더에서
// 같은 이름을 찾으므로, 필요한 쪽에서 직접 import 한다.
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// 실인증(포트원) 이전의 목 인증 쿠키들. 더는 발급하지 않지만 기존 방문자 브라우저에
// 남아 있어 로그인·로그아웃 시 함께 만료시킨다. 신규 코드에서 읽지 말 것.
export const LEGACY_ADULT_COOKIE_NAMES = [
	"adultname",
	"adultbrith",
	"adultphone",
	"adultsex",
	"adultcode",
] as const;

export type BambiGenderValue = "male" | "female";

// 포트원 미구성 개발 환경 전용 목 인증 폼이 서버 라우트로 보내는 입력.
export interface MockPhoneVerifyInput {
	birth: string;
	gender: BambiGenderValue;
	name: string;
	phone: string;
}

// 클라이언트에서 게스트 쿠키의 존재만 본다(내비게이션 UI 분기용). 진위 판정은 서버
// 미들웨어가 서명 검증으로 한다 — 여기 값은 위조 가능하므로 권한 판단에 쓰지 않는다.
export const readGuestFromCookieString = (cookie: string): boolean =>
	readGuestTokenFromCookieString(cookie) !== null;

// 게스트 토큰에서 성별을 읽는다. clearGuestCookie가 쿠키를 만료시키기 전에 회원
// 프로필로 성별을 옮길 때 쓴다(가입 흐름). 서명 검증 없는 클라이언트 읽기다.
export const readGuestGenderFromCookieString = (
	cookie: string
): BambiGenderValue | null => {
	const token = readGuestTokenFromCookieString(cookie);
	return token ? decodeGuestTokenGender(token) : null;
};

// 게스트 열람 쿠키를 서버 라우트를 통해 만료시킨다. 세팅(POST /api/guest)과 동일
// 경로로 처리해 쿠키 속성이 어긋나 삭제가 누락되는 일을 막는다. 회원가입·로그인으로
// 실제 세션이 생기면 더 이상 게스트가 아니므로 호출한다; 남겨두면 로그아웃·세션 만료
// 후에도 게스트 열람 권한이 잔존한다. 삭제 실패는 로그인/로그아웃 흐름을 막지 않는다.
export const clearGuestCookie = async (): Promise<void> => {
	try {
		await fetch("/api/guest", { method: "DELETE" });
	} catch {
		// 네트워크 실패 시 조용히 넘어간다(다음 진입 때 재시도 여지).
	}
};
