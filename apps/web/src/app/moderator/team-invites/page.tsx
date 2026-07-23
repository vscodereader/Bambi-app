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
import { organizationRoleLabel } from "@/lib/bambi/team-labels";
import { orpc } from "@/utils/orpc";

export default function ModeratorTeamInvitesPage() {
	const queryClient = useQueryClient();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const pendingQuery = useQuery(
		orpc.bambi.moderation.listPendingTeamInvitations.queryOptions({ input: {} })
	);
	const decide = useMutation(
		orpc.bambi.moderation.setTeamInvitationStatus.mutationOptions({
			onSuccess: async () => {
				toast.success("처리했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listPendingTeamInvitations.queryKey({
						input: {},
					}),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const invites = pendingQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">팀 합류 승인 대기</h1>
			{invites.length === 0 ? (
				<EmptyState
					description="구인자가 팀에 멤버를 초대하면 이곳에서 승인할 수 있어요."
					title="대기 중인 팀 합류 초대가 없어요"
				/>
			) : null}
			{invites.map((invite) => (
				<Card key={invite.id}>
					<CardHeader>
						<CardTitle>
							{invite.organizationName ?? "이름 없는 업소"}
							{invite.teamName ? ` · ${invite.teamName}` : " · 조직 전체"}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="m-0 text-muted-foreground text-sm">
							{(invite.inviteeName ? `${invite.inviteeName} · ` : "") +
								invite.email}{" "}
							· {organizationRoleLabel(invite.role)}
							{invite.inviterName ? ` · 초대: ${invite.inviterName}` : ""}
							{invite.isExpired ? " · 만료됨" : ""}
						</p>
						<Input
							onChange={(event) =>
								setNotes((prev) => ({
									...prev,
									[invite.id]: event.target.value,
								}))
							}
							placeholder="반려 사유(반려 시 필수)"
							value={notes[invite.id] ?? ""}
						/>
						<div className="flex gap-2">
							<Button
								disabled={decide.isPending || invite.isExpired}
								onClick={() =>
									decide.mutate({
										invitationId: invite.id,
										status: "accepted",
									})
								}
							>
								승인
							</Button>
							<Button
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({
										invitationId: invite.id,
										status: "rejected",
										reason: notes[invite.id]?.trim() || "정보 확인 불가",
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
