"use client";

// 수다방 홈 — 게시판별 최신 글 미리보기 인덱스(레퍼런스: 커뮤니티 인덱스형 홈).

import { useQuery } from "@tanstack/react-query";
import {
	BoardPreviewCard,
	BoardPreviewSkeleton,
	type OverviewPost,
} from "@/components/bambi/community-board-preview";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_BOARDS,
	type CommunityBoardKey,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

export function CommunityHomeScreen() {
	const overviewQuery = useQuery(orpc.bambi.community.overview.queryOptions());

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
		market: data?.market ?? [],
		notice: data?.notice ?? [],
		work_talk: data?.workTalk ?? [],
	};
	// 공지사항은 최상단 전폭 섹션으로 따로 렌더하고, 나머지는 2열 그리드로 배치한다.
	const gridBoards = COMMUNITY_BOARDS.filter((board) => board.key !== "notice");
	const noticePosts = postsByBoard.notice;

	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">수다방</h1>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{overviewQuery.isPending ? (
					gridBoards.map((board) => <BoardPreviewSkeleton key={board.key} />)
				) : (
					<>
						{noticePosts.length > 0 ? (
							<BoardPreviewCard
								boardKey="notice"
								className="md:col-span-2"
								posts={noticePosts}
							/>
						) : null}
						{gridBoards.map((board) => (
							<BoardPreviewCard
								boardKey={board.key}
								key={board.key}
								posts={postsByBoard[board.key]}
							/>
						))}
					</>
				)}
			</div>
		</div>
	);
}
