"use client";

import { notFound, useParams } from "next/navigation";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerCommunityWritePage() {
	const params = useParams<{ board: string }>();
	const board = getBoardBySlug(params.board);

	if (!board?.writable) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityPostForm board={board} />
			</div>
		</RequireCommunityAccess>
	);
}
