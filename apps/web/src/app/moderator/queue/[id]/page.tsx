"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { QueueDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorQueueDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { queue, resolveQueue } = useMod();
	const item = queue.find((q) => q.id === id);

	useEffect(() => {
		if (!item) {
			router.replace("/moderator");
		}
	}, [item, router]);

	if (!item) {
		return null;
	}
	return (
		<QueueDetail
			item={item}
			onBack={() => router.push("/moderator")}
			onResolve={(qid, action) => {
				resolveQueue(qid, action);
				router.push("/moderator");
			}}
			tone="calm"
		/>
	);
}
