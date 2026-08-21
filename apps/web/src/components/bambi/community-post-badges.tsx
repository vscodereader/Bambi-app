"use client";

// 수다방 글 배지 — 게시판 목록(screens/community-board)과 게시판 미리보기 카드
// (community-board-preview, seeker 홈·수다방 홈이 공유)가 같은 규칙으로 배지를 달도록
// 한곳에 모았다. 예전에는 목록에만 광고·업소 배지가 있어 홈 미리보기와 어긋났다.

import { Badge } from "@bambi-app/ui/components/badge";
import { isNewCommunityPost } from "@/lib/bambi/community";

// listPosts·overview 두 응답이 공통으로 갖는 필드만 받는다 — 라우터 출력 타입 하나에
// 묶어두면 다른 쪽에서 못 쓴다.
export interface CommunityPostBadgeSource {
	createdAt: Date | string;
	isPromotion: boolean;
}

// 광고·업소 배지. 공지 게시판은 작성자가 운영자뿐이라 호출부에서 통째로 생략한다.
export function CommunityRoleBadges({
	post,
}: {
	post: CommunityPostBadgeSource;
}) {
	if (!post.isPromotion) {
		return null;
	}
	return (
		<>
			{post.isPromotion ? (
				<Badge className="shrink-0" variant="warning">
					광고
				</Badge>
			) : null}
		</>
	);
}

// 새 글 표시(작성 후 이틀). 글자 "N"만으로는 뜻이 전달되지 않아 role·aria-label로
// "새 글"이라 읽히게 한다.
export function CommunityNewBadge({ createdAt }: { createdAt: Date | string }) {
	if (!isNewCommunityPost(createdAt)) {
		return null;
	}
	return (
		<Badge aria-label="새 글" className="shrink-0 px-1.5" role="img">
			N
		</Badge>
	);
}
