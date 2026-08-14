"use client";

// 밤비 — 출석체크 패널. /seeker/attendance·/employer/attendance 두 라우트가 그대로
// 재사용한다(역할별 문구 차이가 없어 컴포넌트를 나누지 않는다). 화면 요소는 오늘 버튼 +
// 월 달력 + 연속/총/포인트 스탯뿐이다(출석 1회당 10포인트 적립, 잔액은 서버 원장 합산).
// 달력은 라이브러리 없이 Tailwind 7열 grid로 직접 그린다(의존성 추가 금지).
// embedded=true면 MyPageShell 안에 들어간 상태 — 셸이 여백·제목을 주므로 자체 여백과 h1을 뺀다.

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { buildMonthGrid, shiftMonth } from "@/lib/bambi/attendance-calendar";
import { orpc } from "@/utils/orpc";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const monthLabel = (month: string): string =>
	`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;

export function AttendancePanel({ embedded = false }: { embedded?: boolean }) {
	const containerClass = cn(
		"flex w-full max-w-2xl flex-col gap-4",
		!embedded && "mx-auto px-5 py-6 md:px-6"
	);
	const queryClient = useQueryClient();
	// null이면 서버가 정한 이번 달(KST)을 본다 — 클라이언트가 "이번 달"을 따로 계산하면
	// 자정 전후 시계 차이로 서버와 다른 달을 요청하게 된다.
	const [month, setMonth] = useState<null | string>(null);

	const mineQuery = useQuery(
		orpc.bambi.attendance.getMine.queryOptions({
			input: month === null ? {} : { month },
		})
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
				// 달을 이동한 상태여도 모든 월 캐시를 함께 갱신한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.attendance.getMine.key(),
				});
			},
		})
	);

	if (mineQuery.isPending) {
		return (
			<div className={containerClass}>
				<Skeleton className="h-32 w-full rounded-xl" />
				<Skeleton className="h-80 w-full rounded-xl" />
			</div>
		);
	}

	if (mineQuery.isError || !mineQuery.data) {
		return (
			<div className={containerClass}>
				<EmptyState
					action={
						// 이전 달 요청이 실패하면 그 달에 갇힌다 — 이번 달로 되돌리고 다시 부른다.
						<Button
							onClick={() => {
								setMonth(null);
								mineQuery.refetch();
							}}
							type="button"
						>
							다시 시도
						</Button>
					}
					description="출석 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			</div>
		);
	}

	const {
		attendedDates,
		checkedInToday,
		grade,
		nextGrade,
		pointBalance,
		pointsToNext,
		streakDays,
		today,
		totalDays,
	} = mineQuery.data;
	const viewMonth = mineQuery.data.month;
	const attended = new Set(attendedDates);

	return (
		<div className={containerClass}>
			<div className="flex flex-col gap-1">
				{embedded ? null : (
					<h1 className="m-0 font-extrabold text-2xl">출석체크</h1>
				)}
				<p className="m-0 text-muted-foreground text-sm">
					하루에 한 번 출석 도장을 찍고 10포인트를 받아요.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">오늘 출석</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center justify-between gap-4">
					<dl className="m-0 flex flex-wrap gap-x-8 gap-y-3">
						<div className="flex flex-col gap-0.5">
							<dt className="m-0 text-muted-foreground text-xs">연속 출석</dt>
							<dd className="m-0 font-extrabold text-xl">{`${streakDays}일`}</dd>
						</div>
						<div className="flex flex-col gap-0.5">
							<dt className="m-0 text-muted-foreground text-xs">총 출석</dt>
							<dd className="m-0 font-extrabold text-xl">{`${totalDays}일`}</dd>
						</div>
						<div className="flex flex-col gap-0.5">
							<dt className="m-0 text-muted-foreground text-xs">포인트</dt>
							<dd className="m-0 flex flex-col gap-0.5">
								<span className="flex items-center gap-2 font-extrabold text-xl">
									{`${pointBalance.toLocaleString("ko-KR")}P`}
									<GradeBadge grade={grade} />
								</span>
								<span className="text-muted-foreground text-xs">
									{nextGrade
										? `${nextGrade.name}까지 ${pointsToNext?.toLocaleString("ko-KR")}P`
										: "최고 등급입니다"}
								</span>
							</dd>
						</div>
					</dl>
					<Button
						disabled={checkedInToday || checkIn.isPending}
						onClick={() => checkIn.mutate({})}
						size="lg"
					>
						{checkedInToday ? "오늘 출석 완료" : "출석하기"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between gap-2">
					<CardTitle className="text-base">{monthLabel(viewMonth)}</CardTitle>
					<div className="flex gap-1">
						<Button
							aria-label="이전 달"
							onClick={() => setMonth(shiftMonth(viewMonth, -1))}
							size="icon-sm"
							variant="outline"
						>
							<ChevronLeftIcon />
						</Button>
						<Button
							aria-label="다음 달"
							onClick={() => setMonth(shiftMonth(viewMonth, 1))}
							size="icon-sm"
							variant="outline"
						>
							<ChevronRightIcon />
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-7 gap-1">
						{WEEKDAY_LABELS.map((label) => (
							<div
								className="py-1 text-center font-bold text-muted-foreground text-xs"
								key={label}
							>
								{label}
							</div>
						))}
						{buildMonthGrid(viewMonth).map((cell) => {
							if (cell.date === null) {
								return <div key={cell.key} />;
							}

							// 출석·오늘이 배경색과 테두리로만 구분되면 스크린리더·색각이상 사용자에게
							// 전달되지 않는다(WCAG 1.4.1). 칸 안에 sr-only 텍스트를 같이 읽힌다 —
							// div는 generic role이라 aria-label이 무시되므로 텍스트로 넣는다.
							const marks = `${cell.date === today ? " 오늘" : ""}${
								attended.has(cell.date) ? " 출석" : ""
							}`;

							return (
								<div
									className={cn(
										"flex aspect-square items-center justify-center rounded-md border border-transparent text-sm",
										attended.has(cell.date)
											? "bg-primary/15 font-bold text-primary"
											: "text-muted-foreground",
										cell.date === today && "border-primary"
									)}
									key={cell.key}
								>
									{Number(cell.date.slice(8, 10))}
									{marks ? <span className="sr-only">{marks}</span> : null}
								</div>
							);
						})}
					</div>
					<p className="mt-3 mb-0 text-muted-foreground text-xs">
						색이 채워진 날이 출석한 날이에요. 테두리는 오늘이에요.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
