"use client";

import { useQuery } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { authClient } from "@/lib/auth-client";
import {
	readGuestFromCookieString,
	readGuestGenderFromCookieString,
} from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";
import { WarningRestrictionGuard } from "./warning-restriction-guard";

type BambiRole = "job_seeker" | "employer" | "admin" | "legal_advisor" | null;
type BambiAccountStatus = "active" | "warned" | "suspended" | null;

interface BambiAuthValue {
	accountSanctionCreatedAt: string | null;
	accountSanctionReason: string | null;
	accountStatus: BambiAccountStatus;
	canAccessCommunity: boolean;
	guestGender: "female" | "male" | null;
	isAuthenticated: boolean;
	isGuest: boolean;
	isPending: boolean;
	role: BambiRole;
	user: { id: string; email: string; name: string } | null;
	warningRestrictionUntil: string | null;
}

const BambiAuthContext = createContext<BambiAuthValue | null>(null);

export function AuthClientProvider({ children }: { children: ReactNode }) {
	const [mounted, setMounted] = useState(false);
	const session = authClient.useSession();

	useEffect(() => {
		setMounted(true);
	}, []);

	// Better Auth는 브라우저 캐시에 세션이 있으면 hydration 첫 렌더부터 사용자가
	// 보일 수 있다. 서버는 그 캐시를 볼 수 없어 비로그인 HTML을 만들기 때문에,
	// 인증에 따라 알림 벨·채팅 배지·역할 버튼의 태그와 순서가 달라졌다. 마운트 전에는
	// 서버와 동일한 비로그인 스냅샷을 유지하고, hydration이 끝난 뒤 실제 세션을 반영한다.
	const isAuthenticated = mounted && Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isAuthenticated,
	});

	const isGuest =
		mounted && !isAuthenticated && readGuestFromCookieString(document.cookie);
	const guestGender = isGuest
		? readGuestGenderFromCookieString(document.cookie)
		: null;

	// 여성 인증 게스트는 회원 수다방(/seeker/community)에 들어올 수 있다. 여기 판정은
	// 버튼·안내를 고르기 위한 UI 편의일 뿐이다 — 서명·만료·gid까지 보는 최종 강제는
	// 미들웨어(resolve-gate)와 서버(resolveCommunityActor)가 한다.
	const isCommunityGuest = isGuest && guestGender !== null;

	const community = mineQuery.data?.community;
	const value: BambiAuthValue = {
		user:
			mounted && session.data?.user
				? {
						id: session.data.user.id,
						email: session.data.user.email,
						name: session.data.user.name,
					}
				: null,
		role: (mineQuery.data?.bambiProfile?.role ?? null) as BambiRole,
		accountStatus: (mineQuery.data?.bambiProfile?.status ??
			null) as BambiAccountStatus,
		warningRestrictionUntil: mineQuery.data?.bambiProfile
			?.warningRestrictionUntil
			? new Date(
					mineQuery.data.bambiProfile.warningRestrictionUntil
				).toISOString()
			: null,
		accountSanctionReason: mineQuery.data?.accountSanction?.reason ?? null,
		// 제재 시각. oRPC RPC 직렬화는 Date를 보존하지만(문자열로 올 수도 있어)
		// new Date(...)로 감싸 ISO 문자열로 정규화한다. 경고 배너 닫음 상태를
		// 제재 시각별로 분리 저장해, 새 경고가 오면(시각이 바뀌면) 다시 뜨게 하는 데 쓴다.
		accountSanctionCreatedAt: mineQuery.data?.accountSanction?.createdAt
			? new Date(mineQuery.data.accountSanction.createdAt).toISOString()
			: null,
		canAccessCommunity: isAuthenticated
			? (community?.canAccess ?? false)
			: isCommunityGuest,
		isAuthenticated,
		isGuest,
		guestGender,
		// 마운트 전에는 서버와 같은 "아직 모른다"(pending) 상태로 고정한다 — 위
		// isAuthenticated와 같은 이유다. 세션 캐시가 있는 브라우저는 첫 렌더부터
		// isPending이 false가 되는데, 서버는 true로 그리므로 이 값으로 태그가 갈리는
		// 화면(/employer/new 내비의 span↔a)에서 hydration 불일치가 났다.
		isPending:
			!mounted || session.isPending || (isAuthenticated && mineQuery.isLoading),
	};

	return (
		<BambiAuthContext.Provider value={value}>
			<WarningRestrictionGuard
				role={value.role}
				until={value.warningRestrictionUntil}
			>
				{children}
			</WarningRestrictionGuard>
		</BambiAuthContext.Provider>
	);
}

export function useBambiAuth(): BambiAuthValue {
	const value = useContext(BambiAuthContext);
	if (!value) {
		throw new Error("useBambiAuth must be used within AuthClientProvider");
	}
	return value;
}
