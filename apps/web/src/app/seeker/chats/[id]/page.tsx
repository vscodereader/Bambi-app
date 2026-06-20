"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { SeekerChat } from "@/components/bambi/screens/seeker";
import { JOBS } from "@/lib/bambi/data";

export default function SeekerChatPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const job = JOBS.find((j) => j.id === id);
	return (
		<SeekerChat
			job={job}
			onBack={() => router.push("/seeker/chats")}
			onReveal={() => router.push(`/seeker/chats/${id}/reveal` as Route)}
		/>
	);
}
