// 알림 한 건을 화면 문구·딥링크로 바꾸는 순수 맵. DB enum(target_type)과 metadata.action이
// 그대로 렌더되지 않도록 표시는 전부 여기를 거친다 — 모르는 값에도 중립 폴백이 있어
// 서버가 먼저 새 값을 내려도 원값이 화면에 새지 않는다(report-labels.ts와 같은 관례).

import { COMMUNITY_BOARDS, communityPostPath } from "./community";

export const NOTIFICATIONS_HREF = "/seeker/notifications";

export interface BambiNotificationView {
	chatRoomId: null | string;
	metadata: Record<string, unknown> | null;
	/** 채워져 있으면 운영자·법률자문이 공유로 받은 큐 알림이다(문구·딥링크가 갈린다). */
	recipientRole: null | string;
	targetId: string;
	targetType: string;
}

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

// (targetType, action) 조합 문구. 조합이 없으면 targetType 기본 문구로 떨어진다.
const TITLE_BY_TARGET_AND_ACTION: Record<string, string> = {
	"community_comment:reply": "내 댓글에 답글이 달렸어요",
	"community_comment:set_community_comment_status:deleted":
		"내 댓글이 삭제됐어요",
	"community_comment:set_community_comment_status:hidden":
		"내 댓글이 숨김 처리됐어요",
	"community_post:comment": "내 글에 새 댓글이 달렸어요",
	"community_post:set_community_post_status:deleted": "내 글이 삭제됐어요",
	"community_post:set_community_post_status:hidden": "내 글이 숨김 처리됐어요",
	"employer_verification:rejected": "사업자 인증이 반려됐어요",
	"employer_verification:verified": "사업자 인증이 승인됐어요",
	"interview_schedule:canceled": "면접이 취소됐어요",
	"interview_schedule:completed": "면접이 완료 처리됐어요",
	"interview_schedule:confirmed": "면접 일정이 확정됐어요",
	"interview_schedule:declined": "면접 제안이 거절됐어요",
	"interview_schedule:proposed": "면접 제안이 도착했어요",
	"job_post:adjust_job_post_exposure": "공고 노출 기간이 조정됐어요",
	"job_post:edit_job_post": "운영자가 내 공고를 수정했어요",
	"job_post:hard_delete": "내 공고가 삭제됐어요",
	"job_post:set_payment:paid": "공고 결제가 승인돼 노출이 시작됐어요",
	"job_post:set_status:hidden": "공고가 숨김 처리됐어요",
	"job_post:set_status:on_hold": "공고 검수가 보류됐어요",
	"job_post:set_status:published": "공고가 승인돼 게시됐어요",
	"job_post:set_status:rejected": "공고가 반려됐어요",
	"organization_member:ownership_transferred": "조직 소유권을 넘겨받았어요",
	"organization_member:removed": "조직에서 제외됐어요",
	"organization_member:role_changed": "조직 내 권한이 변경됐어요",
	"review:set_status:hidden": "내 후기가 숨김 처리됐어요",
	"review:set_status:published": "내 후기가 게시됐어요",
	"support_inquiry:answered": "문의에 답변이 도착했어요",
	"team_invitation:accepted": "팀 합류가 승인됐어요",
	"team_invitation:rejected": "팀 초대가 반려됐어요",
};

// 운영자·법률자문이 공유로 받는 큐 문구. 같은 targetType이라도 "내 것이 처리됐다"가
// 아니라 "새 처리거리가 왔다"로 읽혀야 한다.
const SHARED_TITLE_BY_TARGET: Record<string, string> = {
	community_post: "법률 자문 새 글이 등록됐어요",
	employer_verification: "사업자 인증 심사 요청이 들어왔어요",
	job_post: "새 공고 검수 요청이 들어왔어요",
	report: "새 신고가 접수됐어요",
	review: "후기 심사 요청이 들어왔어요",
	support_inquiry: "새 1:1 문의가 접수됐어요",
	team_invitation: "팀 초대 심사 요청이 들어왔어요",
};

const TITLE_BY_TARGET: Record<string, string> = {
	chat_message: "새 메시지가 도착했어요",
	chat_room: "새 채팅이 시작됐어요",
	community_comment: "댓글에 변동이 있어요",
	community_post: "내 글에 변동이 있어요",
	contact_reveal: "연락처가 공개됐어요",
	employer_verification: "사업자 인증 상태가 변경됐어요",
	interview_schedule: "면접 일정에 변동이 있어요",
	job_post: "공고 상태가 변경됐어요",
	organization_member: "조직 구성원 정보가 변경됐어요",
	report: "신고 처리 결과가 나왔어요",
	review: "후기 상태가 변경됐어요",
	support_inquiry: "문의에 변동이 있어요",
	team_invitation: "팀 초대에 변동이 있어요",
};

export function notificationTitle(item: BambiNotificationView): string {
	if (isShared(item)) {
		// 문의 재질문(replied)만 공유 큐에서 문구가 갈린다.
		if (item.targetType === "support_inquiry" && action(item) === "replied") {
			return "문의자가 다시 질문했어요";
		}
		return (
			SHARED_TITLE_BY_TARGET[item.targetType] ?? "새 처리 요청이 들어왔어요"
		);
	}

	// 노출 조정은 action에 일수가 붙는다(adjust_job_post_exposure:+7) — prefix로 맞춘다.
	const rawAction = action(item);
	const normalizedAction = rawAction.startsWith("adjust_job_post_exposure")
		? "adjust_job_post_exposure"
		: rawAction;

	return (
		TITLE_BY_TARGET_AND_ACTION[`${item.targetType}:${normalizedAction}`] ??
		TITLE_BY_TARGET[item.targetType] ??
		"새 알림이 도착했어요"
	);
}

/** 반려·숨김류의 사유. 사유가 없는 이벤트는 본문 없이 제목만 보여준다. */
export function notificationBody(item: BambiNotificationView): null | string {
	return readString(item.metadata, "reason");
}

const boardSlug = (item: BambiNotificationView): null | string => {
	const board = readString(item.metadata, "board");
	return COMMUNITY_BOARDS.find((meta) => meta.key === board)?.slug ?? null;
};

const communityHref = (item: BambiNotificationView): string => {
	const slug = boardSlug(item);
	const postId = readString(item.metadata, "postId");
	return slug && postId ? communityPostPath(slug, postId) : NOTIFICATIONS_HREF;
};

const SHARED_HREF_BY_TARGET: Record<string, string> = {
	community_post: "/seeker/community/legal",
	employer_verification: "/moderator/employers",
	job_post: "/moderator/jobs",
	report: "/moderator/reports",
	review: "/moderator/reviews",
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
	if (rawAction === "hard_delete") {
		return "/employer";
	}
	return `/employer/jobs/${item.targetId}/edit`;
};

export function notificationHref(item: BambiNotificationView): string {
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
		case "interview_schedule":
			return item.chatRoomId
				? `/seeker/chats/${item.chatRoomId}`
				: "/seeker/chats";
		case "community_comment":
		case "community_post":
			return communityHref(item);
		case "employer_verification":
			return "/employer/settings";
		case "job_post":
			return jobPostHref(item);
		case "organization_member":
		case "team_invitation":
			return "/employer/settings/teams";
		case "report":
			return "/seeker/me/reports";
		case "review": {
			const jobPostId = readString(item.metadata, "jobPostId");
			return jobPostId ? `/seeker/jobs/${jobPostId}` : NOTIFICATIONS_HREF;
		}
		// 문의 답변은 문의자에게 가고 targetId가 곧 inquiry id다(서버 support 라우터 기준).
		case "support_inquiry":
			return `/support/inquiries/${item.targetId}`;
		default:
			return NOTIFICATIONS_HREF;
	}
}
