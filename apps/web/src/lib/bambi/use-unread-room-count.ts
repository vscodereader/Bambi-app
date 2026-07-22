"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { connectBambiChatSocket } from "@/lib/bambi-chat-realtime";
import { orpc } from "@/utils/orpc";

// 헤더 채팅 버튼 핀과 모바일 하단 탭 뱃지가 공유하는 "안 읽은 방 수" 훅.
// 로그인 상태에서만 조회하고, 채팅 목록 화면과 같은 방식으로 유저 채널의
// chat:list:updated를 받아(새 메시지·읽음 처리 모두 이 신호를 보낸다) 캐시를
// 무효화한다. 소켓은 앱 전역에서 하나만 쓰므로 중복 연결되지 않는다.
export function useUnreadRoomCount(): number {
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

	return query.data?.unreadRoomCount ?? 0;
}
