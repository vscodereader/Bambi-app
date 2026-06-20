"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { QueueList } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorQueuePage() {
	const router = useRouter();
	const { queue, selected, toggleSelect } = useMod();
	return (
		<QueueList
			items={queue}
			onOpen={(item) => router.push(`/moderator/queue/${item.id}` as Route)}
			onToggle={toggleSelect}
			selected={selected}
		/>
	);
}
