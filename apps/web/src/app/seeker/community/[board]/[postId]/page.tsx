"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { notFound, useParams } from "next/navigation";
import { CommunityPostDetailScreen } from "@/components/bambi/screens/community-post-detail";
import { useBoardBySlug } from "@/lib/bambi/use-community-boards";

export default function SeekerCommunityPostPage() {
	const params = useParams<{ board: string; postId: string }>();
	// 게시판 목록을 다 받기 전에는 404를 내지 않는다(목록 페이지와 같은 규칙).
	const { board, isPending } = useBoardBySlug(params.board);

	if (isPending) {
		return <Skeleton className="h-64 w-full" />;
	}

	if (!board) {
		notFound();
	}

	return <CommunityPostDetailScreen board={board} postId={params.postId} />;
}
