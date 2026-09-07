import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";
import { RoleSwitchMenu } from "@/src/components/role-switch-menu";

// 운영자 탭 셸 홈 헤더. EmployerHomeHeader와 같은 구조(안전영역·h-14 행·로고+워드마크·
// 역할 전환)지만 알림 종은 달지 않는다 — 운영자 전용 알림 라우트가 없다.
export function ModeratorHomeHeader() {
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
						밤비알바 운영
					</Text>
				</View>
				<RoleSwitchMenu currentArea="/(moderator)" />
			</View>
		</View>
	);
}
