import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { orpc } from "@/src/lib/orpc";

import { connectChatSocket } from "./chat-socket";

/**
 * 채팅 탭 배지 총합(안 읽은 메시지 행 수, 서버 unreadState가 정본). 회원일 때만 켠다 —
 * unreadState는 protectedProcedure라 게스트에게 401이다. 소켓 chat:list:updated가
 * 오면 재조회하고, 소켓이 없어도 재진입·읽음 응답(useChatAutoRead)이 값을 맞춘다.
 */
export function useChatUnreadBadge(enabled: boolean): number {
	const queryClient = useQueryClient();
	const unreadQuery = useQuery({
		...orpc.bambi.chats.unreadState.queryOptions(),
		enabled,
	});

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const socket = connectChatSocket();
		const refresh = () => {
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.unreadState.queryKey(),
				})
				.catch(() => undefined);
		};

		socket.on("chat:list:updated", refresh);
		socket.on("connect", refresh);

		return () => {
			socket.off("chat:list:updated", refresh);
			socket.off("connect", refresh);
		};
	}, [enabled, queryClient]);

	return unreadQuery.data?.unreadMessageCount ?? 0;
}
