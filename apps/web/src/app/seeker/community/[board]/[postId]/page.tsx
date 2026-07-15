"use client";

import { notFound, useParams } from "next/navigation";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { CommunityPostDetailScreen } from "@/components/bambi/screens/community-post-detail";
import { getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerCommunityPostPage() {
	const params = useParams<{ board: string; postId: string }>();

	if (!getBoardBySlug(params.board)) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityPostDetailScreen
					boardSlug={params.board}
					postId={params.postId}
				/>
			</div>
		</RequireCommunityAccess>
	);
}
