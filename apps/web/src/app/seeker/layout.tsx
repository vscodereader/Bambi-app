import { getSessionCookie } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { AccountStatusBanner } from "@/components/bambi/account-status-banner";
import { SeekerAuthGateScreen } from "@/components/bambi/auth/seeker-auth-gate-screen";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { SeekerAppShell } from "@/components/bambi/seeker-app-shell";
import { GUEST_COOKIE_NAME } from "@/lib/bambi/guest";
import { verifyGuestToken } from "@/lib/bambi/guest-token";

// proxy.ts·/api/guest와 같은 서명 키여야 한다(개발 폴백까지 동일).
const guestTokenSecret = (): string =>
	process.env.BAMBI_GUEST_TOKEN_SECRET ??
	"bambi-dev-guest-token-secret-not-for-prod";

// proxy.ts와 같은 규칙으로 anon을 판정한다 — 세션 쿠키는 같은 getSessionCookie로
// (쿠키 prefix 포함), 게스트는 평문 비교가 아니라 HMAC 서명 검증으로 본다. 서버에서
// 판정하므로 하이드레이션 후 화면이 바뀌는 깜빡임이 없다.
const isAnonymousVisitor = async (): Promise<boolean> => {
	const hasSession = Boolean(
		getSessionCookie(await headers(), {
			cookiePrefix: process.env.BAMBI_COOKIE_PREFIX,
		})
	);
	if (hasSession) {
		return false;
	}
	const token = (await cookies()).get(GUEST_COOKIE_NAME)?.value;
	if (!token) {
		return true;
	}
	return (
		(await verifyGuestToken(token, guestTokenSecret(), new Date())) === null
	);
};

export default async function SeekerLayout({
	children,
}: {
	children: ReactNode;
}) {
	// anon은 게이트상 /seeker 외에는 도달할 수 없으므로 children을 버려도 안전하다.
	if (await isAnonymousVisitor()) {
		return <SeekerAuthGateScreen />;
	}

	return (
		<SeekerAppShell>
			<SeekerNav>
				<AccountStatusBanner />
				{children}
			</SeekerNav>
		</SeekerAppShell>
	);
}
