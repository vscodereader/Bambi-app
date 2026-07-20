"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { authClient } from "@/lib/auth-client";
import { readGuestFromCookieString } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";

type BambiRole = "job_seeker" | "employer" | "admin" | null;
type BambiAccountStatus = "active" | "warned" | "suspended" | null;

interface BambiAuthValue {
	accountSanctionCreatedAt: string | null;
	accountSanctionReason: string | null;
	accountStatus: BambiAccountStatus;
	canAccessCommunity: boolean;
	isAuthenticated: boolean;
	isGuest: boolean;
	isPending: boolean;
	role: BambiRole;
	user: { id: string; email: string; name: string } | null;
}

const BambiAuthContext = createContext<BambiAuthValue | null>(null);

export function AuthClientProvider({ children }: { children: ReactNode }) {
	const session = authClient.useSession();
	const isAuthenticated = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isAuthenticated,
	});

	const isGuest =
		!isAuthenticated &&
		typeof document !== "undefined" &&
		readGuestFromCookieString(document.cookie);

	const community = mineQuery.data?.community;
	const value: BambiAuthValue = {
		user: session.data?.user
			? {
					id: session.data.user.id,
					email: session.data.user.email,
					name: session.data.user.name,
				}
			: null,
		role: (mineQuery.data?.bambiProfile?.role ?? null) as BambiRole,
		accountStatus: (mineQuery.data?.bambiProfile?.status ??
			null) as BambiAccountStatus,
		accountSanctionReason: mineQuery.data?.accountSanction?.reason ?? null,
		// 제재 시각. oRPC RPC 직렬화는 Date를 보존하지만(문자열로 올 수도 있어)
		// new Date(...)로 감싸 ISO 문자열로 정규화한다. 경고 배너 닫음 상태를
		// 제재 시각별로 분리 저장해, 새 경고가 오면(시각이 바뀌면) 다시 뜨게 하는 데 쓴다.
		accountSanctionCreatedAt: mineQuery.data?.accountSanction?.createdAt
			? new Date(mineQuery.data.accountSanction.createdAt).toISOString()
			: null,
		canAccessCommunity: community?.canAccess ?? false,
		isAuthenticated,
		isGuest,
		isPending: session.isPending || (isAuthenticated && mineQuery.isLoading),
	};

	return (
		<BambiAuthContext.Provider value={value}>
			{children}
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
