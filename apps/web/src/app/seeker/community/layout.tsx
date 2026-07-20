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
// 좌우 aside는 판매된 배너가 없어도 폭을 그대로 차지한다. 한쪽만 렌더하면 justify-center가
// 남은 두 칸을 기준으로 정렬해 콘텐츠가 (rail+gap)/2 = 약 139px 밀리고, 고정폭이 같은
// 헤더·푸터와 눈에 띄게 어긋난다(우측 배너만 팔린 수다방에서 실제로 발생했다).
// 그래서 비었는지 판정은 aside 안쪽에서 하고, 바깥 자리는 항상 대칭으로 남긴다 —
// seeker 마켓플레이스·공고 상세도 같은 이유로 이 형태다.
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
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					<div className="sticky top-20">
						{adBanners.leftBanner.length > 0 ? (
							<HorizontalAdBannerRail items={adBanners.leftBanner} />
						) : null}
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
						{adBanners.rightBanner.length > 0 ? (
							<AdBannerRail items={adBanners.rightBanner} />
						) : null}
					</div>
				</aside>
			</div>
		</RequireCommunityAccess>
	);
}
