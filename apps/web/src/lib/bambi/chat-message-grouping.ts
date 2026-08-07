// 카카오톡식 말풍선 묶음의 순수 계산부. 날짜 칩·아바타·시간 표시 여부만 정하고
// 렌더는 컴포넌트에 맡긴다 — 브라우저 API 없이 단위 테스트할 수 있게.

export interface ChatMessageLike {
	createdAt: Date | string;
	id: string;
	kind: string;
	senderUserId: string;
}

export interface AnnotatedChatMessage<MessageType extends ChatMessageLike> {
	/** 그 날짜의 첫 메시지에만 날짜 칩 문구, 나머지는 null. */
	dateLabel: null | string;
	/** 그룹의 마지막 — 시간을 여기에만 붙인다. */
	isGroupEnd: boolean;
	/** 그룹의 첫 — 아바타·이름을 여기에만 붙인다. */
	isGroupStart: boolean;
	message: MessageType;
}

// 연락처 공개 요청은 말풍선이 아니라 카드로 그려서 앞뒤 그룹을 끊는다.
const CONTACT_REQUEST_KIND = "contact_request";

const dateLabelFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" });
const timeLabelFormat = new Intl.DateTimeFormat("ko-KR", {
	hour: "numeric",
	minute: "numeric",
});

/** 예: "2026년 8월 6일 목요일" */
export const formatChatDateLabel = (value: Date | string): string =>
	dateLabelFormat.format(new Date(value));

/** 예: "오후 4:26" */
export const formatChatTimeLabel = (value: Date | string): string =>
	timeLabelFormat.format(new Date(value));

/** 로컬 타임존 기준 달력 날짜. UTC로 자르면 한국 새벽/밤 메시지가 엉뚱한 날에 붙는다. */
const resolveLocalDateKey = (value: Date | string): string => {
	const at = new Date(value);

	return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
};

/** 같은 사람이 같은 날 같은 분에 보낸 메시지끼리 한 묶음. null이면 어디에도 안 붙는다. */
const resolveGroupKey = (message: ChatMessageLike): null | string => {
	if (message.kind === CONTACT_REQUEST_KIND) {
		return null;
	}

	const at = new Date(message.createdAt);

	return [
		message.senderUserId,
		resolveLocalDateKey(at),
		at.getHours(),
		at.getMinutes(),
	].join("|");
};

/**
 * 시간순 정렬된 메시지에 날짜 칩·그룹 경계를 달아 준다.
 * 날짜가 바뀌면 키도 바뀌므로 날짜 칩 자리에서 그룹도 자연히 끊긴다.
 */
export const annotateChatMessages = <MessageType extends ChatMessageLike>(
	messages: readonly MessageType[]
): AnnotatedChatMessage<MessageType>[] => {
	let previousDateKey: null | string = null;
	let previousGroupKey: null | string = null;

	const annotated = messages.map((message) => {
		const dateKey = resolveLocalDateKey(message.createdAt);
		const groupKey = resolveGroupKey(message);
		// 키가 null(특수 메시지)이면 앞 메시지와 같아 보여도 항상 새 그룹으로 연다.
		const isGroupStart = groupKey === null || groupKey !== previousGroupKey;
		const dateLabel =
			dateKey === previousDateKey
				? null
				: formatChatDateLabel(message.createdAt);

		previousDateKey = dateKey;
		previousGroupKey = groupKey;

		return { dateLabel, isGroupEnd: true, isGroupStart, message };
	});

	// 다음 메시지가 새 그룹을 열면 이 메시지가 그룹의 끝이다.
	for (const [index, item] of annotated.entries()) {
		item.isGroupEnd = annotated[index + 1]?.isGroupStart ?? true;
	}

	return annotated;
};
