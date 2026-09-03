import {
	mergeChatMessagesById,
	resolveOldestChatMessageCursor,
} from "@bambi-app/api/services/bambi-chat-room-messages";
import {
	type UseQueryResult,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { orpc } from "@/src/lib/orpc";

import {
	buildChatTimeline,
	type ChatTimelineMessage,
	type OptimisticChatMessage,
} from "./chat-optimistic";
import {
	CHAT_MESSAGE_PAGE_SIZE,
	type ChatRoomDetail,
	type ChatRoomMessage,
} from "./chat-types";

/**
 * 최신 페이지(쿼리, 소켓마다 재조회) + 과거 페이지(커서로 쌓는 화면 상태, 불변 이력) +
 * 낙관적 메시지를 한 타임라인으로 합친다. web의 useOlderChatMessages를 inverted
 * FlatList의 onEndReached에 맞게 버튼 없이 호출하는 형태로 바꿨다.
 */
export function useChatMessages({
	optimistic,
	roomId,
}: {
	optimistic: readonly OptimisticChatMessage[];
	roomId: string;
}): {
	canLoadOlder: boolean;
	isLoadingOlder: boolean;
	loadOlder: () => void;
	room: ChatRoomDetail | undefined;
	roomQuery: UseQueryResult<ChatRoomDetail>;
	timeline: ChatTimelineMessage[];
} {
	const queryClient = useQueryClient();
	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({
			input: { id: roomId, limit: CHAT_MESSAGE_PAGE_SIZE },
		})
	);
	const [olderMessages, setOlderMessages] = useState<ChatRoomMessage[]>([]);
	const [olderExhausted, setOlderExhausted] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [trackedRoomId, setTrackedRoomId] = useState(roomId);

	// 방을 갈아타면 이전 방 이력을 버린다(같은 라우트라 컴포넌트가 재사용된다).
	if (trackedRoomId !== roomId) {
		setTrackedRoomId(roomId);
		setOlderMessages([]);
		setOlderExhausted(false);
	}

	const latestMessages = roomQuery.data?.messages;
	const serverMessages = useMemo(
		() => mergeChatMessagesById(olderMessages, latestMessages ?? []),
		[latestMessages, olderMessages]
	);
	const timeline = useMemo(
		() => buildChatTimeline({ optimistic, server: serverMessages }),
		[optimistic, serverMessages]
	);

	const loadOlder = useCallback(() => {
		if (isLoadingOlder) {
			return;
		}

		const cursor = resolveOldestChatMessageCursor(serverMessages);

		if (!cursor) {
			return;
		}

		setIsLoadingOlder(true);
		queryClient
			.fetchQuery(
				orpc.bambi.chats.getById.queryOptions({
					input: { cursor, id: roomId, limit: CHAT_MESSAGE_PAGE_SIZE },
				})
			)
			.then((page) => {
				setOlderMessages((current) =>
					mergeChatMessagesById(page.messages, current)
				);
				setOlderExhausted(!page.nextCursor);
			})
			.catch(() => {
				// 과거 로드 실패는 조용히 둔다 — 스크롤을 다시 올리면 재시도된다.
			})
			.finally(() => {
				setIsLoadingOlder(false);
			});
	}, [isLoadingOlder, queryClient, roomId, serverMessages]);

	return {
		canLoadOlder: Boolean(roomQuery.data?.hasMoreMessages) && !olderExhausted,
		isLoadingOlder,
		loadOlder,
		room: roomQuery.data,
		roomQuery,
		timeline,
	};
}
