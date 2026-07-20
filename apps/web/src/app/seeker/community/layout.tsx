"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import {
	AdBannerRail,
	HorizontalAdBannerRail,
} from "@/components/bambi/ad-banner";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 수다방 전 페이지 공통 레이아웃 — 입장 게이트로 감싸고, 초광폭(≥1720px)에서만 좌(가로형)·
// 우(세로형) 사이드 광고 배너 rail을 노출한다. 중앙 콘텐츠는 앱 공통 고정폭으로 헤더와 정렬한다.
// 게이트를 rail 바깥(상위)에 둬 미자격·마운트 전에는 배너도 함께 감춘다.
//
// 배너는 위치별로 실제 판매된 공고만 내려오므로(jobs.listAdBanners), 다른 seeker 화면과 같이
// 그룹이 비면 사이드 영역 자체를 렌더하지 않는다 — 빈 rail이 자리만 차지하지 않게.
// 훅을 쓰려면 클라이언트 모듈이어야 하는데, 이미 게이트(RequireCommunityAccess)가
// 클라이언트라 경계가 실질적으로 달라지지 않는다.
export default function SeekerCommunityLayout({
	children,
}: {
	children: ReactNode;
}) {
	const adBanners = useAdBannerJobs();

	return (
		<RequireCommunityAccess>
			<div className="mx-auto flex w-full justify-center gap-5 py-6">
				{adBanners.leftBanner.length > 0 ? (
					<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
						<div className="sticky top-20">
							<HorizontalAdBannerRail items={adBanners.leftBanner} />
						</div>
					</aside>
				) : null}
				<div
					className={cn(
						"flex w-full min-w-0 flex-col px-5 md:px-6",
						SEEKER_CONTENT_WIDTH
					)}
				>
					{children}
				</div>
				{adBanners.rightBanner.length > 0 ? (
					<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
						<div className="sticky top-20">
							<AdBannerRail items={adBanners.rightBanner} />
						</div>
					</aside>
				) : null}
			</div>
		</RequireCommunityAccess>
	);
}
