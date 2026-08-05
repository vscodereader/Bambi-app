"use client";

import {
	BAMBI_NOTIFICATION_SSE_EVENT,
	type BambiNotificationEvent,
} from "@bambi-app/api/services/bambi-notification-stream";
import { env } from "@bambi-app/env/web";
import { useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

type NotificationListener = (event: BambiNotificationEvent) => void;

const NOTIFICATION_STREAM_PATH = "/sse/notifications";
// 셸의 여러 컴포넌트가 같은 훅을 쓰기 때문에(헤더 채팅 버튼·모바일 탭) 연결은 하나만 두고
// 구독자 수로 관리한다. 화면 전환 중 잠깐 0이 되는 경우가 있어 유예 시간을 두고 닫는다.
const CLOSE_GRACE_MS = 1000;

const listeners = new Set<NotificationListener>();
let eventSource: EventSource | null = null;
let closeTimer: null | ReturnType<typeof setTimeout> = null;
let activePathname = "";
let navigate: ((href: string) => void) | null = null;

const chatRoomPath = (chatRoomId: string) => `/seeker/chats/${chatRoomId}`;

const isViewingChatRoom = (event: BambiNotificationEvent) =>
	event.chatRoomId !== null &&
	activePathname === chatRoomPath(event.chatRoomId);

// 토스트는 구독자 수와 무관하게 이벤트당 한 번만 떠야 해서 모듈 레벨에서 처리한다.
const showNotificationToast = (event: BambiNotificationEvent) => {
	if (event.targetType !== "chat_message" || isViewingChatRoom(event)) {
		return;
	}

	const roomId = event.chatRoomId;

	toast("새 메시지가 도착했어요.", {
		action: roomId
			? {
					label: "보러 가기",
					onClick: () => navigate?.(chatRoomPath(roomId)),
				}
			: undefined,
		description: "채팅방에서 내용을 확인해 보세요.",
	});
};

const parseNotificationEvent = (
	data: string
): BambiNotificationEvent | null => {
	try {
		const parsed = JSON.parse(data) as Partial<BambiNotificationEvent>;

		if (!(parsed.notificationId && parsed.targetType)) {
			return null;
		}

		return {
			chatRoomId: parsed.chatRoomId ?? null,
			createdAt: parsed.createdAt ?? new Date().toISOString(),
			notificationId: parsed.notificationId,
			targetId: parsed.targetId ?? "",
			targetType: parsed.targetType,
		};
	} catch {
		// 형식이 깨진 프레임 하나 때문에 스트림을 끊지는 않는다.
		return null;
	}
};

const openStream = () => {
	if (eventSource) {
		return;
	}

	const source = new EventSource(
		`${env.NEXT_PUBLIC_SERVER_URL}${NOTIFICATION_STREAM_PATH}`,
		{ withCredentials: true }
	);

	source.addEventListener(BAMBI_NOTIFICATION_SSE_EVENT, (messageEvent) => {
		const event = parseNotificationEvent(
			(messageEvent as MessageEvent<string>).data
		);

		if (!event) {
			return;
		}

		showNotificationToast(event);

		for (const listener of listeners) {
			listener(event);
		}
	});

	// 재연결은 EventSource 기본 동작에 맡긴다. 개발자 도구를 채우지 않도록 조용히 넘긴다.
	source.onerror = () => undefined;

	eventSource = source;
};

const closeStream = () => {
	eventSource?.close();
	eventSource = null;
};

const subscribeNotificationStream = (listener: NotificationListener) => {
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

/**
 * 알림 SSE 구독 훅. 서버가 알림 행을 만드는 즉시 이벤트를 받아
 * 안 읽음 배지·채팅 목록 캐시를 무효화하고, 새 메시지면 토스트를 띄운다.
 * 기존 폴링·소켓 경로는 그대로 두고 이 스트림은 즉시성만 더한다.
 */
export function useBambiNotificationStream(enabled: boolean): void {
	const queryClient = useQueryClient();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		activePathname = pathname ?? "";
	}, [pathname]);

	// 토스트 액션이 쓰는 이동 함수. 훅이 여러 곳에서 마운트되므로 해제하지 않고
	// 마지막 라우터로 덮어쓰기만 한다(끊기면 액션이 먹통이 된다).
	useEffect(() => {
		navigate = (href: string) => {
			router.push(href as Route);
		};
	}, [router]);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		return subscribeNotificationStream(() => {
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.unreadState.queryKey(),
				})
				.catch(() => undefined);
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.listMine.queryKey(),
				})
				.catch(() => undefined);
		});
	}, [enabled, queryClient]);
}
