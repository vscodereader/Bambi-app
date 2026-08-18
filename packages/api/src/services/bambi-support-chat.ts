export const SUPPORT_CHAT_BODY_MAX = 1000;
export const SUPPORT_CHAT_SEND_LIMIT = 10;
export const SUPPORT_CHAT_WINDOW_MS = 60 * 1000;
export const SUPPORT_CHAT_RATE_LIMIT_ERROR =
	"메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요.";

export type SupportChatInquirer =
	| { kind: "guest"; sid: string }
	| { kind: "member"; userId: string };

// 도배 방지 버킷 키. 회원은 계정 한 축, 비회원은 쿠키를 지우면 sid가 바뀌므로 sid·IP
// 두 축을 모두 건다(커뮤니티 게스트 쓰기와 같은 방식). 방 생성은 첫 발신에서만
// 일어나므로 이 한도가 방 양산도 함께 막는다 — 별도 생성 리밋은 두지 않는다.
export const supportChatSendKeys = (
	inquirer: SupportChatInquirer,
	clientIp: string | undefined
): string[] =>
	inquirer.kind === "member"
		? [`supportChat.send:${inquirer.userId}`]
		: [
				`supportChat.send:sid:${inquirer.sid}`,
				`supportChat.send:ip:${clientIp ?? "unknown"}`,
			];

// 알림 에지 트리거: 수신측 미읽음이 0→1로 바뀌는 삽입에서만 알림 1행을 만든다.
// 메시지마다 쌓으면 알림함이 채팅 로그가 된다. 비회원 문의자는 알림 채널이 없어
// (SSE는 로그인 전제) 운영자 발신이어도 null — 위젯 뱃지 폴링이 유일한 통지다.
export function resolveSupportChatNotificationTarget({
	prevUnreadCount,
	roomUserId,
	senderType,
}: {
	prevUnreadCount: number;
	roomUserId: null | string;
	senderType: "admin" | "inquirer";
}): null | { recipientRole: "admin" } | { recipientUserId: string } {
	if (prevUnreadCount > 0) {
		return null;
	}
	if (senderType === "inquirer") {
		return { recipientRole: "admin" };
	}
	return roomUserId ? { recipientUserId: roomUserId } : null;
}
