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
import { useUnreadMessageCount } from "@/lib/bambi/use-unread-message-count";
import { useBambiAuth } from "./auth-client-provider";
import { Logo } from "./ds";
import { Message, ShieldIcon } from "./icons";
import { NotificationBell } from "./notification-bell";
import { SiteFooter } from "./site-footer";

// 채팅 상세는 <md에서 카카오톡식 풀스크린이라 셸의 모바일 헤더를 숨긴다(md+ 데스크톱 헤더는 유지).
const CHAT_ROOM_PATH_RE = /^\/seeker\/chats\/[^/]+$/;

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
	{ href: "/seeker/community", label: "수다방" },
	{ href: "/point-shop" as Route, label: "포인트몰" },
	{ href: "/support" as Route, label: "고객센터" },
];

interface ResponsiveAppShellProps {
	children: ReactNode;
	className?: string;
	// 데스크톱 헤더 바의 콘텐츠 폭. 기본은 유동 80%, 채용 경로는 고정폭을 주입한다.
	contentWidthClassName?: string;
	headerSlot?: ReactNode;
	// 모바일 헤더(<md) 우측 액션 앞에 끼우는 슬롯. 두 헤더는 CSS로만 숨겨질 뿐 항상
	// 함께 마운트되므로, 같은 노드를 재사용하지 말고 별도 인스턴스를 넘긴다
	// (전역 단축키를 쓰는 슬롯이면 리스너가 두 번 등록된다).
	mobileHeaderSlot?: ReactNode;
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

// 알림 벨과 동일한 형태의 헤더 채팅 아이콘 버튼(아이콘은 모바일 탭바 채팅 탭과 같다).
// 로그인 셸에서는 안 읽은 메시지 총합을 숫자 배지로 표시하고, 비로그인 public 셸은
// 버튼만 노출한다.
function ChatNavButton({ withPin }: { withPin: boolean }) {
	const unreadMessageCount = useUnreadMessageCount();
	const showBadge = withPin && unreadMessageCount > 0;
	return (
		<span className="relative inline-flex">
			<Button
				aria-label={
					showBadge ? `채팅, 읽지 않은 메시지 ${unreadMessageCount}개` : "채팅"
				}
				className="bg-card"
				nativeButton={false}
				render={<Link href={"/seeker/chats" as Route} />}
				size="icon-lg"
				variant="outline"
			>
				<Message />
			</Button>
			{showBadge ? (
				<Badge className="absolute -top-2 -right-2 min-w-5 justify-center px-1 text-xs">
					{unreadMessageCount}
				</Badge>
			) : null}
		</span>
	);
}

function ModeratorHeaderActions() {
	return (
		<>
			<NotificationBell />
			<Badge className="h-9 gap-1.5 px-3 font-bold" variant="secondary">
				<span className="inline-flex size-3.5">
					<ShieldIcon />
				</span>
				운영자 모드
			</Badge>
		</>
	);
}

// 헤더 우측 액션 묶음. 운영자는 전용 액션, 그 외에는 채팅·알림·역할 전환·내 정보/시작하기.
function HeaderRightActions({
	isModerator,
	isPublic,
	showChatButton,
}: {
	isModerator: boolean;
	isPublic: boolean;
	showChatButton: boolean;
}) {
	if (isModerator) {
		return <ModeratorHeaderActions />;
	}
	return (
		<>
			{showChatButton ? <ChatNavButton withPin={!isPublic} /> : null}
			{/* 벨은 스스로 로그인 여부로 게이트한다 — public 라우트를 보는 로그인 사용자에게도
			    모바일 헤더와 똑같이 노출한다(폭에 따라 벨이 사라지지 않게). */}
			<NotificationBell />
			{isPublic ? null : <RoleSwitchLink />}
			<Link
				className={cn(
					buttonVariants({ variant: isPublic ? "dark" : "outline" }),
					"h-10 px-4 font-bold text-sm no-underline"
				)}
				href={(isPublic ? "/seeker?auth=login" : "/seeker/me") as Route}
			>
				{isPublic ? "시작하기" : "내 정보"}
			</Link>
		</>
	);
}

export function ResponsiveAppShell({
	children,
	className,
	contentWidthClassName = "max-w-[80%]",
	headerSlot,
	mobileHeaderSlot,
	navItems = DEFAULT_NAV_ITEMS,
	showDesktopNav = true,
	variant = "public",
}: ResponsiveAppShellProps) {
	const pathname = usePathname();
	const { accountStatus, isPending } = useBambiAuth();
	const isPublic = variant === "public";
	const isModerator = variant === "moderator";
	// 채팅 버튼은 기존 nav "채팅"이 뜨던 셸(구직자·고객센터=seeker, 공개 마켓)에만
	// 노출한다. 구인자·운영자 셸에는 넣지 않는다.
	const showChatButton = variant === "seeker" || variant === "public";
	// 푸터는 구직자·구인자·운영자 셸에 노출한다(공개 셸 제외).
	const showFooter =
		variant === "seeker" || variant === "employer" || variant === "moderator";
	const activeHref = findActiveHref(pathname, navItems);
	// 채팅방은 모바일 헤더를 숨기고 자체 뷰포트 높이(fixed 오버레이/고정 높이)를 쓴다.
	const isChatRoom = CHAT_ROOM_PATH_RE.test(pathname);
	return (
		<div className="min-h-[100dvh] bg-secondary text-foreground">
			{showDesktopNav ? (
				<header className="sticky top-0 z-30 hidden border-border border-b bg-background/95 backdrop-blur md:block">
					{/* 좁은 폭에서는 간격부터 줄인다. 내비가 스크롤로 넘어가는 구간을 최대한
					    뒤로 미뤄, 실제로 스크롤이 필요한 경우를 운영자처럼 항목이 많은
					    역할로 한정한다. */}
					<div
						className={cn(
							"mx-auto flex h-16 items-center gap-3 px-6 lg:gap-7",
							contentWidthClassName
						)}
					>
						{/* 헤더 행에서 줄어들 수 있는 건 이 브랜드 링크뿐이었다: 내비 항목은 w-max, */}
						{/* 우측 버튼·배지는 shrink-0이라 폭이 모자라면 압축이 전부 여기로 몰린다. */}
						{/* shrink-0이 없으면 링크가 한 글자 폭까지 찌그러져 로고가 세로로 쌓인다. */}
						<Link
							aria-label="밤비알바 홈"
							className="shrink-0 no-underline"
							href="/"
						>
							<Logo lang="ko" size="md" />
						</Link>
						{navItems.length > 0 ? (
							// 내비 항목은 navigationMenuTriggerStyle의 w-max라 최소폭이 라벨 전체 폭이다.
							// 그래서 항목이 많은 역할(운영자 7개)은 헤더 폭(min(92%,1120px))을 넘겨
							// 행 전체가 가로로 넘쳤다. min-w-0으로 내비가 줄어들 수 있게 하고 넘치는
							// 만큼은 내비 안에서만 가로 스크롤시킨다 — 브랜드·우측 액션은 제자리를 지킨다.
							// 드롭다운은 Positioner가 Portal 안이라 overflow에 잘리지 않는다.
							<NavigationMenu className="min-w-0">
								{/* 기본 justify-center는 넘칠 때 앞쪽 항목이 잘려 스크롤로도 닿지 않는
								    고전적인 문제가 있다. 헤더에서 내비는 어차피 왼쪽 정렬이라 start로 둔다. */}
								<NavigationMenuList className="justify-start gap-1 overflow-x-auto [scrollbar-width:none]">
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
										const isDisabledEmployerRegistration =
											variant === "employer" &&
											entry.href === "/employer/new" &&
											(isPending || accountStatus === "suspended");
										return (
											<NavigationMenuItem key={`${entry.href}-${entry.label}`}>
												<NavigationMenuLink
													aria-current={isActive ? "page" : undefined}
													aria-disabled={
														isDisabledEmployerRegistration || undefined
													}
													className={cn(
														navigationMenuTriggerStyle(),
														navItemClassName(isActive),
														isDisabledEmployerRegistration &&
															"cursor-not-allowed opacity-40"
													)}
													render={
														isDisabledEmployerRegistration ? (
															<span />
														) : (
															<Link href={entry.href} />
														)
													}
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
							<HeaderRightActions
								isModerator={isModerator}
								isPublic={isPublic}
								showChatButton={showChatButton}
							/>
						</div>
					</div>
				</header>
			) : null}
			<header
				className={cn(
					"sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur md:hidden",
					isChatRoom && "hidden"
				)}
			>
				<div className="flex h-14 items-center justify-between px-5">
					{/* 데스크톱과 같은 이유로 shrink-0 — 좁은 화면에서 우측 액션이 늘어나면
					    브랜드가 압축 대상이 된다. */}
					<Link
						aria-label="밤비알바 홈"
						className="shrink-0 no-underline"
						href="/"
					>
						<Logo lang="ko" size="sm" />
					</Link>
					<div className="flex items-center gap-2">
						{mobileHeaderSlot}
						{isModerator ? <ModeratorHeaderActions /> : <NotificationBell />}
					</div>
				</div>
			</header>
			<main className={cn("mx-auto flex w-full flex-col", className)}>
				{/* 콘텐츠 래퍼에만 최소 높이를 줘, 짧은 페이지에서도 푸터가 첫 화면
				    아래로 밀린다(모바일 헤더 56px·데스크톱 64px 제외). 채팅방은 자체
				    높이를 쓰므로 min-h를 주지 않는다. */}
				<div
					className={cn(
						"flex w-full flex-col",
						!isChatRoom &&
							"min-h-[calc(100dvh-56px)] md:min-h-[calc(100dvh-64px)]"
					)}
				>
					{children}
				</div>
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
