"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { orpc } from "@/utils/orpc";
import {
	mergeChatMessagesById,
	resolveOldestChatMessageCursor,
} from "./chat-room-messages";

type ChatRoomMessage = Awaited<
	ReturnType<AppRouterClient["bambi"]["chats"]["getById"]>
>["messages"][number];

interface OlderChatMessagesInput {
	// 최신 페이지가 내려 준 커서 — 아직 한 번도 안 눌렀을 때 "더 있는지"의 근거.
	latestPageCursor: unknown;
	// 앞이 늘어나기 직전에 부른다 — 스크롤 앵커를 잡을 기회.
	onBeforePrepend: () => void;
	onError: (message: string) => void;
	pageSize: number;
	roomId: string;
}

/**
 * "이전 메시지 더 보기" — (createdAt, id) keyset 커서로 앞 페이지를 하나씩 쌓는다.
 * 지난 이력은 불변이라 소켓마다 다시 받을 이유가 없어 화면 상태로 들고 있고, 매 이벤트에
 * 다시 받는 건 최신 페이지뿐이다. 예전의 "limit을 500까지 키우기"와 달리 상한이 없다.
 */
export function useOlderChatMessages({
	latestPageCursor,
	onBeforePrepend,
	onError,
	pageSize,
	roomId,
}: OlderChatMessagesInput): {
	canLoadOlder: boolean;
	isLoadingOlder: boolean;
	// 커서만 뽑으므로 화면이 쓰는 좁은 메시지 타입도 그대로 받는다.
	loadOlder: (
		loadedMessages: readonly { createdAt: Date | string; id: string }[]
	) => void;
	olderMessages: ChatRoomMessage[];
} {
	const queryClient = useQueryClient();
	const [olderMessages, setOlderMessages] = useState<ChatRoomMessage[]>([]);
	// 마지막 커서 페이지가 끝을 알려 준 상태. 그 전까지는 최신 페이지의 nextCursor가
	// "이전 메시지가 더 있는지"의 근거다.
	const [olderExhausted, setOlderExhausted] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [trackedRoomId, setTrackedRoomId] = useState(roomId);

	// 방을 갈아타면 이전 방의 이력을 그대로 쓰면 안 된다(같은 라우트라 컴포넌트가 재사용된다).
	// effect가 아니라 렌더 중 조정이라, 남의 방 메시지가 한 프레임도 비치지 않는다.
	if (trackedRoomId !== roomId) {
		setTrackedRoomId(roomId);
		setOlderMessages([]);
		setOlderExhausted(false);
	}

	const loadOlder = useCallback(
		(loadedMessages: readonly { createdAt: Date | string; id: string }[]) => {
			const cursor = resolveOldestChatMessageCursor(loadedMessages);

			// 재진입은 버튼의 disabled가 막는다. 새어 들어와도 같은 페이지라 id 병합이 흡수한다.
			if (!cursor) {
				return;
			}

			setIsLoadingOlder(true);
			queryClient
				.fetchQuery(
					orpc.bambi.chats.getById.queryOptions({
						input: { cursor, id: roomId, limit: pageSize },
					})
				)
				.then((page) => {
					onBeforePrepend();
					setOlderMessages((current) =>
						mergeChatMessagesById(page.messages, current)
					);
					setOlderExhausted(!page.nextCursor);
				})
				.catch(() => {
					onError("이전 메시지를 불러오지 못했어요.");
				})
				.finally(() => {
					setIsLoadingOlder(false);
				});
		},
		[onBeforePrepend, onError, pageSize, queryClient, roomId]
	);

	return {
		canLoadOlder: Boolean(latestPageCursor) && !olderExhausted,
		isLoadingOlder,
		loadOlder,
		olderMessages,
	};
}
