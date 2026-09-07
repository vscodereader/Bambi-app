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

export interface ChatParticipantPresenceEvent {
	isOnline: boolean;
	presenceRefreshAt: null | string;
	userId: string;
}

export interface ChatPresenceResyncEvent {
	reason: "listener_reconnected" | "policy_changed";
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
	"chat:participant:presence": (payload: ChatParticipantPresenceEvent) => void;
	"chat:participant:presence:resync": (
		payload: ChatPresenceResyncEvent
	) => void;
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
	emit?<EventName extends keyof ChatRealtimeServerToClientEvents>(
		event: EventName,
		payload: Parameters<ChatRealtimeServerToClientEvents[EventName]>[0]
	): void;
	to(room: string): ChatRealtimeRoomEmitter;
}

interface ParticipantSocketInput {
	roomId: string;
	socketId: string;
	userId: string;
}

let realtimeServer: ChatRealtimeTransport | null = null;
const activeParticipants = new Map<string, Map<string, Set<string>>>();
// socketId → (roomId → userId) 역인덱스. 끊긴 소켓 하나를 지우려고 전체 방×사용자를
// 훑지 않기 위한 것으로, 아래 mark* 함수들이 activeParticipants와 함께 갱신한다.
// 소켓 하나는 사용자 한 명에 묶이므로 방마다 값이 하나면 충분하다.
const socketParticipations = new Map<string, Map<string, string>>();

const CHAT_SOCKET_ROOM_PREFIX = "chat:";

export const getChatRoomSocketRoom = (roomId: string): string =>
	`${CHAT_SOCKET_ROOM_PREFIX}${roomId}`;

/** 소켓룸 이름에서 방 id를 되돌린다(유저 채널 등 다른 룸이면 null). */
export const getChatRoomIdFromSocketRoom = (
	socketRoom: string
): null | string => {
	if (!socketRoom.startsWith(CHAT_SOCKET_ROOM_PREFIX)) {
		return null;
	}

	const roomId = socketRoom.slice(CHAT_SOCKET_ROOM_PREFIX.length);

	return roomId === "" ? null : roomId;
};

export const getUserSocketRoom = (userId: string): string => `user:${userId}`;

export const configureBambiChatRealtime = (
	server: ChatRealtimeTransport | null
): void => {
	realtimeServer = server;
};

export const resetBambiChatRealtimeForTests = (): void => {
	realtimeServer = null;
	activeParticipants.clear();
	socketParticipations.clear();
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

	const participations =
		socketParticipations.get(socketId) ?? new Map<string, string>();
	participations.set(roomId, userId);
	socketParticipations.set(socketId, participations);
};

export const markParticipantInactive = ({
	roomId,
	socketId,
	userId,
}: ParticipantSocketInput): void => {
	const participations = socketParticipations.get(socketId);
	participations?.delete(roomId);

	if (participations?.size === 0) {
		socketParticipations.delete(socketId);
	}

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

/**
 * 끊긴 소켓 하나를 모든 방에서 지운다. 예전에는 disconnect마다 활성 방×사용자를 전부
 * 훑었지만, 이제 socketId 역인덱스에 담긴 항목만 본다(끊김이 몰려도 비용이 그 소켓의
 * 입장 방 수에 비례한다).
 */
export const markSocketInactiveEverywhere = (socketId: string): void => {
	const participations = socketParticipations.get(socketId);

	if (!participations) {
		return;
	}

	for (const [roomId, userId] of Array.from(participations.entries())) {
		markParticipantInactive({ roomId, socketId, userId });
	}

	socketParticipations.delete(socketId);
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

export const emitChatParticipantPresence = (
	userIds: string[],
	payload: ChatParticipantPresenceEvent
): void => {
	for (const userId of new Set(userIds)) {
		realtimeServer
			?.to(getUserSocketRoom(userId))
			.emit("chat:participant:presence", payload);
	}
};

export const emitChatPresenceResync = (
	payload: ChatPresenceResyncEvent
): void => {
	realtimeServer?.emit?.("chat:participant:presence:resync", payload);
};
