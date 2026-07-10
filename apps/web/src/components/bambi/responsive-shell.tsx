"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useBambiAuth } from "./auth-client-provider";
import { Logo } from "./ds";
import { BellIcon, ShieldIcon } from "./icons";
import { SiteFooter } from "./site-footer";

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
	// 데스크톱 헤더 바의 콘텐츠 폭. 기본은 유동 80%, 채용 경로는 고정폭을 주입한다.
	contentWidthClassName?: string;
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
	// 푸터는 구직자·구인자 셸에만 노출한다(운영자·공개 셸 제외).
	const showFooter = variant === "seeker" || variant === "employer";
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
				{showFooter ? (
					<SiteFooter
						contentWidthClassName={contentWidthClassName}
						withBottomNavClearance
					/>
				) : null}
			</main>
		</div>
	);
}
