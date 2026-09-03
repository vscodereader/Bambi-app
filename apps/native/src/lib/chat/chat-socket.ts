import type {
	ChatErrorEvent,
	ChatRealtimeServerToClientEvents,
} from "@bambi-app/api/services/bambi-chat-realtime";
import { env } from "@bambi-app/env/native";
import { Platform } from "react-native";
import { io, type Socket } from "socket.io-client";

import { authClient } from "@/lib/auth-client";

interface ChatRoomPayload {
	roomId: string;
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
	"chat:typing:started": (payload: ChatRoomPayload) => void;
	"chat:typing:stopped": (payload: ChatRoomPayload) => void;
}

export type ChatSocket = Socket<
	ChatRealtimeServerToClientEvents,
	ChatRealtimeClientToServerEvents
>;

const ACK_TIMEOUT_MS = 5000;
// 방 화면을 떠난 뒤 소켓 방 입장을 정리하기까지의 유예(web과 동일). 잠깐 다른 화면을
// 보고 돌아오는 왕복에서 매번 leave/join을 하지 않는다.
const LEAVE_GRACE_MS = 30_000;
// 서버 인증 미들웨어 거절(레이트리밋·세션 순단)은 socket.io가 스스로 다시 붙지 않는다
// (socket.active === false). 우리가 지수 백오프로 다시 붙인다.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let chatSocket: ChatSocket | null = null;
const pendingLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let reconnectTimer: null | ReturnType<typeof setTimeout> = null;
let reconnectAttempt = 0;

const clearReconnectTimer = (): void => {
	if (reconnectTimer !== null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
};

const scheduleReconnect = (): void => {
	if (reconnectTimer !== null) {
		return;
	}

	const backoff = Math.min(
		RECONNECT_BASE_MS * 2 ** reconnectAttempt,
		RECONNECT_MAX_MS
	);
	const delay = backoff + Math.floor(Math.random() * RECONNECT_BASE_MS);
	reconnectAttempt += 1;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		chatSocket?.connect();
	}, delay);
};

const cancelPendingLeave = (roomId: string): void => {
	const timerId = pendingLeaveTimers.get(roomId);

	if (timerId !== undefined) {
		clearTimeout(timerId);
		pendingLeaveTimers.delete(roomId);
	}
};

const rejectFromAck = (response: ChatRealtimeAckResponse): Error | null =>
	response.ok ? null : new Error(response.error.message);

// orpc.ts와 같은 인증 경로: 네이티브는 쿠키 저장소가 없으므로 SecureStore의 세션 쿠키를
// Cookie 헤더로 직접 싣는다(서버 io.use가 createContext(headers)로 세션을 읽는다).
// 웹 빌드(Platform.OS === "web")는 브라우저 쿠키를 withCredentials로 보낸다.
const resolveAuthHeaders = (): Record<string, string> => {
	if (Platform.OS === "web") {
		return {};
	}

	const cookies = authClient.getCookie();

	return cookies ? { Cookie: cookies } : {};
};

export const getChatSocket = (): ChatSocket => {
	if (!chatSocket) {
		chatSocket = io(env.EXPO_PUBLIC_SERVER_URL, {
			autoConnect: false,
			// extraHeaders는 연결 시점에 읽히므로 재연결마다 최신 쿠키를 싣도록 함수형으로
			// 갈아 끼운다(아래 reconnect_attempt 핸들러).
			extraHeaders: resolveAuthHeaders(),
			reconnection: true,
			reconnectionDelay: 500,
			reconnectionDelayMax: 5000,
			timeout: ACK_TIMEOUT_MS,
			withCredentials: Platform.OS === "web",
		}) as ChatSocket;

		chatSocket.on("connect", () => {
			reconnectAttempt = 0;
			clearReconnectTimer();
		});
		chatSocket.on("connect_error", () => {
			if (!chatSocket?.active) {
				scheduleReconnect();
			}
		});
		// 재연결 직전 헤더를 최신 세션 쿠키로 갱신한다(재로그인 뒤 옛 쿠키로 붙는 것 방지).
		chatSocket.io.on("reconnect_attempt", () => {
			if (chatSocket) {
				chatSocket.io.opts.extraHeaders = resolveAuthHeaders();
			}
		});
	}

	return chatSocket;
};

export const connectChatSocket = (): ChatSocket => {
	const socket = getChatSocket();

	if (!socket.connected) {
		socket.io.opts.extraHeaders = resolveAuthHeaders();
		socket.connect();
	}

	return socket;
};

export const joinChatRoom = (roomId: string): Promise<void> =>
	new Promise((resolve, reject) => {
		cancelPendingLeave(roomId);
		const socket = connectChatSocket();
		const timeoutId = setTimeout(() => {
			reject(new Error("실시간 채팅 연결이 지연되고 있어요."));
		}, ACK_TIMEOUT_MS);

		socket.emit("chat:join", { roomId }, (response) => {
			clearTimeout(timeoutId);
			const error = rejectFromAck(response);

			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});

export const leaveChatRoom = (roomId: string): void => {
	cancelPendingLeave(roomId);
	const socket = getChatSocket();

	if (socket.connected) {
		socket.emit("chat:leave", { roomId });
	}
};

export const scheduleChatRoomLeave = (roomId: string): void => {
	if (pendingLeaveTimers.has(roomId)) {
		return;
	}

	pendingLeaveTimers.set(
		roomId,
		setTimeout(() => {
			pendingLeaveTimers.delete(roomId);
			leaveChatRoom(roomId);
		}, LEAVE_GRACE_MS)
	);
};

export const emitChatTypingStarted = (roomId: string): void => {
	const socket = getChatSocket();

	if (socket.connected) {
		socket.emit("chat:typing:started", { roomId });
	}
};

export const emitChatTypingStopped = (roomId: string): void => {
	const socket = getChatSocket();

	if (socket.connected) {
		socket.emit("chat:typing:stopped", { roomId });
	}
};

// 로그아웃 시 세션 쿠키가 사라진 뒤에도 옛 연결이 남지 않게 끊는다.
export const disconnectChatSocket = (): void => {
	clearReconnectTimer();
	for (const timerId of pendingLeaveTimers.values()) {
		clearTimeout(timerId);
	}
	pendingLeaveTimers.clear();
	chatSocket?.disconnect();
};
