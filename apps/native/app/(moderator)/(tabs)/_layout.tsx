import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ModeratorHomeHeader } from "@/src/components/moderation/moderator-header";

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

export default function ModeratorTabsLayout() {
	const accentColor = useThemeColor("accent");
	const mutedColor = useThemeColor("muted");
	const backgroundColor = useThemeColor("background");
	const borderColor = useThemeColor("border");
	const insets = useSafeAreaInsets();

	return (
		<Tabs
			screenOptions={{
				header: () => <ModeratorHomeHeader />,
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
					// 본문이 아니라 헤더가 화면 제목을 진다 — 본문에 같은 제목 블록을 두지 않는다.
					header: () => (
						<ModeratorHomeHeader
							description="검수 대기 공고를 승인, 보류, 반려 처리합니다."
							title="공고 검수"
						/>
					),
					tabBarIcon: tabIcon("shield-checkmark", "shield-checkmark-outline"),
					title: "검수",
				}}
			/>
			<Tabs.Screen
				name="reports"
				options={{
					tabBarIcon: tabIcon("flag", "flag-outline"),
					title: "신고",
				}}
			/>
			<Tabs.Screen
				name="users"
				options={{
					tabBarIcon: tabIcon("people", "people-outline"),
					title: "사용자",
				}}
			/>
		</Tabs>
	);
}
