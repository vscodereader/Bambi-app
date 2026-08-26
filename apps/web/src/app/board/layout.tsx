import { buttonVariants } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/bambi/ds";
import { ThemeToggle } from "@/components/bambi/theme-toggle";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 비로그인 공개 읽기(/board) 셸. 로그인 상태를 전제로 하는 앱 셸(탭바·내 메뉴) 대신
// 브랜드 헤더만 둔다(푸터는 두지 않는다) — 이 영역은 세션 없이도 열려야 하고
// (resolve-gate의 공개 prefix), 크롤러가 JS 없이 본문까지 읽을 수 있어야 한다.
export default function PublicBoardLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-dvh flex-col">
			<header className="border-border border-b bg-background">
				<div
					className={cn(
						// 본문(main)과 같은 폭 규칙(모바일 전체폭+px-5 → md부터 92% 캡+px-6)을 써서
						// 헤더 로고와 콘텐츠 좌측 여백이 어긋나지 않게 한다.
						"mx-auto flex w-full items-center justify-between gap-3 px-5 py-3 md:px-6",
						APP_CONTENT_WIDTH
					)}
				>
					<Link aria-label="밤비알바 홈" href="/seeker">
						<Logo lang="ko" size="sm" />
					</Link>
					<div className="flex items-center gap-2">
						<ThemeToggle />
						<Link
							className={cn(
								buttonVariants({ size: "sm", variant: "outline" }),
								"dark:bg-card dark:text-foreground"
							)}
							href="/seeker"
						>
							채용 공고 보기
						</Link>
					</div>
				</div>
			</header>
			<main
				className={cn(
					"mx-auto flex w-full max-w-full flex-1 flex-col gap-4 px-5 py-6 md:px-6",
					APP_CONTENT_WIDTH
				)}
			>
				{children}
			</main>
		</div>
	);
}
