import { Tabs } from "heroui-native";

interface SortTabOption<T extends string> {
	label: string;
	value: T;
}

// 필터(감지 여부)는 시트 트리거, 정렬은 밑줄 인디케이터(secondary variant)라 두 축이
// 생김새로 구분된다.
//
// 구분선은 따로 긋지 않는다: secondary variant의 Tabs.List가 이미 border-b
// border-border를 달고 있어서, 폭만 w-full로 늘리면 목록과의 경계가 된다. 래퍼에
// border-b를 또 주면 같은 자리에 1px 선이 두 겹 겹친다(Tabs.List는 self-start라
// w-full 없이는 탭 폭만큼만 선이 그어진다).
//
// 트리거 기본 py-1.5는 높이가 36dp뿐이라 py-3으로 올려 48dp 터치 타깃을 맞춘다.
// 목록 본문은 FlatList가 따로 렌더하므로 Tabs.Content는 두지 않는다.
export function SortTabs<T extends string>({
	onChange,
	options,
	value,
}: {
	onChange: (next: T) => void;
	options: readonly SortTabOption<T>[];
	value: T;
}) {
	return (
		<Tabs
			className="px-4"
			onValueChange={(next) => onChange(next as T)}
			value={value}
			variant="secondary"
		>
			<Tabs.List className="w-full">
				<Tabs.Indicator />
				{options.map((option) => (
					<Tabs.Trigger
						accessibilityRole="tab"
						accessibilityState={{ selected: option.value === value }}
						className="py-3"
						key={option.value}
						value={option.value}
					>
						<Tabs.Label>{option.label}</Tabs.Label>
					</Tabs.Trigger>
				))}
			</Tabs.List>
		</Tabs>
	);
}
