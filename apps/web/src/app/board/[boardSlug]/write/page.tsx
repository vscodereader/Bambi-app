import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { GuestVerifyCard } from "@/components/bambi/guest-verify-card";
import { communityWritePath } from "@/lib/bambi/community";
import {
	getPublicBoardBySlug,
	isGuestWritableBoard,
	publicWritePath,
} from "@/lib/bambi/public-community";
import { readGuestCanWrite, readVisitorState } from "@/lib/bambi/visitor";

interface PageProps {
	params: Promise<{ boardSlug: string }>;
}

// 작성 화면은 색인 대상이 아니다(내용이 없고 매번 같은 폼이다).
export const metadata: Metadata = {
	robots: { follow: false, index: false },
};

export default async function PublicBoardWritePage({ params }: PageProps) {
	const { boardSlug } = await params;
	const board = getPublicBoardBySlug(boardSlug);
	if (!(board && isGuestWritableBoard(board.key))) {
		notFound();
	}

	const [visitor, canWrite] = await Promise.all([
		readVisitorState(),
		readGuestCanWrite(),
	]);

	// 회원은 회원 화면에서 쓴다 — 잠금·광고 등 회원 전용 옵션이 그쪽에만 있다.
	if (visitor === "member") {
		redirect(communityWritePath(board.slug) as Route);
	}

	if (!canWrite) {
		return (
			<GuestVerifyCard
				description="성인 본인인증을 마치면 비회원도 자유수다·밤문화 이야기에 글을 남길 수 있어요."
				redirectTo={publicWritePath(board.slug)}
				title={`${board.label} 글쓰기`}
				triggerLabel="본인인증하고 글쓰기"
			/>
		);
	}

	return <CommunityPostForm board={board} guest />;
}
