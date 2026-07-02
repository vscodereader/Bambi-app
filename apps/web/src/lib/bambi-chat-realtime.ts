"use client";

import type {
	ChatErrorEvent,
	ChatRealtimeServerToClientEvents,
} from "@bambi-app/api/services/bambi-chat-realtime";
import { env } from "@bambi-app/env/web";
import { io, type Socket } from "socket.io-client";

interface ChatRoomPayload {
	roomId: string;
}

interface ChatReadPayload extends ChatRoomPayload {
	messageIds: string[];
}

interface ChatRealtimeAckSuccess {
	ok: true;
}

interface ChatRealtimeAckFailure {
	error: ChatErrorEvent;
	ok: false;
}

type ChatRealtimeAckResponse = ChatRealtimeAckFailure | ChatRealtimeAckSuccess;

interface ChatRealtimeClientToServerEvents {
	"chat:join": (
		payload: ChatRoomPayload,
		ack?: (response: ChatRealtimeAckResponse) => void
	) => void;
	"chat:leave": (
		payload: ChatRoomPayload,
		ack?: (response: ChatRealtimeAckResponse) => void
	) => void;
	"chat:message:ack-read": (
		payload: ChatReadPayload,
		ack?: (response: ChatRealtimeAckResponse) => void
	) => void;
	"chat:typing:started": (payload: ChatRoomPayload) => void;
	"chat:typing:stopped": (payload: ChatRoomPayload) => void;
}

export type BambiChatSocket = Socket<
	ChatRealtimeServerToClientEvents,
	ChatRealtimeClientToServerEvents
>;

const ACK_TIMEOUT_MS = 5000;

let chatSocket: BambiChatSocket | null = null;

const rejectFromAck = (response: ChatRealtimeAckResponse): Error | null => {
	if (response.ok) {
		return null;
	}

	return new Error(response.error.message);
};

export const getBambiChatSocket = (): BambiChatSocket => {
	if (!chatSocket) {
		chatSocket = io(env.NEXT_PUBLIC_SERVER_URL, {
			autoConnect: false,
			reconnection: true,
			reconnectionDelay: 500,
			reconnectionDelayMax: 5000,
			timeout: ACK_TIMEOUT_MS,
			withCredentials: true,
		}) as BambiChatSocket;
	}

	return chatSocket;
};

export const connectBambiChatSocket = (): BambiChatSocket => {
	const socket = getBambiChatSocket();

	if (!socket.connected) {
		socket.connect();
	}

	return socket;
};

export const joinBambiChatRoom = (roomId: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const socket = connectBambiChatSocket();
		const timeoutId = window.setTimeout(() => {
			reject(new Error("실시간 채팅 연결이 지연되고 있어요."));
		}, ACK_TIMEOUT_MS);

		socket.emit("chat:join", { roomId }, (response) => {
			window.clearTimeout(timeoutId);
			const error = rejectFromAck(response);

			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});

export const leaveBambiChatRoom = (roomId: string): void => {
	const socket = getBambiChatSocket();

	if (!socket.connected) {
		return;
	}

	socket.emit("chat:leave", { roomId });
};

export const emitBambiChatTypingStarted = (roomId: string): void => {
	const socket = getBambiChatSocket();

	if (socket.connected) {
		socket.emit("chat:typing:started", { roomId });
	}
};

export const emitBambiChatTypingStopped = (roomId: string): void => {
	const socket = getBambiChatSocket();

	if (socket.connected) {
		socket.emit("chat:typing:stopped", { roomId });
	}
};

export const ackReadBambiChatMessages = (
	roomId: string,
	messageIds: string[]
): Promise<void> =>
	new Promise((resolve, reject) => {
		const socket = connectBambiChatSocket();
		const timeoutId = window.setTimeout(() => {
			reject(new Error("읽음 처리가 지연되고 있어요."));
		}, ACK_TIMEOUT_MS);

		socket.emit("chat:message:ack-read", { messageIds, roomId }, (response) => {
			window.clearTimeout(timeoutId);
			const error = rejectFromAck(response);

			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
