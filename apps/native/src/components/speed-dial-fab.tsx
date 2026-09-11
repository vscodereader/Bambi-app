import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "heroui-native";
import { type ComponentProps, useState } from "react";
import { Pressable, Text, View } from "react-native";

// 화면 우하단 플로팅 액션 버튼. 탭하면 백드롭이 깔리고 actions가 위로 펼쳐진다.
// 메뉴를 늘리려면 actions 배열에 { icon, label, onPress }를 더하면 된다 —
// 항목이 하나여도 펼침 단계를 거치므로 개수에 따라 동작이 갈리지 않는다.
// 애니메이션은 넣지 않았다(조건부 렌더). 필요해지면 Animated로 감싸면 된다.
export function SpeedDialFab({
	accessibilityLabel,
	actions,
}: {
	accessibilityLabel?: string;
	actions: {
		icon: ComponentProps<typeof Ionicons>["name"];
		label: string;
		onPress: () => void;
	}[];
}) {
	const [expanded, setExpanded] = useState(false);
	const accentForeground = useThemeColor("accent-foreground");
	const foreground = useThemeColor("foreground");

	const runAction = (onPress: () => void) => {
		setExpanded(false);
		onPress();
	};

	return (
		<>
			{/* 펼친 동안에는 바깥 아무 곳이나 눌러 닫는다 — 목록 스크롤보다 닫기가 먼저다. */}
			{expanded ? (
				<Pressable
					accessibilityLabel="빠른 메뉴 닫기"
					accessibilityRole="button"
					className="absolute inset-0 bg-backdrop"
					onPress={() => setExpanded(false)}
				/>
			) : null}
			<View
				className="absolute right-4 bottom-4 items-end gap-3"
				pointerEvents="box-none"
			>
				{expanded
					? actions.map((action) => (
							<Pressable
								accessibilityLabel={action.label}
								accessibilityRole="button"
								className="flex-row items-center gap-2 active:opacity-75"
								key={action.label}
								onPress={() => runAction(action.onPress)}
							>
								<View className="rounded-lg border border-border bg-surface px-3 py-1.5">
									<Text className="text-foreground text-sm">
										{action.label}
									</Text>
								</View>
								<View className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
									<Ionicons color={foreground} name={action.icon} size={22} />
								</View>
							</Pressable>
						))
					: null}
				<Pressable
					accessibilityLabel={
						accessibilityLabel ??
						(expanded ? "빠른 메뉴 닫기" : "빠른 메뉴 열기")
					}
					accessibilityRole="button"
					accessibilityState={{ expanded }}
					className="h-14 w-14 items-center justify-center rounded-full bg-accent active:opacity-75"
					onPress={() => setExpanded(!expanded)}
				>
					<Ionicons
						color={accentForeground}
						name={expanded ? "close" : "chatbubble-ellipses-outline"}
						size={26}
					/>
				</Pressable>
			</View>
		</>
	);
}
