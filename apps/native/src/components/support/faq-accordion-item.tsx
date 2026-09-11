// FAQ 아코디언 한 항목. 셰브론 회전 상태가 항목마다 따로 필요해 분리했다.
// 펼침 여부는 부모가 쥔다(한 번에 하나만 열린다) — 다른 항목이 열려 이 항목이 닫힐 때도
// isOpen만 바뀌므로 회전은 onPress가 아니라 isOpen 변화에 맞춘다.
// 답변은 조건부 렌더 그대로 둔다(높이 애니메이션 없음).

import { Ionicons } from "@expo/vector-icons";
import { Surface, useThemeColor } from "heroui-native";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

import { MessageBody } from "@/src/components/message-body";

const OPEN_DEGREES = 90;
const ROTATE_DURATION_MS = 180;

export function FaqAccordionItem({
	answer,
	isOpen,
	onPress,
	question,
}: {
	answer: string | undefined;
	isOpen: boolean;
	onPress: () => void;
	question: string;
}) {
	const muted = useThemeColor("muted");
	const rotation = useSharedValue(0);
	const chevronStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value}deg` }],
	}));

	useEffect(() => {
		rotation.value = withTiming(isOpen ? OPEN_DEGREES : 0, {
			duration: ROTATE_DURATION_MS,
		});
	}, [isOpen, rotation]);

	return (
		<Surface className="rounded-lg" variant="secondary">
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: isOpen }}
				className="min-h-11 flex-row items-center gap-2 p-4 active:opacity-75"
				onPress={onPress}
			>
				<Text className="flex-1 font-semibold text-foreground">{question}</Text>
				<Animated.View style={chevronStyle}>
					<Ionicons color={muted} name="chevron-forward" size={18} />
				</Animated.View>
			</Pressable>
			{isOpen && answer ? (
				<View className="border-border border-t p-4">
					<MessageBody body={answer} />
				</View>
			) : null}
		</Surface>
	);
}
