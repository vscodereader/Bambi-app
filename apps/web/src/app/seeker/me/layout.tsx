"use client";

import type { ReactNode } from "react";
import {
	AdBannerRail,
	HorizontalAdBannerRail,
} from "@/components/bambi/ad-banner";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";

// 내 정보 영역(허브·신고 내역·면접·차단·설정) 공통 — 초광폭(≥1720px)에서 좌(가로형)·
// 우(세로형) 사이드 광고 rail을 노출한다. 문의 위젯 런처도 rail 앵커를 따라 세로 배너
// 아래로 붙는다(없으면 fixed FAB 폴백).
//
// 좌우 aside는 판매 배너가 없어도 폭을 그대로 차지한다 — 한쪽만 렌더하면 justify-center가
// 남은 칸 기준으로 정렬해 콘텐츠가 헤더와 어긋난다(수다방·고객센터 rail과 같은 이유·형태).
// 중앙 폭·패딩 제약은 MyPageShell이 이미 갖고 있어 여기선 자리만 내주고, 높이 체인
// (min-h-0/flex-1)은 셸의 내부 스크롤(md 미만 overflow-y-auto)을 보존하려고 그대로 잇는다.
export default function SeekerMeLayout({ children }: { children: ReactNode }) {
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
			<div className="flex min-h-0 w-full min-w-0 flex-col">{children}</div>
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
