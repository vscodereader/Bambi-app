import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";

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
			<View className="h-14 flex-row items-center gap-2 px-4">
				<BambiLogo />
				<Text className="font-extrabold text-foreground text-xl">
					밤비알바 구인
				</Text>
			</View>
		</View>
	);
}
