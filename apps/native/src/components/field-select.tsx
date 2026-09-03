import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { FieldError, Label, Select } from "heroui-native";
import type { ReactElement } from "react";
import { View } from "react-native";

export interface FieldSelectOption {
	label: string;
	value: string;
}

export interface FieldSelectProps {
	errorMessage?: string;
	isRequired?: boolean;
	label: string;
	onChange: (value: string) => void;
	options: readonly FieldSelectOption[];
	placeholder: string;
	// 시트 높이. 목록 길이가 필드마다 달라(급여 단위 5개 ~ 지역 17개) 호출부가 정한다.
	snapPoints?: string[];
	value: string;
}

// heroui는 SelectOption 타입을 패키지 루트로 내보내지 않아(components/select/index가
// 재수출 목록에서 빠뜨렸다) 같은 모양으로 지역 선언한다. 미선택이 undefined인 것까지 같다.
type HeroUiSelectOption = undefined | { label: string; value: string };

// 화면 절반쯤. 항목 하나가 대략 48dp라 8개 안팎이 한 번에 보이고, 그보다 긴 목록(지역)은
// 시트 안에서 스크롤된다. 트리거와 그 위 라벨이 시트 밖에 남아 무엇을 고르는 중인지 보인다.
const DEFAULT_SNAP_POINTS = ["50%"];

export function FieldSelect({
	errorMessage,
	isRequired = false,
	label,
	onChange,
	options,
	placeholder,
	snapPoints = DEFAULT_SNAP_POINTS,
	value,
}: FieldSelectProps): ReactElement {
	// 이 컴포넌트의 존재 이유 — heroui Select는 값을 { label, value } 객체로 주고받지만
	// 폼 상태는 코드 문자열 하나만 들고 있다. 그 변환을 여기 한 곳에서만 한다.
	// 못 찾으면(빈 문자열 초기값 등) undefined를 넘겨 placeholder가 나오게 한다.
	const selectedOption = options.find((option) => option.value === value);

	const handleValueChange = (
		next: HeroUiSelectOption | HeroUiSelectOption[]
	) => {
		// selectionMode 기본값이 'single'이라 배열은 실제로 올 수 없다 — 문서상 시그니처가
		// 두 모드를 함께 덮고 있어 타입에만 남은 경로라 무시한다.
		if (Array.isArray(next) || !next) {
			return;
		}

		onChange(next.value);
	};

	return (
		<View className="gap-2">
			{/* 필수 표시는 heroui Label에 맡긴다 — TextField 라벨과 서체·별표가 어긋나지 않는다. */}
			<Label isRequired={isRequired}>{label}</Label>
			<Select
				onValueChange={handleValueChange}
				presentation="bottom-sheet"
				value={selectedOption}
			>
				{/* 값이 들어간 필드는 테두리만 accent로 바꾼다 — 배경까지 칠하면 입력칸 넷이
				    코럴 덩어리가 되어 하단 등록 CTA와 색 위계가 뒤집힌다. 두께는 기본(1)을 그대로
				    둬서 아직 안 고른 필드와 높이가 어긋나지 않는다. */}
				<Select.Trigger
					className={selectedOption ? "border-accent" : undefined}
				>
					<Select.Value placeholder={placeholder} />
					<Select.TriggerIndicator />
				</Select.Trigger>
				<Select.Portal>
					<Select.Overlay />
					{/* 목록이 시트보다 길 때 스크롤되게 하는 heroui 권장 조합이다. 시트가 내용만큼
					    늘어나거나 스크롤 제스처를 먹지 않도록 dynamic sizing·over-drag를 끄고,
					    높이 제약을 스크롤 자식이 아니라 컨테이너(h-full)에 건다 — 스크롤은 경계가
					    잡힌 부모 안에서만 일어난다. */}
					<Select.Content
						contentContainerClassName="h-full"
						enableDynamicSizing={false}
						enableOverDrag={false}
						presentation="bottom-sheet"
						snapPoints={snapPoints}
					>
						<BottomSheetScrollView>
							<Select.ListLabel>{label}</Select.ListLabel>
							{options.map((option) => (
								// 자식을 주지 않으면 heroui가 ItemLabel + ItemIndicator(체크)를 기본으로
								// 그린다. min-h-12는 항목 하나가 48dp 터치 타깃을 넘기도록.
								<Select.Item
									className="min-h-12"
									key={option.value}
									label={option.label}
									value={option.value}
								/>
							))}
						</BottomSheetScrollView>
					</Select.Content>
				</Select.Portal>
			</Select>
			{/* isInvalid를 명시하지 않으면 FieldError가 폼 컨텍스트 값을 따라간다 — 이 컴포넌트는
			    TextField 밖에 홀로 서 있어 그 컨텍스트가 없다. */}
			<FieldError isInvalid={Boolean(errorMessage)}>{errorMessage}</FieldError>
		</View>
	);
}
