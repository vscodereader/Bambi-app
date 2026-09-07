import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/src/lib/orpc";

const MAX_BADGE = 9;

// 헤더 알림 종 + 안읽음 배지. 룩은 seeker-header의 HeaderIconButton(outline·rounded-2xl·h-11)과
// 같고, 배지는 web notification-bell.tsx처럼 9 초과를 "9+"로 접는다. 카운트 쿼리는 알림
// 화면·SSE 훅과 같은 키라 캐시를 공유한다(읽음 처리·이벤트가 바로 반영된다).
export function NotificationBell({ href }: { href: Href }) {
	const foreground = useThemeColor("foreground");
	const router = useRouter();
	const session = authClient.useSession();
	const unreadQuery = useQuery({
		...orpc.bambi.notifications.unreadCount.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	const unread = unreadQuery.data?.unreadCount ?? 0;
	const badge = unread > MAX_BADGE ? `${MAX_BADGE}+` : String(unread);

	return (
		<Pressable
			accessibilityLabel={unread > 0 ? `알림 ${unread}개 안 읽음` : "알림"}
			accessibilityRole="button"
			className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
			onPress={() => router.push(href)}
		>
			<Ionicons color={foreground} name="notifications-outline" size={22} />
			{unread > 0 ? (
				<View className="absolute top-1 right-1 h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1">
					{/* uniwind 기본 스케일 최소 단위가 text-xs(12px)라 배지엔 여전히 크다 —
					    브리프가 예외로 둔 임의 px를 유지한다. */}
					<Text className="font-bold text-[10px] text-danger-foreground">
						{badge}
					</Text>
				</View>
			) : null}
		</Pressable>
	);
}
