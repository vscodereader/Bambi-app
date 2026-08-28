import { Ionicons } from "@expo/vector-icons";
import { type Href, Link } from "expo-router";
import { Button, Spinner, Surface, useThemeColor } from "heroui-native";
import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, type ScrollViewProps, Text, View } from "react-native";

import { Container } from "@/components/container";

interface ScreenProps {
	children: ReactNode;
	footer?: ReactNode;
	scrollViewProps?: Omit<ScrollViewProps, "contentContainerStyle">;
}

interface StateCardProps {
	action?: ReactNode;
	description: string;
	title: string;
}

interface HeaderProps {
	action?: ReactNode;
	description?: string;
	title: string;
}

interface PillProps {
	children: ReactNode;
	tone?: "accent" | "danger" | "neutral" | "success" | "warning";
}

export function BambiScreen({
	children,
	footer,
	scrollViewProps,
}: ScreenProps) {
	return (
		<Container scrollViewProps={scrollViewProps}>
			<View className="gap-4 p-4">
				{children}
				{footer ? <View className="pt-2">{footer}</View> : null}
			</View>
		</Container>
	);
}

export function BambiHeader({ action, description, title }: HeaderProps) {
	return (
		<View className="gap-3 py-2">
			<View className="flex-row items-start justify-between gap-3">
				<View className="flex-1">
					<Text className="font-bold text-3xl text-foreground" selectable>
						{title}
					</Text>
					{description ? (
						<Text className="mt-2 text-muted text-sm leading-5" selectable>
							{description}
						</Text>
					) : null}
				</View>
				{action ? <View>{action}</View> : null}
			</View>
		</View>
	);
}

export function StateCard({ action, description, title }: StateCardProps) {
	return (
		<Surface className="items-center rounded-lg p-6" variant="secondary">
			<Text
				className="text-center font-semibold text-foreground text-lg"
				selectable
			>
				{title}
			</Text>
			<Text
				className="mt-2 text-center text-muted text-sm leading-5"
				selectable
			>
				{description}
			</Text>
			{action ? <View className="mt-4">{action}</View> : null}
		</Surface>
	);
}

export function LoadingState({
	label = "불러오는 중입니다.",
}: {
	label?: string;
}) {
	return (
		<BambiScreen>
			<View className="items-center justify-center py-16">
				<Spinner size="lg" />
				<Text className="mt-3 text-muted text-sm" selectable>
					{label}
				</Text>
			</View>
		</BambiScreen>
	);
}

export function ErrorState({
	onRetry,
	title = "정보를 불러오지 못했습니다",
}: {
	onRetry?: () => void;
	title?: string;
}) {
	return (
		<BambiScreen>
			<StateCard
				action={
					onRetry ? (
						<Button onPress={onRetry} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					) : null
				}
				description="로그인 상태와 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
				title={title}
			/>
		</BambiScreen>
	);
}

export function Pill({
	children,
	tone = "neutral",
}: PropsWithChildren<PillProps>) {
	// muted에는 -soft-foreground 토큰이 없어 neutral만 text-muted를 유지한다.
	//
	// -soft-foreground는 heroui theme.css에서 원색을 검정 쪽으로 섞어(warning 65%+black
	// 35%, danger/accent 80%+black 20%, success 70%+black 30%) 만드는 값이라 밝은 표면
	// 전용이다. 15% 배경 위 대비를 재 보면 라이트는 크게 좋아지지만(1.8~2.7 → 4.3~5.3)
	// 다크(surface-secondary)에서는 오히려 1.9~2.5로 무너지고, 이건 --warning을 웹 값으로
	// 덮었기 때문이 아니라 heroui 다크 기본값(2.1)에서도 같다. 그래서 다크에서는 원색으로
	// 되돌린다(3.1~5.5). 색은 새로 짓지 않고 이미 있는 토큰만 쓴다.
	const className = {
		accent: "bg-accent/15 text-accent-soft-foreground dark:text-accent",
		danger: "bg-danger/15 text-danger-soft-foreground dark:text-danger",
		neutral: "bg-muted/20 text-muted",
		success: "bg-success/15 text-success-soft-foreground dark:text-success",
		warning: "bg-warning/15 text-warning-soft-foreground dark:text-warning",
	}[tone];

	// selectable을 두지 않는다 — Android에서 textIsSelectable=true인 TextView는 스스로
	// clickable/focusable이 되어 카드(부모 Pressable)로 터치가 전파되지 않는다.
	return (
		<Text
			className={`self-start rounded-full px-2.5 py-1 font-semibold text-xs ${className}`}
		>
			{children}
		</Text>
	);
}

// accessibilityLabel을 주면 카드 전체가 스크린리더 단일 노드가 된다.
export function CardLink({
	accessibilityLabel,
	children,
	href,
}: PropsWithChildren<{ accessibilityLabel?: string; href: Href }>) {
	const foregroundColor = useThemeColor("foreground");

	return (
		<Link asChild href={href}>
			<Pressable
				accessibilityLabel={accessibilityLabel}
				accessibilityRole={accessibilityLabel ? "button" : undefined}
				accessible={accessibilityLabel ? true : undefined}
				className="rounded-lg active:opacity-75"
			>
				<Surface className="rounded-lg p-4" variant="secondary">
					<View
						className="flex-row items-center gap-3"
						importantForAccessibility={
							accessibilityLabel ? "no-hide-descendants" : undefined
						}
					>
						<View className="flex-1">{children}</View>
						<Ionicons
							color={foregroundColor}
							name="chevron-forward"
							size={18}
						/>
					</View>
				</Surface>
			</Pressable>
		</Link>
	);
}

// 급여 단위가 "협의"인 공고는 금액이 없다.
export const formatPay = (
	amount: null | number,
	unit: null | string
): string => {
	if (amount === null) {
		return "급여 협의";
	}

	const money = `${amount.toLocaleString("ko-KR")}원`;

	return unit ? `${money} / ${unit}` : money;
};

export const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
