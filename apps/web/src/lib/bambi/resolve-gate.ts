import { SEEKER_LOGIN_PATH } from "./auth-paths";

export interface GateInput {
	hasSession: boolean;
	// 수다방에 들어올 수 있는 게스트(서명·만료 유효 + gid + 여성). 읽기 게이트(isGuest)보다
	// 좁다 — 남성·gid 없는 옛 토큰은 API가 게스트로 인정하지 않으므로 화면도 열지 않는다.
	isCommunityGuest: boolean;
	isGuest: boolean;
	pathname: string;
}

export type GateDecision =
	| { type: "next" }
	| { type: "redirect"; to: string; permanent?: boolean };

// 약관(/terms)·개인정보 처리방침(/privacy)은 로그인·게스트 여부와 무관하게
// 누구나 열람할 수 있어야 한다(회원가입 동의 화면에서도 링크로 연다).
//
// /jobs는 지역·업종별 공개 공고 랜딩, /board는 공개 게시판 영역이다.
// 검색 크롤러와 비로그인 방문자가 게이트에 걸리지 않고 목록·본문을 읽어야 색인이 된다.
// /board의 글쓰기·댓글·추천 화면도 이 게이트를 통과하지만, 실제 쓰기 자격은 API가
// 게스트 토큰(성인 본인인증 + gid)으로 판정한다 — 미인증 방문자에게는 화면이 본인인증
// 카드를 세운다. 공고 상세(/seeker/jobs/[id])·채팅·연락처는 그대로 게이트 뒤에 남는다.
const PUBLIC_PREFIXES = [
	"/api",
	"/bambi",
	"/board",
	"/jobs",
	// 포인트몰 — 목록 공개, 구매만 로그인(버튼에서 유도)
	"/point-shop",
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
// permanent가 참일 때만 permanent 필드를 실는다 — 임시(307) 리다이렉트의 기존
// toEqual 기대값에 없던 필드가 끼어들지 않게 한다.
const redirect = (to: string, permanent?: boolean): GateDecision =>
	permanent ? { type: "redirect", to, permanent } : { type: "redirect", to };

// 세션이 있어야 열리는 비공개 최상위 라우트들. 여기 밑이 아닌 경로는 게이트가
// 로그인으로 보내지 않고 next로 흘려, Next의 not-found가 진짜 404를 내게 한다.
// 예전엔 아무 미존재 경로나 307→로그인 200이라 크롤러에 soft-404로 남았다.
// 주의: 새 비공개 최상위 라우트를 추가하면 이 목록에도 추가해야 한다.
// (공개 경로 /api·/bambi·/board·/jobs·/point-shop·/terms·/privacy는 위 isPublic이
// 먼저 통과시키므로 여기 넣지 않는다.)
const GATED_ROOTS = [
	"ad-banner-editor",
	"employer",
	"manual",
	"moderator",
	"onboarding",
	"preview",
	"seeker",
	"support",
];
const isGated = (pathname: string): boolean =>
	GATED_ROOTS.some(
		(root) => pathname === `/${root}` || pathname.startsWith(`/${root}/`)
	);

// 인증 UI는 /seeker가 직접 그리는 전체 화면 게이트다. 목록 루트는 비로그인도
// 통과시키되, ?auth= 쿼리가 붙으면 목록 대신 블러 배경 위 인증 카드를 렌더한다
// (배경 데이터는 서버에서 마스킹된다). 실제 목록 위에 겹치는 다이얼로그는 없다.
const SEEKER_ROOT = "/seeker";
// 수다방은 여성 인증 게스트에게도 열린 유일한 /seeker 하위 영역이다. 읽기는 회원과 같고
// (전체 보드), 쓰기 제한(자유수다·밤문화 이야기·비밀번호 필수)은 API 가드가 강제한다.
const COMMUNITY_ROOT = "/seeker/community";
const isCommunity = (pathname: string): boolean =>
	pathname === COMMUNITY_ROOT || pathname.startsWith(`${COMMUNITY_ROOT}/`);
// 그냥 들어온 비로그인 방문자에게는 로그인 폼을 먼저 보인다. 재방문자가 다수라
// 로그인이 기본이고, 가입은 카드 안의 전환 링크로 한 번에 갈 수 있다.
const LOGIN_REDIRECT = SEEKER_LOGIN_PATH;
// 게스트가 허용되지 않은 경로로 진입할 때. 이 경우엔 계정이 없는 게 확정이라
// 가입 쪽을 열고, guestBlocked 신호로 "회원가입 후에 볼 수 있어요" 토스트를 띄운다.
const GUEST_BLOCKED_REDIRECT = "/seeker?auth=signup&guestBlocked=1";

export const resolveGate = ({
	pathname,
	hasSession,
	isCommunityGuest,
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
	// 세션 없는 방문자(anon·guest)의 루트는 canonical /seeker로 영구(308) 이동한다.
	// 옛 anon "/"→"/seeker?auth=login"은 폐기했다 — 307+쿼리 로그인 URL이 canonical
	// /seeker와 불일치해 감사에서 지적됐다.
	if (pathname === "/") {
		return redirect(SEEKER_ROOT, true);
	}
	// 세션 없는 방문자(anon·guest)에게 공통으로 열리는 유일한 화면.
	if (pathname === SEEKER_ROOT) {
		return next;
	}
	// 수다방 홈의 게시판 미리보기는 로그인 여부와 관계없이 공개한다. 게시판 목록·상세·
	// 쓰기는 아래 기존 게이트와 API 권한 검사를 그대로 통과해야 한다.
	if (pathname === COMMUNITY_ROOT) {
		return next;
	}
	// 비공개 최상위 라우트 밑이 아니면 게이트 대상이 아니다 — next로 흘려 404를 낸다.
	if (!isGated(pathname)) {
		return next;
	}
	if (isGuest) {
		if (isCommunityGuest && isCommunity(pathname)) {
			return next;
		}
		return redirect(GUEST_BLOCKED_REDIRECT);
	}
	return redirect(LOGIN_REDIRECT);
};
