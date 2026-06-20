"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { SeekerHome } from "@/components/bambi/screens/seeker";

export default function SeekerHomePage() {
	const router = useRouter();
	return (
		<SeekerHome
			onChatJob={(j) => router.push(`/seeker/chats/${j.id}` as Route)}
			onOpenJob={(j) => router.push(`/seeker/jobs/${j.id}` as Route)}
		/>
	);
}
