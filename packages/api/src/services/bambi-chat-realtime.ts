export interface ChatMessageCreatedEvent {
	createdAt: string;
	messageId: string;
	roomId: string;
	senderUserId: string;
}

export interface ChatMessageReadEvent {
	messageId: string;
	readAt: string;
	readerUserId: string;
	roomId: string;
}

export interface ChatTypingEvent {
	roomId: string;
	userId: string;
}

export interface ChatUnreadUpdatedEvent {
	roomId: string;
	unreadCount: number;
	userId: string;
}

export interface ChatListUpdatedEvent {
	roomId: string;
}

export interface ChatRoomUpdatedEvent {
	roomId: string;
}

export interface ChatErrorEvent {
	code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
	message: string;
}

export interface ChatRealtimeServerToClientEvents {
	"chat:error": (payload: ChatErrorEvent) => void;
	"chat:list:updated": (payload: ChatListUpdatedEvent) => void;
	"chat:message:created": (payload: ChatMessageCreatedEvent) => void;
	"chat:message:read": (payload: ChatMessageReadEvent) => void;
	"chat:room:updated": (payload: ChatRoomUpdatedEvent) => void;
	"chat:typing:started": (payload: ChatTypingEvent) => void;
	"chat:typing:stopped": (payload: ChatTypingEvent) => void;
	"chat:unread:updated": (payload: ChatUnreadUpdatedEvent) => void;
}

export interface ChatRealtimeRoomEmitter {
	emit<EventName extends keyof ChatRealtimeServerToClientEvents>(
		event: EventName,
		payload: Parameters<ChatRealtimeServerToClientEvents[EventName]>[0]
	): void;
}

export interface ChatRealtimeTransport {
	to(room: string): ChatRealtimeRoomEmitter;
}

interface ParticipantSocketInput {
	roomId: string;
	socketId: string;
	userId: string;
}

let realtimeServer: ChatRealtimeTransport | null = null;
const activeParticipants = new Map<string, Map<string, Set<string>>>();

export const getChatRoomSocketRoom = (roomId: string): string =>
	`chat:${roomId}`;

export const getUserSocketRoom = (userId: string): string => `user:${userId}`;

export const configureBambiChatRealtime = (
	server: ChatRealtimeTransport | null
): void => {
	realtimeServer = server;
};

export const resetBambiChatRealtimeForTests = (): void => {
	realtimeServer = null;
	activeParticipants.clear();
};

export const markParticipantActive = ({
	roomId,
	socketId,
	userId,
}: ParticipantSocketInput): void => {
	const users =
		activeParticipants.get(roomId) ?? new Map<string, Set<string>>();
	const sockets = users.get(userId) ?? new Set<string>();
	sockets.add(socketId);
	users.set(userId, sockets);
	activeParticipants.set(roomId, users);
};

export const markParticipantInactive = ({
	roomId,
	socketId,
	userId,
}: ParticipantSocketInput): void => {
	const users = activeParticipants.get(roomId);

	if (!users) {
		return;
	}

	const sockets = users.get(userId);

	if (!sockets) {
		return;
	}

	sockets.delete(socketId);

	if (sockets.size === 0) {
		users.delete(userId);
	}

	if (users.size === 0) {
		activeParticipants.delete(roomId);
	}
};

export const markSocketInactiveEverywhere = (socketId: string): void => {
	for (const [roomId, users] of activeParticipants.entries()) {
		for (const [userId, sockets] of users.entries()) {
			if (sockets.has(socketId)) {
				markParticipantInactive({ roomId, socketId, userId });
			}
		}
	}
};

export const isParticipantActiveInRoom = (
	roomId: string,
	userId: string
): boolean => {
	const sockets = activeParticipants.get(roomId)?.get(userId);
	return Boolean(sockets?.size);
};

export const getActiveParticipantIds = (roomId: string): string[] =>
	Array.from(activeParticipants.get(roomId)?.keys() ?? []).sort();

const emitToRoom = <EventName extends keyof ChatRealtimeServerToClientEvents>(
	roomId: string,
	event: EventName,
	payload: Parameters<ChatRealtimeServerToClientEvents[EventName]>[0]
): void => {
	realtimeServer?.to(getChatRoomSocketRoom(roomId)).emit(event, payload);
};

export const emitMessageCreated = (payload: ChatMessageCreatedEvent): void => {
	emitToRoom(payload.roomId, "chat:message:created", payload);
};

export const emitMessageRead = (payload: ChatMessageReadEvent): void => {
	emitToRoom(payload.roomId, "chat:message:read", payload);
};

export const emitTypingStarted = (payload: ChatTypingEvent): void => {
	emitToRoom(payload.roomId, "chat:typing:started", payload);
};

export const emitTypingStopped = (payload: ChatTypingEvent): void => {
	emitToRoom(payload.roomId, "chat:typing:stopped", payload);
};

export const emitUnreadUpdated = (payload: ChatUnreadUpdatedEvent): void => {
	emitToRoom(payload.roomId, "chat:unread:updated", payload);
};

/**
 * 메시지가 아닌 방 내용 변경(면접 일정 제안·상태 변경 등)을 방 소켓룸에 알린다.
 * 방을 열어둔 상대방이 새로고침 없이 즉시 반영할 수 있게 한다.
 */
export const emitRoomUpdated = (payload: ChatRoomUpdatedEvent): void => {
	emitToRoom(payload.roomId, "chat:room:updated", payload);
};

/**
 * 채팅 목록 갱신 신호를 각 참여자의 유저 채널(user:${userId})로 보낸다.
 * 방 소켓룸(chat:${roomId})에 입장하지 않은 클라이언트(예: 목록 화면)도
 * 새 방 생성·새 메시지를 실시간으로 반영할 수 있게 한다.
 */
export const emitChatListUpdated = (
	userIds: string[],
	payload: ChatListUpdatedEvent
): void => {
	for (const userId of new Set(userIds)) {
		realtimeServer
			?.to(getUserSocketRoom(userId))
			.emit("chat:list:updated", payload);
	}
};
