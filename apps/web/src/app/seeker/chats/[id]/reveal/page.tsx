"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { ContactReveal } from "@/components/bambi/screens/contact-reveal";

export default function SeekerRevealPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	return (
		<ContactReveal
			onBack={() => router.push(`/seeker/chats/${id}` as Route)}
			onDone={() => router.push(`/seeker/chats/${id}` as Route)}
			roomId={id}
		/>
	);
}
