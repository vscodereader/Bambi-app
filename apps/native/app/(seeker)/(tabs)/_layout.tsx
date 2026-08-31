import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

import { SeekerHomeHeader } from "@/src/components/seeker-header";

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
	const mutedColor = useThemeColor("muted");
	const backgroundColor = useThemeColor("background");
	const borderColor = useThemeColor("border");

	return (
		<Tabs
			screenOptions={{
				header: () => <SeekerHomeHeader />,
				tabBarActiveTintColor: accentColor,
				tabBarInactiveTintColor: mutedColor,
				tabBarStyle: {
					backgroundColor,
					borderTopColor: borderColor,
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
