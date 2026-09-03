import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router, Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SeekerHomeHeader } from "@/src/components/seeker-header";
import {
	getNativeRoleTab,
	type NativeProfileRole,
	type NativeRoleAreaRoute,
} from "@/src/lib/bambi-native";
import { useChatUnreadBadge } from "@/src/lib/chat/use-chat-unread-badge";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc } from "@/src/lib/orpc";

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

// 역할 영역별 탭 아이콘. 문구·경로는 순수 함수(getNativeRoleTab)가, 표현은 여기가 갖는다.
const ROLE_TAB_ICONS: Record<
	NativeRoleAreaRoute,
	{
		active: ComponentProps<typeof Ionicons>["name"];
		inactive: ComponentProps<typeof Ionicons>["name"];
	}
> = {
	"/(employer)": { active: "briefcase", inactive: "briefcase-outline" },
	"/(moderator)": {
		active: "shield-checkmark",
		inactive: "shield-checkmark-outline",
	},
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
	// 역할 탭은 회원에게만 물어본다(게스트·비회원은 프로필이 없어 탭도 없다).
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: visitorState === "member",
	});
	const roleTab = getNativeRoleTab(
		mineQuery.data?.bambiProfile?.role as NativeProfileRole | null | undefined
	);
	const roleTabIcons = roleTab ? ROLE_TAB_ICONS[roleTab.href] : null;

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
			{/* 수다방과 내 정보 사이의 역할 탭. 구직자·비회원에게는 href:null로 숨긴다.
			    탭을 누르면 화면을 여는 대신 역할 영역을 push한다 — 구직자 탭 상태를 그대로
			    두어야 뒤로 가기로 원래 보던 탭에 돌아온다(웹 mobile-tab-bar와 같은 축). */}
			<Tabs.Screen
				listeners={{
					tabPress: (event) => {
						if (!roleTab) {
							return;
						}
						event.preventDefault();
						router.push(roleTab.href as Href);
					},
				}}
				name="role"
				options={
					roleTab && roleTabIcons
						? {
								tabBarIcon: tabIcon(roleTabIcons.active, roleTabIcons.inactive),
								title: roleTab.title,
							}
						: { href: null }
				}
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
