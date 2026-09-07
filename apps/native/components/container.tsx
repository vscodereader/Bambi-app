import { cn } from "heroui-native";
import {
	type PropsWithChildren,
	type ReactNode,
	type Ref,
	useState,
} from "react";
import { type ScrollViewProps, View, type ViewProps } from "react-native";
import {
	KeyboardAwareScrollView,
	type KeyboardAwareScrollViewRef,
	KeyboardStickyView,
} from "react-native-keyboard-controller";
import Animated, { type AnimatedProps } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = AnimatedProps<ViewProps> & {
	className?: string;
	hasTopInset?: boolean;
	isScrollable?: boolean;
	scrollViewProps?: Omit<ScrollViewProps, "contentContainerStyle">;
	// ScrollView 핸들이 필요한 화면(첫 오류로 scrollTo 등)만 넘긴다. ref는 스프레드로는
	// KeyboardAwareScrollView(forwardRef)에 닿지 않아 전용 prop으로 받는다. 안 넘기면 undefined다.
	scrollViewRef?: Ref<KeyboardAwareScrollViewRef>;
	stickyFooter?: ReactNode;
};

export function Container({
	children,
	className,
	hasTopInset = false,
	isScrollable = true,
	scrollViewProps,
	scrollViewRef,
	stickyFooter,
	...props
}: PropsWithChildren<Props>) {
	const insets = useSafeAreaInsets();
	// 고정 바가 스크롤 마지막 줄을 덮지 않게 그 높이만큼 스크롤 콘텐츠 아래에 여백을 준다.
	// 상수 대신 onLayout 실측인 이유: 바 안에 오는 것이 버튼 한 개인지, 버튼+안내 문구
	// 두 줄인지에 따라 높이가 달라져 어떤 상수를 골라도 늘 남거나 모자란다. 측정은 바를
	// 넘긴 화면에서만 일어나고, 안 넘기면 값이 0에 머물러 아래 paddingBottom도 undefined다.
	const [stickyFooterHeight, setStickyFooterHeight] = useState(0);

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
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: stickyFooter ? stickyFooterHeight : undefined,
					}}
					contentInsetAdjustmentBehavior="automatic"
					keyboardShouldPersistTaps="handled"
					mode="layout"
					ref={scrollViewRef}
					{...scrollViewProps}
				>
					{children}
				</KeyboardAwareScrollView>
			) : (
				<View className="flex-1">{children}</View>
			)}
			{/* 스크롤 뷰 바깥·이 AnimatedView 안쪽이라 스크롤과 무관하게 화면 하단에 고정된다.
			    (isScrollable=false면 flex-1 콘텐츠 바로 아래에 그대로 붙는다.)
			    키보드: 위 주석대로 edge-to-edge라 IME 인셋이 RN 뷰에 안 실려, 고정 바를 그냥
			    두면 키보드 뒤로 가려진다. KeyboardStickyView는 레이아웃이 아니라 translateY로
			    바만 키보드 위로 올리므로 KeyboardAwareScrollView의 "layout" 재분배와 부딪히지
			    않는다(KeyboardAvoidingView로 감싸면 스크롤 프레임 자체가 두 번 줄어든다).
			    offset.opened=insets.bottom인 이유: 바 아래에는 이미 이 뷰의 paddingBottom(제스처
			    바)이 깔려 있는데 키보드 높이는 화면 맨 아래부터 재므로, 보정하지 않으면 딱 그만큼
			    키보드 위로 떠서 빈 띠가 생긴다. 바 자체에는 하단 인셋을 또 주지 않는다. */}
			{stickyFooter ? (
				<KeyboardStickyView offset={{ opened: insets.bottom }}>
					<View
						className="border-border border-t bg-background p-4"
						onLayout={(event) =>
							setStickyFooterHeight(event.nativeEvent.layout.height)
						}
					>
						{stickyFooter}
					</View>
				</KeyboardStickyView>
			) : null}
		</AnimatedView>
	);
}
