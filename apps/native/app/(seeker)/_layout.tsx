import { Stack } from "expo-router";

export default function SeekerLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ title: "공고 탐색" }} />
			<Stack.Screen name="jobs/[id]" options={{ title: "공고 상세" }} />
			<Stack.Screen name="chats/index" options={{ title: "채팅" }} />
			<Stack.Screen name="chats/[id]" options={{ title: "채팅방" }} />
			<Stack.Screen
				name="chats/[id]/reveal"
				options={{ title: "연락처 공개" }}
			/>
		</Stack>
	);
}
