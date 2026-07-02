"use client";

// 밤비 — 페르소나별 앱 셸(하단 탭 내비게이션 + 운영자 콘솔 셸).
// 라우트 경로(usePathname)로 활성 탭과 셸 노출 여부를 결정한다.

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { BOTTOM_NAV_CONTENT_SPACER, BottomNavShell } from "./bottom-nav-shell";
import { BottomNav } from "./ds";
import { ClipboardListIcon, PlusIcon, SettingsIcon, UserIcon } from "./icons";
import { MobileTabBar } from "./mobile-tab-bar";
import {
	ConsoleToast,
	ConsoleTop,
	ModTabs,
	QueueActionBar,
} from "./screens/moderator";
import { useMod } from "./screens/moderator-context";

function Content({
	children,
	withBottomNav = false,
}: {
	children: ReactNode;
	withBottomNav?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col",
				withBottomNav && BOTTOM_NAV_CONTENT_SPACER,
				withBottomNav && "md:pb-0"
			)}
		>
			{children}
		</div>
	);
}

function NavBar({ children }: { children: ReactNode }) {
	return <BottomNavShell>{children}</BottomNavShell>;
}

// ---- 구직자 ----------------------------------------------------------------
export function SeekerNav({ children }: { children: ReactNode }) {
	const path = usePathname();
	const showNav =
		path === "/seeker" ||
		path === "/seeker/chats" ||
		path === "/seeker/community" ||
		path === "/seeker/me";
	return (
		<>
			<Content withBottomNav={showNav}>{children}</Content>
			{showNav ? <MobileTabBar homeHref="/seeker" /> : null}
		</>
	);
}

// ---- 구인자 ----------------------------------------------------------------
export function EmployerNav({ children }: { children: ReactNode }) {
	const path = usePathname();
	const router = useRouter();
	const showNav =
		path === "/employer" ||
		path === "/employer/new" ||
		path === "/employer/me" ||
		path.startsWith("/employer/settings");
	let value = "postings";
	if (path === "/employer/me") {
		value = "me";
	} else if (path.startsWith("/employer/settings")) {
		value = "settings";
	} else if (path === "/employer/new") {
		value = "post";
	}
	const go = (v: string) => {
		if (v === "post") {
			router.push("/employer/new");
		} else if (v === "settings") {
			router.push("/employer/settings" as Route);
		} else if (v === "me") {
			router.push("/employer/me");
		} else {
			router.push("/employer");
		}
	};
	return (
		<>
			<Content withBottomNav={showNav}>{children}</Content>
			{showNav ? (
				<NavBar>
					<BottomNav
						items={[
							{ value: "postings", label: "내 공고", icon: ClipboardListIcon },
							{ value: "post", label: "등록", icon: PlusIcon },
							{ value: "settings", label: "설정", icon: SettingsIcon },
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
	const previousPath = useRef(path);
	const {
		bulkAction,
		clearSelection,
		isBulkApplying,
		openReports,
		queue,
		selected,
		toast,
		warnedUsers,
	} = useMod();

	useEffect(() => {
		if (previousPath.current === path) {
			return;
		}

		previousPath.current = path;
		clearSelection();
	}, [clearSelection, path]);

	const isDetail = MOD_DETAIL_RE.test(path);
	if (isDetail) {
		return (
			<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
				<Content>{children}</Content>
			</div>
		);
	}

	let tab = "queue";
	if (path.startsWith("/moderator/reports")) {
		tab = "reports";
	} else if (path.startsWith("/moderator/users")) {
		tab = "users";
	}
	const go = (v: string) => {
		clearSelection();
		router.push(MOD_ROUTES[v] ?? MOD_ROUTES.queue);
	};
	let bulkScope: "queue" | "reports" | "users" = "queue";
	if (tab === "reports") {
		bulkScope = "reports";
	} else if (tab === "users") {
		bulkScope = "users";
	}
	const showActionBar = selected.length > 0;

	return (
		<>
			<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
				<ConsoleTop
					counts={{
						queue: queue.length,
						reports: openReports,
						warned: warnedUsers,
					}}
				/>
				<Content withBottomNav>{children}</Content>
				{showActionBar ? (
					<div className="max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-30">
						<QueueActionBar
							count={selected.length}
							isApplying={isBulkApplying}
							onAction={bulkAction}
							scope={bulkScope}
						/>
					</div>
				) : null}
			</div>
			<NavBar>
				<ModTabs setTab={go} tab={tab} />
			</NavBar>
			{toast ? <ConsoleToast message={toast} /> : null}
		</>
	);
}
