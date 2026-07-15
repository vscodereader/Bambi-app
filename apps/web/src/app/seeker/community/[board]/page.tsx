"use client";

import { notFound, useParams } from "next/navigation";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { CommunityBoardScreen } from "@/components/bambi/screens/community-board";
import { getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerCommunityBoardPage() {
	const params = useParams<{ board: string }>();
	const board = getBoardBySlug(params.board);

	if (!board) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityBoardScreen boardSlug={params.board} />
			</div>
		</RequireCommunityAccess>
	);
}
