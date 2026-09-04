"use client";

import {
	BAMBI_HEARTBEAT_SSE_EVENT,
	BAMBI_NOTIFICATION_SSE_EVENT,
	type BambiNotificationEvent,
} from "@bambi-app/api/services/bambi-notification-stream";
import { env } from "@bambi-app/env/web";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
	NOTIFICATIONS_HREF,
	notificationTitle,
} from "@/lib/bambi/notification-labels";
import { showOsNotification } from "@/lib/bambi/os-notification";
import { getPresenceConnectionId } from "@/lib/bambi/user-activity-intent";
import { orpc } from "@/utils/orpc";

interface NotificationStreamListener {
	onEvent: (event: BambiNotificationEvent) => void;
	// 스트림이 (다시) 열릴 때마다 부른다. 끊겨 있던 동안 놓친 알림은 재전송되지 않으므로
	// 여기서 정본을 다시 읽어야 배지·목록이 낡은 값으로 굳지 않는다.
	onOpen: () => void;
}

const NOTIFICATION_STREAM_PATH = "/sse/notifications";
// 셸의 여러 컴포넌트가 같은 훅을 쓰기 때문에(헤더 채팅 버튼·모바일 탭) 연결은 하나만 두고
// 구독자 수로 관리한다. 화면 전환 중 잠깐 0이 되는 경우가 있어 유예 시간을 두고 닫는다.
const CLOSE_GRACE_MS = 1000;
// 서버가 401·5xx를 주면 EventSource는 CLOSED로 확정 종료되고 스스로 재연결하지 않는다.
// 그 상태를 방치하면 싱글턴이 CLOSED인 채 남아 새로고침 전까지 알림이 영영 멈춘다.
const REOPEN_BASE_MS = 5000;
const REOPEN_MAX_MS = 60_000;
// 서버 하트비트는 30초 간격이다. 두 번 넘게 건너뛰면 반쪽 열린(half-open) 연결로 보고 되연다.
const STREAM_SILENCE_LIMIT_MS = 75_000;
const WATCHDOG_INTERVAL_MS = 15_000;

const listeners = new Set<NotificationStreamListener>();
let eventSource: EventSource | null = null;
let closeTimer: null | ReturnType<typeof setTimeout> = null;
let reopenTimer: null | ReturnType<typeof setTimeout> = null;
let watchdogTimer: null | ReturnType<typeof setInterval> = null;
let reopenAttempt = 0;
let lastFrameAt = 0;

const parseNotificationEvent = (
	data: string
): BambiNotificationEvent | null => {
	try {
		const parsed = JSON.parse(data) as Partial<BambiNotificationEvent>;

		if (!(parsed.notificationId && parsed.targetType)) {
			return null;
		}

		return {
			// 배포 중에는 옛 서버 프레임(두 필드 없음)이 섞여 올 수 있다 — 그때는 폴백 문구로 돈다.
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

const markFrameReceived = () => {
	lastFrameAt = Date.now();
};

const stopWatchdog = () => {
	if (watchdogTimer) {
		clearInterval(watchdogTimer);
		watchdogTimer = null;
	}
};

const dropStream = () => {
	eventSource?.close();
	eventSource = null;
	stopWatchdog();
};

const scheduleReopen = () => {
	if (reopenTimer || listeners.size === 0) {
		return;
	}

	const backoff = Math.min(REOPEN_BASE_MS * 2 ** reopenAttempt, REOPEN_MAX_MS);
	// 지터가 없으면 배포로 전원이 동시에 끊긴 뒤 같은 시점에 되돌아온다.
	const delay = backoff + Math.floor(Math.random() * REOPEN_BASE_MS);
	reopenAttempt += 1;
	reopenTimer = setTimeout(() => {
		reopenTimer = null;
		openStream();
	}, delay);
};

const startWatchdog = () => {
	stopWatchdog();
	watchdogTimer = setInterval(() => {
		if (Date.now() - lastFrameAt < STREAM_SILENCE_LIMIT_MS) {
			return;
		}

		// 모바일 NAT·방화벽이 RST 없이 연결을 버리면 브라우저는 소켓이 살아 있다고 믿는다.
		// 하트비트가 끊긴 스트림은 우리가 직접 닫고 다시 연다.
		dropStream();
		scheduleReopen();
	}, WATCHDOG_INTERVAL_MS);
};

function openStream() {
	if (eventSource || listeners.size === 0) {
		return;
	}

	const connectionId = getPresenceConnectionId();
	const source = new EventSource(
		`${env.NEXT_PUBLIC_SERVER_URL}${NOTIFICATION_STREAM_PATH}?connectionId=${encodeURIComponent(connectionId)}`,
		{ withCredentials: true }
	);

	markFrameReceived();

	source.addEventListener("open", () => {
		reopenAttempt = 0;
		markFrameReceived();

		for (const listener of listeners) {
			listener.onOpen();
		}
	});

	source.addEventListener(BAMBI_HEARTBEAT_SSE_EVENT, markFrameReceived);

	source.addEventListener(BAMBI_NOTIFICATION_SSE_EVENT, (messageEvent) => {
		markFrameReceived();

		const event = parseNotificationEvent(
			(messageEvent as MessageEvent<string>).data
		);

		if (!event) {
			return;
		}

		for (const listener of listeners) {
			listener.onEvent(event);
		}
	});

	source.onerror = () => {
		// CONNECTING이면 브라우저가 알아서 다시 붙는다. CLOSED는 확정 종료(401·5xx·CORS)라
		// 우리가 싱글턴을 비우고 백오프로 다시 열지 않으면 그대로 영영 멈춘다.
		if (source.readyState === EventSource.CLOSED) {
			dropStream();
			scheduleReopen();
		}
	};

	eventSource = source;
	startWatchdog();
}

const closeStream = () => {
	dropStream();

	if (reopenTimer) {
		clearTimeout(reopenTimer);
		reopenTimer = null;
	}

	reopenAttempt = 0;
};

const subscribeNotificationStream = (listener: NotificationStreamListener) => {
	listeners.add(listener);

	if (closeTimer) {
		clearTimeout(closeTimer);
		closeTimer = null;
	}

	openStream();

	return () => {
		listeners.delete(listener);

		if (listeners.size > 0) {
			return;
		}

		closeTimer = setTimeout(() => {
			closeTimer = null;

			if (listeners.size === 0) {
				closeStream();
			}
		}, CLOSE_GRACE_MS);
	};
};

// 채팅 축 알림. 이 두 타입만 채팅 핀·목록·방 캐시를 건드린다.
const CHAT_TARGET_TYPES = new Set(["chat_message", "chat_room"]);

/**
 * 알림 SSE 구독 훅. 서버가 알림 행을 만드는 즉시 이벤트를 받아 관련 캐시를 무효화한다.
 * 채팅류는 기존대로 채팅 핀·목록·방을, 그 외는 알림함 목록·벨 배지를 갱신한다.
 * 탭을 보고 있지 않고 권한이 허용된 경우에만 OS 알림을 덧붙인다 — 토스트는 띄우지 않는다.
 */
export function useBambiNotificationStream(enabled: boolean): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!enabled) {
			return;
		}

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
			// 전체 이벤트에 한 줄이면 충분하다(과도 무효화 비용 미미, targetType 분기 불필요).
			invalidate(orpc.bambi.directMessages.unreadCount.queryKey());
		};

		return subscribeNotificationStream({
			onEvent: (event) => {
				// 배지·목록만 갱신하면 "안 읽음 1인데 방에는 그 메시지가 없는" 상태가 된다
				// (방 소켓룸을 잃었거나 소켓과 SSE가 서로 다른 인스턴스에 붙은 경우).
				// targetType과 무관하게 돈다 — 면접 제안·연락처 공개는 chat_message 행을
				// 만들지 않아 방 캐시를 대신 복구해 줄 이벤트가 뒤따르지 않는다.
				if (event.chatRoomId) {
					invalidate(
						orpc.bambi.chats.getById.key({
							input: { id: event.chatRoomId },
						})
					);
				}

				if (CHAT_TARGET_TYPES.has(event.targetType)) {
					refreshChat();
					return;
				}

				refreshNotifications();
				// 페이로드에는 action·recipientRole만 있어 제목까지는 정확하지만, 사유·딥링크에
				// 필요한 나머지 metadata는 없다 — 정본은 알림함이라 클릭은 알림함으로만 보낸다.
				showOsNotification({
					href: NOTIFICATIONS_HREF,
					title: notificationTitle({
						chatRoomId: event.chatRoomId,
						metadata: event.action ? { action: event.action } : null,
						recipientRole: event.recipientRole,
						targetId: event.targetId,
						targetType: event.targetType,
					}),
				});
			},
			// 끊겨 있던 동안 놓친 알림은 재전송되지 않는다 — 재연결마다 양쪽 정본을 다시 읽는다.
			onOpen: () => {
				refreshChat();
				refreshNotifications();
			},
		});
	}, [enabled, queryClient]);
}
