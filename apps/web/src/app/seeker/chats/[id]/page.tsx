"use client";

import { useParams, useRouter } from "next/navigation";
import { SeekerChat } from "@/components/bambi/screens/seeker";
import { SeekerChatRoomResponsive } from "@/components/bambi/screens/seeker-chat-room-responsive";
import { isApiJobId } from "@/lib/bambi/api-jobs";
import { JOBS } from "@/lib/bambi/data";

export default function SeekerChatPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	if (isApiJobId(id)) {
		// 실서비스: 연락처 공개는 채팅방 안 요청/응답 흐름으로 처리한다(별도 reveal 라우트 없음).
		return (
			<SeekerChatRoomResponsive
				onBack={() => router.push("/seeker/chats")}
				roomId={id}
			/>
		);
	}
	const job = JOBS.find((j) => j.id === id);
	// 목(프로토타입) 경로. reveal 라우트가 제거돼 목 공개 버튼은 동작하지 않는다.
	return (
		<SeekerChat
			job={job}
			onBack={() => router.push("/seeker/chats")}
			onReveal={() => {
				// no-op: reveal 라우트 제거됨
			}}
		/>
	);
}
