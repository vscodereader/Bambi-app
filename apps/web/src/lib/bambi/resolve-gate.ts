export interface GateInput {
	hasSession: boolean;
	isGuest: boolean;
	pathname: string;
}

export type GateDecision = { type: "next" } | { type: "redirect"; to: string };

// 약관(/terms)·개인정보 처리방침(/privacy)은 로그인·게스트 여부와 무관하게
// 누구나 열람할 수 있어야 한다(회원가입 동의 화면에서도 링크로 연다).
//
// /jobs는 지역·업종별 공개 공고 랜딩, /board는 공개 게시판(읽기 전용) 영역이다.
// 검색 크롤러와 비로그인 방문자가 게이트에 걸리지 않고 목록·본문을 읽어야 색인이 된다.
// 공개 범위는 읽기 전용까지이고, 공고 상세(/seeker/jobs/[id])·채팅·연락처와
// 커뮤니티 쓰기·댓글·추천은 그대로 게이트 뒤에 남는다.
const PUBLIC_PREFIXES = [
	"/api",
	"/bambi",
	"/board",
	"/jobs",
	"/terms",
	"/privacy",
];

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

// 인증 UI는 /seeker가 직접 그리는 전체 화면 게이트다. 목록 루트는 비로그인도
// 통과시키되, ?auth= 쿼리가 붙으면 목록 대신 블러 배경 위 인증 카드를 렌더한다
// (배경 데이터는 서버에서 마스킹된다). 실제 목록 위에 겹치는 다이얼로그는 없다.
const SEEKER_ROOT = "/seeker";
// 그냥 들어온 비로그인 방문자에게는 로그인 폼을 먼저 보인다. 재방문자가 다수라
// 로그인이 기본이고, 가입은 카드 안의 전환 링크로 한 번에 갈 수 있다.
const LOGIN_REDIRECT = "/seeker?auth=login";
// 게스트가 허용되지 않은 경로로 진입할 때. 이 경우엔 계정이 없는 게 확정이라
// 가입 쪽을 열고, guestBlocked 신호로 "회원가입 후에 볼 수 있어요" 토스트를 띄운다.
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
	return redirect(LOGIN_REDIRECT);
};
