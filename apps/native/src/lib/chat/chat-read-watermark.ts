export interface ChatReadWatermark {
	chatRoomId: string;
	messageId: string;
}

/** markRead 응답이 "더 새 안읽음"을 알려주면 그 id를 다음 기준선으로 삼는다. */
export const resolveNextChatReadWatermark = ({
	attemptedMessageId,
	latestUnreadMessageId,
}: {
	attemptedMessageId: string;
	latestUnreadMessageId: null | string;
}): null | string =>
	latestUnreadMessageId && latestUnreadMessageId !== attemptedMessageId
		? latestUnreadMessageId
		: null;

export const canFlushChatRead = (
	latest: ChatReadWatermark | null,
	sentMessageId: null | string,
	attemptedMessageIds: ReadonlySet<string>
): latest is ChatReadWatermark =>
	Boolean(
		latest &&
			sentMessageId !== latest.messageId &&
			!attemptedMessageIds.has(latest.messageId)
	);
