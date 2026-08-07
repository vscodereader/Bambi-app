// 알림 한 건을 화면 문구·딥링크로 바꾸는 순수 맵. DB enum(target_type)과 metadata.action이
// 그대로 렌더되지 않도록 표시는 전부 여기를 거친다 — 모르는 값에도 중립 폴백이 있어
// 서버가 먼저 새 값을 내려도 원값이 화면에 새지 않는다(report-labels.ts와 같은 관례).

import { COMMUNITY_BOARDS, communityPostPath } from "./community";
import { organizationRoleLabel } from "./team-labels";

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

const readNumber = (
	metadata: Record<string, unknown> | null,
	key: string
): null | number => {
	const value = metadata?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
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
	"job_post:set_payment:paid": "입금이 확인돼 공고가 게시됐어요",
	"job_post:set_status:hidden": "공고가 숨김 처리됐어요",
	"job_post:set_status:on_hold": "공고 검수가 보류됐어요",
	"job_post:set_status:published": "공고가 승인돼 게시됐어요",
	"job_post:set_status:rejected": "공고가 반려됐어요",
	"organization_member:ownership_transferred": "조직 소유권을 넘겨받았어요",
	"organization_member:removed": "조직에서 제외됐어요",
	"organization_member:role_changed": "조직 내 권한이 변경됐어요",
	// 업주가 받는 "새 후기 등록"(reviews.ts action: "created"). 폴백 문구로 떨어지면
	// "후기 상태가 변경됐어요"가 되어 내 후기가 조치된 것처럼 정반대로 읽힌다.
	"review:created": "내 업소에 새 후기가 등록됐어요",
	"review:set_status:hidden": "내 후기가 숨김 처리됐어요",
	"review:set_status:published": "내 후기가 게시됐어요",
	"support_inquiry:answered": "문의에 답변이 도착했어요",
	"team_invitation:accepted": "팀 합류가 승인됐어요",
	// 초대를 낸 조직 쪽이 받는 합류 완료 알림(합류자 본인의 accepted와 짝이다).
	"team_invitation:joined": "초대한 구성원이 팀에 합류했어요",
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

/**
 * 공고명·업소명처럼 metadata가 있어야 완성되는 문구. 서버가 그 값을 싣기 전에 쌓인
 * 구버전 행도 그대로 남아 있으므로, 재료가 하나라도 없으면 null을 돌려 아래 정적 맵
 * 문구로 폴백한다(「」만 남은 빈 제목이 나오지 않게).
 */
const dynamicTitle = (
	item: BambiNotificationView,
	key: string
): null | string => {
	const jobPostTitle = readString(item.metadata, "jobPostTitle");

	switch (key) {
		// 승인은 셋으로 갈린다: 숨김 해제(재공개) / 유료 공고의 입금 대기 / 무료 즉시 게시.
		// 유료 공고는 승인만으로 노출되지 않아 "게시됐어요"가 사실과 다르다.
		case "job_post:set_status:published": {
			if (readString(item.metadata, "previousStatus") === "hidden") {
				return "공고가 재공개됐어요";
			}
			return item.metadata?.paymentPending === true
				? "공고가 승인됐어요. 입금 확인 후 게시됩니다"
				: null;
		}
		case "job_post:adjust_job_post_exposure": {
			const days = readNumber(item.metadata, "days");
			if (!(jobPostTitle && days)) {
				return null;
			}
			const direction = days > 0 ? "연장" : "단축";
			return `｢${jobPostTitle}｣ 공고의 노출 기간이 ${Math.abs(days)}일 ${direction}되었습니다`;
		}
		case "job_post:hard_delete":
			return jobPostTitle ? `｢${jobPostTitle}｣ 공고가 삭제됐어요` : null;
		case "review:created":
			return jobPostTitle ? `｢${jobPostTitle}｣ 공고에 후기가 달렸어요` : null;
		case "organization_member:role_changed": {
			const orgName = readString(item.metadata, "orgName");
			const role = readString(item.metadata, "role");
			return orgName && role
				? `${orgName}에서 권한이 ${organizationRoleLabel(role)}(으)로 변경되었습니다`
				: null;
		}
		case "team_invitation:joined": {
			const joinedDisplayName = readString(item.metadata, "joinedDisplayName");
			return joinedDisplayName
				? `${joinedDisplayName}님이 팀에 합류했어요`
				: null;
		}
		default:
			return null;
	}
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

	const key = `${item.targetType}:${normalizedAction}`;

	return (
		dynamicTitle(item, key) ??
		TITLE_BY_TARGET_AND_ACTION[key] ??
		TITLE_BY_TARGET[item.targetType] ??
		"새 알림이 도착했어요"
	);
}

// 사유를 본문으로 낼 수 있는 부정 전이 결과. metadata.reason은 부정 전이에서만 당사자에게
// 남기는 설명이고, 그 밖(승인·게시·접수)에서는 운영자 내부 메모이거나 신고 사유 enum
// 원값이라 그대로 렌더하면 안 새야 할 값이 샌다(스펙 §4).
const REASON_VISIBLE_OUTCOMES = new Set([
	"deleted",
	"hard_delete",
	"hidden",
	"on_hold",
	"rejected",
]);

/**
 * 반려·숨김류의 사유. 사유가 없거나 부정 전이가 아니면 본문 없이 제목만 보여준다.
 * action은 `set_status:rejected`·`set_community_post_status:hidden`처럼 접미가 붙거나
 * `hard_delete`·`rejected`처럼 단독으로 오므로 마지막 세그먼트로 판정한다.
 */
export function notificationBody(item: BambiNotificationView): null | string {
	const rawAction = action(item);
	// 신고 처리 결과의 reason만 예외로 전이 방향과 무관하게 남긴다 — 운영자가 신고자에게
	// 남기는 처리 메모라(setReportStatus의 자유 입력) 결과가 resolved여도 본문이 정보다.
	const visible =
		rawAction.startsWith("set_report_status:") ||
		REASON_VISIBLE_OUTCOMES.has(rawAction.split(":").at(-1) ?? "");

	return visible ? readString(item.metadata, "reason") : null;
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
				? `/seeker/chats/${item.chatRoomId}`
				: "/seeker/chats";
		// 면접은 채팅방이 아니라 예정된 면접 화면으로 보낸다 — 방이 삭제되면 착지할 곳이
		// 없어지고, 구인자·구직자가 같은 화면에서 일정을 본다.
		case "interview_schedule":
			return "/seeker/me/interviews";
		case "community_comment":
		case "community_post":
			return communityHref(item);
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
