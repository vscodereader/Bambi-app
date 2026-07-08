"use client";

import type { ReactNode } from "react";
import { useBambiAuth } from "./auth-client-provider";
import { CommunityAccessNotice } from "./community-access-notice";
import { RequireAuth } from "./require-auth";

// 로그인 확인(RequireAuth) 후 수다방 입장 자격을 검사한다. 미자격자는 사유별
// 안내 화면을 보여준다. 게스트는 미들웨어(resolve-gate)가 이미 차단한다.
export function RequireCommunityAccess({ children }: { children: ReactNode }) {
	return (
		<RequireAuth>
			<CommunityGate>{children}</CommunityGate>
		</RequireAuth>
	);
}

function CommunityGate({ children }: { children: ReactNode }) {
	const { canAccessCommunity, communityNotice, isPending } = useBambiAuth();
	if (isPending) {
		return null;
	}
	if (canAccessCommunity) {
		return <>{children}</>;
	}
	return <CommunityAccessNotice notice={communityNotice ?? "unverified"} />;
}
