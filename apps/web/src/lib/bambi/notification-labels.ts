// 알림 한 건의 딥링크(web 경로) 맵. 제목·본문 문구는 packages/api 서비스로 옮겨 native와
// 공유하고, 여기서는 re-export만 한다(호출부 import 경로 유지). 경로는 플랫폼별이라 남긴다.

import type { BambiNotificationView } from "@bambi-app/api/services/bambi-notification-labels";
import { buildChatRoomPath, CHAT_LIST_PATH } from "./chat-paths";
import {
	COMMUNITY_BOARDS,
	communityCrawledPath,
	communityPostPath,
} from "./community";

export type { BambiNotificationView } from "@bambi-app/api/services/bambi-notification-labels";
// biome-ignore lint/performance/noBarrelFile: 정본(packages/api) 이전에 따른 경로 호환용 재수출.
export {
	notificationBody,
	notificationTitle,
} from "@bambi-app/api/services/bambi-notification-labels";

export const NOTIFICATIONS_HREF = "/seeker/notifications";

const readString = (
	metadata: Record<string, unknown> | null,
	key: string
): null | string => {
	const value = metadata?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
};

const action = (item: BambiNotificationView): string =>
	readString(item.metadata, "action") ?? "";

const isShared = (item: BambiNotificationView): boolean =>
	item.recipientRole !== null;

const boardSlug = (item: BambiNotificationView): null | string => {
	const board = readString(item.metadata, "board");
	return COMMUNITY_BOARDS.find((meta) => meta.key === board)?.slug ?? null;
};

const communityHref = (item: BambiNotificationView): string => {
	// 수집 글에 달린 댓글은 게시판 글이 아니라 수집 전용 상세로 보낸다(게시판 slug·postId가
	// 아예 없는 알림이라 이 분기가 없으면 알림함으로 되돌아간다).
	const crawledTopicId = readString(item.metadata, "crawledTopicId");
	if (crawledTopicId) {
		return communityCrawledPath(crawledTopicId);
	}
	const slug = boardSlug(item);
	const postId = readString(item.metadata, "postId");
	return slug && postId ? communityPostPath(slug, postId) : NOTIFICATIONS_HREF;
};

const SHARED_HREF_BY_TARGET: Record<string, string> = {
	community_post: "/seeker/community/legal",
	employer_verification: "/moderator/employers",
	// 공유 job_post는 "새 공고 검수 요청"뿐이라 검수 대기 큐인 콘솔 루트가 착지점이다
	// (/moderator/jobs는 전체 상태 공고 관리라 방금 온 검수 건이 묻힌다).
	job_post: "/moderator",
	report: "/moderator/reports",
	review: "/moderator/reviews",
	support_chat: "/moderator/support-chats",
	support_inquiry: "/moderator/support",
	team_invitation: "/moderator/team-invites",
};

const jobPostHref = (item: BambiNotificationView): string => {
	const rawAction = action(item);
	// 결제 승인은 "노출이 시작됐다"는 신호라 광고 관리가 착지점이다. 하드 삭제된 공고는
	// 수정 화면이 404라 목록으로 보낸다.
	if (rawAction.startsWith("set_payment")) {
		return "/employer/promotions";
	}
	// 대기열 3종(접수·자동 노출 시작·제외) 모두 대기 순번·노출 상태가 보이는 광고 관리로 보낸다.
	if (
		rawAction === "listing_queued" ||
		rawAction === "listing_activated" ||
		rawAction === "remove_from_listing_queue"
	) {
		return "/employer/promotions";
	}
	if (rawAction === "hard_delete") {
		return "/employer";
	}
	return `/employer/jobs/${item.targetId}/edit`;
};

/** null이면 착지할 화면이 없는 알림이다(읽음 처리만 하고 이동하지 않는다). */
export function notificationHref(item: BambiNotificationView): null | string {
	if (isShared(item)) {
		// 법률자문 공유는 운영자 콘솔이 아니라 법률 자문 게시판 글로 보낸다.
		if (item.recipientRole === "legal_advisor") {
			return communityHref(item);
		}
		return SHARED_HREF_BY_TARGET[item.targetType] ?? NOTIFICATIONS_HREF;
	}

	switch (item.targetType) {
		case "chat_message":
		case "chat_room":
		case "contact_reveal":
			return item.chatRoomId
				? buildChatRoomPath(item.chatRoomId)
				: CHAT_LIST_PATH;
		// 면접은 채팅방이 아니라 예정된 면접 화면으로 보낸다 — 방이 삭제되면 착지할 곳이
		// 없어지고, 구인자·구직자가 같은 화면에서 일정을 본다.
		case "interview_schedule":
			return "/seeker/me/interviews";
		case "community_comment":
		case "community_post":
			return communityHref(item);
		case "direct_message":
			return "/seeker/me/messages";
		case "employer_verification":
			return "/employer/settings";
		case "job_post":
			return jobPostHref(item);
		// 권한 변경은 당사자가 볼 화면이 없다(팀 관리는 소유자 전용) — 이동시키지 않는다.
		case "organization_member":
			return action(item) === "role_changed"
				? null
				: "/employer/settings/teams";
		case "team_invitation":
			return "/employer/settings/teams";
		// 보유 아이템 카드가 있는 포인트 내역 페이지로 보낸다(옛 구매 내역 페이지는 폐지).
		case "point_shop_order":
			return "/seeker/attendance";
		case "point_transaction":
			if (action(item) === "point_job_reward") {
				const jobPostId = readString(item.metadata, "jobPostId");
				if (jobPostId) {
					return readString(item.metadata, "targetSource") ===
						"crawled_job_post"
						? `/seeker/jobs/crawled/${jobPostId}`
						: `/seeker/jobs/${jobPostId}`;
				}
			}
			return "/seeker/attendance#point-history";
		case "report":
			return "/seeker/me/reports";
		case "review": {
			const jobPostId = readString(item.metadata, "jobPostId");
			return jobPostId ? `/seeker/jobs/${jobPostId}` : NOTIFICATIONS_HREF;
		}
		// 문의 채팅 답변은 위젯을 자동으로 여는 딥링크로 보낸다(Task 8과 약속된 쿼리 파라미터).
		case "support_chat":
			return "/?support-chat=1";
		// 문의 답변은 문의자에게 가고 targetId가 곧 inquiry id다(서버 support 라우터 기준).
		case "support_inquiry":
			return `/support/inquiries/${item.targetId}`;
		default:
			return NOTIFICATIONS_HREF;
	}
}
