import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { GuestVerifyCard } from "@/components/bambi/guest-verify-card";
import { communityEditPath } from "@/lib/bambi/community";
import {
	getPublicBoardBySlug,
	isGuestWritableBoard,
	publicEditPath,
} from "@/lib/bambi/public-community";
import { readGuestCanWrite, readVisitorState } from "@/lib/bambi/visitor";
import { client } from "@/utils/orpc";

interface PageProps {
	params: Promise<{ boardSlug: string; postId: string }>;
}

export const metadata: Metadata = {
	robots: { follow: false, index: false },
};

// 비회원 글 수정. 소유권은 서버가 비밀번호로 판정하므로(폼의 비밀번호 필드) 여기서는
// 별도 게이트를 두지 않는다 — 비밀번호가 틀리면 저장 시 403 안내가 나간다.
export default async function PublicPostEditPage({ params }: PageProps) {
	const { boardSlug, postId } = await params;
	const board = getPublicBoardBySlug(boardSlug);
	if (!(board && isGuestWritableBoard(board.key))) {
		notFound();
	}

	const [post, visitor, canWrite] = await Promise.all([
		client.bambi.community.getPublicPost({ postId }).catch(() => null),
		readVisitorState(),
		readGuestCanWrite(),
	]);
	// 회원 글은 회원 화면에서 수정한다(잠금·광고 옵션이 그쪽에만 있다).
	if (!post || post.board !== board.key || post.authorRole !== "guest") {
		notFound();
	}
	if (visitor === "member") {
		redirect(communityEditPath(board.slug, postId) as Route);
	}

	if (!canWrite) {
		return (
			<GuestVerifyCard
				description="본인인증을 다시 마치면 비밀번호로 내 글을 수정할 수 있어요."
				redirectTo={publicEditPath(board.slug, postId)}
				title={`${board.label} 글 수정`}
				triggerLabel="본인인증하고 수정하기"
			/>
		);
	}

	return (
		<CommunityPostForm
			board={board}
			guest
			initialPost={{
				authorName: post.authorName,
				authorRole: post.authorRole,
				body: post.body,
				id: post.id,
				isLocked: false,
				isPromotion: post.isPromotion,
				title: post.title,
			}}
		/>
	);
}
