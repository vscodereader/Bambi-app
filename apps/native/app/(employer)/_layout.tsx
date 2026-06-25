import { Stack } from "expo-router";

export default function EmployerLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ title: "구인자 관리" }} />
			<Stack.Screen name="new" options={{ title: "새 공고" }} />
			<Stack.Screen name="jobs/[id]/edit" options={{ title: "공고 편집" }} />
		</Stack>
	);
}
