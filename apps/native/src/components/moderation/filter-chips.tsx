import { TagGroup } from "heroui-native";
import { ScrollView } from "react-native";

export interface FilterChipOption<T extends string> {
	label: string;
	value: T;
}

// 운영 목록 화면의 단일 선택 필터 행. TagGroup(selectionMode="single")이 선택 색 채움과
// 접근성 상태를 직접 처리하므로 체크 아이콘·accessibilityState를 따로 얹지 않는다.
// TagGroup.List 기본 클래스가 flex-wrap이라 가로 스크롤에서 줄바꿈이 나지 않게 flex-nowrap으로
// 덮고, 태그(sm = 20dp)에 hitSlop 14 + List py-3.5(14)를 더해 20+28=48dp 터치 타깃을 만든다
// (hitSlop은 부모 뷰 경계를 넘지 못하므로 같은 값의 패딩이 함께 있어야 한다).
// 세로 flex 컬럼(헤더·칩·FlatList) 안에서 가로 ScrollView가 남은 높이를 먹지 않게
// flexGrow·flexShrink를 0으로 고정한다(RN ScrollView 기본값은 둘 다 1이라 긴 목록 옆에서 눌린다).
export function FilterChips<T extends string>({
	onChange,
	options,
	value,
}: {
	onChange: (next: T) => void;
	options: readonly FilterChipOption<T>[];
	value: T;
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={{ flexGrow: 0, flexShrink: 0 }}
		>
			<TagGroup
				onSelectionChange={(keys) => {
					// 선택된 태그를 다시 누르면 빈 Set이 온다 — 항상 하나는 선택된 상태를 유지한다.
					if (keys.size === 0) {
						return;
					}
					const [next] = keys;
					onChange(next as T);
				}}
				selectedKeys={[value]}
				selectionMode="single"
				size="sm"
			>
				<TagGroup.List className="flex-nowrap px-4 py-3.5">
					{options.map((option) => (
						<TagGroup.Item hitSlop={14} id={option.value} key={option.value}>
							{option.label}
						</TagGroup.Item>
					))}
				</TagGroup.List>
			</TagGroup>
		</ScrollView>
	);
}
