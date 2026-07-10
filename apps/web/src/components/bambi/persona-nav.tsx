"use client";

// 밤비 — 페르소나별 앱 셸(하단 탭 내비게이션 + 운영자 콘솔 셸).
// 라우트 경로(usePathname)로 활성 탭과 셸 노출 여부를 결정한다.

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { BOTTOM_NAV_CONTENT_SPACER, BottomNavShell } from "./bottom-nav-shell";
import { BottomNav } from "./ds";
import {
	ClipboardListIcon,
	PlusIcon,
	ShieldIcon,
	StoreIcon,
	UserIcon,
} from "./icons";
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
	// 내 정보 하위 페이지(신고 내역·예정된 면접·차단 목록·계정 설정)도 하단 탭을
	// 유지한다 → /seeker/me 및 그 하위 경로 전체에서 노출.
	const showNav =
		path === "/seeker" ||
		path === "/seeker/chats" ||
		path === "/seeker/community" ||
		path === "/seeker/me" ||
		path.startsWith("/seeker/me/");
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
	// 하단 탭은 구인자 주요 라우트에서 항상 노출한다(승인 상태와 무관).
	// 프로모션·성과 분석은 대시보드 퀵링크로만 닿는 하위 페이지지만, 하단 탭이
	// 사라지면 모바일에서 되돌아갈 길이 없어 함께 노출한다("내 공고" 활성 유지).
	const showNav =
		path === "/employer" ||
		path === "/employer/new" ||
		path === "/employer/me" ||
		path.startsWith("/employer/promotions") ||
		path.startsWith("/employer/analytics") ||
		path.startsWith("/employer/settings");
	let value = "postings";
	if (path === "/employer/me") {
		value = "business";
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
		} else if (v === "business") {
			router.push("/employer/me");
		} else if (v === "me") {
			// 개인 계정은 role 공용 페이지(/seeker/me)를 재사용한다. 라우트
			// 세그먼트가 달라 SeekerNav 셸로 전환되는 것은 의도된 동작이다.
			router.push("/seeker/me");
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
							{ value: "business", label: "업체 정보", icon: StoreIcon },
							{ value: "post", label: "공고 등록", icon: PlusIcon },
							{ value: "settings", label: "조직 설정", icon: ShieldIcon },
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
	employers: "/moderator/employers",
	users: "/moderator/users",
	adProducts: "/moderator/ad-products",
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
			<div
				className={cn(
					"mx-auto flex min-h-0 w-full flex-1 flex-col",
					APP_CONTENT_WIDTH
				)}
			>
				<Content>{children}</Content>
			</div>
		);
	}

	// 하단 탭은 검수·신고·사용자·광고 상품 4개만 노출하고, 나머지 목적지(업소
	// 승인·팀 합류 승인·결제 관리)는 "더보기" 시트로 접는다 → 그 경로에선 "more" 활성.
	let tab = "queue";
	if (path.startsWith("/moderator/reports")) {
		tab = "reports";
	} else if (path.startsWith("/moderator/users")) {
		tab = "users";
	} else if (path.startsWith("/moderator/ad-products")) {
		tab = "adProducts";
	} else if (
		path.startsWith("/moderator/employers") ||
		path.startsWith("/moderator/team-invites") ||
		path.startsWith("/moderator/payments")
	) {
		tab = "more";
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
			<div
				className={cn(
					"mx-auto flex min-h-0 w-full flex-1 flex-col",
					APP_CONTENT_WIDTH
				)}
			>
				<ConsoleTop
					counts={{
						queue: queue.length,
						reports: openReports,
						warned: warnedUsers,
					}}
				/>
				<Content withBottomNav>{children}</Content>
				{showActionBar ? (
					<div className="max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-30 md:sticky md:bottom-6 md:z-30">
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
				<ModTabs setTab={go} showEmployers tab={tab} />
			</NavBar>
			{toast ? <ConsoleToast message={toast} /> : null}
		</>
	);
}
