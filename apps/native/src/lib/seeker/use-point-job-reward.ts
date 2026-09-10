import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";

import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/src/lib/orpc";

export function usePointJobReward(input: {
	category: "premium" | "recommended" | "special";
	targetId: string;
	targetSource: "crawled_job_post" | "job_post";
}) {
	const session = authClient.useSession();
	const current = useQuery({
		...orpc.bambi.pointJobRewards.getCurrent.queryOptions(),
		enabled: Boolean(session.data?.user),
		retry: false,
	});
	const selection = current.data?.selections.find(
		(item) =>
			item.category === input.category &&
			item.targetId === input.targetId &&
			item.targetSource === input.targetSource &&
			item.eligible
	);
	const claim = useMutation(
		orpc.bambi.pointJobRewards.claim.mutationOptions({
			onError: (error) => Alert.alert("포인트를 받지 못했어요", error.message),
			onSuccess: async (result) => {
				if (result.awarded > 0) {
					Alert.alert(
						"포인트를 받았어요",
						`${result.awarded.toLocaleString("ko-KR")}포인트가 적립됐어요.`
					);
				}
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointJobRewards.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.key(),
					}),
				]);
			},
		})
	);
	return {
		claim: () => {
			if (selection && !claim.isPending) {
				claim.mutate(input);
			}
		},
		isPending: claim.isPending,
		points: selection?.rewardPoints ?? 0,
	};
}
