import { cn } from "heroui-native";
import type { PropsWithChildren } from "react";
import {
	ScrollView,
	type ScrollViewProps,
	View,
	type ViewProps,
} from "react-native";
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
				<ScrollView
					contentContainerStyle={{ flexGrow: 1 }}
					contentInsetAdjustmentBehavior="automatic"
					keyboardShouldPersistTaps="handled"
					{...scrollViewProps}
				>
					{children}
				</ScrollView>
			) : (
				<View className="flex-1">{children}</View>
			)}
		</AnimatedView>
	);
}
