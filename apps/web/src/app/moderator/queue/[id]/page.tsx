"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { QueueDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";
import { orpc } from "@/utils/orpc";

export default function ModeratorQueueDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isLoading, queue, resolveQueue } = useMod();
	const item = queue.find((q) => q.id === id);
	// 이미지는 상세에서만 필요하다. 큐 목록(최대 50건)에 미디어 조인을 붙이지 않으려고
	// 여기서 공고 한 건만 따로 읽는다(getJobPostForAdmin은 미디어 세트를 그대로 내려준다).
	const mediaQuery = useQuery({
		...orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId: id },
		}),
		enabled: Boolean(item),
	});

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
				isMediaLoading={mediaQuery.isPending}
				item={item}
				media={{
					cover: mediaQuery.data?.media.cover ?? null,
					detail: mediaQuery.data?.media.detail ?? [],
				}}
				onBack={() => router.push("/moderator")}
				onResolve={(qid, action, reason) => {
					resolveQueue(qid, action, reason);
					router.push("/moderator");
				}}
				tone="calm"
			/>
		</div>
	);
}
