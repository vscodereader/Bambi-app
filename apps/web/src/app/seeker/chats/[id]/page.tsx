"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SeekerChatRoomResponsive } from "@/components/bambi/screens/seeker-chat-room-responsive";
import { isApiJobId } from "@/lib/bambi/api-jobs";

export default function SeekerChatPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	// 실서비스 채팅방 id는 UUID다. 그 외(옛 목 프로토타입 id 등)는 유효한 방이 아니므로
	// 채팅 목록으로 돌려보낸다. 연락처 공개는 채팅방 안 요청/응답 흐름으로 처리한다.
	const isRealRoom = isApiJobId(id);
	useEffect(() => {
		if (!isRealRoom) {
			router.replace("/seeker/chats");
		}
	}, [isRealRoom, router]);

	if (!isRealRoom) {
		return null;
	}

	return (
		<SeekerChatRoomResponsive
			onBack={() => router.push("/seeker/chats")}
			roomId={id}
		/>
	);
}
