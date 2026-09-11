// 1:1 상담 입력바. 멀티라인 입력 + 원형 전송 버튼(누름 스프링), 전송하면 입력을 비운다.
// formSheet 안에서 쓰이므로 하단 인셋을 보정 없이 그대로 얹는다.

import { Ionicons } from "@expo/vector-icons";
import { cn, TextArea, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 서버 sendMessage 입력 한도(SUPPORT_CHAT_BODY_MAX)와 맞춘다.
const BODY_MAX = 1000;
const PRESSED_SCALE = 0.9;

export function SupportChatComposer({
	isDisabled,
	isSending,
	onSend,
}: {
	isDisabled: boolean;
	isSending: boolean;
	onSend: (body: string) => void;
}) {
	const insets = useSafeAreaInsets();
	const accentForeground = useThemeColor("accent-foreground");
	const [body, setBody] = useState("");
	const scale = useSharedValue(1);
	const buttonStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const canSend = !(isDisabled || isSending) && body.trim().length > 0;

	const handleSend = () => {
		if (!canSend) {
			return;
		}
		onSend(body.trim());
		setBody("");
	};

	return (
		<View
			className="flex-row items-end gap-2 border-border border-t bg-background px-3 pt-2"
			style={{ paddingBottom: insets.bottom }}
		>
			<View className="flex-1">
				<TextArea
					accessibilityLabel="메시지 입력"
					className="h-auto max-h-32 min-h-12"
					editable={!isDisabled}
					maxLength={BODY_MAX}
					onChangeText={setBody}
					placeholder="메시지를 보내주세요"
					textAlignVertical="center"
					value={body}
					variant="secondary"
				/>
			</View>
			<Pressable
				accessibilityLabel="메시지 전송"
				accessibilityRole="button"
				accessibilityState={{ disabled: !canSend }}
				disabled={!canSend}
				onPress={handleSend}
				onPressIn={() => {
					scale.value = withSpring(PRESSED_SCALE);
				}}
				onPressOut={() => {
					scale.value = withSpring(1);
				}}
			>
				<Animated.View
					className={cn(
						"h-11 w-11 items-center justify-center rounded-full bg-accent",
						canSend ? "" : "opacity-50"
					)}
					style={buttonStyle}
				>
					<Ionicons color={accentForeground} name="send" size={18} />
				</Animated.View>
			</Pressable>
		</View>
	);
}
