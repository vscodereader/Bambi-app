import { NotificationsScreen } from "@/src/components/notifications-screen";

// 구인자 레이아웃이 세션·역할을 이미 가드하므로 MemberOnly를 겹치지 않는다.
export default function EmployerNotificationsScreen() {
	// biome-ignore lint/a11y/useValidAriaRole: 화면 역할 prop이며 DOM ARIA role이 아니다.
	return <NotificationsScreen role="employer" />;
}
