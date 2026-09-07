import { Ionicons } from "@expo/vector-icons";
import { Chip, useThemeColor } from "heroui-native";
import { ScrollView, View } from "react-native";

export interface FilterChipOption<T extends string> {
	label: string;
	value: T;
}

// 운영 목록 화면의 단일 선택 필터 행. 홈 업종 필터(IndustryChipRail)와 같은 규칙 —
// Chip이 PressableProps를 상속하므로 래퍼 없이 직접 터치를 걸고, hitSlop은 부모 뷰
// 경계를 넘지 못하므로 래퍼에 py-2.5를 줘 28+20=48dp 터치 타깃을 확보한다.
export function FilterChips<T extends string>({
	onChange,
	options,
	value,
}: {
	onChange: (next: T) => void;
	options: readonly FilterChipOption<T>[];
	value: T;
}) {
	const accentForegroundColor = useThemeColor("accent-foreground");

	return (
		<ScrollView horizontal showsHorizontalScrollIndicator={false}>
			<View className="flex-row gap-2 px-4 py-2.5">
				{options.map((option) => {
					const selected = option.value === value;

					return (
						<Chip
							accessibilityRole="button"
							accessibilityState={{ selected }}
							color={selected ? "accent" : "default"}
							hitSlop={10}
							key={option.value}
							onPress={() => onChange(option.value)}
							size="md"
							variant={selected ? "primary" : "soft"}
						>
							{/* 선택 상태를 색 채움 단독으로 전달하지 않는다(색약 대응). */}
							{selected ? (
								<Ionicons
									color={accentForegroundColor}
									name="checkmark"
									size={14}
								/>
							) : null}
							<Chip.Label>{option.label}</Chip.Label>
						</Chip>
					);
				})}
			</View>
		</ScrollView>
	);
}
