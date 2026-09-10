import type { ChatResponseBucket } from "@bambi-app/api/services/bambi-chat-response-policy";

export type ChatAvailabilityBadge =
	| "blocked"
	| "conversation_available"
	| "counterpart_withdrawn"
	| "offline"
	| "realtime_connected"
	| ChatResponseBucket;

export const resolveChatAvailabilityBadges = (input: {
	counterpartIsOnline: boolean;
	counterpartResponseBucket: ChatResponseBucket | null;
	counterpartWithdrawn: boolean;
	isBlocked: boolean;
	showRealtimeBadge: boolean;
	viewerIsOnline: boolean;
}): ChatAvailabilityBadge[] => {
	if (input.counterpartWithdrawn) {
		return ["counterpart_withdrawn"];
	}
	if (input.isBlocked) {
		return ["blocked"];
	}
	if (input.viewerIsOnline && input.counterpartIsOnline) {
		return input.showRealtimeBadge
			? ["conversation_available", "realtime_connected"]
			: ["conversation_available"];
	}
	return input.counterpartResponseBucket
		? ["offline", input.counterpartResponseBucket]
		: ["offline"];
};

export const CHAT_AVAILABILITY_LABELS: Record<ChatAvailabilityBadge, string> = {
	blocked: "차단됨",
	conversation_available: "대화 가능",
	counterpart_withdrawn: "대화 불가능",
	low: "응답 낮음",
	offline: "오프라인",
	realtime_connected: "실시간 연결",
	sixty_minutes: "평균 60분 이내 응답",
	ten_minutes: "평균 10분 이내 응답",
	thirty_minutes: "평균 30분 이내 응답",
};

export function chatActionDecision(
	kind: "contact",
	confirmed: boolean
): "decline" | "reveal";
export function chatActionDecision(
	kind: "interview",
	confirmed: boolean
): "confirmed" | "declined";
export function chatActionDecision(
	kind: "contact" | "interview",
	confirmed: boolean
): "confirmed" | "decline" | "declined" | "reveal" {
	if (kind === "contact") {
		return confirmed ? "reveal" : "decline";
	}
	return confirmed ? "confirmed" : "declined";
}
