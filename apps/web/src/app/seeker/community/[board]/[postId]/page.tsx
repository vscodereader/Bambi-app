"use client";

import { notFound, useParams } from "next/navigation";
import { CommunityPostDetailScreen } from "@/components/bambi/screens/community-post-detail";
import { getBoardBySlug } from "@/lib/bambi/community";

export default function SeekerCommunityPostPage() {
	const params = useParams<{ board: string; postId: string }>();

	if (!getBoardBySlug(params.board)) {
		notFound();
	}

	return (
		<CommunityPostDetailScreen
			boardSlug={params.board}
			postId={params.postId}
		/>
	);
}
