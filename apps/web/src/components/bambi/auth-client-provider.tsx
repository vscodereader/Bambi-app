"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { authClient } from "@/lib/auth-client";
import { readGuestFromCookieString } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";

type BambiRole = "job_seeker" | "employer" | "admin" | null;

interface BambiAuthValue {
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
