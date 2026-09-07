// 알림 SSE(/sse/notifications) native 구독. RN에는 EventSource가 없어 expo/fetch의 스트리밍
// 응답 본문을 직접 읽어 `event:`/`data:` 프레임을 자른다. 규약(이벤트명·30초 하트비트·
// 75초 무프레임 재연결·백오프)은 web use-bambi-notification-stream.ts와 같다.
// 연결은 앱이 active일 때만 유지한다 — background에서는 OS가 소켓을 끊으므로 우리가 먼저
// abort하고, 복귀 시 다시 열며 놓친 알림은 재전송되지 않으니 정본(unreadCount·list)을 재조회한다.
import {
	BAMBI_NOTIFICATION_SSE_EVENT,
	type BambiNotificationEvent,
} from "@bambi-app/api/services/bambi-notification-stream";
import { env } from "@bambi-app/env/native";
import type { QueryKey } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/src/lib/orpc";

// 순수 파서는 별도 파일에 둔다 — vitest(node)는 이 파일의 react-native·expo/fetch·env import를
// 못 읽어서, 파서 테스트가 훅과 같은 모듈에 있으면 통째로 로드에 실패한다.
import { parseSseChunk, type SseFrame } from "./sse-parser";

const STREAM_URL = `${env.EXPO_PUBLIC_SERVER_URL}/sse/notifications`;
const REOPEN_BASE_MS = 1000;
const REOPEN_MAX_MS = 60_000;
const STREAM_SILENCE_LIMIT_MS = 75_000;
const WATCHDOG_INTERVAL_MS = 15_000;
const STABLE_CONNECTION_MS = 5000;
const CHAT_TARGET_TYPES = new Set(["chat_message", "chat_room"]);

const parseNotificationEvent = (
	data: string
): BambiNotificationEvent | null => {
	try {
		const parsed = JSON.parse(data) as Partial<BambiNotificationEvent>;
		if (!(parsed.notificationId && parsed.targetType)) {
			return null;
		}
		return {
			action: parsed.action ?? null,
			chatRoomId: parsed.chatRoomId ?? null,
			createdAt: parsed.createdAt ?? new Date().toISOString(),
			notificationId: parsed.notificationId,
			recipientRole: parsed.recipientRole ?? null,
			targetId: parsed.targetId ?? "",
			targetType: parsed.targetType,
		};
	} catch {
		// 형식이 깨진 프레임 하나 때문에 스트림을 끊지는 않는다.
		return null;
	}
};

const invalidate = (queryKey: QueryKey) => {
	queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
};

const refreshChat = () => {
	invalidate(orpc.bambi.chats.unreadState.queryKey());
	invalidate(orpc.bambi.chats.listMine.queryKey());
};

const refreshNotifications = () => {
	invalidate(orpc.bambi.notifications.unreadCount.queryKey());
	invalidate(orpc.bambi.notifications.list.key());
	// 쪽지 도착도 이 경로로 온다(direct_message 타입) — 쪽지 배지도 함께 무효화한다.
	invalidate(orpc.bambi.directMessages.unreadCount.queryKey());
};

const handleEvent = (event: BambiNotificationEvent) => {
	// 방 캐시는 targetType과 무관하게 돈다 — 면접 제안·연락처 공개는 chat_message 행을
	// 만들지 않아 방 캐시를 대신 복구해 줄 이벤트가 뒤따르지 않는다.
	if (event.chatRoomId) {
		invalidate(
			orpc.bambi.chats.getById.key({ input: { id: event.chatRoomId } })
		);
	}
	if (CHAT_TARGET_TYPES.has(event.targetType)) {
		refreshChat();
		return;
	}
	refreshNotifications();
};

// 하트비트(bambi:ping)를 비롯한 다른 이벤트는 "프레임이 왔다"는 사실(lastFrameAt)만 의미가
// 있어 여기서는 그냥 흘려보낸다.
const handleFrame = (frame: SseFrame) => {
	if (frame.event !== BAMBI_NOTIFICATION_SSE_EVENT) {
		return;
	}
	const event = parseNotificationEvent(frame.data);
	if (event) {
		handleEvent(event);
	}
};

// 한 번의 연결 수명. 반환한 함수로 abort한다. 연결이 끝나면(정상 종료·오류·워치독) onClose를
// 불러 호출부가 백오프 재연결을 결정한다.
const openStream = (onClose: () => void): (() => void) => {
	const controller = new AbortController();
	let lastFrameAt = Date.now();
	let closed = false;

	const finish = () => {
		if (closed) {
			return;
		}
		closed = true;
		clearInterval(watchdog);
		controller.abort();
		onClose();
	};

	// 모바일 NAT·방화벽이 RST 없이 연결을 버리면 read()가 영영 안 깨어난다 —
	// 하트비트가 끊긴 스트림은 우리가 직접 닫는다.
	const watchdog = setInterval(() => {
		if (Date.now() - lastFrameAt >= STREAM_SILENCE_LIMIT_MS) {
			finish();
		}
	}, WATCHDOG_INTERVAL_MS);

	const pump = async () => {
		const cookie = authClient.getCookie();
		const response = await fetch(STREAM_URL, {
			// 쿠키는 아래 헤더로만 싣는다(orpc.ts link.fetch와 같은 규칙) — 기본값 include면
			// 플랫폼 쿠키 저장소 값이 먼저 붙어 "Cookie: a=X,a=X"로 병합되거나 SecureStore
			// 정본을 덮어써 세션 파싱이 깨지고 401 → 백오프 루프가 된다.
			credentials: "omit",
			headers: {
				Accept: "text/event-stream",
				...(cookie ? { Cookie: cookie } : {}),
			},
			signal: controller.signal,
		});
		if (!(response.ok && response.body)) {
			throw new Error(`sse ${response.status}`);
		}

		// 연결이 (다시) 열렸다 — 끊긴 동안의 알림은 재전송되지 않으므로 정본을 읽는다.
		refreshChat();
		refreshNotifications();

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (!closed) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			lastFrameAt = Date.now();
			buffer += decoder.decode(value, { stream: true });
			const parsed = parseSseChunk(buffer);
			buffer = parsed.rest;

			for (const frame of parsed.frames) {
				handleFrame(frame);
			}
		}
	};

	pump()
		.catch(() => undefined)
		.finally(finish);

	return finish;
};

/**
 * 알림 SSE 구독 훅. enabled(로그인 세션)일 때 앱이 active인 동안만 연결을 유지한다.
 * 루트에서 한 번만 마운트한다(notification-stream-gate.tsx).
 */
export function useBambiNotificationStream(enabled: boolean): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		let abort: (() => void) | null = null;
		let reopenTimer: null | ReturnType<typeof setTimeout> = null;
		let attempt = 0;
		let disposed = false;
		let appState: AppStateStatus = AppState.currentState;

		const clearReopen = () => {
			if (reopenTimer) {
				clearTimeout(reopenTimer);
				reopenTimer = null;
			}
		};

		const connect = () => {
			if (disposed || abort || appState !== "active") {
				return;
			}
			const startedAt = Date.now();
			abort = openStream(() => {
				abort = null;
				// 5초 이상 살아 있던 연결이 끊긴 것은 정상 수명 종료로 보고 백오프를 되감는다.
				if (Date.now() - startedAt > STABLE_CONNECTION_MS) {
					attempt = 0;
				}
				if (disposed || appState !== "active") {
					return;
				}
				const delay = Math.min(REOPEN_BASE_MS * 2 ** attempt, REOPEN_MAX_MS);
				attempt += 1;
				clearReopen();
				reopenTimer = setTimeout(() => {
					reopenTimer = null;
					connect();
				}, delay);
			});
		};

		const disconnect = () => {
			clearReopen();
			abort?.();
			abort = null;
		};

		const subscription = AppState.addEventListener("change", (next) => {
			appState = next;
			if (next === "active") {
				attempt = 0;
				connect();
			} else {
				disconnect();
			}
		});

		connect();

		return () => {
			disposed = true;
			subscription.remove();
			disconnect();
		};
	}, [enabled]);
}
