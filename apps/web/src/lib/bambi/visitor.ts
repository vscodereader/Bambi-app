import { getSessionCookie } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { GUEST_COOKIE_NAME } from "@/lib/bambi/guest";
import { verifyGuestToken } from "@/lib/bambi/guest-token";

// 방문자 3분류. proxy.ts의 게이트 입력(hasSession·isGuest)과 같은 사실을 서버
// 컴포넌트 쪽에서 쓰기 좋은 형태로 정리한 것이다.
export type VisitorState = "anon" | "guest" | "member";

// proxy.ts·/api/guest와 같은 서명 키여야 한다(개발 폴백까지 동일).
const guestTokenSecret = (): string =>
	process.env.BAMBI_GUEST_TOKEN_SECRET ??
	"bambi-dev-guest-token-secret-not-for-prod";

// proxy.ts와 같은 규칙으로 판정한다 — 세션 쿠키는 같은 getSessionCookie로
// (쿠키 prefix 포함), 게스트는 평문 비교가 아니라 HMAC 서명 검증으로 본다. 서버에서
// 판정하므로 하이드레이션 후 화면이 바뀌는 깜빡임이 없다.
// layout과 page가 각각 이 판정을 필요로 해서(아래 seeker/layout.tsx 주석 참고)
// 한쪽에 두지 않고 공용 헬퍼로 뺐다 — 두 곳의 규칙이 어긋나면 게이트가 새 버린다.
// next/headers를 쓰므로 서버 전용이다(클라이언트에서 import하면 빌드가 막힌다).
export const readVisitorState = async (): Promise<VisitorState> => {
	const hasSession = Boolean(
		getSessionCookie(await headers(), {
			cookiePrefix: process.env.BAMBI_COOKIE_PREFIX,
		})
	);
	if (hasSession) {
		return "member";
	}
	const token = (await cookies()).get(GUEST_COOKIE_NAME)?.value;
	if (!token) {
		return "anon";
	}
	const verified = await verifyGuestToken(
		token,
		guestTokenSecret(),
		new Date()
	);
	return verified === null ? "anon" : "guest";
};
