export interface GateInput {
	hasSession: boolean;
	isGuest: boolean;
	pathname: string;
}

export type GateDecision = { type: "next" } | { type: "redirect"; to: string };

// 약관(/terms)·개인정보 처리방침(/privacy)은 로그인·게스트 여부와 무관하게
// 누구나 열람할 수 있어야 한다(회원가입 동의 화면에서도 링크로 연다).
const PUBLIC_PREFIXES = [
	"/welcome",
	"/login",
	"/api",
	"/bambi",
	"/terms",
	"/privacy",
];

const GUEST_BLOCKED_SEEKER_PREFIXES = [
	"/seeker/jobs",
	"/seeker/community",
	"/seeker/chats",
	"/seeker/me",
];

const isPublic = (pathname: string): boolean =>
	PUBLIC_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);

// 확장자가 붙은 경로는 정적 파일이다. App Router 메타데이터 파일(icon.svg,
// apple-icon.png, og-image.png, robots.txt, sitemap.xml 등)이 여기 해당한다.
// 이런 요청은 세션이 없어도 게이트 리다이렉트 없이 통과시켜야 한다. 그러지 않으면
// 비로그인 방문자·크롤러가 파비콘/OG 이미지를 요청할 때 /welcome으로 307 리다이렉트되어
// 아이콘·미리보기가 표시되지 않는다.
const STATIC_FILE_PATTERN = /\.[^/]+$/;
const isStaticFile = (pathname: string): boolean =>
	STATIC_FILE_PATTERN.test(pathname);

const next: GateDecision = { type: "next" };
const redirect = (to: string): GateDecision => ({ type: "redirect", to });

// 게스트가 공고 목록(/seeker) 외 허용되지 않은 경로로 진입할 때의 리다이렉트.
// guestBlocked 신호를 실어 랜딩(/welcome)에서 "회원가입 후에 볼 수 있어요" 토스트를 띄운다.
const GUEST_BLOCKED_REDIRECT = "/welcome?signup&guestBlocked=1";

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
	if (isGuest) {
		if (pathname === "/") {
			return redirect("/seeker");
		}
		if (pathname === "/seeker") {
			return next;
		}
		if (
			GUEST_BLOCKED_SEEKER_PREFIXES.some((prefix) =>
				pathname.startsWith(prefix)
			) ||
			pathname.startsWith("/employer") ||
			pathname.startsWith("/moderator")
		) {
			return redirect(GUEST_BLOCKED_REDIRECT);
		}
		return redirect(GUEST_BLOCKED_REDIRECT);
	}
	return redirect("/welcome");
};
