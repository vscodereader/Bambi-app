import type { ChatResponseBucket } from "@bambi-app/api/services/bambi-chat-response-policy";

export type ChatAvailabilityBadge =
	| "blocked"
	| "conversation_available"
	| "counterpart_withdrawn"
	| "offline"
	| "realtime_connected"
	| ChatResponseBucket;

export interface ChatAvailabilityInput {
	counterpartIsOnline: boolean;
	counterpartResponseBucket: ChatResponseBucket | null;
	counterpartWithdrawn: boolean;
	isBlocked: boolean;
	showRealtimeBadge: boolean;
	viewerIsOnline: boolean;
}

export const resolveChatAvailabilityBadges = ({
	counterpartIsOnline,
	counterpartResponseBucket,
	counterpartWithdrawn,
	isBlocked,
	showRealtimeBadge,
	viewerIsOnline,
}: ChatAvailabilityInput): ChatAvailabilityBadge[] => {
	if (counterpartWithdrawn) {
		return ["counterpart_withdrawn"];
	}
	if (isBlocked) {
		return ["blocked"];
	}
	if (viewerIsOnline && counterpartIsOnline) {
		return showRealtimeBadge
			? ["conversation_available", "realtime_connected"]
			: ["conversation_available"];
	}
	return counterpartResponseBucket
		? ["offline", counterpartResponseBucket]
		: ["offline"];
};
