"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

export default function ModeratorEmployersPage() {
	const queryClient = useQueryClient();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const pendingQuery = useQuery(
		orpc.bambi.moderation.listPendingEmployers.queryOptions()
	);
	const decide = useMutation(
		orpc.bambi.moderation.setEmployerVerificationStatus.mutationOptions({
			onSuccess: async () => {
				toast.success("처리했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listPendingEmployers.queryKey(),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const employers = pendingQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
			<h1 className="m-0 font-extrabold text-2xl">업소 승인 대기</h1>
			{employers.length === 0 ? (
				<EmptyState
					description="새로운 가입 신청이 들어오면 이곳에서 심사할 수 있어요."
					title="대기 중인 업소가 없어요"
				/>
			) : null}
			{employers.map((employer) => (
				<Card key={employer.organizationId}>
					<CardHeader>
						<CardTitle>{employer.displayName}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="m-0 text-muted-foreground text-sm">
							{employer.ownerEmail}
							{employer.businessRegistrationNumber
								? ` · 사업자 ${employer.businessRegistrationNumber}`
								: ""}
						</p>
						<Input
							onChange={(event) =>
								setNotes((prev) => ({
									...prev,
									[employer.organizationId]: event.target.value,
								}))
							}
							placeholder="반려 사유(반려 시 필수)"
							value={notes[employer.organizationId] ?? ""}
						/>
						<div className="flex gap-2">
							<Button
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({
										organizationId: employer.organizationId,
										status: "verified",
										reason: "서류 확인 완료",
									})
								}
							>
								승인
							</Button>
							<Button
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({
										organizationId: employer.organizationId,
										status: "rejected",
										reason:
											notes[employer.organizationId]?.trim() ||
											"정보 확인 불가",
									})
								}
								variant="secondary"
							>
								반려
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
