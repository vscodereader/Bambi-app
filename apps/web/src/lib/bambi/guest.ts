export const GUEST_COOKIE_NAME = "bambi_guest";
export const GUEST_COOKIE_VALUE = "1";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const readGuestFromCookieString = (cookie: string): boolean =>
	cookie
		.split(";")
		.map((part) => part.trim())
		.some((part) => part === `${GUEST_COOKIE_NAME}=${GUEST_COOKIE_VALUE}`);

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
