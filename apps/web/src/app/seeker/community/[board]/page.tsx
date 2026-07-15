"use client";

import { notFound, useParams } from "next/navigation";
import { CommunityBoardScreen } from "@/components/bambi/screens/community-board";
import { getBoardBySlug } from "@/lib/bambi/community";

export default function SeekerCommunityBoardPage() {
	const params = useParams<{ board: string }>();

	if (!getBoardBySlug(params.board)) {
		notFound();
	}

	return <CommunityBoardScreen boardSlug={params.board} />;
}
