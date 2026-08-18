"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import {
	AdBannerRail,
	HorizontalAdBannerRail,
} from "@/components/bambi/ad-banner";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 알림함(/seeker/notifications) — 초광폭(≥1720px)에서 좌(가로형)·우(세로형) 사이드
// 광고 rail을 노출한다. 문의 위젯 런처도 rail 앵커를 따라 세로 배너 아래로 붙는다
// (없으면 fixed FAB 폴백). seeker 내 정보 영역(me/layout.tsx)과 같은 구조·이유다.
//
// 좌우 aside는 판매 배너가 없어도 폭을 그대로 차지한다 — 한쪽만 렌더하면 justify-center가
// 남은 칸 기준으로 정렬해 콘텐츠가 헤더와 어긋난다. 중앙 컬럼은 seeker 마켓플레이스와
// 동일하게 여기서 SEEKER_CONTENT_WIDTH로 캡을 걸고, NotificationsScreen은 캡·센터링
// 없이(w-full) 그 안을 채운다 — 화면이 자체 mx-auto·캡을 가지면 flex 자식의 auto 마진이
// justify-center보다 먼저 여유 폭을 흡수해 aside가 화면 끝까지 밀리거나, 92% 캡이 이중으로
// 곱혀 seeker보다 좁아진다. 패딩은 화면의 px-5/md:px-6이 담당한다.
export default function SeekerNotificationsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const adBanners = useAdBannerJobs();

	return (
		<div className="mx-auto flex min-h-0 w-full flex-1 justify-center gap-5">
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
						promotionSurface="notifications_left"
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
						promotionSurface="notifications_right"
					/>
				</div>
			</aside>
		</div>
	);
}
