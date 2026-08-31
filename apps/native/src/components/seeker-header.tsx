import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";

// 룩은 웹 헤더의 outline 아이콘 버튼(border+card 표면, 반경 16px=rounded-2xl)을 따른다.
function HeaderIconButton({
	href,
	label,
	name,
}: {
	href: Href;
	label: string;
	name: ComponentProps<typeof Ionicons>["name"];
}) {
	const foreground = useThemeColor("foreground");
	const router = useRouter();

	return (
		<Pressable
			accessibilityLabel={label}
			accessibilityRole="button"
			className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
			onPress={() => router.push(href)}
		>
			<Ionicons color={foreground} name={name} size={22} />
		</Pressable>
	);
}

// 웹 모바일 헤더(responsive-shell.tsx)의 네이티브판 — 로고+워드마크 / 검색·포인트몰·알림.
// Tabs의 커스텀 header로 쓰이므로 상단 안전영역 인셋을 스스로 채운다.
export function SeekerHomeHeader() {
	const insets = useSafeAreaInsets();

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center justify-between px-4">
				<View className="flex-row items-center gap-2">
					<BambiLogo />
					<Text className="font-extrabold text-foreground text-xl">
						밤비알바
					</Text>
				</View>
				{/* 테두리 박스끼리 맞닿지 않게 gap을 둔다 — 터치 영역은 각자 44dp(h-11)로 충분. */}
				<View className="flex-row items-center gap-2">
					{/* 정적 라우트지만 jobs/[id]와 같은 이유로 Href 캐스팅 — expo-router 타입
					    생성이 dev 서버 없이 돌지 않아 새 라우트가 생성 타입에 아직 없다. */}
					<HeaderIconButton
						href={"/(seeker)/search" as unknown as Href}
						label="공고 검색"
						name="search-outline"
					/>
					<HeaderIconButton
						href={"/(seeker)/point-shop" as unknown as Href}
						label="포인트몰"
						name="storefront-outline"
					/>
					<HeaderIconButton
						href={"/(seeker)/notifications" as unknown as Href}
						label="알림"
						name="notifications-outline"
					/>
				</View>
			</View>
		</View>
	);
}
