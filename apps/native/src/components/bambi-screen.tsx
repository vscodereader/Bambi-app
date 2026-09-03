import { DEFAULT_MINIMUM_WAGE } from "@bambi-app/api/services/bambi-policy";
import { Ionicons } from "@expo/vector-icons";
import { type Href, Link } from "expo-router";
import { Button, cn, Spinner, Surface, useThemeColor } from "heroui-native";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import {
	Alert,
	Pressable,
	type ScrollViewProps,
	Text,
	View,
} from "react-native";

import { Container } from "@/components/container";

interface ScreenProps {
	children: ReactNode;
	footer?: ReactNode;
	hasTopInset?: boolean;
	isCentered?: boolean;
	scrollViewProps?: Omit<ScrollViewProps, "contentContainerStyle">;
	// footer와 다르다: footer는 스크롤 콘텐츠 끝에 붙고, stickyFooter는 스크롤 밖 화면
	// 하단에 고정된다(긴 폼의 제출 CTA용). 둘 다 넘겨도 서로 간섭하지 않는다.
	stickyFooter?: ReactNode;
}

interface StateCardProps {
	action?: ReactNode;
	description: string;
	title: string;
}

interface HeaderProps {
	action?: ReactNode;
	description?: string;
	leading?: ReactNode;
	title: string;
}

interface PillProps {
	children: ReactNode;
	tone?: "accent" | "danger" | "neutral" | "success" | "warning";
}

export function BambiScreen({
	children,
	footer,
	hasTopInset,
	isCentered = false,
	scrollViewProps,
	stickyFooter,
}: ScreenProps) {
	return (
		<Container
			hasTopInset={hasTopInset}
			scrollViewProps={scrollViewProps}
			stickyFooter={stickyFooter}
		>
			{/* flex-1이 아니라 grow인 것이 핵심이다 — flex-1은 flexBasis:0%+flexShrink:1까지
			    붙어서, 내용이 뷰포트보다 길면 이 래퍼가 한 화면 높이로 눌리고 넘치는 부분이
			    잘린 채 스크롤도 되지 않는다. grow는 flexGrow:1만 얹으므로 짧으면 남는 공간을
			    먹어 중앙 정렬이 살고, 길면 높이가 내용을 따라가 그대로 스크롤된다. */}
			<View className={cn("gap-4 p-4", isCentered && "grow justify-center")}>
				{children}
				{footer ? <View className="pt-2">{footer}</View> : null}
			</View>
		</Container>
	);
}

export function BambiHeader({
	action,
	description,
	leading,
	title,
}: HeaderProps) {
	return (
		<View className="gap-3 py-2">
			<View className="flex-row items-start justify-between gap-3">
				{/* 행 정렬은 items-start를 그대로 둔다. text-3xl의 첫 줄 박스 높이(36)가 로고
				    타일(h-9 = 36)과 같아 위를 맞추면 두 박스가 그대로 포개지고, description이
				    붙어 제목 열이 두세 줄로 길어져도 타일이 제목 첫 줄 옆에 남는다.
				    items-center로 바꾸면 타일이 "제목+설명" 블록 한가운데로 내려가 제목과 어긋난다.
				    leading에 오는 장식 로고는 호출부에서 스스로 스크린리더에서 빠지므로,
				    실제로 읽히는 순서는 제목 → 설명 → action이다. */}
				{leading ? <View>{leading}</View> : null}
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

// 상세 정보 타일용 표기 — 웹 InfoTile과 같은 "월급 12,000,000원"(단위 앞) 순서.
export const formatPayUnitFirst = (
	amount: null | number,
	unit: null | string
): string => {
	if (amount === null) {
		return "급여 협의";
	}

	const money = `${amount.toLocaleString("ko-KR")}원`;

	return unit ? `${unit} ${money}` : money;
};

// 급여 타일 보조 표기("2026년 최저시급 10,320원") — 웹 lib/bambi/minimum-wage의
// formatMinimumWageLabel과 같은 규칙. 미설정(null)·조회 실패·로딩 중(undefined)에는 코드
// 기본값(DEFAULT_MINIMUM_WAGE)으로 떨어져 표기가 깜빡이며 사라지지 않게 한다.
export const formatMinimumWageLabel = (
	settings?: null | {
		minimumWageHourly?: null | number;
		minimumWageYear?: null | number;
	}
): string => {
	const year = settings?.minimumWageYear ?? DEFAULT_MINIMUM_WAGE.year;
	const hourly = settings?.minimumWageHourly ?? DEFAULT_MINIMUM_WAGE.hourly;
	return `${year}년 최저시급 ${hourly.toLocaleString("ko-KR")}원`;
};

// 웹 상세의 InfoTile 이식 — 원형 테두리 아이콘 + 작은 라벨/굵은 값/보조 줄.
// 순수·수집 공고 상세가 공유한다.
export function InfoTile({
	icon,
	label,
	sub,
	value,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	label: string;
	sub?: ReactNode;
	value: string;
}) {
	const foregroundColor = useThemeColor("foreground");

	return (
		<View className="flex-row items-center gap-3">
			<View className="size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
				<Ionicons color={foregroundColor} name={icon} size={20} />
			</View>
			<View className="flex-1 gap-0.5">
				<Text className="text-muted text-xs">{label}</Text>
				<Text className="font-bold text-base text-foreground" selectable>
					{value}
				</Text>
				{sub}
			</View>
		</View>
	);
}

export const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));

// 미구현 진입점 안내는 인라인 Alert 슬롯이 아니라 OS 알럿으로 띄운다 — 로그인·회원가입
// 화면에서 이 안내가 붙는 버튼들은 인라인 슬롯보다 아래에 있어, 인라인이면 안내가 화면
// 밖 위쪽에 꽂히고 버튼만 밀린다. 로그인·회원가입·member-only 공용(logout-button과 같은
// Alert.alert 패턴).
export const notifyWebOnly = (title: string) =>
	Alert.alert(title, "앱에서는 준비 중이에요. 웹에서 이용해 주세요.");

// 청소년유해매체물 고지. 로그인·회원가입 화면 공용 — 색은 muted 계열로만 둔다(코럴은 주
// 액션 CTA의 색이라 여기에 쓰면 위계가 뒤집힌다). role="alert"를 달지 않는다: 상시 노출되는
// 법정 고지를 매 렌더마다 스크린리더가 경보로 읽어버린다.
export function AdultNotice() {
	return (
		<View className="flex-row items-start gap-3">
			<View className="h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-muted">
				<Text className="font-extrabold text-muted text-sm">19</Text>
			</View>
			<Text className="flex-1 text-muted text-xs leading-5" selectable>
				본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호 등에
				관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의 청소년이
				이용할 수 없습니다.
			</Text>
		</View>
	);
}
