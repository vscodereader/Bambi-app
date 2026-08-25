"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export type PointJobCategory = "premium" | "recommended" | "special";
export type PointJobTargetSource = "crawled_job_post" | "job_post";

export function PointJobSticker() {
	return (
		<Badge className="pointer-events-none absolute top-2 left-2 z-20 bg-primary text-primary-foreground shadow-sm">
			<CircleDollarSign aria-hidden="true" />
			POINT
		</Badge>
	);
}

export function usePointJobReward({
	category,
	targetId,
	targetSource,
}: {
	category: PointJobCategory;
	targetId: string;
	targetSource: PointJobTargetSource;
}) {
	const session = authClient.useSession();
	const client = useQueryClient();
	const currentQueryOptions =
		orpc.bambi.pointJobRewards.getCurrent.queryOptions();
	const current = useQuery({
		...currentQueryOptions,
		enabled: Boolean(session.data?.user),
		queryKey: [...currentQueryOptions.queryKey, session.data?.user.id],
		retry: false,
	});
	const selection = current.data?.selections.find(
		(item) =>
			item.category === category &&
			item.targetId === targetId &&
			item.targetSource === targetSource &&
			item.eligible
	);
	const claim = useMutation(
		orpc.bambi.pointJobRewards.claim.mutationOptions({
			onSuccess: async (result) => {
				if (result.awarded > 0) {
					toast.success(
						`${result.awarded.toLocaleString("ko-KR")}포인트를 받았어요.`
					);
				}
				await client.invalidateQueries({
					queryKey: orpc.bambi.pointJobRewards.key(),
				});
				await client.invalidateQueries({
					queryKey: orpc.bambi.attendance.key(),
				});
			},
		})
	);
	return {
		claim: () => {
			if (selection && !claim.isPending) {
				claim.mutate({ category, targetId, targetSource });
			}
		},
		points: selection?.rewardPoints ?? 0,
	};
}
