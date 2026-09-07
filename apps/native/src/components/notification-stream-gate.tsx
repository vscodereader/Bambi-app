import { authClient } from "@/lib/auth-client";
import { useBambiNotificationStream } from "@/src/lib/notification-stream";

// 로그인 세션이 있을 때만 알림 SSE를 연다. 게스트·비로그인은 알림이 없어 연결하지 않는다.
// 루트 레이아웃에 한 번만 둔다 — 화면마다 열면 계정당 5스트림 상한에 걸린다.
export function NotificationStreamGate() {
	const session = authClient.useSession();
	useBambiNotificationStream(Boolean(session.data?.user));
	return null;
}
