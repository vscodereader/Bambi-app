// 밤비 — 약관·개인정보 처리방침 등 법적 문서 공용 레이아웃 프리미티브.
// 타이포·간격을 한곳에서 통일한다. shadcn 토큰만 사용(임의 CSS 금지).

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";

export function LegalDoc({
	title,
	effectiveDate,
	intro,
	children,
}: {
	title: string;
	effectiveDate: string;
	intro?: ReactNode;
	children: ReactNode;
}) {
	return (
		<article className="flex w-full flex-col gap-8 py-10 md:py-14">
			<header className="flex flex-col gap-2">
				<h1 className="font-bold text-2xl text-foreground tracking-tight md:text-3xl">
					{title}
				</h1>
				<p className="text-muted-foreground text-sm">시행일 {effectiveDate}</p>
			</header>
			{intro ? (
				<div className="flex flex-col gap-3 text-foreground text-sm leading-relaxed md:text-base">
					{intro}
				</div>
			) : null}
			<div className="flex flex-col gap-10">{children}</div>
		</article>
	);
}

export function LegalSection({
	heading,
	children,
}: {
	heading: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-bold text-foreground text-lg md:text-xl">
				{heading}
			</h2>
			<div className="flex flex-col gap-3 text-muted-foreground text-sm leading-relaxed md:text-base">
				{children}
			</div>
		</section>
	);
}

// 조문 소제목(제N조 등)용 중간 제목.
export function LegalSubheading({ children }: { children: ReactNode }) {
	return (
		<h3 className="pt-2 font-bold text-base text-foreground">{children}</h3>
	);
}

export function LegalParagraph({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <p className={cn("leading-relaxed", className)}>{children}</p>;
}

// 들여쓴 항목 목록(가·나·다, ①②③, a·b·c 등 마커는 텍스트에 직접 포함).
export function LegalList({ items }: { items: ReactNode[] }) {
	return (
		<ul className="flex flex-col gap-1.5 pl-1">
			{items.map((item, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: 정적 법령 문구 목록이라 순서 불변
				<li className="leading-relaxed" key={index}>
					{item}
				</li>
			))}
		</ul>
	);
}

// 개인정보 위탁·보존기간·국외이전 등 표. 열 수는 head 길이를 따르며, 좁은 화면에서는
// 가로 스크롤한다(첫 열만 줄바꿈을 막아 항목명이 쪼개지지 않게 한다).
export function LegalTable({
	head,
	rows,
}: {
	head: string[];
	rows: string[][];
}) {
	return (
		<div className="overflow-x-auto rounded-lg border border-border">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="bg-muted/50 text-left">
						{head.map((label) => (
							<th className="px-4 py-3 font-bold text-foreground" key={label}>
								{label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr className="border-border border-t" key={row.join("|")}>
							{row.map((cell, index) => (
								<td
									className={cn(
										"px-4 py-3",
										index === 0
											? "whitespace-nowrap text-foreground"
											: "text-muted-foreground"
									)}
									key={cell}
								>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
