"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
	navigationMenuTriggerStyle,
} from "@bambi-app/ui/components/navigation-menu";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useBambiAuth } from "./auth-client-provider";
import { Logo } from "./ds";
import { BellIcon, ShieldIcon } from "./icons";

export interface NavItem {
	href: Route;
	label: string;
}

// 여러 하위 링크를 하나의 드롭다운으로 접는 nav 그룹.
export interface NavGroup {
	items: NavItem[];
	label: string;
}

export type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
	return "items" in entry;
}

export const DEFAULT_NAV_ITEMS: NavEntry[] = [
	{ href: "/seeker", label: "채용정보" },
	{ href: "/seeker/chats", label: "채팅" },
	{ href: "/", label: "업체 인증" },
	{ href: "/seeker/community", label: "수다방" },
	{ href: "/support" as Route, label: "고객센터" },
];

interface ResponsiveAppShellProps {
	children: ReactNode;
	className?: string;
	// 데스크톱 헤더 바의 콘텐츠 폭. 기본은 유동 80%, 채용 경로는 고정폭을 주입한다.
	contentWidthClassName?: string;
	headerSlot?: ReactNode;
	navItems?: readonly NavEntry[];
	showDesktopNav?: boolean;
	variant?: "public" | "seeker" | "employer" | "moderator";
}

// 그룹을 포함한 nav 목록에서 실제 링크만 평탄화한다.
function collectNavLinks(entries: readonly NavEntry[]): NavItem[] {
	const links: NavItem[] = [];
	for (const entry of entries) {
		if (isNavGroup(entry)) {
			links.push(...entry.items);
		} else {
			links.push(entry);
		}
	}
	return links;
}

// 현재 경로와 가장 길게 일치하는 nav 링크만 활성 처리한다(/seeker·/seeker/chats 중복 방지).
function findActiveHref(
	pathname: string,
	entries: readonly NavEntry[]
): Route | undefined {
	let active: NavItem | undefined;
	for (const item of collectNavLinks(entries)) {
		const matches =
			pathname === item.href ||
			(item.href !== "/" && pathname.startsWith(`${item.href}/`));
		if (matches && item.href.length > (active?.href.length ?? 0)) {
			active = item;
		}
	}
	return active?.href;
}

// 데스크톱 헤더 nav 링크·그룹 트리거 공통 톤(밤비 헤더: 굵게·muted).
function navItemClassName(isActive: boolean): string {
	return cn(
		"h-auto px-3 py-2 font-bold text-muted-foreground text-sm no-underline",
		isActive && "bg-muted text-foreground"
	);
}

// 여러 하위 링크를 접는 nav 그룹. NavigationMenu 트리거로 펼친다.
function NavGroupItem({
	activeHref,
	group,
}: {
	activeHref?: Route;
	group: NavGroup;
}) {
	const isActive = group.items.some((item) => item.href === activeHref);
	return (
		<NavigationMenuItem>
			<NavigationMenuTrigger className={navItemClassName(isActive)}>
				{group.label}
			</NavigationMenuTrigger>
			<NavigationMenuContent>
				<ul className="grid w-44 gap-1">
					{group.items.map((item) => (
						<li key={`${item.href}-${item.label}`}>
							<NavigationMenuLink
								className={cn(
									"font-bold text-sm",
									item.href === activeHref && "bg-muted/50"
								)}
								render={<Link href={item.href} />}
							>
								{item.label}
							</NavigationMenuLink>
						</li>
					))}
				</ul>
			</NavigationMenuContent>
		</NavigationMenuItem>
	);
}

// 구직자 홈(seeker/public 셸) 헤더에서 "내 정보" 왼쪽에 노출되는 역할 전환 버튼.
// 구인자는 /employer, 운영자(admin)는 /moderator로 이동한다. 구직자·비로그인은 없음.
function RoleSwitchLink() {
	const { role } = useBambiAuth();
	const linkClassName = cn(
		buttonVariants({ variant: "outline" }),
		"h-10 px-4 font-bold text-sm no-underline"
	);
	if (role === "employer") {
		return (
			<Link className={linkClassName} href={"/employer" as Route}>
				구인 관리
			</Link>
		);
	}
	if (role === "admin") {
		return (
			<Link className={linkClassName} href={"/moderator" as Route}>
				운영자 모드
			</Link>
		);
	}
	return null;
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
	contentWidthClassName = "max-w-[80%]",
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
					<div
						className={cn(
							"mx-auto flex h-16 items-center gap-7 px-6",
							contentWidthClassName
						)}
					>
						<Link aria-label="밤비 홈" className="no-underline" href="/">
							<Logo lang="ko" size="md" />
						</Link>
						{navItems.length > 0 ? (
							<NavigationMenu>
								<NavigationMenuList className="gap-1">
									{navItems.map((entry) => {
										if (isNavGroup(entry)) {
											return (
												<NavGroupItem
													activeHref={activeHref}
													group={entry}
													key={`group-${entry.label}`}
												/>
											);
										}
										const isActive = entry.href === activeHref;
										return (
											<NavigationMenuItem key={`${entry.href}-${entry.label}`}>
												<NavigationMenuLink
													aria-current={isActive ? "page" : undefined}
													className={cn(
														navigationMenuTriggerStyle(),
														navItemClassName(isActive)
													)}
													render={<Link href={entry.href} />}
												>
													{entry.label}
												</NavigationMenuLink>
											</NavigationMenuItem>
										);
									})}
								</NavigationMenuList>
							</NavigationMenu>
						) : null}
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
									{isPublic ? null : <RoleSwitchLink />}
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
						{(() => {
							if (isModerator) {
								return <ModeratorHeaderActions />;
							}
							return (
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
							);
						})()}
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
