"use client";

// 밤비 — 마이페이지(내 정보) 공용 셸. /seeker/me 와 하위 4개 화면(신고 내역·예정된
// 면접·차단한 상대·계정 설정)이 공유한다. 구직자 전용이 아니라 구인자도 헤더 "내 정보"로
// 들어오므로 역할은 프로필 카드의 라벨로만 구분한다.
//
// md↑: 좌측 사이드바(프로필 아이덴티티 카드 + 내비 + 로그아웃, sticky) + 우측 콘텐츠 2단.
// <md: 사이드바를 접고 허브(/seeker/me)에만 프로필·메뉴·로그아웃을 쌓는다. 하위 화면은
// 상단 "내 정보" 복귀 링크 + 콘텐츠만 — 모바일에서 되돌아갈 길이 없던 결함을 메운다.
//
// 셸을 layout.tsx가 아니라 컴포넌트로 둔 이유: 프로필 카드가 세션·프로필 쿼리에 의존하는데
// layout은 각 page의 RequireAuth 바깥이라 비로그인 상태에서도 아이덴티티 UI가 먼저 그려진다.

import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { signOutToHome } from "@/lib/bambi/auth-actions";
import { MANUAL_PATH } from "@/lib/bambi/manual";
import { orpc } from "@/utils/orpc";
import { useBambiAuth } from "./auth-client-provider";
import { Avatar, Badge } from "./ds";
import {
	BookOpenIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ClipboardListIcon,
	ClockIcon,
	DollarCircle,
	LockIcon,
	Message,
	SettingsIcon,
	UserIcon,
} from "./icons";

export const MY_PAGE_HUB_HREF = "/seeker/me" as Route;
export const ATTENDANCE_HREF = "/seeker/attendance" as Route;

// 출석 라우터는 구직자·업주만 허용한다(서버 게이트) — 법률자문·운영자에게는 진입점 자체를
// 감춘다. 그대로 두면 눌러서 에러 화면을 보게 된다. 역할 로딩 중(null)에도 감춘 뒤 나타난다.
export const canUseAttendance = (role: null | string): boolean =>
	role === "job_seeker" || role === "employer";

// 표시 라벨은 여기서만 만든다 — enum 원값(job_seeker·legal_advisor …)이 화면에 새지 않도록
// 미등록 역할도 "구직자"로 떨어뜨린다. 법률자문은 구직자 계정에 얹는 역할이라 폴백도 자연스럽다.
// 운영자 콘솔 라벨("법률자문")과 달리 당사자에게 보이는 내 정보에서는 "법률자문가"로 부른다.
const ROLE_LABELS: Record<string, string> = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
	legal_advisor: "법률자문가",
};

const NAV_ITEMS: { href: Route; icon: ReactNode; label: string }[] = [
	{ href: MY_PAGE_HUB_HREF, icon: <UserIcon />, label: "내 정보" },
	{
		href: "/seeker/me/reports" as Route,
		icon: <ClipboardListIcon />,
		label: "내 신고 내역",
	},
	{
		href: "/seeker/me/content" as Route,
		icon: <ClipboardListIcon />,
		label: "글 관리",
	},
	{
		href: "/seeker/me/interviews" as Route,
		icon: <ClockIcon />,
		label: "예정된 면접",
	},
	{
		href: "/seeker/me/blocks" as Route,
		icon: <LockIcon />,
		label: "차단한 상대",
	},
	{
		href: ATTENDANCE_HREF,
		icon: <DollarCircle />,
		label: "포인트 내역",
	},
	{
		href: "/seeker/me/settings" as Route,
		icon: <SettingsIcon />,
		label: "계정 설정",
	},
	{ href: MANUAL_PATH, icon: <BookOpenIcon />, label: "이용 가이드" },
	{ href: "/support" as Route, icon: <Message />, label: "고객센터" },
];

// 역할별로 감추는 항목. 운영자는 신고·면접·차단·고객센터를 콘솔에서 처리하므로 개인용
// 메뉴가 의미 없다. 이용 가이드도 운영자는 콘솔 "콘텐츠 → 운영자 매뉴얼"로 보므로 감춘다.
// 구인자는 예정된 면접을 그대로 본다 — 카드가 호출자 기준(구직자 닉네임·공고명·일시)으로
// 그려지므로 구인자 시점에서도 읽힌다. 노출만 감추는 것이라 직접 URL로는 그대로 들어갈 수
// 있다. 데스크톱 허브 카드(screens/seeker.tsx)도 같은 표를 쓴다.
const HIDDEN_MY_PAGE_HREFS: Record<string, string[]> = {
	admin: [
		"/seeker/me/reports",
		"/seeker/me/interviews",
		"/seeker/me/blocks",
		"/manual",
		"/support",
	],
};

export function isMyPageItemVisible(href: string, role: string | null) {
	// 출석은 서버 게이트(job_seeker·employer)와 같은 조건으로 감춘다 — 다른 역할이 눌러
	// 에러 화면을 보지 않게. 직접 URL 진입은 서버 FORBIDDEN이 막는다.
	if (href === ATTENDANCE_HREF && !canUseAttendance(role)) {
		return false;
	}
	return !HIDDEN_MY_PAGE_HREFS[role ?? ""]?.includes(href);
}

function ProfileCard() {
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	// 표시명(닉네임)의 정본은 user.name(세션). bambi_profile.display_name은 제거됐다.
	const displayName = session.data?.user?.name?.trim() || "구직자 회원";
	const roleLabel = ROLE_LABELS[profile?.role ?? ""] ?? "구직자";
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);

	if (mineQuery.isLoading) {
		return (
			<div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
				<Skeleton className="size-14 rounded-full" />
				<div className="flex-1">
					<Skeleton className="h-5 w-28 rounded-md" />
					<Skeleton className="mt-2 h-4 w-24 rounded-md" />
				</div>
			</div>
		);
	}

	return (
		// 코럴 보더 링은 이 구역의 시그니처 — 사이드바에서도 그대로 유지한다.
		// 인증 배지는 최상위가 아니라 역할 라벨 줄에 둔다 — 긴 이름이 두 줄로 꺾여도 배지가
		// 어정쩡한 높이에 끼지 않고, 그 줄이 flex-wrap이라 좁은 사이드바에선 아래로 접힌다.
		<Link
			aria-label="계정 설정으로 이동"
			className="flex items-center gap-3 rounded-xl border border-primary bg-card p-4 no-underline transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
			href="/seeker/me/settings"
		>
			<Avatar
				fallbackIcon="user"
				name={displayName}
				ring
				size="lg"
				src={session.data?.user.image ?? undefined}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-1.5 break-words font-extrabold text-foreground text-lg leading-tight">
					<span>{displayName}</span>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="text-muted-foreground text-sm">{roleLabel}</span>
					<Badge tone={isPhoneVerified ? "primary" : "neutral"}>
						{isPhoneVerified ? "인증완료" : "인증 필요"}
					</Badge>
				</div>
			</div>
		</Link>
	);
}

function MyPageNav() {
	const pathname = usePathname();
	const { role } = useBambiAuth();
	const items = NAV_ITEMS.filter((item) =>
		isMyPageItemVisible(item.href, role)
	);
	return (
		// 사이드바(md↑)와 모바일 허브가 같은 행 렌더를 공유한다. 셰브런은 카드 리스트로
		// 보이는 모바일에서만 노출(md:hidden) — 사이드바는 활성 하이라이트로 위치를 알린다.
		<nav aria-label="내 정보 메뉴" className="flex flex-col gap-1">
			{items.map((item) => {
				const isActive = pathname === item.href;
				return (
					<Link
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-secondary",
							isActive
								? "bg-secondary font-bold text-foreground"
								: "font-semibold text-muted-foreground"
						)}
						href={item.href}
						key={item.href}
					>
						<span className="inline-flex size-5">{item.icon}</span>
						<span className="min-w-0 flex-1 truncate">{item.label}</span>
						<span className="inline-flex size-4 text-muted-foreground md:hidden">
							<ChevronRightIcon />
						</span>
					</Link>
				);
			})}
		</nav>
	);
}

function SignOutButton() {
	const router = useRouter();
	const handleSignOut = async () => {
		await signOutToHome(router);
	};
	return (
		<Button
			className="w-full"
			onClick={handleSignOut}
			type="button"
			variant="outline"
		>
			로그아웃
		</Button>
	);
}

export function MyPageShell({
	children,
	hubSummary,
	title,
}: {
	children: ReactNode;
	hubSummary?: ReactNode;
	title: string;
}) {
	const pathname = usePathname();
	const isHub = pathname === MY_PAGE_HUB_HREF;

	return (
		// 폭 캡·센터링은 여기서 하지 않는다 — me/layout.tsx의 rail 3열이 seeker 중앙 컬럼과
		// 같은 캡(SEEKER_CONTENT_WIDTH)을 이미 건다. 셸이 mx-auto를 갖고 flex 자식이 되면
		// auto 마진이 justify-center보다 먼저 여유 폭을 흡수해 aside가 화면 끝까지 밀리고,
		// 캡을 또 걸면 92%가 이중으로 곱혀 seeker보다 좁아진다. rail 밖 소비처(출석체크)는
		// 페이지 쪽 래퍼가 같은 캡을 건다.
		<div className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-5 py-6 md:flex-row md:gap-8 md:overflow-visible md:px-6">
			<aside className="hidden w-56 shrink-0 md:block lg:w-64">
				<div className="sticky top-20 flex flex-col gap-4">
					<ProfileCard />
					<MyPageNav />
					<SignOutButton />
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col gap-4">
				{isHub ? null : (
					<Link
						className="inline-flex w-fit items-center gap-1 font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground md:hidden"
						href={MY_PAGE_HUB_HREF}
					>
						<span className="inline-flex size-4">
							<ChevronLeftIcon />
						</span>
						내 정보
					</Link>
				)}
				<h1 className="font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					{title}
				</h1>
				{isHub ? (
					<>
						<div className="md:hidden">
							<ProfileCard />
						</div>
						{hubSummary}
						<div className="flex flex-col gap-4 md:hidden">
							<div className="rounded-xl border border-border bg-card p-2">
								<MyPageNav />
							</div>
							<SignOutButton />
						</div>
					</>
				) : null}
				{children}
			</div>
		</div>
	);
}
