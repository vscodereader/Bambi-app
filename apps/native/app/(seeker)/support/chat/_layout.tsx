import { Stack } from "expo-router";

// 시트 안쪽 전용 Stack — 목록(index)에서 대화([id])를 push해도 시트 밖으로 나가지 않고
// 시트 안에서 갈아끼워진다. anchor는 알림 딥링크로 [id]에 바로 들어와도 그 아래에 목록을
// 깔아 둔다(중첩 Stack에는 anchor를 직접 줘야 한다). v4에서 initialRouteName → anchor로
// 이름이 바뀌었고, 루트 app/_layout.tsx도 anchor를 쓴다.
export const unstable_settings = {
	anchor: "index",
};

// 두 화면 모두 자체 헤더를 그리므로 네이티브 헤더는 끈다.
export default function SupportChatLayout() {
	return <Stack screenOptions={{ headerShown: false }} />;
}
