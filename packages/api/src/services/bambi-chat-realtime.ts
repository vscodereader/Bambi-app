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

export interface ChatErrorEvent {
	code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
	message: string;
}

export interface ChatRealtimeServerToClientEvents {
	"chat:error": (payload: ChatErrorEvent) => void;
	"chat:message:created": (payload: ChatMessageCreatedEvent) => void;
	"chat:message:read": (payload: ChatMessageReadEvent) => void;
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
