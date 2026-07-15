"use client";

import { notFound, useParams } from "next/navigation";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { getBoardBySlug } from "@/lib/bambi/community";

export default function SeekerCommunityWritePage() {
	const params = useParams<{ board: string }>();
	const board = getBoardBySlug(params.board);

	if (!board?.writable) {
		notFound();
	}

	return <CommunityPostForm board={board} />;
}
