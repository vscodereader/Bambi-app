"use client";

import { useParams, useRouter } from "next/navigation";
import { ModeratorPaymentPanel } from "@/components/bambi/moderator-payment-panel";
import { QueueDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorQueueDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isLoading, queue, resolveQueue } = useMod();
	const item = queue.find((q) => q.id === id);

	if (isLoading) {
		return null;
	}

	if (!item) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="m-0 font-bold text-[15px] text-foreground">
					검수 공고를 찾을 수 없어요.
				</p>
				<button
					className="h-10 rounded-xl border border-border bg-card px-4 font-bold text-[13px] text-foreground"
					onClick={() => router.push("/moderator")}
					type="button"
				>
					목록으로
				</button>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<QueueDetail
				item={item}
				onBack={() => router.push("/moderator")}
				onResolve={(qid, action) => {
					resolveQueue(qid, action);
					router.push("/moderator");
				}}
				tone="calm"
			/>
			<ModeratorPaymentPanel jobPostId={item.id} />
		</div>
	);
}
