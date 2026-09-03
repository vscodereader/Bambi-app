import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { orpc } from "@/src/lib/orpc";

import {
	type ChatReadWatermark,
	canFlushChatRead,
	resolveNextChatReadWatermark,
} from "./chat-read-watermark";
import type { ChatRoomListItem } from "./chat-types";

// 읽음 기준선 합치기 지연. 수신이 몰려도 markRead는 이 창 안에서 최신 기준선 하나로 접힌다.
const MARK_READ_COALESCE_MS = 300;

const zeroUnreadCountForRoom = (
	rooms: ChatRoomListItem[] | undefined,
	roomId: string
): ChatRoomListItem[] | undefined =>
	rooms?.map((room) =>
		room.id === roomId ? { ...room, unreadCount: 0 } : room
	);

/**
 * 보고 있는 방의 자동 읽음(web useChatRoomAutoRead의 native판). 기준은
 * isActive(화면 포커스 + 앱 active) — 백그라운드에서는 목록 배지를 그대로 두고
 * 돌아온 순간 밀린 기준선 하나로 읽음 처리한다.
 * 서버 markRead는 upToMessageId를 무시하고 방 전체를 읽음 처리하므로 기준선은
 * "마지막으로 알게 된 메시지 하나"면 충분하다.
 */
export function useChatAutoRead({
	chatRoomId,
	isActive,
}: {
	chatRoomId: string;
	isActive: boolean;
}): {
	markReadNow: (messageId: null | string) => void;
	queueMarkRead: (messageId: null | string) => void;
	reassertMarkRead: () => void;
} {
	const queryClient = useQueryClient();
	const markReadMutation = useMutation(
		orpc.bambi.chats.markRead.mutationOptions({
			// 왕복 사이에 목록이 다시 그려져도 방금 읽은 방의 배지가 깜빡이지 않게 먼저 0.
			onMutate: () => {
				queryClient.setQueryData(
					orpc.bambi.chats.listMine.queryKey(),
					(rooms: ChatRoomListItem[] | undefined) =>
						zeroUnreadCountForRoom(rooms, chatRoomId)
				);
			},
			onSuccess: (data) => {
				// 탭 배지는 서버가 방금 센 총합으로 즉시 덮는다(무효화만으론 늦은 응답이 이긴다).
				queryClient.setQueryData(orpc.bambi.chats.unreadState.queryKey(), {
					unreadMessageCount: data.totalUnreadMessageCount,
				});
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMine.queryKey(),
					})
					.catch(() => undefined);
			},
		})
	);
	const latestRef = useRef<ChatReadWatermark | null>(null);
	const sentMessageIdRef = useRef<null | string>(null);
	const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
	const isActiveRef = useRef(isActive);
	const mutateAsyncRef = useRef(markReadMutation.mutateAsync);

	useEffect(() => {
		isActiveRef.current = isActive;
		mutateAsyncRef.current = markReadMutation.mutateAsync;
	}, [isActive, markReadMutation.mutateAsync]);

	const flush = useCallback(() => {
		const attemptedMessageIds = new Set<string>();

		// 한 번의 markRead 시도. 더 새 안읽음이 남아 루프를 이어야 하면 true.
		const step = async (): Promise<boolean> => {
			const latest = latestRef.current;

			if (
				!canFlushChatRead(latest, sentMessageIdRef.current, attemptedMessageIds)
			) {
				return false;
			}

			attemptedMessageIds.add(latest.messageId);
			sentMessageIdRef.current = latest.messageId;

			try {
				const result = await mutateAsyncRef.current({
					chatRoomId: latest.chatRoomId,
					upToMessageId: latest.messageId,
				});
				const nextMessageId = resolveNextChatReadWatermark({
					attemptedMessageId: latest.messageId,
					latestUnreadMessageId: result.latestUnreadMessageId,
				});

				if (!nextMessageId || result.unreadCount === 0) {
					return false;
				}

				latestRef.current = {
					chatRoomId: latest.chatRoomId,
					messageId: nextMessageId,
				};
				sentMessageIdRef.current = null;
				return true;
			} catch {
				if (sentMessageIdRef.current === latest.messageId) {
					sentMessageIdRef.current = null;
				}
				return false;
			}
		};

		const run = async () => {
			while (isActiveRef.current) {
				if (!(await step())) {
					return;
				}
			}
		};

		run().catch(() => undefined);
	}, []);

	const flushSoon = useCallback(() => {
		if (timerRef.current !== null) {
			return;
		}

		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			flush();
		}, MARK_READ_COALESCE_MS);
	}, [flush]);

	const markReadNow = useCallback(
		(messageId: null | string) => {
			if (!messageId) {
				return;
			}

			latestRef.current = { chatRoomId, messageId };
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			flush();
		},
		[chatRoomId, flush]
	);

	const queueMarkRead = useCallback(
		(messageId: null | string) => {
			if (!messageId) {
				return;
			}

			latestRef.current = { chatRoomId, messageId };

			if (isActiveRef.current) {
				flushSoon();
			}
		},
		[chatRoomId, flushSoon]
	);

	// chat:unread:updated가 "아직 0이 아니다"를 알리면 같은 기준선이라도 다시 보낸다.
	// markRead 성공이 0 신호를 만들므로 루프는 돌지 않는다.
	const reassertMarkRead = useCallback(() => {
		if (latestRef.current?.chatRoomId !== chatRoomId) {
			return;
		}

		sentMessageIdRef.current = null;

		if (isActiveRef.current) {
			flushSoon();
		}
	}, [chatRoomId, flushSoon]);

	// 백그라운드에서 돌아오면 밀린 기준선을 바로 흘린다.
	useEffect(() => {
		if (isActive && latestRef.current) {
			flushSoon();
		}
	}, [flushSoon, isActive]);

	useEffect(
		() => () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
		},
		[]
	);

	return { markReadNow, queueMarkRead, reassertMarkRead };
}
