import { Ionicons } from "@expo/vector-icons";
import { Avatar, useThemeColor } from "heroui-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 채팅방 전용 헤더(SeekerStackHeader 대신). 뒤로 / 상대 아바타·이름·공고명 / 우측 슬롯.
// statusLine은 공고 마감·상대 탈퇴·차단 등 상태가 있을 때만 헤더 아래 얇게 뜬다.
export function ChatRoomHeader({
	counterpartName,
	counterpartProfileImageUrl,
	jobTitle,
	onBack,
	right,
	statusLine,
}: {
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
	jobTitle: null | string;
	onBack: () => void;
	right?: ReactNode;
	statusLine: null | string;
}) {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center gap-3 px-4">
				<Pressable
					accessibilityLabel="뒤로 가기"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
					hitSlop={8}
					onPress={onBack}
				>
					<Ionicons color={foreground} name="arrow-back" size={22} />
				</Pressable>
				<Avatar color="accent" size="sm">
					{counterpartProfileImageUrl ? (
						<Avatar.Image source={{ uri: counterpartProfileImageUrl }} />
					) : null}
					<Avatar.Fallback>
						{(counterpartName ?? "?").trim().charAt(0) || "?"}
					</Avatar.Fallback>
				</Avatar>
				<View className="flex-1">
					<Text
						className="font-bold text-base text-foreground"
						numberOfLines={1}
					>
						{counterpartName ?? "채팅방"}
					</Text>
					{jobTitle ? (
						<Text className="text-muted text-xs" numberOfLines={1}>
							{jobTitle}
						</Text>
					) : null}
				</View>
				{right}
			</View>
			{statusLine ? (
				<View className="bg-warning/15 px-4 py-1.5">
					<Text className="text-center text-warning-soft-foreground text-xs dark:text-warning">
						{statusLine}
					</Text>
				</View>
			) : null}
		</View>
	);
}
