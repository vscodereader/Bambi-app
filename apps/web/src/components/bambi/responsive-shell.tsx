"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "./ds";
import { BellIcon, ShieldIcon } from "./icons";

export interface NavItem {
	href: Route;
	label: string;
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
	{ href: "/seeker", label: "채용정보" },
	{ href: "/seeker/chats", label: "채팅" },
	{ href: "/", label: "안전가이드" },
	{ href: "/employer", label: "업체 인증" },
	{ href: "/seeker/community", label: "수다방" },
];

interface ResponsiveAppShellProps {
	children: ReactNode;
	className?: string;
	headerSlot?: ReactNode;
	navItems?: readonly NavItem[];
	showDesktopNav?: boolean;
	variant?: "public" | "seeker" | "employer" | "moderator";
}

// 현재 경로와 가장 길게 일치하는 nav 항목만 활성 처리한다(/seeker·/seeker/chats 중복 방지).
function findActiveHref(
	pathname: string,
	navItems: readonly NavItem[]
): Route | undefined {
	let active: NavItem | undefined;
	for (const item of navItems) {
		const matches =
			pathname === item.href ||
			(item.href !== "/" && pathname.startsWith(`${item.href}/`));
		if (matches && item.href.length > (active?.href.length ?? 0)) {
			active = item;
		}
	}
	return active?.href;
}

function ModeratorHeaderActions() {
	return (
		<>
			<Badge className="h-9 gap-1.5 px-3 font-bold" variant="secondary">
				<span className="inline-flex size-3.5">
					<ShieldIcon />
				</span>
				운영자 모드
			</Badge>
			<Button
				aria-label="알림"
				className="bg-card"
				size="icon-lg"
				variant="outline"
			>
				<BellIcon />
			</Button>
		</>
	);
}

export function ResponsiveAppShell({
	children,
	className,
	headerSlot,
	navItems = DEFAULT_NAV_ITEMS,
	showDesktopNav = true,
	variant = "public",
}: ResponsiveAppShellProps) {
	const pathname = usePathname();
	const isPublic = variant === "public";
	const isModerator = variant === "moderator";
	const activeHref = findActiveHref(pathname, navItems);
	return (
		<div className="min-h-[100dvh] bg-secondary text-foreground">
			{showDesktopNav ? (
				<header className="sticky top-0 z-30 hidden border-border border-b bg-background/95 backdrop-blur md:block">
					<div className="mx-auto flex h-16 max-w-[80%] items-center gap-7 px-6">
						<Link aria-label="밤비 홈" className="no-underline" href="/">
							<Logo lang="ko" size="md" />
						</Link>
						<nav className="flex items-center gap-1">
							{navItems.map((item) => {
								const isActive = item.href === activeHref;
								return (
									<Link
										aria-current={isActive ? "page" : undefined}
										className={cn(
											buttonVariants({ variant: "ghost" }),
											"h-auto px-3 py-2 font-bold text-muted-foreground text-sm no-underline",
											isActive && "bg-muted text-foreground"
										)}
										href={item.href}
										key={`${item.href}-${item.label}`}
									>
										{item.label}
									</Link>
								);
							})}
						</nav>
						<div className="ml-auto flex items-center gap-2">
							{headerSlot}
							{isModerator ? (
								<ModeratorHeaderActions />
							) : (
								<>
									<Badge
										className="h-9 gap-1.5 px-3 font-bold"
										variant="success"
									>
										<span className="inline-flex size-3.5">
											<ShieldIcon />
										</span>
										연락처 보호
									</Badge>
									<Link
										className={cn(
											buttonVariants({
												variant: isPublic ? "dark" : "outline",
											}),
											"h-10 px-4 font-bold text-sm no-underline"
										)}
										href={(isPublic ? "/login" : "/seeker/me") as Route}
									>
										{isPublic ? "시작하기" : "내 정보"}
									</Link>
								</>
							)}
						</div>
					</div>
				</header>
			) : null}
			<header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur md:hidden">
				<div className="flex h-14 items-center justify-between px-5">
					<Link aria-label="밤비 홈" className="no-underline" href="/">
						<Logo lang="ko" size="sm" />
					</Link>
					<div className="flex items-center gap-2">
						{isModerator ? (
							<ModeratorHeaderActions />
						) : (
							<>
								<Badge
									className="h-8 gap-1.5 px-3 font-bold"
									variant="secondary"
								>
									<span className="inline-flex size-3.5 text-green-600">
										<ShieldIcon />
									</span>
									보호 중
								</Badge>
								<Button
									aria-label="알림"
									className="bg-card"
									size="icon-lg"
									variant="outline"
								>
									<BellIcon />
								</Button>
							</>
						)}
					</div>
				</div>
			</header>
			<main
				className={cn(
					"mx-auto flex min-h-[calc(100dvh-56px)] w-full flex-col",
					className
				)}
			>
				{children}
			</main>
		</div>
	);
}
