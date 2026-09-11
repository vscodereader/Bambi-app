import { router, useLocalSearchParams } from "expo-router";
import { Button, Surface, useThemeColor } from "heroui-native";
import { useEffect, useState } from "react";
import { Dimensions, Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	type CoachmarkTargetName,
	type CoachmarkTargetRect,
	useCoachmarkTargets,
} from "@/src/components/onboarding/coachmark-targets";

const SPOTLIGHT_PADDING = 10;
const SPOTLIGHT_RADIUS = 18;
const CARD_SIDE = 24;
const MEASURE_RETRY_MS = 80;
const MEASURE_RETRY_LIMIT = 5;

const STEPS: readonly {
	description: string;
	target: CoachmarkTargetName;
	title: string;
}[] = [
	{
		description:
			"화면 위 돋보기에서 업종, 지역과 공고 제목을 검색할 수 있어요.",
		target: "search",
		title: "공고 검색과 필터",
	},
	{
		description: "구인자와 나눈 대화는 아래 채팅 탭에서 확인할 수 있어요.",
		target: "chats",
		title: "채팅",
	},
	{
		description: "면접 일정, 후기, 신고와 계정 설정은 내 정보에서 확인하세요.",
		target: "me",
		title: "내 정보",
	},
] as const;

const paddedRect = (
	rect: CoachmarkTargetRect | null,
	windowWidth: number,
	windowHeight: number
): CoachmarkTargetRect | null => {
	if (!rect) {
		return null;
	}
	const x = Math.max(0, rect.x - SPOTLIGHT_PADDING);
	const y = Math.max(0, rect.y - SPOTLIGHT_PADDING);
	const right = Math.min(windowWidth, rect.x + rect.width + SPOTLIGHT_PADDING);
	const bottom = Math.min(
		windowHeight,
		rect.y + rect.height + SPOTLIGHT_PADDING
	);
	return { height: bottom - y, width: right - x, x, y };
};

export function FeatureCoachmark() {
	const params = useLocalSearchParams<{ coachmarks?: string }>();
	const targets = useCoachmarkTargets();
	const insets = useSafeAreaInsets();
	const accent = useThemeColor("accent");
	const [index, setIndex] = useState(0);
	const [closed, setClosed] = useState(false);
	const [rect, setRect] = useState<CoachmarkTargetRect | null>(null);
	const [windowSize, setWindowSize] = useState(Dimensions.get("window"));
	const { height: windowHeight, width: windowWidth } = windowSize;
	const open = params.coachmarks === "1" && !closed;
	const step = STEPS[index] ?? STEPS[0];

	useEffect(() => {
		const subscription = Dimensions.addEventListener("change", ({ window }) =>
			setWindowSize(window)
		);
		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (!(open && targets)) {
			setRect(null);
			return;
		}
		if (windowHeight <= 0 || windowWidth <= 0) {
			return;
		}
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const measure = async (attempt: number) => {
			const next = await targets.measure(step.target);
			if (cancelled) {
				return;
			}
			if (next || attempt >= MEASURE_RETRY_LIMIT) {
				setRect(next);
				return;
			}
			timer = setTimeout(() => measure(attempt + 1), MEASURE_RETRY_MS);
		};
		measure(0);
		return () => {
			cancelled = true;
			if (timer) {
				clearTimeout(timer);
			}
		};
	}, [open, step.target, targets, windowHeight, windowWidth]);

	const close = () => {
		setClosed(true);
		router.setParams({ coachmarks: undefined });
	};
	const spotlight = paddedRect(rect, windowWidth, windowHeight);
	const shade = "rgba(15, 23, 42, 0.72)";

	return (
		<Modal
			accessibilityViewIsModal
			animationType="fade"
			onRequestClose={close}
			statusBarTranslucent
			transparent
			visible={open}
		>
			<View className="flex-1">
				{spotlight ? (
					<>
						<View
							className="absolute top-0 right-0 left-0"
							style={{ backgroundColor: shade, height: spotlight.y }}
						/>
						<View
							className="absolute left-0"
							style={{
								backgroundColor: shade,
								height: spotlight.height,
								top: spotlight.y,
								width: spotlight.x,
							}}
						/>
						<View
							className="absolute right-0"
							style={{
								backgroundColor: shade,
								height: spotlight.height,
								top: spotlight.y,
								width: windowWidth - spotlight.x - spotlight.width,
							}}
						/>
						<View
							className="absolute right-0 bottom-0 left-0"
							style={{
								backgroundColor: shade,
								top: spotlight.y + spotlight.height,
							}}
						/>
						<View
							className="absolute border-2"
							pointerEvents="none"
							style={{
								borderColor: accent,
								borderRadius: SPOTLIGHT_RADIUS,
								height: spotlight.height,
								left: spotlight.x,
								top: spotlight.y,
								width: spotlight.width,
							}}
						/>
					</>
				) : (
					<View
						className="absolute inset-0"
						style={{ backgroundColor: shade }}
					/>
				)}
				<Surface
					accessibilityLabel={`${index + 1}/${STEPS.length}, ${step.title}`}
					className="absolute gap-4 rounded-2xl p-5"
					style={{
						bottom: insets.bottom + 92,
						left: CARD_SIDE,
						right: CARD_SIDE,
					}}
					variant="secondary"
				>
					<Text className="font-semibold text-accent text-xs">
						{index + 1}/{STEPS.length}
					</Text>
					<Text className="font-bold text-foreground text-xl">
						{step.title}
					</Text>
					<Text className="text-muted leading-6">{step.description}</Text>
					<View className="flex-row gap-2">
						<View className="flex-1">
							<Button
								isDisabled={index === 0}
								onPress={() => setIndex((value) => Math.max(0, value - 1))}
								variant="secondary"
							>
								<Button.Label>이전</Button.Label>
							</Button>
						</View>
						<View className="flex-1">
							<Button
								onPress={() =>
									index === STEPS.length - 1
										? close()
										: setIndex((value) => value + 1)
								}
							>
								<Button.Label>
									{index === STEPS.length - 1 ? "확인" : "다음"}
								</Button.Label>
							</Button>
						</View>
					</View>
				</Surface>
			</View>
		</Modal>
	);
}
