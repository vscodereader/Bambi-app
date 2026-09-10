import type { ChatResponseBucket } from "@bambi-app/api/services/bambi-chat-response-policy";
import { View } from "react-native";
import { Pill } from "@/src/components/bambi-screen";
import {
	CHAT_AVAILABILITY_LABELS,
	resolveChatAvailabilityBadges,
} from "@/src/lib/chat/chat-availability";

const availabilityTone = (
	badge: keyof typeof CHAT_AVAILABILITY_LABELS
): "danger" | "neutral" | "success" => {
	if (badge === "blocked" || badge === "counterpart_withdrawn") {
		return "danger";
	}
	if (badge === "conversation_available" || badge === "realtime_connected") {
		return "success";
	}
	return "neutral";
};

export function ChatAvailabilityBadges(props: {
	counterpartIsOnline: boolean;
	counterpartResponseBucket: ChatResponseBucket | null;
	counterpartWithdrawn?: boolean;
	isBlocked: boolean;
	showRealtimeBadge?: boolean;
	viewerIsOnline: boolean;
}) {
	const badges = resolveChatAvailabilityBadges({
		...props,
		counterpartWithdrawn: props.counterpartWithdrawn ?? false,
		showRealtimeBadge: props.showRealtimeBadge ?? false,
	});
	return (
		<View className="flex-row flex-wrap gap-1">
			{badges.map((badge) => (
				<Pill key={badge} tone={availabilityTone(badge)}>
					{CHAT_AVAILABILITY_LABELS[badge]}
				</Pill>
			))}
		</View>
	);
}
