import { mergeChatMessagesById } from "@bambi-app/api/services/bambi-chat-room-messages";

import type { ChatRoomMessage } from "./chat-types";

export type ChatSendStatus = "failed" | "sending";

// 서버 응답이 오기 전 화면에 먼저 그리는 내 메시지. id는 generateChatMessageId()로
// 만들어 서버에 그대로 보내므로, 서버 행이 캐시에 들어오면 같은 id로 자연히 대체된다.
export interface OptimisticChatMessage {
	attempts: number;
	body: string;
	chatRoomId: string;
	createdAt: string;
	id: string;
	// 이미지 첨부 전송 중 미리 보여줄 로컬 파일 uri. 텍스트면 null.
	localImageUri: null | string;
	senderUserId: string;
	sendStatus: ChatSendStatus;
}

export type ChatTimelineMessage = ChatRoomMessage & {
	localImageUri?: null | string;
	sendStatus?: ChatSendStatus;
};

// 서버 sendMediaMessage가 첨부 메시지 body로 저장하는 문구와 같다(chats.ts).
const OPTIMISTIC_IMAGE_BODY = "첨부 파일을 보냈습니다.";

export const createOptimisticTextMessage = ({
	body,
	chatRoomId,
	id,
	senderUserId,
}: {
	body: string;
	chatRoomId: string;
	id: string;
	senderUserId: string;
}): OptimisticChatMessage => ({
	attempts: 1,
	body,
	chatRoomId,
	createdAt: new Date().toISOString(),
	id,
	localImageUri: null,
	senderUserId,
	sendStatus: "sending",
});

export const createOptimisticImageMessage = ({
	chatRoomId,
	id,
	localImageUri,
	senderUserId,
}: {
	chatRoomId: string;
	id: string;
	localImageUri: string;
	senderUserId: string;
}): OptimisticChatMessage => ({
	attempts: 1,
	body: OPTIMISTIC_IMAGE_BODY,
	chatRoomId,
	createdAt: new Date().toISOString(),
	id,
	localImageUri,
	senderUserId,
	sendStatus: "sending",
});

// 낙관적 항목을 서버 메시지 모양으로 승격한다. 서버 행에만 있는 필드는 비운 값으로 채운다.
const toTimelineMessage = (
	optimistic: OptimisticChatMessage
): ChatTimelineMessage =>
	({
		attachments: [],
		body: optimistic.body,
		chatRoomId: optimistic.chatRoomId,
		createdAt: new Date(optimistic.createdAt),
		id: optimistic.id,
		kind: "text",
		localImageUri: optimistic.localImageUri,
		metadata: null,
		revealedPhone: null,
		riskFlags: [],
		senderUserId: optimistic.senderUserId,
		sendStatus: optimistic.sendStatus,
	}) as unknown as ChatTimelineMessage;

/**
 * 서버 메시지(최신 페이지 + 누적 과거 페이지)와 낙관적 메시지를 시간순 한 줄로 합친다.
 * 같은 id는 서버 행이 이긴다(mergeChatMessagesById의 latest 우선) — 전송 성공 직후
 * sendStatus가 사라지는 것이 그 결과다.
 */
export const buildChatTimeline = ({
	optimistic,
	server,
}: {
	optimistic: readonly OptimisticChatMessage[];
	server: readonly ChatRoomMessage[];
}): ChatTimelineMessage[] =>
	mergeChatMessagesById<ChatTimelineMessage>(
		optimistic.map(toTimelineMessage),
		server
	);

/** 서버에 도착한 id의 낙관적 항목을 걷어낸다(재전송 목록·업로드 중 상태 정리용). */
export const dropSettledOptimistic = (
	optimistic: readonly OptimisticChatMessage[],
	server: readonly ChatRoomMessage[]
): OptimisticChatMessage[] => {
	const serverIds = new Set(server.map(({ id }) => id));

	return optimistic.filter(({ id }) => !serverIds.has(id));
};

/** FlatList inverted는 0번이 화면 맨 아래(최신)다. */
export const toInvertedTimeline = <ItemType>(
	items: readonly ItemType[]
): ItemType[] => [...items].reverse();
