// 밤비 — 모바일 우선 앱 셸.
// 모바일: 화면을 꽉 채우는 단일 컬럼. 데스크톱: 가운데 모바일 셸 + 왼쪽 홍보 배너 거터.

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
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

const TONE: Record<
	PromoTone,
	{ body: string; card: string; chip: string; eyebrow: string; title: string }
> = {
	coral: {
		card: "bg-primary text-white",
		chip: "bg-white/20 text-white",
		eyebrow: "text-white",
		title: "text-white",
		body: "text-white/85",
	},
	ink: {
		card: "bg-ink-800 text-white",
		chip: "bg-white/10 text-coral-300",
		eyebrow: "text-coral-300",
		title: "text-white",
		body: "text-white/70",
	},
	light: {
		card: "border border-border bg-card text-foreground",
		chip: "bg-coral-50 text-coral-700",
		eyebrow: "text-coral-700",
		title: "text-foreground",
		body: "text-muted-foreground",
	},
};

function PromoCard({ p }: { p: Promo }) {
	const t = TONE[p.tone];
	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded-3xl p-[22px] shadow-lg",
				t.card
			)}
		>
			<div className="flex items-center gap-2.5">
				<span
					className={cn(
						"inline-flex size-10 items-center justify-center rounded-xl",
						t.chip
					)}
				>
					<span className="inline-flex size-5">{p.icon}</span>
				</span>
				<span
					className={cn("font-extrabold text-xs tracking-[0.06em]", t.eyebrow)}
				>
					{p.eyebrow}
				</span>
			</div>
			<div className={cn("font-extrabold text-[19px] leading-snug", t.title)}>
				{p.title}
			</div>
			<p className={cn("text-[13.5px] leading-relaxed", t.body)}>{p.body}</p>
		</div>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-[100dvh] items-start justify-center bg-background md:gap-7 md:bg-secondary">
			<aside className="hidden h-[100dvh] w-[296px] shrink-0 flex-col justify-center gap-4 min-[1080px]:flex">
				{PROMOS.map((p) => (
					<PromoCard key={p.title} p={p} />
				))}
			</aside>
			<div className="relative flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-background md:shadow-2xl md:ring-1 md:ring-border">
				{children}
			</div>
			{/* 오른쪽은 앱을 가운데 정렬하기 위한 빈 여백 */}
			<div className="hidden w-[296px] shrink-0 min-[1080px]:block" />
		</div>
	);
}
