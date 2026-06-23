"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { SeekerChat } from "@/components/bambi/screens/seeker";
import { SeekerChatRoomResponsive } from "@/components/bambi/screens/seeker-chat-room-responsive";
import { isApiJobId } from "@/lib/bambi/api-jobs";
import { JOBS } from "@/lib/bambi/data";

export default function SeekerChatPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	if (isApiJobId(id)) {
		return (
			<SeekerChatRoomResponsive
				onBack={() => router.push("/seeker/chats")}
				onReveal={() => router.push(`/seeker/chats/${id}/reveal` as Route)}
				roomId={id}
			/>
		);
	}
	const job = JOBS.find((j) => j.id === id);
	return (
		<SeekerChat
			job={job}
			onBack={() => router.push("/seeker/chats")}
			onReveal={() => router.push(`/seeker/chats/${id}/reveal` as Route)}
		/>
	);
}
