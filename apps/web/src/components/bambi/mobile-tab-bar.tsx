"use client";

// 밤비 — 모바일 하단 탭바(탐색·채팅·내 정보). 공개 마켓과 구직자 셸이 공유한다.
// 구인자 계정으로 로그인한 경우 채팅과 내 정보 사이에 구인자 관리 탭을 노출한다.

import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { BottomNav } from "./ds";
import { BriefcaseIcon, Message, Search2, UserIcon } from "./icons";

export function MobileTabBar({ homeHref }: { homeHref: string }) {
	const path = usePathname();
	const router = useRouter();
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const isEmployer = mineQuery.data?.bambiProfile?.role === "employer";
	let value = "home";
	if (path === "/seeker/me") {
		value = "me";
	} else if (path === "/seeker/chats") {
		value = "chat";
	}
	const go = (v: string) => {
		if (v === "chat") {
			router.push("/seeker/chats");
		} else if (v === "employer") {
			router.push("/employer");
		} else if (v === "me") {
			router.push("/seeker/me");
		} else {
			router.push(homeHref as Route);
		}
	};
	return (
		<div className="sticky bottom-0 z-30 border-border border-t bg-background md:hidden">
			<BottomNav
				badges={{ chat: 1 }}
				items={[
					{ value: "home", label: "탐색", icon: Search2 },
					{ value: "chat", label: "채팅", icon: Message },
					...(isEmployer
						? [{ value: "employer", label: "구인 관리", icon: BriefcaseIcon }]
						: []),
					{ value: "me", label: "내 정보", icon: UserIcon },
				]}
				onChange={go}
				value={value}
			/>
		</div>
	);
}
