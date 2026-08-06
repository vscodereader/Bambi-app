"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
} from "lucide-react";
import { useMemo, useState } from "react";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const toKstDate = (date: Date) => new Date(date.getTime() + KST_OFFSET_MS);
const fromKstParts = (
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number
) => new Date(Date.UTC(year, month, day, hour - 9, minute));
const parts = (date: Date) => {
	const kst = toKstDate(date);
	return {
		day: kst.getUTCDate(),
		hour: kst.getUTCHours(),
		minute: kst.getUTCMinutes(),
		month: kst.getUTCMonth(),
		year: kst.getUTCFullYear(),
	};
};
const label = (date: Date | null) =>
	date
		? new Intl.DateTimeFormat("ko-KR", {
				dateStyle: "medium",
				timeStyle: "short",
				timeZone: "Asia/Seoul",
			}).format(date)
		: "설정 안 함";

export function PopupDateTimePicker({
	kind,
	onChange,
	value,
}: {
	kind: "end" | "start";
	onChange: (value: Date | null) => void;
	value: Date | null;
}) {
	const initial = parts(value ?? new Date());
	const [open, setOpen] = useState(false);
	const [year, setYear] = useState(initial.year);
	const [month, setMonth] = useState(initial.month);
	const [day, setDay] = useState(initial.day);
	const [hour, setHour] = useState(initial.hour);
	const [minute, setMinute] = useState(initial.minute);
	const days = useMemo(() => {
		const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
		const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		return [
			...Array.from({ length: first }, (_, index) => ({
				key: `blank-${year}-${month}-${index + 1}`,
				value: null,
			})),
			...Array.from({ length: count }, (_, index) => ({
				key: `day-${year}-${month}-${index + 1}`,
				value: index + 1,
			})),
		];
	}, [month, year]);
	const today = parts(new Date());
	const isPast = (candidate: number) =>
		kind === "start" &&
		fromKstParts(year, month, candidate, 23, 59) < new Date();
	const changeMonth = (delta: number) => {
		const date = new Date(Date.UTC(year, month + delta, 1));
		setYear(date.getUTCFullYear());
		setMonth(date.getUTCMonth());
		setDay(1);
	};
	const commit = () => {
		let next = fromKstParts(year, month, day, hour, minute);
		if (kind === "start" && next < new Date()) {
			next = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
		}
		onChange(next);
		setOpen(false);
	};
	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					<Button className="justify-between" type="button" variant="outline">
						{label(value)}
						<ChevronDown />
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))]">
				<div className="grid gap-4 sm:grid-cols-[1fr_auto_7rem]">
					<div>
						<div className="mb-2 flex items-center justify-between">
							<Button
								aria-label="이전 달"
								onClick={() => changeMonth(-1)}
								size="icon-sm"
								variant="ghost"
							>
								<ChevronLeft />
							</Button>
							<strong>
								{year}년 {month + 1}월
							</strong>
							<Button
								aria-label="다음 달"
								onClick={() => changeMonth(1)}
								size="icon-sm"
								variant="ghost"
							>
								<ChevronRight />
							</Button>
						</div>
						<div className="grid grid-cols-7 text-center text-muted-foreground text-xs">
							{"일월화수목금토".split("").map((week) => (
								<span className="py-1" key={week}>
									{week}
								</span>
							))}
						</div>
						<div className="grid grid-cols-7 gap-1">
							{days.map(({ key, value: candidate }) =>
								candidate ? (
									<Button
										aria-label={`${candidate}일`}
										disabled={isPast(candidate)}
										key={key}
										onClick={() => setDay(candidate)}
										size="icon-sm"
										variant={day === candidate ? "default" : "ghost"}
									>
										{candidate}
									</Button>
								) : (
									<span key={key} />
								)
							)}
						</div>
					</div>
					<div className="hidden w-px bg-border sm:block" />
					<div className="flex items-center justify-center gap-2 sm:flex-col">
						<TimeStepper label="시" max={23} onChange={setHour} value={hour} />
						<span>:</span>
						<TimeStepper
							label="분"
							max={59}
							onChange={setMinute}
							value={minute}
						/>
					</div>
				</div>
				<div className="mt-4 flex justify-between">
					<Button
						onClick={() => {
							onChange(null);
							setOpen(false);
						}}
						variant="ghost"
					>
						설정 안 함
					</Button>
					<Button onClick={commit}>확인</Button>
				</div>
				{kind === "start" &&
				year === today.year &&
				month === today.month &&
				day === today.day ? (
					<p className="mt-2 text-muted-foreground text-xs">
						현재 시각보다 이른 시간은 현재 시각으로 보정됩니다.
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function TimeStepper({
	label,
	max,
	onChange,
	value,
}: {
	label: string;
	max: number;
	onChange: (value: number) => void;
	value: number;
}) {
	const set = (next: number) => onChange((next + max + 1) % (max + 1));
	return (
		<div className="grid justify-items-center gap-1">
			<Button
				aria-label={`${label} 증가`}
				onClick={() => set(value + 1)}
				size="icon-sm"
				variant="ghost"
			>
				<ChevronUp />
			</Button>
			<Input
				aria-label={label}
				className="w-14 text-center"
				max={max}
				min={0}
				onChange={(event) =>
					set(Math.max(0, Math.min(max, Number(event.target.value))))
				}
				type="number"
				value={value}
			/>
			<Button
				aria-label={`${label} 감소`}
				onClick={() => set(value - 1)}
				size="icon-sm"
				variant="ghost"
			>
				<ChevronDown />
			</Button>
		</div>
	);
}
