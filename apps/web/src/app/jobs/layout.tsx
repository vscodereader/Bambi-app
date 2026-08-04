import { Button } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/bambi/ds";
import { SiteFooter } from "@/components/bambi/site-footer";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";

// 공개 공고 랜딩 셸. 로그인 여부와 무관하게 열리는 화면이라(resolve-gate의 공개 prefix)
// 역할별 내비게이션 없이 로고 헤더와 공용 푸터만 둔다 — 약관·처리방침 셸과 같은 구성이다.
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
						"mx-auto flex h-14 items-center justify-between gap-3 px-6 md:h-16",
						APP_CONTENT_MAX_W
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
				<div className={cn("mx-auto w-full px-6", APP_CONTENT_MAX_W)}>
					{children}
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
