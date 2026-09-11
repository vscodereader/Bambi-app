import type { ChatResponseBucket } from "@bambi-app/api/services/bambi-chat-response-policy";

import {
	type ChatAvailabilityBadge,
	resolveChatAvailabilityBadges,
} from "@/lib/bambi/chat-availability";

import { Badge } from "./ds";

const BADGE_LABELS: Record<ChatAvailabilityBadge, string> = {
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

const badgeTone = (
	badge: ChatAvailabilityBadge
): "danger" | "neutral" | "pending" | "success" => {
	if (badge === "blocked" || badge === "counterpart_withdrawn") {
		return "danger";
	}
	if (badge === "conversation_available" || badge === "realtime_connected") {
		return "success";
	}
	if (
		badge === "low" ||
		badge === "sixty_minutes" ||
		badge === "ten_minutes" ||
		badge === "thirty_minutes"
	) {
		return "pending";
	}
	return "neutral";
};

interface ChatAvailabilityBadgesProps {
	counterpartIsOnline: boolean;
	counterpartResponseBucket: ChatResponseBucket | null;
	counterpartWithdrawn?: boolean;
	isBlocked: boolean;
	showRealtimeBadge?: boolean;
	viewerIsOnline: boolean;
}

export function ChatAvailabilityBadges({
	counterpartIsOnline,
	counterpartResponseBucket,
	counterpartWithdrawn = false,
	isBlocked,
	showRealtimeBadge = false,
	viewerIsOnline,
}: ChatAvailabilityBadgesProps) {
	const badges = resolveChatAvailabilityBadges({
		counterpartIsOnline,
		counterpartResponseBucket,
		counterpartWithdrawn,
		isBlocked,
		showRealtimeBadge,
		viewerIsOnline,
	});

	return (
		<>
			{badges.map((badge) => (
				<Badge key={badge} tone={badgeTone(badge)}>
					{BADGE_LABELS[badge]}
				</Badge>
			))}
		</>
	);
}
