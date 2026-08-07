"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { notFound, useParams } from "next/navigation";
import { CommunityBoardScreen } from "@/components/bambi/screens/community-board";
import { useBoardBySlug } from "@/lib/bambi/use-community-boards";

export default function SeekerCommunityBoardPage() {
	const params = useParams<{ board: string }>();
	// 게시판 목록은 서버(DB)에서 온다 — 다 받기 전에 notFound를 부르면 멀쩡한 게시판이
	// 404로 깜빡이므로 로딩 동안은 자리표시자만 세운다.
	const { board, isPending } = useBoardBySlug(params.board);

	if (isPending) {
		return <Skeleton className="h-64 w-full" />;
	}

	if (!board) {
		notFound();
	}

	return <CommunityBoardScreen board={board} />;
}
