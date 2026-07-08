"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBambiAuth } from "./auth-client-provider";
import { RequireAuth } from "./require-auth";

const COMMUNITY_BLOCKED_MESSAGE =
	"여성회원과 광고 중인 업소회원만 이용가능합니다";

// 로그인 확인(RequireAuth) 후 수다방 입장 자격을 검사한다. 미자격자에게는 탭·nav를
// 그대로 노출하되, 진입 시 토스트로 안내하고 구직 홈으로 되돌린다. 게스트는
// 미들웨어(resolve-gate)가 이미 차단한다.
export function RequireCommunityAccess({ children }: { children: ReactNode }) {
	return (
		<RequireAuth>
			<CommunityGate>{children}</CommunityGate>
		</RequireAuth>
	);
}

function CommunityGate({ children }: { children: ReactNode }) {
	const router = useRouter();
	const { canAccessCommunity, isPending } = useBambiAuth();
	const notified = useRef(false);

	useEffect(() => {
		if (isPending || canAccessCommunity || notified.current) {
			return;
		}
		notified.current = true;
		toast(COMMUNITY_BLOCKED_MESSAGE);
		router.replace("/seeker");
	}, [isPending, canAccessCommunity, router]);

	if (isPending || !canAccessCommunity) {
		return null;
	}
	return <>{children}</>;
}
