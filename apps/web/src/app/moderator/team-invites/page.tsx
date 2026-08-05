"use client";

// 밤비 — 운영자 팀 합류 승인. 상태(대기·승인·반려) 탭으로 조회 범위를 바꾸고,
// 서버가 offset 기반으로 페이지를 잘라 준다(받은 건수가 페이지 크기보다 적으면 마지막 쪽).
// 승인·반려는 대기 건에만 열려 있다(서버도 pending이 아니면 CONFLICT).

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { organizationRoleLabel } from "@/lib/bambi/team-labels";
import { orpc } from "@/utils/orpc";

type InviteStatus = "pending" | "accepted" | "rejected";

const STATUS_TABS: { value: InviteStatus; label: string }[] = [
	{ value: "pending", label: "대기" },
	{ value: "accepted", label: "승인" },
	{ value: "rejected", label: "반려" },
];

// 상태 배지 라벨(원값 노출 금지).
const STATUS_BADGE: Record<
	InviteStatus,
	{ label: string; variant: "secondary" | "success" | "destructive" }
> = {
	accepted: { label: "승인 완료", variant: "success" },
	pending: { label: "승인 대기", variant: "secondary" },
	rejected: { label: "반려", variant: "destructive" },
};

const PAGE_SIZE = 20;

const EMPTY_DESCRIPTION: Record<InviteStatus, string> = {
	accepted: "승인 처리한 팀 합류 초대가 아직 없어요.",
	pending: "구인자가 팀에 멤버를 초대하면 이곳에서 승인할 수 있어요.",
	rejected: "반려 처리한 팀 합류 초대가 아직 없어요.",
};

export default function ModeratorTeamInvitesPage() {
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<InviteStatus>("pending");
	const [page, setPage] = useState(0);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const queryInput = { limit: PAGE_SIZE, offset: page * PAGE_SIZE, status };
	const invitesQuery = useQuery(
		orpc.bambi.moderation.listPendingTeamInvitations.queryOptions({
			input: queryInput,
		})
	);
	const decide = useMutation(
		orpc.bambi.moderation.setTeamInvitationStatus.mutationOptions({
			onSuccess: async (_result, variables) => {
				toast.success("처리했어요.");
				// 처리한 건의 반려 사유 입력값을 남겨두면 다음 건에 그대로 붙어 보인다.
				setNotes((prev) => {
					const { [variables.invitationId]: _removed, ...rest } = prev;
					return rest;
				});
				// 상태가 바뀌면 다른 탭 목록도 달라지므로 입력 키 전체를 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listPendingTeamInvitations.key(),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const invites = invitesQuery.data ?? [];
	const hasNextPage = invites.length === PAGE_SIZE;

	const switchStatus = (value: string) => {
		setStatus(value as InviteStatus);
		setPage(0);
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">팀 합류 승인</h1>
			<Tabs onValueChange={switchStatus} value={status}>
				<TabsList className="max-w-full flex-wrap">
					{STATUS_TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{invites.length === 0 ? (
				<EmptyState
					description={EMPTY_DESCRIPTION[status]}
					title="표시할 팀 합류 초대가 없어요"
				/>
			) : null}
			{invites.map((invite) => {
				const badge = STATUS_BADGE[status];
				const rejectNote = (notes[invite.id] ?? "").trim();
				return (
					<Card key={invite.id}>
						<CardHeader className="gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>
									{invite.organizationName ?? "이름 없는 업소"}
									{invite.teamName ? ` · ${invite.teamName}` : " · 조직 전체"}
								</CardTitle>
								<Badge className="ml-auto" variant={badge.variant}>
									{badge.label}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<p className="m-0 text-muted-foreground text-sm">
								{(invite.inviteeName ? `${invite.inviteeName} · ` : "") +
									invite.email}{" "}
								· {organizationRoleLabel(invite.role)}
								{invite.inviterName ? ` · 초대: ${invite.inviterName}` : ""}
								{invite.isExpired ? " · 만료됨" : ""}
							</p>
							{invite.inviteReason ? (
								<p className="m-0 text-sm">
									<span className="font-medium">초대 사유</span> ·{" "}
									{invite.inviteReason}
								</p>
							) : (
								<p className="m-0 text-muted-foreground text-sm">
									초대 사유가 적혀 있지 않아요.
								</p>
							)}
							{invite.rejectionReason ? (
								<p className="m-0 text-muted-foreground text-sm">
									반려 사유: {invite.rejectionReason}
								</p>
							) : null}
							{status === "pending" ? (
								<>
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
													reason: rejectNote || "정보 확인 불가",
												})
											}
											variant="secondary"
										>
											반려
										</Button>
									</div>
								</>
							) : null}
						</CardContent>
					</Card>
				);
			})}
			<div className="flex items-center justify-between gap-2">
				<Button
					disabled={page === 0}
					onClick={() => setPage((prev) => Math.max(0, prev - 1))}
					variant="outline"
				>
					이전
				</Button>
				<span className="text-muted-foreground text-sm">{page + 1} 페이지</span>
				<Button
					disabled={!hasNextPage}
					onClick={() => setPage((prev) => prev + 1)}
					variant="outline"
				>
					다음
				</Button>
			</div>
		</div>
	);
}
