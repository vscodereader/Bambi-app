import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SeekerHomeHeader } from "@/src/components/seeker-header";
import { useChatUnreadBadge } from "@/src/lib/chat/use-chat-unread-badge";
import { useVisitor } from "@/src/lib/guest-store";

// 웹 하단 탭(4.5rem=72px)에 맞춰 기본 49dp보다 키운 콘텐츠 높이. 안전영역은 별도 가산.
const TAB_BAR_CONTENT_HEIGHT = 64;

// 미읽음 배지 상한 — 초과분은 "99+"로 접는다.
const UNREAD_CAP = 99;

// 0이면 배지 없음, 상한 초과면 "99+", 그 외엔 숫자 그대로.
const resolveTabBadge = (count: number): number | string | undefined => {
	if (count <= 0) {
		return;
	}
	return count > UNREAD_CAP ? `${UNREAD_CAP}+` : count;
};

// 활성 탭은 채운 글리프, 비활성은 outline — 색 틴트 단독으로 상태를 전달하지 않는다.
function tabIcon(
	active: ComponentProps<typeof Ionicons>["name"],
	inactive: ComponentProps<typeof Ionicons>["name"]
) {
	return ({
		color,
		focused,
		size,
	}: {
		color: ColorValue;
		focused: boolean;
		size: number;
	}) => (
		<Ionicons color={color} name={focused ? active : inactive} size={size} />
	);
}

export default function SeekerTabsLayout() {
	const accentColor = useThemeColor("accent");
	const accentForegroundColor = useThemeColor("accent-foreground");
	const mutedColor = useThemeColor("muted");
	const backgroundColor = useThemeColor("background");
	const borderColor = useThemeColor("border");
	const insets = useSafeAreaInsets();
	const { state: visitorState } = useVisitor();
	const chatUnreadCount = useChatUnreadBadge(visitorState === "member");

	return (
		<Tabs
			screenOptions={{
				header: () => <SeekerHomeHeader />,
				tabBarActiveTintColor: accentColor,
				tabBarInactiveTintColor: mutedColor,
				tabBarStyle: {
					backgroundColor,
					borderTopColor: borderColor,
					// height를 재정의하면 라이브러리의 인셋 처리도 함께 고정해 줘야 한다 —
					// 안 그러면 콘텐츠 높이가 기기별 인셋만큼 들쭉날쭉해진다.
					height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
					paddingBottom: insets.bottom,
					paddingTop: 6,
				},
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					tabBarIcon: tabIcon("search", "search-outline"),
					title: "탐색",
				}}
			/>
			<Tabs.Screen
				name="chats"
				options={{
					tabBarBadge: resolveTabBadge(chatUnreadCount),
					tabBarBadgeStyle: {
						backgroundColor: accentColor,
						color: accentForegroundColor,
						fontSize: 11,
					},
					tabBarIcon: tabIcon(
						"chatbubble-ellipses",
						"chatbubble-ellipses-outline"
					),
					title: "채팅",
				}}
			/>
			<Tabs.Screen
				name="community"
				options={{
					tabBarIcon: tabIcon("chatbubbles", "chatbubbles-outline"),
					title: "수다방",
				}}
			/>
			<Tabs.Screen
				name="me"
				options={{
					tabBarIcon: tabIcon("person", "person-outline"),
					title: "내 정보",
				}}
			/>
		</Tabs>
	);
}
