import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/bambi/ds";
import { SiteFooter } from "@/components/bambi/site-footer";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";

// 약관·개인정보 처리방침 등 법적 문서 공용 셸. 앱 내비게이션 없이 로고 헤더와
// 공용 푸터만 둔다. 어떤 역할(비로그인 포함)에서도 접근 가능해야 하므로 role
// 가드를 두지 않는다.
export default function LegalLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-[100dvh] flex-col bg-secondary text-foreground">
			<header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur">
				<div
					className={cn(
						"mx-auto flex h-14 items-center px-6 md:h-16",
						APP_CONTENT_MAX_W
					)}
				>
					<Link aria-label="밤비 홈" className="no-underline" href="/">
						<Logo lang="ko" size="md" />
					</Link>
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
