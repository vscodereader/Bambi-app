import { Stack } from "expo-router";

// 탭 4개는 (tabs) 그룹이 관리하고, 여기는 탭바 없이 풀스크린으로 떠야 하는 상세만 남긴다
// (웹 SeekerNav와 같은 규칙 — 채팅방은 카카오톡식 풀스크린이라 탭바를 숨긴다).
export default function SeekerLayout() {
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="jobs/[id]" options={{ title: "공고 상세" }} />
			<Stack.Screen name="chats/[id]" options={{ title: "채팅방" }} />
			<Stack.Screen
				name="chats/[id]/reveal"
				options={{ title: "연락처 공개" }}
			/>
		</Stack>
	);
}
