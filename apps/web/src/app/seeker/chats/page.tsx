"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/bambi/require-auth";
import { SeekerChats } from "@/components/bambi/screens/seeker";
import { SeekerChatListResponsive } from "@/components/bambi/screens/seeker-chat-list-responsive";

export default function SeekerChatsPage() {
	const router = useRouter();
	return (
		<RequireAuth>
			<SeekerChatListResponsive
				onFallback={() => (
					<SeekerChats
						onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
					/>
				)}
				onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
			/>
		</RequireAuth>
	);
}
