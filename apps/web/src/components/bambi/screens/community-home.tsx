"use client";

// 수다방 홈 — 게시판별 최신 글 미리보기 인덱스(레퍼런스: 커뮤니티 인덱스형 홈).

import { useQuery } from "@tanstack/react-query";
import {
	CommunityOverviewGrid,
	type OverviewPost,
	useLegalAdvisorNavGuard,
} from "@/components/bambi/community-board-preview";
import { EmptyState } from "@/components/bambi/empty-state";
import { PremiumAdBannerSection } from "@/components/bambi/premium-ad-banner-section";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import type { CommunityBoardKey } from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

export function CommunityHomeScreen() {
	const overviewQuery = useQuery(orpc.bambi.community.overview.queryOptions());
	const adBanners = useAdBannerJobs();
	// 법률자문 계정은 legal 게시판만 이용한다(서버 격리 가드와 동일) — 카드는 다 보여주되
	// 다른 게시판 링크를 누르면 토스트로 안내한다.
	const legalAdvisorGuard = useLegalAdvisorNavGuard();

	if (overviewQuery.isError) {
		return (
			<EmptyState
				className="flex-1"
				description="수다방 글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
				title="불러오기 실패"
			/>
		);
	}

	const data = overviewQuery.data;
	const postsByBoard: Record<CommunityBoardKey, OverviewPost[]> = {
		best: data?.best ?? [],
		free: data?.free ?? [],
		legal: data?.legal ?? [],
		market: data?.market ?? [],
		notice: data?.notice ?? [],
		work_talk: data?.workTalk ?? [],
	};
	return (
		<div className="flex flex-col gap-4">
			{/* 마켓플레이스 상단과 동일한 프리미엄(중간) 광고 섹션 — 빈 칸은 자체
			    "광고 모집중" 자리표시로 채우므로 조건 없이 항상 렌더한다. */}
			<PremiumAdBannerSection
				isLoading={adBanners.isLoading}
				items={adBanners.premiumBanner}
				promotionSurface="community_center"
			/>
			<h1 className="m-0 font-extrabold text-xl">수다방</h1>
			<CommunityOverviewGrid
				isPending={overviewQuery.isPending}
				onBlockedNavigate={legalAdvisorGuard}
				postsByBoard={postsByBoard}
			/>
		</div>
	);
}
