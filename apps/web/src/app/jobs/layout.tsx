import { Button } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/bambi/ds";
import { SiteFooter } from "@/components/bambi/site-footer";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 공개 공고 랜딩 셸. 로그인 여부와 무관하게 열리는 화면이라(resolve-gate의 공개 prefix)
// 역할별 내비게이션 없이 로고 헤더만 둔다. 사업자·직업정보제공사업 신고번호 등
// 법정 표시를 공개 표면에도 노출하기 위해 (legal) 셸과 같은 공용 푸터를 붙인다.
// SiteFooter는 폴백 값을 먼저 그린 뒤 클라이언트에서 값을 채워 ISR을 깨지 않는다.
export default function JobsLandingLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-[100dvh] flex-col bg-secondary text-foreground">
			<header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur">
				<div
					className={cn(
						// 모바일은 로그인 셸(ResponsiveAppShell) 모바일 헤더와 같은 전체폭+px-5.
						// 92% 캡을 모바일까지 걸면 콘텐츠와 안 맞고 좁은 화면 폭만 낭비한다.
						"mx-auto flex h-14 items-center justify-between gap-3 px-5 md:h-16 md:px-6",
						APP_CONTENT_WIDTH
					)}
				>
					<Link aria-label="밤비알바 홈" className="no-underline" href="/jobs">
						<Logo lang="ko" size="md" />
					</Link>
					<Button
						nativeButton={false}
						render={<Link href="/seeker">공고 검색</Link>}
						size="sm"
						variant="outline"
					/>
				</div>
			</header>
			<main className="flex flex-1 flex-col">
				<div className={cn("mx-auto w-full px-5 md:px-6", APP_CONTENT_WIDTH)}>
					{children}
				</div>
			</main>
			{/* 콘텐츠와 같은 폭 기준으로 정렬(헤더·본문과 동일한 APP_CONTENT_WIDTH). */}
			<SiteFooter contentWidthClassName={APP_CONTENT_WIDTH} />
		</div>
	);
}
