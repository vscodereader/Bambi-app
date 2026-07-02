// 밤비 — 역할 선택 진입 화면 (/).
// 인증 없는 데모: 역할을 고르면 해당 서비스(구직자/구인자/운영자)로 진입한다.

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/bambi/app-shell";
import { Logo } from "@/components/bambi/ds";
import {
	BriefcaseIcon,
	ChevronRightIcon,
	Search2,
	ShieldIcon,
} from "@/components/bambi/icons";

interface RoleCard {
	desc: string;
	href: Route;
	icon: ReactNode;
	primary?: boolean;
	title: string;
}

const ROLES: RoleCard[] = [
	{
		title: "구직자",
		desc: "안전하게 일자리를 찾고 면접까지 진행해요",
		href: "/seeker",
		icon: <Search2 />,
		primary: true,
	},
	{
		title: "구인자",
		desc: "검수를 통과한 공고로 신뢰를 쌓아요",
		href: "/employer",
		icon: <BriefcaseIcon />,
	},
	{
		title: "운영자",
		desc: "검수·신고·제재로 안전을 지켜요",
		href: "/moderator",
		icon: <ShieldIcon />,
	},
];

export default function Home() {
	return (
		<AppShell>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-7 pb-6">
				<div className="flex items-center justify-between">
					<Logo lang="ko" size="lg" />
					<span className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-secondary px-[11px] font-bold text-foreground text-xs">
						<span className="inline-flex size-3.5 text-green-600">
							<ShieldIcon />
						</span>
						신뢰·안전
					</span>
				</div>

				<div className="py-10">
					<h1 className="font-extrabold text-[30px] text-foreground leading-[1.28] tracking-[-0.02em]">
						밤비에 오신 걸
						<br />
						환영해요
					</h1>
					<p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
						합법 유흥·접객 채용을 안전하게.
						<br />
						어떤 역할로 시작할까요?
					</p>
				</div>

				<div className="flex flex-col gap-3">
					{ROLES.map((r) => (
						<Link
							className={cn(
								"flex items-center gap-3.5 rounded-2xl p-[18px] no-underline",
								r.primary
									? "bg-ink-800 text-white shadow-md"
									: "border border-border bg-card shadow-sm"
							)}
							href={r.href}
							key={r.title}
						>
							<span
								className={cn(
									"inline-flex size-12 shrink-0 items-center justify-center rounded-[14px]",
									r.primary
										? "bg-primary text-white"
										: "bg-coral-50 text-coral-700"
								)}
							>
								<span className="inline-flex size-6">{r.icon}</span>
							</span>
							<div className="min-w-0 flex-1">
								<div
									className={cn(
										"font-extrabold text-[17px]",
										r.primary ? "text-white" : "text-foreground"
									)}
								>
									{r.title}
								</div>
								<div
									className={cn(
										"mt-0.5 text-[13px]",
										r.primary ? "text-white/70" : "text-muted-foreground"
									)}
								>
									{r.desc}
								</div>
							</div>
							<span
								className={cn(
									"inline-flex size-5",
									r.primary ? "text-white/60" : "text-muted-foreground"
								)}
							>
								<ChevronRightIcon />
							</span>
						</Link>
					))}
				</div>

				<div className="flex-1" />

				<div className="flex justify-center pt-6">
					<Link
						className="font-semibold text-[13px] text-muted-foreground no-underline"
						href="/preview"
					>
						디자인 프리뷰 보기 →
					</Link>
				</div>
			</div>
		</AppShell>
	);
}
