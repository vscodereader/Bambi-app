"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import {
	AdBannerRail,
	HorizontalAdBannerRail,
} from "@/components/bambi/ad-banner";
import { MobileTabBar } from "@/components/bambi/mobile-tab-bar";
import { PointBalanceChip } from "@/components/bambi/point-shop/point-balance-chip";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { SeekerHeaderSearch } from "@/components/bambi/seeker-app-shell";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { APP_CONTENT_MAX_W, SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 포인트몰은 구인자·구직자 공통 창구라 역할 셸에 묶지 않고 고객센터(/support)와 같은
// 골격을 쓴다 — 폭 상수·좌우 광고 rail·하단 탭바까지 그 레이아웃의 판단을 그대로 따른다
// (그쪽 주석에 이유가 정리돼 있다). 다른 점은 셋뿐이다:
// - 헤더 슬롯에 보유 포인트 칩을 두고 그 오른쪽에 공고 검색을 붙인다(모바일 헤더는 좁아 칩만).
// - 우측 rail 아래 1:1 상담 런처 — SupportChatWidget이 레일 하단 앵커에 포털한다(seeker 메인과 동일).
// - 목록은 비로그인도 볼 수 있다(구매만 로그인 유도) — 미들웨어 공개 경로에 열려 있다.
export default function PointShopLayout({ children }: { children: ReactNode }) {
	const adBanners = useAdBannerJobs();

	return (
		<ResponsiveAppShell
			contentWidthClassName={APP_CONTENT_MAX_W}
			headerSlot={
				<div className="flex items-center gap-3">
					<PointBalanceChip />
					<SeekerHeaderSearch withHotkey />
				</div>
			}
			mobileHeaderSlot={<PointBalanceChip />}
			variant="seeker"
		>
			<div className="mx-auto flex w-full justify-center gap-5">
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					<div className="sticky top-20">
						<HorizontalAdBannerRail
							isLoading={adBanners.isLoading}
							items={adBanners.leftBanner}
							promotionSurface="point_shop_left"
						/>
					</div>
				</aside>
				<div
					className={cn(
						"flex w-full min-w-0 flex-col px-5 md:px-6",
						SEEKER_CONTENT_WIDTH
					)}
				>
					{children}
				</div>
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					<div className="sticky top-20 flex flex-col gap-3">
						{/* 레일 하단 앵커에 SupportChatWidget의 1:1 상담 런처가 포털된다(seeker 메인과 동일). */}
						<AdBannerRail
							isLoading={adBanners.isLoading}
							items={adBanners.rightBanner}
							promotionSurface="point_shop_right"
						/>
					</div>
				</aside>
			</div>
			<MobileTabBar homeHref="/seeker" />
		</ResponsiveAppShell>
	);
}
