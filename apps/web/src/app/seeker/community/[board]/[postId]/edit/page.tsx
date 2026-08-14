"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { notFound, useParams } from "next/navigation";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { CommunityEditGate } from "@/components/bambi/community-edit-gate";
import { useBoardBySlug } from "@/lib/bambi/use-community-boards";

export default function SeekerCommunityEditPage() {
	const params = useParams<{ board: string; postId: string }>();
	const { isGuest } = useBambiAuth();
	// 게시판 목록을 다 받기 전에는 404를 내지 않는다(목록 페이지와 같은 규칙).
	const { board, isPending } = useBoardBySlug(params.board);

	if (isPending) {
		return <Skeleton className="h-64 w-full" />;
	}

	if (!board?.writable) {
		notFound();
	}

	return (
		<CommunityEditGate board={board} guest={isGuest} postId={params.postId} />
	);
}
