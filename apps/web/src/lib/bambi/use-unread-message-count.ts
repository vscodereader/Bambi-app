"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { connectBambiChatSocket } from "@/lib/bambi-chat-realtime";
import { orpc } from "@/utils/orpc";

// 헤더 채팅 버튼과 모바일 하단 탭이 공유하는 안 읽은 메시지 총합 훅.
// 새 메시지·읽음 처리 신호를 받으면 서버 정본을 다시 조회해 중복 증감을 피한다.
export function useUnreadMessageCount(): number {
	const { isAuthenticated } = useBambiAuth();
	const queryClient = useQueryClient();
	const query = useQuery({
		...orpc.bambi.chats.unreadState.queryOptions(),
		enabled: isAuthenticated,
	});

	useEffect(() => {
		if (!isAuthenticated) {
			return;
		}

		const socket = connectBambiChatSocket();
		const refresh = () => {
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.unreadState.queryKey(),
				})
				.catch(() => undefined);
		};

		socket.on("chat:list:updated", refresh);

		return () => {
			socket.off("chat:list:updated", refresh);
		};
	}, [isAuthenticated, queryClient]);

	return query.data?.unreadMessageCount ?? 0;
}
