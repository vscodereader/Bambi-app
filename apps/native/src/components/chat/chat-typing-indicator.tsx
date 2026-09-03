import { Avatar } from "heroui-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

const DOT_COUNT = 3;
const DOT_STAGGER_MS = 160;
const DOT_CYCLE_MS = 480;
const DOT_KEYS = Array.from(
	{ length: DOT_COUNT },
	(_, index) => `typing-dot-${index}`
);

function TypingDot({ index }: { index: number }) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = withDelay(
			index * DOT_STAGGER_MS,
			withRepeat(
				withSequence(
					withTiming(1, {
						duration: DOT_CYCLE_MS,
						easing: Easing.inOut(Easing.ease),
					}),
					withTiming(0, {
						duration: DOT_CYCLE_MS,
						easing: Easing.inOut(Easing.ease),
					})
				),
				-1
			)
		);

		return () => cancelAnimation(progress);
	}, [index, progress]);

	const style = useAnimatedStyle(() => ({
		opacity: 0.35 + progress.value * 0.65,
		transform: [{ translateY: -progress.value * 3 }],
	}));

	return (
		<Animated.View className="h-2 w-2 rounded-full bg-muted" style={style} />
	);
}

// 상대 아바타 + 점 3개 말풍선. 표시 여부는 부모(typingUserIds.length > 0)가 정한다.
export function ChatTypingIndicator({
	counterpartName,
	counterpartProfileImageUrl,
}: {
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
}) {
	return (
		<View className="my-3 flex-row items-end px-4">
			<View className="mr-2 w-9">
				<Avatar color="accent" size="sm">
					{counterpartProfileImageUrl ? (
						<Avatar.Image source={{ uri: counterpartProfileImageUrl }} />
					) : null}
					<Avatar.Fallback>
						{(counterpartName ?? "?").trim().charAt(0) || "?"}
					</Avatar.Fallback>
				</Avatar>
			</View>
			<View
				accessibilityLabel={`${counterpartName ?? "상대"}가 입력 중`}
				className="flex-row items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-secondary px-4 py-3"
			>
				{DOT_KEYS.map((dotKey, index) => (
					<TypingDot index={index} key={dotKey} />
				))}
			</View>
		</View>
	);
}
