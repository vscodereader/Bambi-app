"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export default function EmployerPendingPage() {
	const queryClient = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const orgProfile = mineQuery.data?.employerOrganizationProfiles?.[0] ?? null;
	const status = orgProfile?.verificationStatus ?? "pending";

	const resubmit = useMutation(
		orpc.bambi.onboarding.requestEmployerVerification.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	return (
		<div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-10">
			{status === "rejected" ? (
				<Alert variant="destructive">
					<AlertTitle>가입이 반려되었어요</AlertTitle>
					<AlertDescription>
						{orgProfile?.verificationNote ??
							"제출하신 정보를 확인할 수 없었어요."}
					</AlertDescription>
				</Alert>
			) : (
				<Alert>
					<AlertTitle>운영자 심사 대기 중이에요</AlertTitle>
					<AlertDescription>
						업소 정보를 검토하고 있어요. 승인되면 구인 관리 기능을 이용할 수
						있어요.
					</AlertDescription>
				</Alert>
			)}
			{status === "rejected" && orgProfile ? (
				<Button
					disabled={resubmit.isPending}
					onClick={() =>
						resubmit.mutate({ organizationId: orgProfile.organizationId })
					}
				>
					재신청하기
				</Button>
			) : null}
		</div>
	);
}
