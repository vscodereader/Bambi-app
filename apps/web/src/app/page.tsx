"use client";

import { buttonVariants } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";

import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { formatNullable } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const roleLabels = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
} as const;

interface HomeAction {
	href: Route;
	label: string;
}

const getPrimaryHref = (role: null | string | undefined): Route => {
	if (!role) {
		return "/onboarding" as Route;
	}

	if (role === "employer" || role === "admin") {
		return "/employer" as Route;
	}

	return "/jobs" as Route;
};

const getRoleLabel = (role: null | string | undefined): string => {
	if (!role) {
		return "프로필 미설정";
	}

	return roleLabels[role as keyof typeof roleLabels] ?? role;
};

const primaryActionLabels = {
	"/employer": "구인자 관리",
	"/jobs": "공고 보기",
	"/onboarding": "온보딩 시작",
} as const;

const getSecondaryActions = (role: null | string | undefined): HomeAction[] => {
	if (role === "employer" || role === "admin") {
		return [{ href: "/chats" as Route, label: "채팅" }];
	}

	if (role === "job_seeker") {
		return [{ href: "/chats" as Route, label: "채팅" }];
	}

	return [];
};

export default function Home() {
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});

	if (session.isPending) {
		return <Loader />;
	}

	if (!isSignedIn) {
		return (
			<PageShell
				description="계정으로 로그인한 뒤 밤비 구인구직 도구를 사용할 수 있습니다."
				title="밤비"
			>
				<section className="grid gap-4 border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
					<div className="space-y-1">
						<h2 className="font-medium text-base">시작하기</h2>
						<p className="text-muted-foreground text-sm">
							구직자와 구인자 모두 하나의 계정으로 프로필을 만들 수 있습니다.
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/login?mode=sign-up"
						>
							회원가입
						</Link>
					</div>
				</section>
			</PageShell>
		);
	}

	if (mineQuery.isLoading) {
		return <Loader />;
	}

	const profile = mineQuery.data?.bambiProfile ?? null;
	const role = profile?.role;
	const primaryHref = getPrimaryHref(role);
	const secondaryActions = getSecondaryActions(role);

	return (
		<PageShell
			description="프로필 상태에 맞춰 필요한 업무 화면으로 이동합니다."
			title="밤비 홈"
		>
			<section className="grid gap-4 border p-4 lg:grid-cols-[1fr_auto] lg:items-center">
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="font-medium text-base">
							{formatNullable(profile?.displayName ?? session.data?.user.name)}
						</h2>
						<StatusBadge tone={role ? "good" : "warning"}>
							{getRoleLabel(role)}
						</StatusBadge>
					</div>
					<p className="text-muted-foreground text-sm">
						{role
							? "주요 작업을 바로 이어서 진행할 수 있습니다."
							: "구직자 또는 구인자 프로필을 먼저 선택해 주세요."}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
					<Link className={buttonVariants()} href={primaryHref}>
						{primaryActionLabels[
							primaryHref as keyof typeof primaryActionLabels
						] ?? "바로가기"}
					</Link>
					{secondaryActions.map(({ href, label }) => (
						<Link
							className={buttonVariants({ variant: "outline" })}
							href={href}
							key={href}
						>
							{label}
						</Link>
					))}
				</div>
			</section>
		</PageShell>
	);
}
