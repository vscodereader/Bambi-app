"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { SeekerChats } from "@/components/bambi/screens/seeker";
import { SeekerChatListResponsive } from "@/components/bambi/screens/seeker-chat-list-responsive";

export default function SeekerChatsPage() {
	const router = useRouter();
	return (
		<SeekerChatListResponsive
			onFallback={() => (
				<SeekerChats
					onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
				/>
			)}
			onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
		/>
	);
}
