import { Ionicons } from "@expo/vector-icons";
import { type Href, router, Stack } from "expo-router";
import { setItemAsync } from "expo-secure-store";
import { Button, Surface, useThemeColor } from "heroui-native";
import { useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { BambiLogo } from "@/src/components/bambi-logo";
import { BambiScreen } from "@/src/components/bambi-screen";
import { onboardingCompletionKey } from "@/src/lib/account-experience";
import {
	clampGuideIndex,
	SEEKER_GUIDE_SLIDES,
} from "@/src/lib/onboarding-guide";

const SWIPE_THRESHOLD = 48;
const SWIPE_ACTIVATION_DISTANCE = 8;

export default function FeatureGuideScreen() {
	const session = authClient.useSession();
	const [index, setIndex] = useState(0);
	const accent = useThemeColor("accent");
	const slide = SEEKER_GUIDE_SLIDES[index] ?? SEEKER_GUIDE_SLIDES[0];
	const last = index === SEEKER_GUIDE_SLIDES.length - 1;
	const pan = useRef(
		PanResponder.create({
			onMoveShouldSetPanResponder: (_event, gesture) =>
				Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
				Math.abs(gesture.dx) > SWIPE_ACTIVATION_DISTANCE,
			onPanResponderRelease: (_event, gesture) => {
				if (gesture.dx <= -SWIPE_THRESHOLD) {
					setIndex((value) => clampGuideIndex(value + 1));
				} else if (gesture.dx >= SWIPE_THRESHOLD) {
					setIndex((value) => clampGuideIndex(value - 1));
				}
			},
		})
	).current;
	const exit = async (withCoachmarks: boolean) => {
		if (session.data?.user.id) {
			await setItemAsync(
				onboardingCompletionKey(session.data.user.id, "job_seeker"),
				session.data.user.id
			).catch(() => undefined);
		}
		router.replace(
			(withCoachmarks
				? "/(seeker)?coachmarks=1"
				: "/(seeker)") as unknown as Href
		);
	};
	return (
		<BambiScreen isCentered>
			<Stack.Screen options={{ headerShown: false }} />
			<View className="flex-row items-center justify-between">
				<BambiLogo />
				<Button onPress={() => exit(false)} variant="tertiary">
					<Button.Label>건너뛰기</Button.Label>
				</Button>
			</View>
			<Surface
				className="items-center gap-5 rounded-2xl p-6"
				variant="secondary"
				{...pan.panHandlers}
			>
				<View className="size-20 items-center justify-center rounded-full bg-accent-soft">
					<Ionicons color={accent} name={slide.icon} size={40} />
				</View>
				<Text className="text-center font-bold text-2xl text-foreground">
					{slide.title}
				</Text>
				<Text className="text-center text-muted leading-6">
					{slide.description}
				</Text>
				<Text className="text-muted text-sm">
					{index + 1} / {SEEKER_GUIDE_SLIDES.length}
				</Text>
			</Surface>
			<View className="flex-row gap-2">
				<View className="flex-1">
					<Button
						isDisabled={index === 0}
						onPress={() => setIndex((value) => clampGuideIndex(value - 1))}
						variant="secondary"
					>
						<Button.Label>이전</Button.Label>
					</Button>
				</View>
				<View className="flex-1">
					<Button
						onPress={() =>
							last
								? exit(true)
								: setIndex((value) => clampGuideIndex(value + 1))
						}
					>
						<Button.Label>{last ? "시작하기" : "다음"}</Button.Label>
					</Button>
				</View>
			</View>
		</BambiScreen>
	);
}
