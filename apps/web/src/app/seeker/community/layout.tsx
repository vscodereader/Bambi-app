import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import {
	AdBannerRail,
	HorizontalAdBannerRail,
} from "@/components/bambi/ad-banner";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 수다방 전 페이지 공통 레이아웃 — 입장 게이트로 감싸고, 초광폭(≥1720px)에서만 좌(가로형)·
// 우(세로형) 사이드 광고 배너 rail을 노출한다. 중앙 콘텐츠는 앱 공통 고정폭으로 헤더와 정렬한다.
// 게이트를 rail 바깥(상위)에 둬 미자격·마운트 전에는 배너도 함께 감춘다.
export default function SeekerCommunityLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<RequireCommunityAccess>
			<div className="mx-auto flex w-full justify-center gap-5 py-6">
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					<div className="sticky top-20">
						<HorizontalAdBannerRail
							keys={[
								"community-left-1",
								"community-left-2",
								"community-left-3",
							]}
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
						<AdBannerRail count={3} offset={0} />
					</div>
				</aside>
			</div>
		</RequireCommunityAccess>
	);
}
