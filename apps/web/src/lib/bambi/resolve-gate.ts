export interface GateInput {
	hasSession: boolean;
	isGuest: boolean;
	pathname: string;
}

export type GateDecision = { type: "next" } | { type: "redirect"; to: string };

// 약관(/terms)·개인정보 처리방침(/privacy)은 로그인·게스트 여부와 무관하게
// 누구나 열람할 수 있어야 한다(회원가입 동의 화면에서도 링크로 연다).
const PUBLIC_PREFIXES = ["/api", "/bambi", "/terms", "/privacy"];

const isPublic = (pathname: string): boolean =>
	PUBLIC_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);

// 확장자가 붙은 경로는 정적 파일이다. App Router 메타데이터 파일(icon.svg,
// apple-icon.png, og-image.png, robots.txt, sitemap.xml 등)이 여기 해당한다.
// 이런 요청은 세션이 없어도 게이트 리다이렉트 없이 통과시켜야 한다. 그러지 않으면
// 비로그인 방문자·크롤러가 파비콘/OG 이미지를 요청할 때 인증 화면으로 307
// 리다이렉트되어 아이콘·미리보기가 표시되지 않는다.
const STATIC_FILE_PATTERN = /\.[^/]+$/;
const isStaticFile = (pathname: string): boolean =>
	STATIC_FILE_PATTERN.test(pathname);

const next: GateDecision = { type: "next" };
const redirect = (to: string): GateDecision => ({ type: "redirect", to });

// 인증 UI는 /seeker 위의 오버레이다. 목록 루트는 비로그인도 통과시키고, 그 위에
// 뜨는 카드가 게이트 역할을 한다(배경 데이터는 서버에서 마스킹된다).
const SEEKER_ROOT = "/seeker";
const SIGNUP_REDIRECT = "/seeker?auth=signup";
// 게스트가 허용되지 않은 경로로 진입할 때. guestBlocked 신호로 토스트를 띄운다.
const GUEST_BLOCKED_REDIRECT = "/seeker?auth=signup&guestBlocked=1";

export const resolveGate = ({
	pathname,
	hasSession,
	isGuest,
}: GateInput): GateDecision => {
	if (isStaticFile(pathname)) {
		return next;
	}
	if (isPublic(pathname)) {
		return next;
	}
	if (hasSession) {
		return next;
	}
	// 세션 없는 방문자(anon·guest)에게 공통으로 열리는 유일한 화면.
	if (pathname === SEEKER_ROOT) {
		return next;
	}
	if (isGuest) {
		if (pathname === "/") {
			return redirect(SEEKER_ROOT);
		}
		return redirect(GUEST_BLOCKED_REDIRECT);
	}
	return redirect(SIGNUP_REDIRECT);
};
