"use client";

// 밤비 — 모바일 하단 탭바(탐색·채팅·수다방·내 정보). 공개 마켓과 구직자 셸이 공유한다.
// 구인자 계정은 채팅과 수다방 사이에 "구인 관리" 탭을, 운영자(admin)는 "내 정보"
// 왼쪽에 "운영자 모드" 탭을 노출해 각자 영역(/employer·/moderator)으로 이동한다.

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useBambiAuth } from "./auth-client-provider";
import { BottomNavShell } from "./bottom-nav-shell";
import { BottomNav } from "./ds";
import {
	BriefcaseIcon,
	Message,
	MessagesIcon,
	Search2,
	ShieldIcon,
	UserIcon,
} from "./icons";

export function MobileTabBar({ homeHref }: { homeHref: string }) {
	const path = usePathname();
	const router = useRouter();
	const { role } = useBambiAuth();
	const isEmployer = role === "employer";
	const isModerator = role === "admin";
	let value = "home";
	if (path === "/seeker/me" || path.startsWith("/seeker/me/")) {
		value = "me";
	} else if (path === "/seeker/chats") {
		value = "chat";
	} else if (path === "/seeker/community") {
		value = "community";
	}
	const go = (v: string) => {
		if (v === "chat") {
			router.push("/seeker/chats");
		} else if (v === "employer") {
			router.push("/employer");
		} else if (v === "moderator") {
			router.push("/moderator");
		} else if (v === "community") {
			router.push("/seeker/community");
		} else if (v === "me") {
			router.push("/seeker/me");
		} else {
			router.push(homeHref as Route);
		}
	};
	return (
		<BottomNavShell>
			<BottomNav
				items={[
					{ value: "home", label: "탐색", icon: Search2 },
					{ value: "chat", label: "채팅", icon: Message },
					...(isEmployer
						? [{ value: "employer", label: "구인 관리", icon: BriefcaseIcon }]
						: []),
					{ value: "community", label: "수다방", icon: MessagesIcon },
					...(isModerator
						? [{ value: "moderator", label: "운영자 모드", icon: ShieldIcon }]
						: []),
					{ value: "me", label: "내 정보", icon: UserIcon },
				]}
				onChange={go}
				value={value}
			/>
		</BottomNavShell>
	);
}
