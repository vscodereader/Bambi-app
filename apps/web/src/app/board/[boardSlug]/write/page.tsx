import { buttonVariants } from "@bambi-app/ui/components/button";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { EmptyState } from "@/components/bambi/empty-state";
import { communityWritePath } from "@/lib/bambi/community";
import {
	getPublicBoardBySlug,
	isGuestWritableBoard,
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

	// 이 화면으로 오는 동선은 목록에서 없앴다(본인인증 CTA 제거) — 주소로 직접 들어온
	// 미인증 방문자에게는 인증을 권하지 않고 로그인으로 안내한다.
	if (!canWrite) {
		return (
			<EmptyState
				action={
					<Link className={buttonVariants()} href="/seeker?auth=login">
						로그인
					</Link>
				}
				description="로그인하면 게시판에 글을 남길 수 있어요."
				title="로그인이 필요해요"
			/>
		);
	}

	return <CommunityPostForm board={board} guest />;
}
