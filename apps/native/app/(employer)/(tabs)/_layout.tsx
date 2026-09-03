import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmployerHomeHeader } from "@/src/components/employer-header";

// 웹 하단 탭(72px)에 맞춘 콘텐츠 높이. 안전영역은 별도 가산(이중 패딩 금지).
const TAB_BAR_CONTENT_HEIGHT = 64;

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

export default function EmployerTabsLayout() {
	const accentColor = useThemeColor("accent");
	const mutedColor = useThemeColor("muted");
	const backgroundColor = useThemeColor("background");
	const borderColor = useThemeColor("border");
	const insets = useSafeAreaInsets();

	return (
		<Tabs
			screenOptions={{
				header: () => <EmployerHomeHeader />,
				tabBarActiveTintColor: accentColor,
				tabBarInactiveTintColor: mutedColor,
				tabBarStyle: {
					backgroundColor,
					borderTopColor: borderColor,
					height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
					paddingBottom: insets.bottom,
					paddingTop: 6,
				},
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					tabBarIcon: tabIcon("briefcase", "briefcase-outline"),
					title: "공고관리",
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
				name="me"
				options={{
					tabBarIcon: tabIcon("person", "person-outline"),
					title: "내 정보",
				}}
			/>
		</Tabs>
	);
}
