// 알림 한 건 → native 착지 경로. web notificationHref의 native판이며, 화면이 없는 타입은
// null(읽음 처리만·이동 없음 — 스펙 §4.3). 역할과 맞지 않는 조합도 null이다: 구인자 셸에서
// 구직자 화면으로 push하면 (seeker) 그룹 레이아웃이 통째로 바뀐다.
import type { BambiNotificationView } from "@bambi-app/api/services/bambi-notification-labels";

export type NotificationRole = "employer" | "seeker";

const readString = (
	metadata: Record<string, unknown> | null,
	key: string
): null | string => {
	const value = metadata?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
};

const PROMOTION_ACTIONS = new Set([
	"listing_activated",
	"listing_queued",
	"remove_from_listing_queue",
]);

const SEEKER_ROUTES: Record<string, string> = {
	direct_message: "/(seeker)/me/messages",
	interview_schedule: "/(seeker)/me/interviews",
	point_shop_order: "/(seeker)/me/attendance",
	point_transaction: "/(seeker)/me/attendance",
	report: "/(seeker)/me/reports",
	support_inquiry: "/(seeker)/support/inquiries",
	support_chat: "/(seeker)/support/chat",
};

const EMPLOYER_ROUTES: Record<string, string> = {
	employer_verification: "/(employer)/me/business",
	organization_member: "/(employer)/me/teams",
	team_invitation: "/(employer)/me/teams",
};

const jobPostRoute = (item: BambiNotificationView): string => {
	const action = readString(item.metadata, "action") ?? "";
	if (action.startsWith("set_payment") || PROMOTION_ACTIONS.has(action)) {
		return "/(employer)/promotions";
	}
	if (action === "hard_delete") {
		return "/(employer)/(tabs)";
	}
	return `/(employer)/jobs/${item.targetId}/edit`;
};

const chatRoute = (
	item: BambiNotificationView,
	role: NotificationRole
): string =>
	item.chatRoomId
		? `/(${role})/chats/${item.chatRoomId}`
		: `/(${role})/(tabs)/chats`;

const reviewRoute = (
	item: BambiNotificationView,
	role: NotificationRole
): null | string => {
	const jobPostId = readString(item.metadata, "jobPostId");
	return role === "seeker" && jobPostId ? `/(seeker)/jobs/${jobPostId}` : null;
};

export function notificationRoute(
	item: BambiNotificationView,
	role: NotificationRole
): null | string {
	if (item.recipientRole !== null) {
		return null;
	}

	switch (item.targetType) {
		case "chat_message":
		case "chat_room":
		case "contact_reveal":
			return chatRoute(item, role);
		case "review":
			return reviewRoute(item, role);
		case "support_inquiry":
			return role === "seeker"
				? `/(seeker)/support/inquiries/${item.targetId}`
				: null;
		case "support_chat":
			return role === "seeker"
				? `/(seeker)/support/chat/${item.targetId}`
				: null;
		case "job_post":
			return role === "employer" ? jobPostRoute(item) : null;
		default:
			return (
				(role === "seeker" ? SEEKER_ROUTES : EMPLOYER_ROUTES)[
					item.targetType
				] ?? null
			);
	}
}
