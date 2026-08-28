"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import {
	SEEKER_CONTENT_WIDTH,
	SIDE_AD_RAIL_ASIDE_CLASS,
	SIDE_AD_RAIL_LAYOUT_CLASS,
	SIDE_AD_RAIL_STICKY_CLASS,
} from "@/lib/bambi/layout";
import { AdBannerRail, HorizontalAdBannerRail } from "./ad-banner";

export const PUBLIC_AD_RAIL_SURFACE = {
	board: "public_board",
	jobs: "public_jobs",
} as const;

type PublicAdRailSurface =
	(typeof PUBLIC_AD_RAIL_SURFACE)[keyof typeof PUBLIC_AD_RAIL_SURFACE];

// 공개 페이지에서 로그인 후 메인페이지와 같은 좌·우 프리미엄 광고 레일만 노출한다.
// 중앙 프리미엄 배너는 렌더하지 않는다. 좌우 aside는 항상 대칭으로 유지해 광고 판매
// 여부와 무관하게 본문 중앙선을 보존하고, 빈 슬롯·로딩·클릭·GA4 계측은 기존 rail에 위임한다.
export function PublicSideAdRailLayout({
	children,
	promotionSurface,
}: {
	children: ReactNode;
	promotionSurface: PublicAdRailSurface;
}) {
	const adBanners = useAdBannerJobs();

	return (
		<div className={SIDE_AD_RAIL_LAYOUT_CLASS}>
			<aside className={SIDE_AD_RAIL_ASIDE_CLASS}>
				<div className={SIDE_AD_RAIL_STICKY_CLASS}>
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
						promotionSurface={`${promotionSurface}_left`}
					/>
				</div>
			</aside>
			<div className={cn("w-full min-w-0 shrink-0", SEEKER_CONTENT_WIDTH)}>
				{children}
			</div>
			<aside className={SIDE_AD_RAIL_ASIDE_CLASS}>
				<div className={SIDE_AD_RAIL_STICKY_CLASS}>
					<AdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.rightBanner}
						promotionSurface={`${promotionSurface}_right`}
					/>
				</div>
			</aside>
		</div>
	);
}
