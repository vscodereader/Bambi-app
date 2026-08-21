"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { buildMonthGrid, shiftMonth } from "@/lib/bambi/attendance-calendar";
import { orpc } from "@/utils/orpc";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function AttendanceRestoreDialog(): React.JSX.Element {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [month, setMonth] = useState<null | string>(null);
	const [selected, setSelected] = useState<null | string>(null);
	const mineQuery = useQuery({
		...orpc.bambi.attendance.getMine.queryOptions({
			input: month ? { month } : {},
		}),
		enabled: open,
	});
	const restore = useMutation(
		orpc.bambi.attendance.restoreDate.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "출석을 복구하지 못했어요."),
			onSuccess: async (result) => {
				toast.success(
					result.drawTicketAwarded
						? "출석을 복구해 7일 연속 출석을 완성했고 뽑기권 1장을 받았어요."
						: "출석을 복구했어요."
				);
				setOpen(false);
				setSelected(null);
				await queryClient.invalidateQueries({ queryKey: orpc.bambi.key() });
			},
		})
	);
	const data = mineQuery.data;
	const viewMonth = data?.month;
	const attended = new Set(data?.attendedDates ?? []);
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button size="sm" type="button" />}>
				사용하기
			</DialogTrigger>
			<DialogContent>
				<DialogTitle>출석 복구권 사용</DialogTitle>
				<DialogDescription>
					과거 미출석일 한 날짜만 선택할 수 있어요. 복구 출석에는 일반 출석
					포인트가 지급되지 않아요.
				</DialogDescription>
				{viewMonth ? (
					<>
						<div className="flex items-center justify-between gap-2">
							<Button
								aria-label="이전 달"
								onClick={() => setMonth(shiftMonth(viewMonth, -1))}
								size="icon-sm"
								variant="outline"
							>
								<ChevronLeftIcon />
							</Button>
							<strong>{`${viewMonth.slice(0, 4)}년 ${Number(viewMonth.slice(5, 7))}월`}</strong>
							<Button
								aria-label="다음 달"
								disabled={viewMonth >= data.today.slice(0, 7)}
								onClick={() => setMonth(shiftMonth(viewMonth, 1))}
								size="icon-sm"
								variant="outline"
							>
								<ChevronRightIcon />
							</Button>
						</div>
						<div className="grid grid-cols-7 gap-1">
							{WEEKDAYS.map((weekday) => (
								<span
									className="py-1 text-center text-muted-foreground text-xs"
									key={weekday}
								>
									{weekday}
								</span>
							))}
							{buildMonthGrid(viewMonth).map((cell) => {
								if (!cell.date) {
									return <span key={cell.key} />;
								}
								const canSelect =
									cell.date < data.today && !attended.has(cell.date);
								return (
									<button
										aria-pressed={selected === cell.date}
										className={cn(
											"aspect-square rounded-md border text-sm",
											attended.has(cell.date)
												? "bg-muted text-muted-foreground"
												: "font-semibold text-foreground",
											selected === cell.date &&
												"border-primary bg-primary/10 text-primary"
										)}
										disabled={!canSelect}
										key={cell.key}
										onClick={() => setSelected(cell.date)}
										type="button"
									>
										{Number(cell.date.slice(8, 10))}
									</button>
								);
							})}
						</div>
					</>
				) : null}
				<div className="flex justify-end gap-2">
					<Button onClick={() => setOpen(false)} variant="outline">
						취소
					</Button>
					<Button
						disabled={!selected || restore.isPending}
						onClick={() => selected && restore.mutate({ attendedOn: selected })}
					>
						{restore.isPending ? "저장 중…" : "저장"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
