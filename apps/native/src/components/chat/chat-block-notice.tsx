import { Ionicons } from "@expo/vector-icons";
import { Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 입력바 자리에 뜨는 안내(차단·신고 검토·상대 탈퇴·공고 마감). 이력은 그대로 보이고 발신만 막는다.
export function ChatBlockNotice({ message }: { message: string }) {
	const insets = useSafeAreaInsets();
	const muted = useThemeColor("muted");

	return (
		<View
			className="border-border border-t bg-background px-4 pt-3"
			style={{ paddingBottom: insets.bottom + 12 }}
		>
			<Surface
				className="flex-row items-center gap-3 rounded-2xl p-4"
				variant="secondary"
			>
				<Ionicons color={muted} name="lock-closed-outline" size={20} />
				<Text className="flex-1 text-muted text-sm leading-5">{message}</Text>
			</Surface>
		</View>
	);
}
