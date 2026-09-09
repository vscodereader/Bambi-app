import { OPEN_REPORT_STATUSES } from "@bambi-app/api/services/bambi-moderation-labels";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BambiLogo } from "@/src/components/bambi-logo";
import { RoleSwitchMenu } from "@/src/components/role-switch-menu";
import {
	queueListOptions,
	reportListOptions,
	userListOptions,
} from "@/src/lib/moderation/queries";

// 운영자 탭 셸 홈 헤더. EmployerHomeHeader와 같은 구조(안전영역·h-14 행·로고+워드마크·
// 역할 전환)지만 알림 종은 달지 않는다 — 운영자 전용 알림 라우트가 없다.
export function ModeratorHomeHeader() {
	const insets = useSafeAreaInsets();
	const queue = useQuery(queueListOptions());
	const reports = useQuery(reportListOptions());
	const users = useQuery(userListOptions());
	const summaries = [
		{
			label: "검수 대기",
			count: queue.data?.length,
			href: "/(moderator)/(tabs)?risk=all",
		},
		{
			label: "신고 대기",
			count: reports.data?.filter((item) =>
				OPEN_REPORT_STATUSES.has(item.status)
			).length,
			href: "/(moderator)/(tabs)/reports?bucket=open",
		},
		{
			label: "경고 회원",
			count: users.data?.filter((item) => item.status === "warned").length,
			href: "/(moderator)/(tabs)/users?status=warned",
		},
	];

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center justify-between px-4">
				<View className="flex-row items-center gap-2">
					<BambiLogo />
					<Text className="font-extrabold text-foreground text-xl">
						밤비알바 운영
					</Text>
				</View>
				<RoleSwitchMenu currentArea="/(moderator)" />
			</View>
			<View className="flex-row justify-between gap-2 px-4 pb-2">
				{summaries.map((item) => (
					<Pressable
						accessibilityLabel={`${item.label} 목록 열기`}
						accessibilityRole="button"
						key={item.label}
						onPress={() => router.navigate(item.href as Href)}
					>
						<Text className="text-muted text-xs">
							{item.label} {item.count ?? "—"}
						</Text>
					</Pressable>
				))}
			</View>
			<Text className="px-4 pb-2 text-muted text-xs">현재 조회 범위 기준</Text>
		</View>
	);
}
