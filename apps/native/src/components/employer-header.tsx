import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";
import { RoleSwitchMenu } from "@/src/components/role-switch-menu";

// 구인자 탭 셸 홈 헤더. Tabs의 커스텀 header로 쓰이므로 상단 안전영역 인셋을 스스로 채운다.
// SeekerHomeHeader는 검색·포인트몰·알림(구직자 라우트)을 달고 있어 그대로 못 쓴다 —
// 구조(테두리·h-14 행·로고+워드마크)만 같은 얇은 헤더를 둔다.
export function EmployerHomeHeader() {
	const insets = useSafeAreaInsets();

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			{/* 로고 묶음과 역할 전환을 양 끝으로 — SeekerHomeHeader와 같은 축(justify-between).
			    RoleSwitchMenu가 null이면 자식이 하나뿐이라 로고는 그대로 왼쪽에 남는다. */}
			<View className="h-14 flex-row items-center justify-between px-4">
				<View className="flex-row items-center gap-2">
					<BambiLogo />
					<Text className="font-extrabold text-foreground text-xl">
						밤비알바 구인
					</Text>
				</View>
				<RoleSwitchMenu currentArea="/(employer)" />
			</View>
		</View>
	);
}
