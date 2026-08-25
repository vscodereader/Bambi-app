"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { AdBannerRail, HorizontalAdBannerRail } from "./ad-banner";

export function MyPageAdRailLayout({ children }: { children: ReactNode }) {
	const adBanners = useAdBannerJobs();
	return (
		<div className="mx-auto flex min-h-0 w-full flex-1 justify-center gap-5">
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
						promotionSurface="my_page_left"
					/>
				</div>
			</aside>
			<div
				className={cn(
					"flex min-h-0 w-full min-w-0 flex-col",
					SEEKER_CONTENT_WIDTH
				)}
			>
				{children}
			</div>
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<AdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.rightBanner}
						promotionSurface="my_page_right"
					/>
				</div>
			</aside>
		</div>
	);
}
