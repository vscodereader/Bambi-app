import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { orpc } from "@/src/lib/orpc";

import {
	connectChatSocket,
	emitChatTypingStopped,
	joinChatRoom,
	scheduleChatRoomLeave,
} from "./chat-socket";
import {
	applyTypingStarted,
	applyTypingStopped,
	pruneTyping,
	TYPING_TTL_MS,
	type TypingState,
	typingUserIds,
} from "./chat-typing";

// 소켓이 끊긴 동안만 도는 보강 폴링 간격. 연결되면 즉시 멈춘다.
const OFFLINE_POLL_MS = 15_000;

/**
 * 방 화면의 실시간 배선. 입장·이벤트→쿼리 무효화·타이핑 상태·AppState 복귀 재조회·
 * 오프라인 폴링을 한 곳에서 관리한다. 화면은 반환값만 그린다.
 */
export function useChatRoomRealtime({
	onIncomingMessage,
	onUnreadRemaining,
	roomId,
}: {
	onIncomingMessage: (messageId: string) => void;
	onUnreadRemaining: () => void;
	roomId: string;
}): { isConnected: boolean; typingUserIds: string[] } {
	const queryClient = useQueryClient();
	const [isConnected, setIsConnected] = useState(false);
	const [typing, setTyping] = useState<TypingState>({});
	const [now, setNow] = useState(() => Date.now());
	const onIncomingMessageRef = useRef(onIncomingMessage);
	const onUnreadRemainingRef = useRef(onUnreadRemaining);

	useEffect(() => {
		onIncomingMessageRef.current = onIncomingMessage;
		onUnreadRemainingRef.current = onUnreadRemaining;
	}, [onIncomingMessage, onUnreadRemaining]);

	useEffect(() => {
		const socket = connectChatSocket();
		const roomKey = orpc.bambi.chats.getById.key({ input: { id: roomId } });
		const invalidateRoom = () => {
			queryClient
				.invalidateQueries({ queryKey: roomKey })
				.catch(() => undefined);
		};
		const invalidateList = () => {
			queryClient
				.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() })
				.catch(() => undefined);
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.unreadState.queryKey(),
				})
				.catch(() => undefined);
		};
		const join = () => {
			joinChatRoom(roomId)
				.then(() => setIsConnected(true))
				.catch(() => setIsConnected(false));
		};

		const handleConnect = () => {
			join();
			invalidateRoom();
		};
		const handleDisconnect = () => setIsConnected(false);
		const handleMessageCreated = (payload: {
			messageId: string;
			roomId: string;
		}) => {
			if (payload.roomId !== roomId) {
				return;
			}
			invalidateRoom();
			onIncomingMessageRef.current(payload.messageId);
		};
		const handleRoomChanged = (payload: { roomId: string }) => {
			if (payload.roomId === roomId) {
				invalidateRoom();
			}
		};
		const handleUnreadUpdated = (payload: {
			roomId: string;
			unreadCount: number;
		}) => {
			if (payload.roomId !== roomId) {
				return;
			}
			invalidateRoom();
			if (payload.unreadCount > 0) {
				onUnreadRemainingRef.current();
			}
		};
		const handleTypingStarted = (payload: {
			roomId: string;
			userId: string;
		}) => {
			if (payload.roomId === roomId) {
				setTyping((state) =>
					applyTypingStarted(state, payload.userId, Date.now())
				);
			}
		};
		const handleTypingStopped = (payload: {
			roomId: string;
			userId: string;
		}) => {
			if (payload.roomId === roomId) {
				setTyping((state) => applyTypingStopped(state, payload.userId));
			}
		};

		socket.on("connect", handleConnect);
		socket.on("disconnect", handleDisconnect);
		socket.on("chat:message:created", handleMessageCreated);
		socket.on("chat:message:read", handleRoomChanged);
		socket.on("chat:room:updated", handleRoomChanged);
		socket.on("chat:list:updated", invalidateList);
		socket.on("chat:unread:updated", handleUnreadUpdated);
		socket.on("chat:typing:started", handleTypingStarted);
		socket.on("chat:typing:stopped", handleTypingStopped);

		if (socket.connected) {
			join();
		}

		// 백그라운드→active 복귀: 소켓 복구 여부와 무관하게 방·목록을 다시 받는다.
		const appStateSubscription = AppState.addEventListener(
			"change",
			(state) => {
				if (state === "active") {
					invalidateRoom();
					invalidateList();
					if (!socket.connected) {
						socket.connect();
					}
				}
			}
		);

		return () => {
			socket.off("connect", handleConnect);
			socket.off("disconnect", handleDisconnect);
			socket.off("chat:message:created", handleMessageCreated);
			socket.off("chat:message:read", handleRoomChanged);
			socket.off("chat:room:updated", handleRoomChanged);
			socket.off("chat:list:updated", invalidateList);
			socket.off("chat:unread:updated", handleUnreadUpdated);
			socket.off("chat:typing:started", handleTypingStarted);
			socket.off("chat:typing:stopped", handleTypingStopped);
			appStateSubscription.remove();
			emitChatTypingStopped(roomId);
			scheduleChatRoomLeave(roomId);
		};
	}, [queryClient, roomId]);

	// 소켓이 끊긴 동안만 폴링으로 보강한다.
	useEffect(() => {
		if (isConnected) {
			return;
		}

		const roomKey = orpc.bambi.chats.getById.key({ input: { id: roomId } });
		const timerId = setInterval(() => {
			queryClient
				.invalidateQueries({ queryKey: roomKey })
				.catch(() => undefined);
		}, OFFLINE_POLL_MS);

		return () => clearInterval(timerId);
	}, [isConnected, queryClient, roomId]);

	// 타이핑 TTL 만료를 반영할 틱. 표시 중인 사람이 있을 때만 돈다.
	const hasTyping = Object.keys(typing).length > 0;

	useEffect(() => {
		if (!hasTyping) {
			return;
		}

		const timerId = setInterval(() => {
			const current = Date.now();
			setNow(current);
			setTyping((state) => pruneTyping(state, current));
		}, TYPING_TTL_MS / 5);

		return () => clearInterval(timerId);
	}, [hasTyping]);

	return { isConnected, typingUserIds: typingUserIds(typing, now) };
}
