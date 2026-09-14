import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";
import { RoleSwitchMenu } from "@/src/components/role-switch-menu";

interface ModeratorHomeHeaderProps {
	description?: string;
	title?: string;
}

// 운영자 탭 셸 홈 헤더. EmployerHomeHeader와 같은 구조(안전영역·h-14 행·로고+워드마크·
// 역할 전환)지만 알림 종은 달지 않는다 — 운영자 전용 알림 라우트가 없다.
// title을 주면 로고+워드마크 자리에 그 화면의 제목(+부제)을 싣는다. 본문에 같은 제목
// 블록을 중복해 두지 않기 위한 것이고, 부제가 붙으면 두 줄이라 고정 h-14로는 모자라
// 높이는 min-h-14 + 세로 패딩으로 둔다(로고만 있을 때는 예전과 같은 56).
export function ModeratorHomeHeader({
	description,
	title,
}: ModeratorHomeHeaderProps) {
	const insets = useSafeAreaInsets();

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="min-h-14 flex-row items-center justify-between gap-3 px-4 py-2">
				{title ? (
					<View className="flex-1">
						<Text className="font-extrabold text-foreground text-xl">
							{title}
						</Text>
						{description ? (
							<Text className="mt-1 text-muted text-sm leading-5">
								{description}
							</Text>
						) : null}
					</View>
				) : (
					<View className="flex-row items-center gap-2">
						<BambiLogo />
						<Text className="font-extrabold text-foreground text-xl">
							밤비알바 운영
						</Text>
					</View>
				)}
				<RoleSwitchMenu currentArea="/(moderator)" />
			</View>
		</View>
	);
}
