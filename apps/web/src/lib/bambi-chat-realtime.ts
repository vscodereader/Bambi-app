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
/**
 * 방 화면을 떠난 뒤 소켓 방 입장을 정리하기까지의 유예. 상대에게는 아무 표시도 가지
 * 않는(나감 알림이 아닌) 내부 정리라, 잠깐 다른 화면을 보고 돌아오는 흔한 왕복에서
 * 매번 leave/join을 왕복시키지 않으려고 창을 둔다.
 */
const LEAVE_GRACE_MS = 30_000;
/**
 * 서버 인증 미들웨어 거절(레이트리밋·세션 순단)은 네임스페이스 오류라 socket.io가
 * 스스로 다시 붙지 않는다(그때 socket.active === false). 아무도 듣지 않으면 소켓이
 * 조용히 영영 죽어 핀·목록·실시간이 전부 멈추고 HTTP 경로만 남는다.
 */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let chatSocket: BambiChatSocket | null = null;
// roomId → 유예 타이머. 같은 방으로 다시 들어오면 취소하고 기존 입장을 그대로 쓴다.
const pendingLeaveTimers = new Map<string, number>();
let reconnectTimer: null | number = null;
let reconnectAttempt = 0;

const clearReconnectTimer = (): void => {
	if (reconnectTimer !== null) {
		window.clearTimeout(reconnectTimer);
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
	// 지터가 없으면 배포·레이트리밋으로 동시에 끊긴 클라이언트가 같은 시점에 몰려 온다.
	const delay = backoff + Math.floor(Math.random() * RECONNECT_BASE_MS);
	reconnectAttempt += 1;
	reconnectTimer = window.setTimeout(() => {
		reconnectTimer = null;
		chatSocket?.connect();
	}, delay);
};

const cancelPendingLeave = (roomId: string): void => {
	const timerId = pendingLeaveTimers.get(roomId);

	if (timerId !== undefined) {
		window.clearTimeout(timerId);
		pendingLeaveTimers.delete(roomId);
	}
};

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

		chatSocket.on("connect", () => {
			reconnectAttempt = 0;
			clearReconnectTimer();
		});
		// active === false면 socket.io가 재시도를 포기한 상태(미들웨어 거절)다. 전송 계층
		// 오류는 내장 재연결이 이미 돌고 있으므로 우리가 끼어들지 않는다.
		chatSocket.on("connect_error", () => {
			if (!chatSocket?.active) {
				scheduleReconnect();
			}
		});
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
		// 유예 중에 돌아왔다 = 아직 방에 들어가 있다. 예약된 정리부터 취소한다.
		cancelPendingLeave(roomId);
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
	cancelPendingLeave(roomId);
	const socket = getBambiChatSocket();

	if (!socket.connected) {
		return;
	}

	socket.emit("chat:leave", { roomId });
};

/**
 * 방 화면을 떠날 때의 정리 예약. 30초 안에 같은 방으로 돌아오면(joinBambiChatRoom)
 * 취소되고 기존 입장을 그대로 쓴다. 유예 동안은 프레즌스가 남아 새 메시지가 알림(SSE)
 * 대신 소켓으로 오지만, 안 읽음 핀은 방과 무관한 `chat:list:updated`로 갱신되므로
 * 그대로 뜬다 — 화면이 없으니 자동 읽음도 돌지 않는다.
 * 전역 소켓 연결 자체는 건드리지 않는다(목록·뱃지 갱신이 계속 필요하다).
 */
export const scheduleBambiChatRoomLeave = (roomId: string): void => {
	if (pendingLeaveTimers.has(roomId)) {
		return;
	}

	pendingLeaveTimers.set(
		roomId,
		window.setTimeout(() => {
			pendingLeaveTimers.delete(roomId);
			leaveBambiChatRoom(roomId);
		}, LEAVE_GRACE_MS)
	);
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
