"use client";

// 밤비 — 페르소나별 앱 셸(하단 탭 내비게이션 + 운영자 콘솔 셸).
// 라우트 경로(usePathname)로 활성 탭과 셸 노출 여부를 결정한다.

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "./ds";
import {
	ClipboardListIcon,
	Message,
	PlusIcon,
	Search2,
	UserIcon,
} from "./icons";
import {
	ConsoleToast,
	ConsoleTop,
	ModTabs,
	QueueActionBar,
} from "./screens/moderator";
import { useMod } from "./screens/moderator-context";

function Content({ children }: { children: ReactNode }) {
	return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

function NavBar({ children }: { children: ReactNode }) {
	return (
		<div className="sticky bottom-0 z-30 border-border border-t bg-background md:hidden">
			{children}
		</div>
	);
}

// ---- 구직자 ----------------------------------------------------------------
export function SeekerNav({ children }: { children: ReactNode }) {
	const path = usePathname();
	const router = useRouter();
	const showNav =
		path === "/seeker" || path === "/seeker/chats" || path === "/seeker/me";
	let value = "home";
	if (path === "/seeker/me") {
		value = "me";
	} else if (path === "/seeker/chats") {
		value = "chat";
	}
	const go = (v: string) => {
		if (v === "chat") {
			router.push("/seeker/chats");
		} else if (v === "me") {
			router.push("/seeker/me");
		} else {
			router.push("/seeker");
		}
	};
	return (
		<>
			<Content>{children}</Content>
			{showNav ? (
				<NavBar>
					<BottomNav
						badges={{ chat: 1 }}
						items={[
							{ value: "home", label: "탐색", icon: Search2 },
							{ value: "chat", label: "채팅", icon: Message },
							{ value: "me", label: "내 정보", icon: UserIcon },
						]}
						onChange={go}
						value={value}
					/>
				</NavBar>
			) : null}
		</>
	);
}

// ---- 구인자 ----------------------------------------------------------------
export function EmployerNav({ children }: { children: ReactNode }) {
	const path = usePathname();
	const router = useRouter();
	const showNav = path === "/employer" || path === "/employer/me";
	const value = path === "/employer/me" ? "me" : "postings";
	const go = (v: string) => {
		if (v === "post") {
			router.push("/employer/new");
		} else if (v === "me") {
			router.push("/employer/me");
		} else {
			router.push("/employer");
		}
	};
	return (
		<>
			<Content>{children}</Content>
			{showNav ? (
				<NavBar>
					<BottomNav
						items={[
							{ value: "postings", label: "내 공고", icon: ClipboardListIcon },
							{ value: "post", label: "등록", icon: PlusIcon },
							{ value: "me", label: "내 정보", icon: UserIcon },
						]}
						onChange={go}
						value={value}
					/>
				</NavBar>
			) : null}
		</>
	);
}

// ---- 운영자 콘솔 -----------------------------------------------------------
const MOD_ROUTES: Record<string, Route> = {
	queue: "/moderator",
	reports: "/moderator/reports",
	users: "/moderator/users",
};
const MOD_DETAIL_RE = /^\/moderator\/(?:queue|reports|users)\/[^/]+/;

export function ModeratorShell({ children }: { children: ReactNode }) {
	const path = usePathname();
	const router = useRouter();
	const { queue, selected, openReports, warnedUsers, toast, bulkAction } =
		useMod();

	const isDetail = MOD_DETAIL_RE.test(path);
	if (isDetail) {
		return <Content>{children}</Content>;
	}

	let tab = "queue";
	if (path.startsWith("/moderator/reports")) {
		tab = "reports";
	} else if (path.startsWith("/moderator/users")) {
		tab = "users";
	}
	const go = (v: string) => router.push(MOD_ROUTES[v] ?? MOD_ROUTES.queue);
	const showActionBar = tab === "queue" && selected.length > 0;

	return (
		<>
			<ConsoleTop
				counts={{
					queue: queue.length,
					reports: openReports,
					warned: warnedUsers,
				}}
				onTab={go}
				tab={tab}
			/>
			<Content>{children}</Content>
			{showActionBar ? (
				<QueueActionBar count={selected.length} onAction={bulkAction} />
			) : null}
			<NavBar>
				<ModTabs setTab={go} tab={tab} />
			</NavBar>
			{toast ? <ConsoleToast message={toast} /> : null}
		</>
	);
}
