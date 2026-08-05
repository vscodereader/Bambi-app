// 운영 조치 상태(community_content_status: published/hidden/deleted) 전이 규칙.
//
// 소프트 삭제된 글·댓글·문의를 운영자가 "또 삭제"하는 흐름을 서버에서 막는다. 화면이
// 삭제 버튼을 숨기더라도(목록 캐시가 낡았거나 다른 탭에서 이미 삭제했을 수 있다) 요청은
// 들어올 수 있고, 그대로 통과시키면 같은 대상에 감사 로그만 계속 쌓여 "누가 언제 지웠나"가
// 흐려진다. 조치 프로시저들이 같은 판정을 공유하도록 여기 한 곳에 둔다.

import { ORPCError } from "@orpc/server";

export type ContentModerationStatus = "published" | "hidden" | "deleted";

export type ModeratableContentKind = "comment" | "inquiry" | "post";

// 한국어 조사가 대상마다 달라(글이에요 / 문의예요) 문장을 통째로 둔다 — 라벨만 갈아끼우면
// "문의이에요" 같은 문장이 나온다.
export const ALREADY_DELETED_MESSAGES: Record<ModeratableContentKind, string> =
	{
		comment: "이미 삭제된 댓글이에요. 다시 삭제할 수 없어요.",
		inquiry: "이미 삭제된 문의예요. 다시 삭제할 수 없어요.",
		post: "이미 삭제된 글이에요. 다시 삭제할 수 없어요.",
	};

// 삭제 요청이 이미 삭제된 대상에 다시 오면 true. 복구(published)·숨김(hidden) 요청은
// 삭제된 대상에도 유효한 전이라 막지 않는다.
export const isRedundantDelete = (
	current: ContentModerationStatus,
	next: ContentModerationStatus
): boolean => current === "deleted" && next === "deleted";

export const assertNotAlreadyDeleted = ({
	current,
	kind,
	next,
}: {
	current: ContentModerationStatus;
	kind: ModeratableContentKind;
	next: ContentModerationStatus;
}): void => {
	if (isRedundantDelete(current, next)) {
		throw new ORPCError("CONFLICT", {
			message: ALREADY_DELETED_MESSAGES[kind],
		});
	}
};
