import { Ionicons } from "@expo/vector-icons";
import { Chip, useThemeColor } from "heroui-native";
import { Pressable, View } from "react-native";

// 위로 스크롤해 과거를 보는 중 새 메시지가 오면 하단에 뜨는 플로팅 칩. 탭하면 맨 아래로.
export function ChatNewMessagePill({ onPress }: { onPress: () => void }) {
	const accentForeground = useThemeColor("accent-foreground");

	return (
		<View
			className="absolute right-0 bottom-3 left-0 items-center"
			pointerEvents="box-none"
		>
			<Pressable
				accessibilityLabel="새 메시지로 이동"
				accessibilityRole="button"
				onPress={onPress}
			>
				<Chip color="accent" size="md" variant="primary">
					<Ionicons color={accentForeground} name="arrow-down" size={14} />
					<Chip.Label>새 메시지</Chip.Label>
				</Chip>
			</Pressable>
		</View>
	);
}
