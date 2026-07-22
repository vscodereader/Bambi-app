// 밤비 — 공용 사이트 푸터. 구직자(/seeker)·구인자(/employer) 셸과 약관·개인정보
// 처리방침 페이지가 함께 재사용한다. 운영자 콘솔(/moderator)에는 노출하지 않는다.
//
// 사업자 정보는 운영자 콘솔(/moderator/site-settings)에서 저장한 값을 쓰고, 값이
// 없으면 BAMBI_COMPANY 상수로 폴백한다. 재사용처 중 하나(responsive-shell)가
// "use client" 트리라 서버 컴포넌트 async 페치를 쓸 수 없어, 클라이언트에서 react
// query로 불러오되 폴백 값을 먼저 표시해 로딩 깜빡임을 없앤다.
"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { orpc } from "@/utils/orpc";
import { BOTTOM_NAV_CONTENT_SPACER } from "./bottom-nav-shell";
import { Logo } from "./ds";

interface FooterLink {
	emphasis?: boolean;
	href: Route;
	label: string;
}

const FOOTER_LINKS: FooterLink[] = [
	{ href: "/terms" as Route, label: "이용약관" },
	{ href: "/privacy" as Route, label: "개인정보 처리방침", emphasis: true },
];

interface SiteFooterProps {
	// 콘텐츠 폭 — 헤더와 정렬. 기본은 앱 공통 고정폭.
	contentWidthClassName?: string;
	// 모바일 고정 하단 탭바가 있는 셸에서 겹침을 막기 위한 하단 여백.
	withBottomNavClearance?: boolean;
}

export function SiteFooter({
	contentWidthClassName = APP_CONTENT_MAX_W,
	withBottomNavClearance = false,
}: SiteFooterProps) {
	const { data } = useQuery(orpc.bambi.siteSettings.getFooter.queryOptions());

	// DB에 값이 있으면 그 값, 없으면 코드 상수로 폴백.
	const intro = data?.footerIntro ?? BAMBI_COMPANY.footerIntro;
	const operator = data?.operator ?? BAMBI_COMPANY.operator;
	const ceo = data?.ceo ?? BAMBI_COMPANY.ceo;
	const bizRegNo = data?.bizRegNo ?? BAMBI_COMPANY.bizRegNo;
	const address = data?.address ?? BAMBI_COMPANY.address;
	const email = data?.email ?? BAMBI_COMPANY.email;

	return (
		<footer
			className={cn(
				"mt-auto border-border border-t bg-background",
				withBottomNavClearance && BOTTOM_NAV_CONTENT_SPACER,
				withBottomNavClearance && "md:pb-0"
			)}
		>
			<div
				className={cn(
					"mx-auto flex w-full flex-col gap-8 px-6 py-10",
					contentWidthClassName
				)}
			>
				<div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
					<div className="flex flex-col gap-3">
						<Logo lang="ko" size="md" />
						<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
							{intro}
						</p>
					</div>
					<nav
						aria-label="약관 및 정책"
						className="flex flex-wrap items-center gap-x-6 gap-y-2"
					>
						{FOOTER_LINKS.map((link) => (
							<Link
								className={cn(
									"text-muted-foreground text-sm no-underline transition-colors hover:text-foreground",
									link.emphasis && "font-bold text-foreground"
								)}
								href={link.href}
								key={link.href}
							>
								{link.label}
							</Link>
						))}
						{/* 환불 정책은 페이지 이동 대신 안내 다이얼로그로 노출한다. 링크 톤 유지. */}
						<Dialog>
							<DialogTrigger className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground text-sm no-underline transition-colors hover:text-foreground">
								환불 정책
							</DialogTrigger>
							<DialogContent>
								<div className="flex flex-col gap-2">
									<DialogTitle>환불 정책</DialogTitle>
									<DialogDescription>
										무통장: 수수료 5% + 광고 게재 기간을 제외한 금액
									</DialogDescription>
								</div>
							</DialogContent>
						</Dialog>
						<a
							className="text-muted-foreground text-sm no-underline transition-colors hover:text-foreground"
							href={`mailto:${email}`}
						>
							고객센터
						</a>
					</nav>
				</div>

				<Separator />

				<div className="flex flex-col gap-1 text-muted-foreground text-xs leading-relaxed">
					<p>
						{operator} · 대표 {ceo} · 사업자등록번호 {bizRegNo}
					</p>
					<p>
						{address} · 고객문의 {email}
					</p>
					<p className="pt-2 text-muted-foreground/80">
						© {new Date().getFullYear()} {operator}. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}
