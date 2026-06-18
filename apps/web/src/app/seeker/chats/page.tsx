"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { SeekerChats } from "@/components/bambi/screens/seeker";

export default function SeekerChatsPage() {
	const router = useRouter();
	return (
		<SeekerChats
			onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
		/>
	);
}
