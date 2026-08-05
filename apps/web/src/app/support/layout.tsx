"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import {
	AdBannerRail,
	HorizontalAdBannerRail,
} from "@/components/bambi/ad-banner";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { APP_CONTENT_MAX_W, SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 고객센터는 구인자·구직자 공통 창구라 역할 셸(seeker/employer)에 묶지 않는다.
// 헤더 폭과 본문 폭은 다른 화면과 동일한 공용 상수를 그대로 쓴다 — 폭 기준이 갈리면
// 헤더와 본문 정렬이 어긋난다(커뮤니티 채팅 프리플라이트에서 같은 문제가 있었다).
//
// variant는 "public"이 아니라 "seeker"다. public은 비로그인 마켓 전용이라 헤더 우측이
// "시작하기"(가입 유도)로 바뀌는데, 고객센터는 로그인 회원만 들어오므로 "내 정보"여야 한다.
// 셸이 실제로 구분하는 것은 public/moderator뿐이라 구인자가 열어도 동일하게 동작한다.
//
// 광고는 좌(가로형)·우(세로형) 사이드 rail만 노출한다(중간 프리미엄 섹션 없음).
// 초광폭(≥1720px) 전용이며, 좌우 aside는 판매된 배너가 없어도 폭을 그대로 차지한다 —
// 한쪽만 렌더하면 justify-center가 남은 칸 기준으로 정렬해 콘텐츠가 헤더·푸터와
// 어긋난다(수다방 레이아웃과 같은 이유·같은 형태). 빈 슬롯은 rail이 자체 "광고 모집중"
// 자리표시로 채우므로 조건 없이 렌더한다. 훅(useAdBannerJobs) 때문에 클라이언트
// 모듈이지만 children(고객센터 페이지)은 RSC로 그대로 통과한다.
export default function SupportLayout({ children }: { children: ReactNode }) {
	const adBanners = useAdBannerJobs();

	return (
		<ResponsiveAppShell
			contentWidthClassName={APP_CONTENT_MAX_W}
			variant="seeker"
		>
			<div className="mx-auto flex w-full justify-center gap-5">
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					<div className="sticky top-20">
						<HorizontalAdBannerRail
							isLoading={adBanners.isLoading}
							items={adBanners.leftBanner}
							promotionSurface="support_left"
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
					<div className="sticky top-20">
						<AdBannerRail
							isLoading={adBanners.isLoading}
							items={adBanners.rightBanner}
							promotionSurface="support_right"
						/>
					</div>
				</aside>
			</div>
		</ResponsiveAppShell>
	);
}
