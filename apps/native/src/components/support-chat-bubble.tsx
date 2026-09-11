// 1:1 상담 말풍선. 내 메시지는 오른쪽 accent, 운영팀은 왼쪽 surface-secondary + 헤드셋 아바타.
// chat-message-bubble은 bambi-chat 타임라인 타입에 묶여 있어 재사용하지 않고 body/시각만 받는다.

import { formatChatTimeLabel } from "@bambi-app/api/services/bambi-chat-message-grouping";
import { Ionicons } from "@expo/vector-icons";
import { cn, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";
import Animated, { FadeInLeft, FadeInRight } from "react-native-reanimated";

const ENTER_DURATION_MS = 200;

// 그룹 첫 메시지에만 아바타를 그리고, 나머지 줄은 같은 폭의 빈 칸으로 들여쓰기를 맞춘다.
function SupportAvatarColumn({ isGroupStart }: { isGroupStart: boolean }) {
	const accentForeground = useThemeColor("accent-foreground");

	return (
		<View className="mr-2 w-8">
			{isGroupStart ? (
				<View className="h-8 w-8 items-center justify-center rounded-full bg-accent">
					<Ionicons color={accentForeground} name="headset-outline" size={16} />
				</View>
			) : null}
		</View>
	);
}

export function SupportChatBubble({
	animateIn = false,
	body,
	createdAt,
	isGroupEnd,
	isGroupStart,
	isMine,
}: {
	// 마운트 이후 새로 도착한 메시지만 true — 초기 로드분까지 애니메이션하면 화면이 출렁인다.
	animateIn?: boolean;
	body: string;
	createdAt: Date | string;
	isGroupEnd: boolean;
	isGroupStart: boolean;
	isMine: boolean;
}) {
	// 삼항 중첩을 피하려 방향을 먼저 고르고 modifier를 얹는다.
	const enterFrom = isMine ? FadeInRight : FadeInLeft;

	return (
		<Animated.View
			className={cn(
				"flex-row px-4",
				isMine ? "justify-end" : "justify-start",
				isGroupStart ? "mt-3" : "mt-1"
			)}
			entering={animateIn ? enterFrom.duration(ENTER_DURATION_MS) : undefined}
		>
			{isMine ? null : <SupportAvatarColumn isGroupStart={isGroupStart} />}
			<View className={cn("max-w-[80%]", isMine ? "items-end" : "items-start")}>
				{!isMine && isGroupStart ? (
					<Text className="mb-1 text-muted text-xs">운영팀</Text>
				) : null}
				<View
					className={cn(
						"rounded-2xl px-3.5 py-2.5",
						isMine
							? "rounded-br-md bg-accent"
							: "rounded-bl-md bg-surface-secondary"
					)}
				>
					<Text
						className={cn(
							"text-base leading-6",
							isMine ? "text-accent-foreground" : "text-foreground"
						)}
						selectable
					>
						{body}
					</Text>
				</View>
				{isGroupEnd ? (
					<Text className="mt-1 text-muted text-xs">
						{formatChatTimeLabel(createdAt)}
					</Text>
				) : null}
			</View>
		</Animated.View>
	);
}
