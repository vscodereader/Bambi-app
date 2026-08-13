import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { CommunityEditGate } from "@/components/bambi/community-edit-gate";
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

// 비회원 글 수정. 비밀번호 입력 게이트를 먼저 세우고, 통과한 뒤에야 글 폼을 연다
// (CommunityEditGate). 여기 서버 검증은 존재·보드·게스트글 판정과 본인인증 여부까지만
// 맡고, 소유권 비밀번호 실검증은 게이트가 getPost로 서버에 위임한다.
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
	// 회원 글은 회원 화면에서 수정한다(잠금·광고 옵션이 그쪽에만 있다). getPublicPost 조회는
	// 글 존재·보드·게스트글 여부 확인용으로만 쓴다(폼 초기값은 게이트가 다시 받아온다).
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

	return <CommunityEditGate board={board} guest postId={postId} />;
}
