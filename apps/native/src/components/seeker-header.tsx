import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps, ReactNode } from "react";
import { type ColorValue, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";
import { NotificationBell } from "@/src/components/notification-bell";

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

// (seeker) Stack 상세 화면들의 커스텀 헤더. 네이티브 기본 헤더는 edge-to-edge에서 상단
// 밴드를 상태바 높이만큼 과하게 잡는데(중첩 Stack + react-native-screens 인셋 계산, 노출된
// 조절 노브 없음) 커스텀 헤더는 안전영역 top만 정확히 얹는다. 룩은 검색 화면 상단 바·홈
// 헤더와 같은 축(border-b + h-14 행 + outline 아이콘 버튼).
// props는 native-stack HeaderProps의 부분집합만 구조적으로 받는다 — @react-navigation/
// native-stack이 직접 의존성이 아니라 타입 import가 불가하다(라이브러리 추가 금지).
// headerRight는 화면이 <Stack.Screen options={{ headerRight }}>로 주입하는 우측 슬롯이다.
export function SeekerStackHeader({
	back,
	navigation,
	options,
}: {
	back?: unknown;
	navigation: { goBack: () => void };
	// headerRight 시그니처는 native-stack 옵션과 맞춘다(인자 슬롯이 다르면 header prop
	// 스프레드에서 타입이 어긋난다). 필드는 모두 선택적이라 인자 없이 호출해도 안전하다.
	options: {
		title?: string;
		headerRight?: (props: {
			tintColor?: ColorValue;
			canGoBack?: boolean;
			backgroundColor?: ColorValue;
		}) => ReactNode;
	};
}) {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center gap-3 px-4">
				{back ? (
					<Pressable
						accessibilityLabel="뒤로 가기"
						accessibilityRole="button"
						className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
						hitSlop={8}
						onPress={() => navigation.goBack()}
					>
						<Ionicons color={foreground} name="arrow-back" size={22} />
					</Pressable>
				) : null}
				<Text className="font-bold text-foreground text-lg" numberOfLines={1}>
					{options.title ?? ""}
				</Text>
				{options.headerRight ? (
					<View className="ml-auto">{options.headerRight({})}</View>
				) : null}
			</View>
		</View>
	);
}

// 웹 모바일 헤더(responsive-shell.tsx)의 네이티브판 — 로고+워드마크 / 검색·포인트몰·알림.
// Tabs의 커스텀 header로 쓰이므로 상단 안전영역 인셋을 스스로 채운다.
export function SeekerHomeHeader({
	hidePointShop = false,
}: {
	hidePointShop?: boolean;
}) {
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
					{hidePointShop ? null : (
						<HeaderIconButton
							href={"/(seeker)/point-shop" as unknown as Href}
							label="포인트몰"
							name="storefront-outline"
						/>
					)}
					<NotificationBell
						href={"/(seeker)/notifications" as unknown as Href}
					/>
				</View>
			</View>
		</View>
	);
}
