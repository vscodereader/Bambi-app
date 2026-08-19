"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { orpc } from "@/utils/orpc";
import { ATTENDANCE_HREF } from "./my-page-shell";

export function MyPointsSummaryCard(): React.JSX.Element {
	const queryClient = useQueryClient();
	const mineQuery = useQuery(
		orpc.bambi.attendance.getMine.queryOptions({ input: {} })
	);
	const checkIn = useMutation(
		orpc.bambi.attendance.checkIn.mutationOptions({
			onError: (error) => toast.error(error.message || "출석하지 못했어요."),
			onSuccess: async (result) => {
				toast.success(
					result.alreadyAttended
						? "오늘은 이미 출석했어요."
						: `출석했어요. +${result.pointsAwarded} 포인트 적립!`
				);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.getMine.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.getMineHistory.key(),
					}),
				]);
			},
		})
	);

	if (mineQuery.isPending) {
		return <Skeleton className="h-24 w-full rounded-xl" />;
	}
	if (mineQuery.isError || !mineQuery.data) {
		return (
			<Card className="p-4 text-muted-foreground text-sm">
				포인트 정보를 불러오지 못했어요.
			</Card>
		);
	}

	const { checkedInToday, grade, nextGrade, pointBalance, pointsToNext } =
		mineQuery.data;

	return (
		<Card className="flex flex-col overflow-hidden sm:flex-row sm:items-stretch">
			<Link
				className="grid min-w-0 flex-1 grid-cols-3 gap-3 p-4 no-underline transition-colors hover:bg-secondary/50"
				href={ATTENDANCE_HREF}
			>
				<div className="min-w-0">
					<p className="m-0 text-muted-foreground text-xs">포인트</p>
					<p className="mt-1 mb-0 truncate font-extrabold text-base text-primary">
						{pointBalance.toLocaleString("ko-KR")}P
					</p>
				</div>
				<div className="min-w-0">
					<p className="m-0 text-muted-foreground text-xs">등급</p>
					<div className="mt-1 -ml-2">
						<GradeBadge grade={grade} />
					</div>
				</div>
				<div className="min-w-0">
					<p className="m-0 text-muted-foreground text-xs">다음 등급까지</p>
					<p className="mt-1 mb-0 text-foreground text-sm">
						{nextGrade
							? `${pointsToNext?.toLocaleString("ko-KR")}P 남음`
							: "최고 등급입니다"}
					</p>
				</div>
			</Link>
			<div className="flex items-center border-t px-4 py-3 sm:border-t-0 sm:border-l">
				<Button
					className="w-full sm:w-auto"
					disabled={checkedInToday || checkIn.isPending}
					onClick={() => checkIn.mutate({})}
					type="button"
				>
					{checkedInToday ? "출석 완료" : "출석하기"}
				</Button>
			</div>
		</Card>
	);
}
