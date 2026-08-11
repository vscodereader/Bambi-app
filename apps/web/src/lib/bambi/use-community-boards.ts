"use client";

// 게시판 목록 조회 훅. 정본은 DB(community_board)이고 운영자가 코드 배포 없이 게시판을
// 늘리거나 감출 수 있으므로, 화면은 상수 배열이 아니라 이 훅으로 slug를 해석한다.
// 행 → 화면 메타 변환(가상 게시판 best, 공지의 운영자 전용 규칙)은 community.ts에 있다.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { type CommunityBoardMeta, toBoardMetas } from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

// 게시판 목록은 운영자가 손대기 전에는 움직이지 않는다 — 화면을 옮길 때마다 다시 받지 않게
// 오래 캐시한다(useRegions와 같은 관례).
const BOARDS_STALE_TIME_MS = 5 * 60 * 1000;

export function useCommunityBoards(): {
	boards: CommunityBoardMeta[];
	isPending: boolean;
} {
	const query = useQuery({
		...orpc.bambi.communityBoards.listActive.queryOptions(),
		staleTime: BOARDS_STALE_TIME_MS,
	});

	const boards = useMemo(
		() =>
			query.data ? toBoardMetas(query.data.boards, query.data.bestIcon) : [],
		[query.data]
	);

	return { boards, isPending: query.isPending };
}

// slug로 게시판 하나. 로딩 중에는 board가 undefined이므로 호출부는 isPending을 먼저 본다
// (로드가 끝난 뒤에도 없으면 그때 없는 게시판이다).
export function useBoardBySlug(slug: string): {
	board: CommunityBoardMeta | undefined;
	isPending: boolean;
} {
	const { boards, isPending } = useCommunityBoards();

	return { board: boards.find((board) => board.slug === slug), isPending };
}
