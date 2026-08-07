"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { notFound, useParams } from "next/navigation";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	GUEST_BOARD_LIMIT_NOTICE,
	isGuestWritableBoardKey,
} from "@/lib/bambi/community";
import { useBoardBySlug } from "@/lib/bambi/use-community-boards";

export default function SeekerCommunityWritePage() {
	const params = useParams<{ board: string }>();
	// 비회원 여부로 폼 모드가 갈린다(작성인 기본값·비밀번호 필수·잠금/광고·이미지 업로드 숨김).
	// 최종 판정은 서버 가드다 — 이 분기는 화면을 맞춰 주는 것뿐이다.
	const { isGuest } = useBambiAuth();
	// 게시판 목록을 다 받기 전에는 404를 내지 않는다(목록 페이지와 같은 규칙).
	const { board, isPending } = useBoardBySlug(params.board);

	if (isPending) {
		return <Skeleton className="h-64 w-full" />;
	}

	if (!board?.writable) {
		notFound();
	}

	// 주소를 직접 친 경우 — 목록의 글쓰기 버튼은 비회원에게 애초에 뜨지 않는다.
	if (isGuest && !isGuestWritableBoardKey(board.key)) {
		return (
			<EmptyState
				className="flex-1"
				description={GUEST_BOARD_LIMIT_NOTICE}
				title="글을 쓸 수 없는 게시판이에요"
			/>
		);
	}

	return <CommunityPostForm board={board} guest={isGuest} />;
}
