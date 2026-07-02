"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { ContactReveal } from "@/components/bambi/screens/contact-reveal";
import { JOBS } from "@/lib/bambi/data";

export default function SeekerRevealPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const job = JOBS.find((j) => j.id === id);
	return (
		<ContactReveal
			job={job}
			onBack={() => router.push(`/seeker/chats/${id}` as Route)}
			onDone={() => router.push("/seeker")}
		/>
	);
}
