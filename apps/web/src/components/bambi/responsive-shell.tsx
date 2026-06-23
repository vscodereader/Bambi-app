"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ds";
import { BellIcon, ShieldIcon } from "./icons";

interface NavItem {
	href: Route;
	label: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
	{ href: "/seeker", label: "채용정보" },
	{ href: "/seeker/chats", label: "채팅" },
	{ href: "/", label: "안전가이드" },
	{ href: "/employer", label: "업체 인증" },
];

interface ResponsiveAppShellProps {
	children: ReactNode;
	className?: string;
	navItems?: readonly NavItem[];
	showDesktopNav?: boolean;
	variant?: "public" | "seeker" | "employer" | "moderator";
}

export function ResponsiveAppShell({
	children,
	className,
	navItems = DEFAULT_NAV_ITEMS,
	showDesktopNav = true,
	variant = "public",
}: ResponsiveAppShellProps) {
	const isPublic = variant === "public";
	return (
		<div className="min-h-[100dvh] bg-secondary text-foreground">
			{showDesktopNav ? (
				<header className="sticky top-0 z-30 hidden border-border border-b bg-background/95 backdrop-blur md:block">
					<div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-6">
						<Link aria-label="밤비 홈" className="no-underline" href="/">
							<Logo lang="ko" size="md" />
						</Link>
						<nav className="flex items-center gap-1">
							{navItems.map((item) => (
								<Link
									className="rounded-lg px-3 py-2 font-bold text-muted-foreground text-sm no-underline transition-colors hover:bg-secondary hover:text-foreground"
									href={item.href}
									key={`${item.href}-${item.label}`}
								>
									{item.label}
								</Link>
							))}
						</nav>
						<div className="ml-auto flex items-center gap-2">
							<span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-green-50 px-3 font-bold text-green-600 text-xs">
								<span className="inline-flex size-3.5">
									<ShieldIcon />
								</span>
								연락처 보호
							</span>
							<Link
								className={cn(
									"inline-flex h-10 items-center rounded-lg px-4 font-bold text-sm no-underline",
									isPublic
										? "bg-ink-800 text-white"
										: "border border-border bg-card text-foreground"
								)}
								href={(isPublic ? "/login" : "/seeker/me") as Route}
							>
								{isPublic ? "시작하기" : "내 정보"}
							</Link>
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
						<span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 font-bold text-foreground text-xs">
							<span className="inline-flex size-3.5 text-green-600">
								<ShieldIcon />
							</span>
							보호 중
						</span>
						<button
							aria-label="알림"
							className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground"
							type="button"
						>
							<span className="inline-flex size-4">
								<BellIcon />
							</span>
						</button>
					</div>
				</div>
			</header>
			<main
				className={cn("mx-auto min-h-[calc(100dvh-56px)] w-full", className)}
			>
				{children}
			</main>
		</div>
	);
}
