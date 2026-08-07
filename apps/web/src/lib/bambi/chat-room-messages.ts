// 채팅방 화면의 순수 계산부. 컴포넌트에서 떼어 두면 브라우저 API 없이 단위 테스트할 수 있다.

/** 방 이력 keyset 커서. 정렬 총순서 (createdAt, id)와 같은 축이다. */
export interface ChatMessageCursor {
	createdAt: string;
	id: string;
}

interface ChatMessageLike {
	createdAt: Date | string;
	id: string;
}

/**
 * 최신 페이지(쿼리)와 "이전 메시지 더 보기"로 쌓은 페이지를 합친다.
 * 메시지 id가 유일 키다 — 큐 재처리·소켓 재전달로 같은 메시지가 두 경로로 들어와도
 * 말풍선이 두 번 뜨지 않는다. 같은 id면 나중 것(최신 페이지)의 내용을 쓰되 자리는 유지한다.
 */
export const mergeChatMessagesById = <MessageType extends ChatMessageLike>(
	older: readonly MessageType[],
	latest: readonly MessageType[]
): MessageType[] => {
	const byId = new Map<string, MessageType>();

	for (const message of older) {
		byId.set(message.id, message);
	}

	for (const message of latest) {
		byId.set(message.id, message);
	}

	return [...byId.values()].sort((left, right) => {
		const createdAtDifference =
			new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

		return Number.isFinite(createdAtDifference) && createdAtDifference !== 0
			? createdAtDifference
			: left.id.localeCompare(right.id);
	});
};

/** 가장 오래된 로드분의 (createdAt, id) — 다음 "더 보기" 요청의 커서. */
export const resolveOldestChatMessageCursor = (
	messages: readonly ChatMessageLike[]
): ChatMessageCursor | null => {
	const oldest = messages.at(0);

	if (!oldest) {
		return null;
	}

	return {
		createdAt: new Date(oldest.createdAt).toISOString(),
		id: oldest.id,
	};
};

// 하단에서 이만큼 안쪽까지는 "맨 아래를 보고 있다"로 친다. 한 줄 높이보다 넉넉히 잡아야
// 브라우저의 소수점 스크롤 오차로 하단 고정이 풀리지 않는다.
const BOTTOM_STICK_THRESHOLD_PX = 64;

/**
 * 새 메시지가 왔을 때 하단으로 따라 내릴지 판단한다.
 * 사용자가 위로 올려 과거를 읽는 중이면 false — 읽던 자리를 빼앗지 않는다.
 */
export const isScrolledToBottom = ({
	clientHeight,
	scrollHeight,
	scrollTop,
}: {
	clientHeight: number;
	scrollHeight: number;
	scrollTop: number;
}): boolean =>
	scrollHeight - scrollTop - clientHeight <= BOTTOM_STICK_THRESHOLD_PX;
