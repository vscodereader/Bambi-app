import { View } from "react-native";

export function PresenceIndicator({ isOnline }: { isOnline: boolean }) {
	return (
		<View
			accessibilityLabel={isOnline ? "온라인" : "오프라인"}
			accessible
			className={`size-4 rounded-full ${isOnline ? "bg-success" : "bg-muted/40"}`}
		/>
	);
}
