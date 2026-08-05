// 알림(bambi_notification)을 SSE로 즉시 밀어 주기 위한 전역 구독자 레지스트리.
// 채팅 자체는 socket.io로 실시간이지만, 방 소켓룸에 들어와 있지 않은 수신자는 알림 행만
// 쌓여 새로고침 전까지 아무 신호도 못 받았다. 여기서는 알림이 만들어지는 즉시 해당
// 사용자의 열린 SSE 스트림으로 이벤트를 흘려보낸다.
// bambi-chat-realtime.ts와 같은 결(모듈 전역 상태 + configure/emit/reset)을 따른다.

export type BambiNotificationTargetType = "chat_message" | "chat_room";

export interface BambiNotificationEvent {
	chatRoomId: null | string;
	createdAt: string;
	notificationId: string;
	targetId: string;
	targetType: BambiNotificationTargetType;
}

export type BambiNotificationSubscriber = (
	event: BambiNotificationEvent
) => void;

export interface BambiNotificationStreamLogger {
	error(error: unknown, message: string): void;
}

interface SubscriberInput {
	subscriberId: string;
	userId: string;
}

interface RegisterSubscriberInput extends SubscriberInput {
	/** 상한을 넘겨 밀려날 때 스트림을 실제로 닫는 콜백(플러그인이 넘긴다). */
	close?: () => void;
	send: BambiNotificationSubscriber;
}

interface RegisteredSubscriber {
	close?: () => void;
	send: BambiNotificationSubscriber;
}

/** SSE 이벤트 이름. 서버·웹이 같은 문자열을 써야 해서 여기서 한 번만 정의한다. */
export const BAMBI_NOTIFICATION_SSE_EVENT = "bambi:notification";

/** 하트비트 이벤트 이름. 서버·웹이 같은 문자열을 써야 해서 여기서 한 번만 정의한다. */
export const BAMBI_HEARTBEAT_SSE_EVENT = "bambi:ping";

/**
 * 하트비트는 프록시·로드밸런서가 유휴 연결을 끊지 않게 주기적으로 흘려보낸다.
 * 예전에는 SSE 주석 프레임(`: heartbeat`)이라 스펙상 클라이언트 핸들러에 노출되지 않았고,
 * 그래서 모바일 NAT·방화벽이 RST 없이 연결을 버려도(반쪽 열림) 브라우저는 소켓이 살아 있다고
 * 믿어 재연결하지 않았다. 이름 있는 이벤트로 보내면 클라이언트가 "마지막 수신 시각"을
 * 관측할 수 있어 워치독으로 죽은 스트림을 스스로 되살릴 수 있다.
 */
export const BAMBI_SSE_HEARTBEAT_FRAME = `event: ${BAMBI_HEARTBEAT_SSE_EVENT}\ndata: {}\n\n`;

/**
 * 한 계정이 동시에 열어 둘 수 있는 스트림 수. 열린 스트림 하나가 인스턴스 동시 슬롯 하나와
 * 하트비트 타이머 하나를 잡고 있어, 상한이 없으면 스크립트로 수천 개를 열어 서비스를 밀어낼
 * 수 있었다. 탭·기기 몇 개는 정상이므로 넉넉히 두고, 넘치면 가장 오래된 스트림을 닫는다.
 */
export const BAMBI_MAX_STREAMS_PER_USER = 5;

let streamLogger: BambiNotificationStreamLogger | null = null;
const subscribers = new Map<string, Map<string, RegisteredSubscriber>>();

export const configureBambiNotificationStream = (
	logger: BambiNotificationStreamLogger | null
): void => {
	streamLogger = logger;
};

export const resetBambiNotificationStreamForTests = (): void => {
	streamLogger = null;
	subscribers.clear();
};

/**
 * 스트림을 등록하고, 계정별 상한을 넘긴 만큼 가장 오래된 스트림을 닫는다.
 * 반환값은 밀어낸 스트림 수(로그·테스트용).
 */
export const registerBambiNotificationSubscriber = ({
	close,
	send,
	subscriberId,
	userId,
}: RegisterSubscriberInput): number => {
	const userSubscribers =
		subscribers.get(userId) ?? new Map<string, RegisteredSubscriber>();
	userSubscribers.set(subscriberId, { close, send });
	subscribers.set(userId, userSubscribers);

	let evicted = 0;

	// Map은 삽입순을 유지하므로 맨 앞이 가장 오래된 스트림이다. 닫기 콜백이 다시
	// unregister를 부를 수 있어(재진입) 먼저 지우고 나서 닫는다.
	while (userSubscribers.size > BAMBI_MAX_STREAMS_PER_USER) {
		const oldestId = userSubscribers.keys().next().value;

		if (oldestId === undefined) {
			break;
		}

		const oldest = userSubscribers.get(oldestId);
		userSubscribers.delete(oldestId);
		evicted += 1;

		try {
			oldest?.close?.();
		} catch (error) {
			streamLogger?.error(error, "bambi notification stream evict failed");
		}
	}

	return evicted;
};

export const unregisterBambiNotificationSubscriber = ({
	subscriberId,
	userId,
}: SubscriberInput): void => {
	const userSubscribers = subscribers.get(userId);

	if (!userSubscribers) {
		return;
	}

	userSubscribers.delete(subscriberId);

	if (userSubscribers.size === 0) {
		subscribers.delete(userId);
	}
};

export const getBambiNotificationSubscriberCount = (userId: string): number =>
	subscribers.get(userId)?.size ?? 0;

/**
 * 알림을 수신자의 열린 스트림 전부(여러 탭·기기)로 밀어 넣고 전달 건수를 돌려준다.
 * 구독자 하나가 끊긴 소켓이라 던지더라도 나머지 전달과 호출부(알림 생성)를 막지 않는다.
 */
export const emitBambiNotification = (
	recipientUserId: string,
	event: BambiNotificationEvent
): number => {
	const userSubscribers = subscribers.get(recipientUserId);

	if (!userSubscribers) {
		return 0;
	}

	let delivered = 0;

	for (const { send } of userSubscribers.values()) {
		try {
			send(event);
			delivered += 1;
		} catch (error) {
			streamLogger?.error(error, "bambi notification stream delivery failed");
		}
	}

	return delivered;
};

interface SseFrameInput {
	data: string;
	event: string;
	id?: string;
}

/**
 * SSE 와이어 포맷 직렬화. data는 줄바꿈마다 필드를 다시 열어야 하고, 프레임은 빈 줄로
 * 끝나야 브라우저가 하나의 이벤트로 인식한다.
 */
export const formatBambiSseFrame = ({ data, event, id }: SseFrameInput) => {
	const dataLines = data
		.split("\n")
		.map((line) => `data: ${line}`)
		.join("\n");
	const idLine = id ? `id: ${id}\n` : "";

	return `${idLine}event: ${event}\n${dataLines}\n\n`;
};

export const serializeBambiNotificationEvent = (
	event: BambiNotificationEvent
): string =>
	formatBambiSseFrame({
		data: JSON.stringify(event),
		event: BAMBI_NOTIFICATION_SSE_EVENT,
		id: event.notificationId,
	});
