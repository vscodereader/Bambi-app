// 밤비 — 공용 사이트 푸터. 구직자(/seeker)·구인자(/employer) 셸과 약관·개인정보
// 처리방침 페이지가 함께 재사용한다. 운영자 콘솔(/moderator)에는 노출하지 않는다.

import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
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
							밤비는 유흥·접객 구인구직 정보를 1:1 채팅으로 안전하게 연결하는
							플랫폼입니다.
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
						<a
							className="text-muted-foreground text-sm no-underline transition-colors hover:text-foreground"
							href={`mailto:${BAMBI_COMPANY.email}`}
						>
							고객센터
						</a>
					</nav>
				</div>

				<Separator />

				<div className="flex flex-col gap-1 text-muted-foreground text-xs leading-relaxed">
					<p>
						{BAMBI_COMPANY.operator} · 대표 {BAMBI_COMPANY.ceo} · 사업자등록번호{" "}
						{BAMBI_COMPANY.bizRegNo}
					</p>
					<p>
						{BAMBI_COMPANY.address} · 고객문의 {BAMBI_COMPANY.email}
					</p>
					<p className="pt-2 text-muted-foreground/80">
						© {new Date().getFullYear()} {BAMBI_COMPANY.operator}. All rights
						reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}
