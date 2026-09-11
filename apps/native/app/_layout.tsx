import "@/polyfills";
import "@/global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { NotificationStreamGate } from "@/src/components/notification-stream-gate";
import { UserPresenceLifecycle } from "@/src/components/user-presence-lifecycle";
import { queryClient } from "@/src/lib/orpc";

export const unstable_settings = {
	anchor: "index",
};

function StackLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="login" options={{ headerShown: false }} />
			{/* headerBackTitle을 명시하지 않으면 iOS가 이전 화면 route.name("login")을 back
			    라벨로 노출한다(login은 headerShown:false라 title이 없음). */}
			<Stack.Screen
				name="signup"
				options={{ headerBackTitle: "로그인", title: "회원가입" }}
			/>
			<Stack.Screen name="onboarding" options={{ title: "프로필 설정" }} />
			<Stack.Screen name="(seeker)" options={{ headerShown: false }} />
			<Stack.Screen name="(employer)" options={{ headerShown: false }} />
			<Stack.Screen name="(moderator)" options={{ headerShown: false }} />
		</Stack>
	);
}

export default function Layout() {
	return (
		<QueryClientProvider client={queryClient}>
			<UserPresenceLifecycle />
			<GestureHandlerRootView style={{ flex: 1 }}>
				<KeyboardProvider>
					<AppThemeProvider>
						<HeroUINativeProvider>
							<NotificationStreamGate />
							<StackLayout />
						</HeroUINativeProvider>
					</AppThemeProvider>
				</KeyboardProvider>
			</GestureHandlerRootView>
		</QueryClientProvider>
	);
}
