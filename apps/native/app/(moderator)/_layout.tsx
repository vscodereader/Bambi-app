import { Stack } from "expo-router";

export default function ModeratorLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ title: "관리자 검수" }} />
			<Stack.Screen name="reports" options={{ title: "신고" }} />
			<Stack.Screen name="users" options={{ title: "사용자" }} />
		</Stack>
	);
}
