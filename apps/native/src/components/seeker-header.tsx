import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";

// 아직 연결된 화면이 없는 자리 표시 버튼 — 비활성으로 렌더한다.
// 룩은 웹 헤더의 outline 아이콘 버튼(border+card 표면, 반경 16px=rounded-2xl)을 따른다.
// ponytail: 검색·포인트몰·알림 화면이 생기면 onPress 라우팅을 연결하고 disabled를 푼다.
function HeaderIconButton({
	label,
	name,
}: {
	label: string;
	name: ComponentProps<typeof Ionicons>["name"];
}) {
	const foreground = useThemeColor("foreground");

	return (
		<Pressable
			accessibilityLabel={label}
			accessibilityRole="button"
			accessibilityState={{ disabled: true }}
			className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"
			disabled
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
					<HeaderIconButton label="공고 검색" name="search-outline" />
					<HeaderIconButton label="포인트몰" name="storefront-outline" />
					<HeaderIconButton label="알림" name="notifications-outline" />
				</View>
			</View>
		</View>
	);
}
