// 밤비 — 역할 선택 진입 화면 (/).
// 인증 없는 데모: 역할을 고르면 해당 서비스(구직자/구인자/운영자)로 진입한다.

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
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					padding: "28px 24px 24px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<Logo lang="ko" size="lg" />
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 5,
							height: 30,
							padding: "0 11px",
							borderRadius: "var(--radius-pill)",
							background: "var(--surface-subtle)",
							color: "var(--text-default)",
							fontFamily: "var(--font-sans)",
							fontSize: 12,
							fontWeight: 700,
						}}
					>
						<span
							style={{
								display: "inline-flex",
								width: 14,
								height: 14,
								color: "var(--green-600)",
							}}
						>
							<ShieldIcon />
						</span>
						신뢰·안전
					</span>
				</div>

				<div style={{ padding: "40px 0 28px" }}>
					<h1
						style={{
							margin: 0,
							fontFamily: "var(--font-display)",
							fontSize: 30,
							fontWeight: 800,
							lineHeight: 1.28,
							letterSpacing: "-0.02em",
							color: "var(--text-strong)",
						}}
					>
						밤비에 오신 걸
						<br />
						환영해요
					</h1>
					<p
						style={{
							margin: "12px 0 0",
							fontFamily: "var(--font-sans)",
							fontSize: 15,
							lineHeight: 1.6,
							color: "var(--text-muted)",
						}}
					>
						합법 유흥·접객 채용을 안전하게.
						<br />
						어떤 역할로 시작할까요?
					</p>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 12,
					}}
				>
					{ROLES.map((r) => (
						<Link
							href={r.href}
							key={r.title}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 14,
								padding: 18,
								borderRadius: 18,
								textDecoration: "none",
								background: r.primary
									? "var(--surface-inverse)"
									: "var(--surface-card)",
								border: r.primary
									? "1px solid transparent"
									: "1px solid var(--border-default)",
								boxShadow: r.primary
									? "var(--shadow-md)"
									: "var(--shadow-card)",
							}}
						>
							<span
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									width: 48,
									height: 48,
									flex: "0 0 48px",
									borderRadius: 14,
									background: r.primary
										? "var(--color-primary)"
										: "var(--color-primary-soft)",
									color: r.primary
										? "var(--white)"
										: "var(--color-primary-press)",
								}}
							>
								<span style={{ display: "inline-flex", width: 24, height: 24 }}>
									{r.icon}
								</span>
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 17,
										fontWeight: 800,
										color: r.primary ? "var(--white)" : "var(--text-strong)",
									}}
								>
									{r.title}
								</div>
								<div
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 13,
										marginTop: 2,
										color: r.primary
											? "var(--text-on-dark-muted)"
											: "var(--text-muted)",
									}}
								>
									{r.desc}
								</div>
							</div>
							<span
								style={{
									display: "inline-flex",
									width: 20,
									height: 20,
									color: r.primary
										? "rgba(255,255,255,0.6)"
										: "var(--text-subtle)",
								}}
							>
								<ChevronRightIcon />
							</span>
						</Link>
					))}
				</div>

				<div style={{ flex: 1 }} />

				<div
					style={{
						display: "flex",
						justifyContent: "center",
						paddingTop: 24,
					}}
				>
					<Link
						href="/preview"
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							fontWeight: 600,
							color: "var(--text-muted)",
							textDecoration: "none",
						}}
					>
						디자인 프리뷰 보기 →
					</Link>
				</div>
			</div>
		</AppShell>
	);
}
