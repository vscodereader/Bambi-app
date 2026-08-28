"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { COMMUNITY_ROOT_PATH, isSecretBoardKey } from "@/lib/bambi/community";
import { useBoardBySlug } from "@/lib/bambi/use-community-boards";
import { useBambiAuth } from "./auth-client-provider";
import { RequireAuth } from "./require-auth";

const COMMUNITY_BLOCKED_MESSAGE =
	"일반 여성회원과 광고 중인 업소회원만 이용가능합니다";
const SUSPENDED_COMMUNITY_BLOCKED_MESSAGE = "차단된 유저는 확인이 불가합니다";

// 로그인 확인(RequireAuth) 후 수다방 입장 자격을 검사한다. 미자격자에게는 탭·nav를
// 그대로 노출하되, 진입 시 토스트로 안내하고 구직 홈으로 되돌린다.
//
// 여성 인증 게스트는 계정이 없으므로 로그인 확인을 건너뛴다 — 자격(서명·gid·성별)은
// 미들웨어(resolve-gate)가 이미 봤고, 매 요청의 최종 판정은 서버가 한다.
export function RequireCommunityAccess({ children }: { children: ReactNode }) {
	// 세션·자격 판정은 클라이언트 전용 상태라 SSR과 첫 클라이언트 렌더가 어긋나
	// hydration 불일치가 난다(RequireAuth의 pending 스켈레톤 등). 마운트 후에만
	// 게이트를 렌더해 서버·첫 클라이언트 렌더를 null로 일치시켜 이를 피한다.
	const [mounted, setMounted] = useState(false);
	const pathname = usePathname();
	const { isGuest } = useBambiAuth();
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}
	if (pathname === COMMUNITY_ROOT_PATH) {
		return <>{children}</>;
	}

	const gate = <CommunityGate>{children}</CommunityGate>;
	return isGuest ? gate : <RequireAuth>{gate}</RequireAuth>;
}

function CommunityGate({ children }: { children: ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { accountStatus, canAccessCommunity, isPending } = useBambiAuth();
	const boardSlug = pathname.split("/")[3] ?? "";
	const { board, isPending: isBoardPending } = useBoardBySlug(boardSlug);
	const isSecretBoard = Boolean(board && isSecretBoardKey(board.key));
	const notified = useRef(false);

	useEffect(() => {
		if (
			isPending ||
			isBoardPending ||
			canAccessCommunity ||
			isSecretBoard ||
			notified.current
		) {
			return;
		}
		notified.current = true;
		toast(
			accountStatus === "suspended"
				? SUSPENDED_COMMUNITY_BLOCKED_MESSAGE
				: COMMUNITY_BLOCKED_MESSAGE
		);
		router.replace("/seeker");
	}, [
		accountStatus,
		isPending,
		isBoardPending,
		canAccessCommunity,
		isSecretBoard,
		router,
	]);

	if (isPending || isBoardPending || !(canAccessCommunity || isSecretBoard)) {
		return null;
	}
	return <>{children}</>;
}
