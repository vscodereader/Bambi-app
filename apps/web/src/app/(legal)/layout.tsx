import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/bambi/ds";
import {
	SiteFooter,
	type SiteFooterSettings,
} from "@/components/bambi/site-footer";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { publicClient } from "@/utils/orpc-public";

// 사업자 정보(운영자 콘솔 저장값)를 정적 HTML에 싣기 위한 서버 조회. SiteFooter의
// 클라이언트 폴백만 두면 JS를 실행하지 않는 크롤러(AI봇 등)는 BAMBI_COMPANY의
// TODO_ 자리표시자를 보게 된다(/about은 sitemap 등재 E-E-A-T 페이지). publicClient는
// next/headers를 읽지 않아 ISR을 깨지 않는다. 조회 실패 시엔 기존 폴백 동작으로 되돌아간다.
async function loadFooterSettings(): Promise<SiteFooterSettings | undefined> {
	try {
		return await publicClient.bambi.siteSettings.getFooter();
	} catch {
		return;
	}
}

// 약관·개인정보 처리방침 등 법적 문서 공용 셸. 앱 내비게이션 없이 로고 헤더와
// 공용 푸터만 둔다. 어떤 역할(비로그인 포함)에서도 접근 가능해야 하므로 role
// 가드를 두지 않는다. 푸터 사업자 정보는 loadFooterSettings가 정적 렌더 시점에 실값을 싣는다.
export default async function LegalLayout({
	children,
}: {
	children: ReactNode;
}) {
	const footerSettings = await loadFooterSettings();
	return (
		<div className="flex min-h-[100dvh] flex-col bg-secondary text-foreground">
			<header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur">
				<div
					className={cn(
						"mx-auto flex h-14 items-center px-6 md:h-16",
						APP_CONTENT_MAX_W
					)}
				>
					<Link aria-label="밤비알바 홈" className="no-underline" href="/">
						<Logo lang="ko" size="md" />
					</Link>
				</div>
			</header>
			{/* 헤더(h-14/h-16)를 뺀 최소 높이를 본문에 줘, 콘텐츠가 짧아도 형제 푸터가
			    첫 화면 아래로 밀린다. */}
			<main className="flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col md:min-h-[calc(100dvh-4rem)]">
				<div className={cn("mx-auto w-full px-6", APP_CONTENT_MAX_W)}>
					{children}
				</div>
			</main>
			<SiteFooter initialData={footerSettings} />
		</div>
	);
}
