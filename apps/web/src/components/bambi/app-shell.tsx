// 밤비 — 모바일 우선 앱 셸.
// 모바일: 화면을 꽉 채우는 단일 컬럼. 데스크톱: 가운데 모바일 셸 + 왼쪽 홍보 배너 거터.

import type { CSSProperties, ReactNode } from "react";
import { Flash, LockIcon, ShieldIcon } from "./icons";

type PromoTone = "coral" | "ink" | "light";

interface Promo {
	body: string;
	eyebrow: string;
	icon: ReactNode;
	title: string;
	tone: PromoTone;
}

const PROMOS: Promo[] = [
	{
		tone: "ink",
		eyebrow: "신뢰",
		title: "게시 전 전수 검수",
		body: "모든 공고는 게시 전 자동 필터와 운영자 검수를 함께 거쳐요.",
		icon: <ShieldIcon />,
	},
	{
		tone: "coral",
		eyebrow: "안전",
		title: "연락처는 비공개",
		body: "면접 확정·양측 동의 전까지 연락처는 공개되지 않아요.",
		icon: <LockIcon />,
	},
	{
		tone: "light",
		eyebrow: "이벤트",
		title: "신규 매장 인증 0원",
		body: "이번 달 신규 사업자 인증 매장은 등록 수수료가 무료예요.",
		icon: <Flash />,
	},
];

const PROMO_TONES: Record<
	PromoTone,
	{ bg: string; fg: string; sub: string; chip: string; chipFg: string }
> = {
	coral: {
		bg: "var(--color-primary)",
		fg: "var(--white)",
		sub: "rgba(255,255,255,0.86)",
		chip: "rgba(255,255,255,0.18)",
		chipFg: "var(--white)",
	},
	ink: {
		bg: "var(--ink-800)",
		fg: "var(--white)",
		sub: "var(--text-on-dark-muted)",
		chip: "rgba(255,255,255,0.1)",
		chipFg: "var(--coral-300)",
	},
	light: {
		bg: "var(--surface-card)",
		fg: "var(--text-strong)",
		sub: "var(--text-muted)",
		chip: "var(--color-primary-soft)",
		chipFg: "var(--color-primary-press)",
	},
};

function PromoCard({ p }: { p: Promo }) {
	const t = PROMO_TONES[p.tone];
	const cardStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		gap: 12,
		padding: 22,
		borderRadius: 22,
		background: t.bg,
		color: t.fg,
		border:
			p.tone === "light"
				? "1px solid var(--border-subtle)"
				: "1px solid transparent",
		boxShadow: "var(--shadow-card)",
	};
	return (
		<div style={cardStyle}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
				}}
			>
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 40,
						height: 40,
						borderRadius: 12,
						background: t.chip,
						color: t.chipFg,
					}}
				>
					<span style={{ display: "inline-flex", width: 20, height: 20 }}>
						{p.icon}
					</span>
				</span>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12,
						fontWeight: 800,
						letterSpacing: "0.06em",
						color: t.chipFg,
					}}
				>
					{p.eyebrow}
				</span>
			</div>
			<div
				style={{
					fontFamily: "var(--font-display)",
					fontSize: 19,
					fontWeight: 800,
					lineHeight: 1.3,
					color: t.fg,
				}}
			>
				{p.title}
			</div>
			<p
				style={{
					margin: 0,
					fontFamily: "var(--font-sans)",
					fontSize: 13.5,
					lineHeight: 1.55,
					color: t.sub,
				}}
			>
				{p.body}
			</p>
		</div>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="bambi-backdrop">
			<aside aria-hidden="true" className="bambi-promo">
				{PROMOS.map((p) => (
					<PromoCard key={p.title} p={p} />
				))}
			</aside>
			<div className="bambi-app">{children}</div>
			{/* 오른쪽은 앱을 가운데 정렬하기 위한 빈 여백 */}
			<div aria-hidden="true" className="bambi-promo" />
		</div>
	);
}
