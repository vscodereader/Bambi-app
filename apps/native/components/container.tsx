import { cn } from "heroui-native";
import type { PropsWithChildren } from "react";
import { type ScrollViewProps, View, type ViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { type AnimatedProps } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = AnimatedProps<ViewProps> & {
	className?: string;
	hasTopInset?: boolean;
	isScrollable?: boolean;
	scrollViewProps?: Omit<ScrollViewProps, "contentContainerStyle">;
};

export function Container({
	children,
	className,
	hasTopInset = false,
	isScrollable = true,
	scrollViewProps,
	...props
}: PropsWithChildren<Props>) {
	const insets = useSafeAreaInsets();

	return (
		<AnimatedView
			className={cn("flex-1 bg-background", className)}
			style={{
				paddingBottom: insets.bottom,
				// 콘텐츠가 아니라 스크롤 뷰포트를 줄인다 — 이 View가 ScrollView의 프레임이라
				// 여기에 얹으면 (a) 줄어든 높이 기준으로 안쪽 중앙 정렬이 그대로 성립하고
				// (b) 내용이 아무리 길어져도 상태바를 침범할 수 없다.
				// 기본은 false다: 네이티브 헤더가 있는 화면은 헤더가 이미 상단 인셋을 지므로
				// 켜면 이중 인셋이 된다. headerShown: false인 화면만 켠다.
				paddingTop: hasTopInset ? insets.top : undefined,
			}}
			{...props}
		>
			{isScrollable ? (
				// KeyboardProvider가 붙은 순간부터 iOS·Android 모두 키보드가 떠도 스크롤
				// 프레임 높이는 그대로다(edge-to-edge라 IME 인셋이 RN 뷰에 안 실린다).
				// 그래서 flexGrow로 잡은 안쪽 래퍼가 "키보드 없을 때 화면 높이"로 중앙을
				// 계산해, CTA가 키보드 밑으로 밀린다.
				// mode는 기본값 "insets"를 쓰지 않는다 — contentInset만 늘리는 방식이라
				// 스크롤 여백은 생겨도 래퍼 높이가 그대로여서 중앙 정렬은 못 고친다.
				// "layout"이라야 children 뒤에 스페이서를 붙여 flexGrow 여유를 먹고,
				// 래퍼 높이가 (프레임 − 키보드)로 줄어 가시 영역 기준으로 재정렬된다.
				// 라이브러리는 성능상 "insets"를 권하지만 여기 목적은 레이아웃 재분배다.
				<KeyboardAwareScrollView
					contentContainerStyle={{ flexGrow: 1 }}
					contentInsetAdjustmentBehavior="automatic"
					keyboardShouldPersistTaps="handled"
					mode="layout"
					{...scrollViewProps}
				>
					{children}
				</KeyboardAwareScrollView>
			) : (
				<View className="flex-1">{children}</View>
			)}
		</AnimatedView>
	);
}
