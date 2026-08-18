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
// 중앙은 MyPageShell을 직접 flex 자식으로 둔다 — 셸이 이미 seeker 마켓플레이스 중앙 컬럼과
// 동일한 폭·패딩(md:max-w-[min(92%,1120px)]·px-5/md:px-6)을 가지므로, 별도 w-full 래퍼로
// 한 겹 더 감싸면 셸이 그 안에서 mx-auto로 다시 좁아져(92%의 92%) 배너-콘텐츠 간격이
// seeker보다 벌어졌다. 래퍼를 없애 셸을 seeker처럼 capped 직속 컬럼으로 만들면 justify-center가
// 남는 폭을 aside 바깥으로 밀어 배너가 콘텐츠에 gap-5로 붙는다. 셸의 내부 스크롤(md 미만
// overflow-y-auto)은 row의 bounded 높이 + align-stretch로 그대로 유지된다.
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
			{children}
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
