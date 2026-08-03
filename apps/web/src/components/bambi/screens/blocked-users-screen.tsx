"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/bambi/ds";
import { EmptyState } from "@/components/bambi/empty-state";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { orpc } from "@/utils/orpc";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

function formatBlockedDate(value: Date | string): string {
	const parts = dateFormatter.formatToParts(new Date(value));
	const lookup = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";

	return `${lookup("year")}.${lookup("month")}.${lookup("day")}`;
}

export function BlockedUsersScreen() {
	const queryClient = useQueryClient();
	const [confirmingId, setConfirmingId] = useState<null | string>(null);
	const query = useQuery(orpc.bambi.blocks.listMine.queryOptions());
	const unblock = useMutation(
		orpc.bambi.blocks.unblockUser.mutationOptions({
			onError: () => {
				toast.error("차단 해제에 실패했어요");
			},
			onSuccess: async () => {
				setConfirmingId(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.blocks.listMine.queryKey(),
				});
				toast.success("차단을 해제했어요");
			},
		})
	);

	const blocks = query.data ?? [];

	return <MyPageShell title="차단한 상대">{renderBody()}</MyPageShell>;

	function renderBody() {
		if (query.isLoading) {
			return (
				<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
					{[0, 1, 2].map((index) => (
						<div
							className={
								index
									? "flex items-center gap-3 border-border border-t p-4"
									: "flex items-center gap-3 p-4"
							}
							key={index}
						>
							<Skeleton className="size-11 rounded-full" />
							<div className="flex-1">
								<Skeleton className="h-4 w-28 rounded-md" />
								<Skeleton className="mt-2 h-3 w-20 rounded-md" />
							</div>
							<Skeleton className="h-9 w-20 rounded-md" />
						</div>
					))}
				</div>
			);
		}

		if (blocks.length === 0) {
			return (
				<EmptyState
					description="채팅에서 차단한 상대가 여기에 표시됩니다."
					title="차단한 상대가 없어요"
				/>
			);
		}

		return (
			<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
				{blocks.map((block, index) => {
					const isConfirming = confirmingId === block.blockedUserId;
					const isPending =
						unblock.isPending &&
						unblock.variables?.blockedUserId === block.blockedUserId;

					return (
						<div
							className={
								index
									? "flex flex-col gap-3 border-border border-t p-4"
									: "flex flex-col gap-3 p-4"
							}
							key={block.blockedUserId}
						>
							<div className="flex items-center gap-3">
								<Avatar name={block.name} size="md" />
								<div className="min-w-0 flex-1">
									<div className="break-words font-semibold text-foreground text-sm">
										{block.name}
									</div>
									<div className="mt-0.5 text-muted-foreground text-xs">
										{formatBlockedDate(block.createdAt)} 차단
									</div>
								</div>
								{isConfirming ? null : (
									<Button
										onClick={() => setConfirmingId(block.blockedUserId)}
										size="sm"
										type="button"
										variant="outline"
									>
										차단 해제
									</Button>
								)}
							</div>
							{isConfirming ? (
								<div className="flex items-center justify-end gap-2">
									<Button
										disabled={isPending}
										onClick={() => setConfirmingId(null)}
										size="sm"
										type="button"
										variant="ghost"
									>
										취소
									</Button>
									<Button
										disabled={isPending}
										onClick={() =>
											unblock.mutate({ blockedUserId: block.blockedUserId })
										}
										size="sm"
										type="button"
										variant="outline"
									>
										{isPending ? "해제 중" : "차단 해제"}
									</Button>
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		);
	}
}
