// 밤비 채팅 차단 사유 → 화면 안내 문구.
//
// 서버(packages/api chats.ts)는 막힌 채팅을 전부 맨 FORBIDDEN으로 돌려주던 시절을 지나
// error data에 chatBlockReason·counterpartName을 함께 싣는다. 채팅방·채팅 목록·채팅 시작
// 프리플라이트가 각자 이 data를 해석하면 문구가 갈라지므로 해석을 여기 한 곳에 모은다.

export type ChatBlockReason =
	| "blocked_by_counterpart"
	| "blocked_by_me"
	| "counterpart_left"
	| "moderation"
	| "pending_report";

// 상대가 방을 나가 발신이 막힌 상태의 기본 문구(입력창 잠금 안내와 같은 말을 쓴다).
export const COUNTERPART_LEFT_NOTICE =
	"상대방이 채팅방을 나가서 더 이상 메시지를 보낼 수 없어요.";

interface ChatBlockErrorData {
	chatBlockReason?: unknown;
	counterpartName?: unknown;
}

const readChatBlockErrorData = (error: unknown): ChatBlockErrorData | null => {
	const data = (error as { data?: unknown } | null | undefined)?.data;

	if (typeof data !== "object" || data === null) {
		return null;
	}

	return data as ChatBlockErrorData;
};

/**
 * 오류에서 차단 사유를 읽어 안내 문구로 바꾼다.
 *
 * 사유를 읽어낸 경우에만 문자열을 돌려주고, 그 밖의 오류(비로그인·네트워크 등)는 null —
 * 사유를 모르는 채 목록으로 튕기면 원인 파악이 더 어려워지므로 호출부의 오류 카드에 맡긴다.
 */
export const getChatBlockMessage = (error: unknown): null | string => {
	const data = readChatBlockErrorData(error);
	const name =
		typeof data?.counterpartName === "string" ? data.counterpartName : null;

	switch (data?.chatBlockReason) {
		case "blocked_by_counterpart":
			return name ? `${name}님이 차단했어요.` : "차단된 채팅방이에요.";
		case "blocked_by_me":
			return name
				? `${name}님을 차단했어요. 차단 관리에서 해제할 수 있어요.`
				: "차단된 채팅방이에요.";
		case "counterpart_left":
			return name
				? `${name}님이 채팅방을 나가서 더 이상 메시지를 보낼 수 없어요.`
				: COUNTERPART_LEFT_NOTICE;
		case "moderation":
			return "신고에 대한 운영자 조치로 종료된 채팅방이에요.";
		case "pending_report":
			return "신고를 검토하고 있는 채팅이에요. 처리 후 다시 볼 수 있어요.";
		default:
			return null;
	}
};

/**
 * 방 진입을 막아 목록으로 돌려보내야 하는 사유인지.
 *
 * counterpart_left는 읽기까지 막지 않는다(지난 대화는 그대로 보고, 입력창만 잠긴다).
 * 방 조회가 이 사유로 실패하는 경우는 없지만, 전송 실패 안내와 진입 차단을 같은 함수로
 * 다루다 대화 내용을 통째로 감추는 사고를 막으려고 구분해 둔다.
 */
export const getChatEntryBlockMessage = (error: unknown): null | string => {
	if (readChatBlockErrorData(error)?.chatBlockReason === "counterpart_left") {
		return null;
	}

	return getChatBlockMessage(error);
};
