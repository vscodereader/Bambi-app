"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	JOB_BOOST_OPTION_TYPE_LABELS,
	type JobBoostOptionTypeKey,
} from "@/lib/bambi/boost-options";
import { orpc } from "@/utils/orpc";

// 빈 입력 = null(가격) / undefined(스펙)로 구분한다. 숫자로만 들고 있으면 "0"과
// "미입력"을 구분할 수 없다(디자인 제작 가격 입력의 toPriceInput/fromPriceInput 관례).
const toNumberInput = (value: null | number) =>
	value == null ? "" : String(value);
const fromPriceInput = (value: string) =>
	value.trim() === "" ? null : Number(value);
const fromSpecInput = (value: string) =>
	value.trim() === "" ? undefined : Number(value);

// 기간제(manual_period·auto_period)는 하루 횟수·기간을, 횟수권(manual_count)은 총 횟수를 쓴다.
const isPeriodOption = (optionType: JobBoostOptionTypeKey) =>
	optionType !== "manual_count";

interface BoostOptionRow {
	boostCount: null | number;
	boostsPerDay: null | number;
	durationDays: null | number;
	optionType: JobBoostOptionTypeKey;
	price: null | number;
}

function BoostOptionRow({ option }: { option: BoostOptionRow }) {
	const queryClient = useQueryClient();
	const period = isPeriodOption(option.optionType);
	const [price, setPrice] = useState(toNumberInput(option.price));
	const [boostsPerDay, setBoostsPerDay] = useState(
		toNumberInput(option.boostsPerDay)
	);
	const [durationDays, setDurationDays] = useState(
		toNumberInput(option.durationDays)
	);
	const [boostCount, setBoostCount] = useState(
		toNumberInput(option.boostCount)
	);

	const upsert = useMutation(
		orpc.bambi.boostOptions.upsertOption.mutationOptions({
			onSuccess: async () => {
				toast.success("옵션을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.boostOptions.listOptionsByAdmin.queryKey(),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);

	const save = () =>
		upsert.mutate({
			optionType: option.optionType,
			price: fromPriceInput(price),
			...(period
				? {
						boostsPerDay: fromSpecInput(boostsPerDay),
						durationDays: fromSpecInput(durationDays),
					}
				: { boostCount: fromSpecInput(boostCount) }),
		});

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-end md:gap-4">
			<span className="font-bold md:w-36 md:shrink-0 md:self-center">
				{JOB_BOOST_OPTION_TYPE_LABELS[option.optionType]}
			</span>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${option.optionType}-price`}>판매가(원)</Label>
				<Input
					className="md:w-32"
					id={`${option.optionType}-price`}
					min={0}
					onChange={(event) => setPrice(event.target.value)}
					type="number"
					value={price}
				/>
			</div>
			{period ? (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${option.optionType}-boosts-per-day`}>
							하루 끌어올리기 횟수
						</Label>
						<Input
							className="md:w-32"
							id={`${option.optionType}-boosts-per-day`}
							min={1}
							onChange={(event) => setBoostsPerDay(event.target.value)}
							type="number"
							value={boostsPerDay}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${option.optionType}-duration-days`}>
							적용 일수
						</Label>
						<Input
							className="md:w-32"
							id={`${option.optionType}-duration-days`}
							min={1}
							onChange={(event) => setDurationDays(event.target.value)}
							type="number"
							value={durationDays}
						/>
					</div>
				</>
			) : (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${option.optionType}-boost-count`}>충전 횟수</Label>
					<Input
						className="md:w-32"
						id={`${option.optionType}-boost-count`}
						min={1}
						onChange={(event) => setBoostCount(event.target.value)}
						type="number"
						value={boostCount}
					/>
				</div>
			)}
			<Button
				disabled={upsert.isPending}
				onClick={save}
				type="button"
				variant="secondary"
			>
				저장
			</Button>
		</div>
	);
}

export function BoostOptionSettings() {
	const optionsQuery = useQuery(
		orpc.bambi.boostOptions.listOptionsByAdmin.queryOptions()
	);
	const options = optionsQuery.data ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>끌어올리기 옵션</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-sm">
					판매가를 비우면 해당 옵션은 미판매로 처리돼 구인자 화면에서
					숨겨집니다.
				</p>
				{options.length === 0 ? (
					<p className="m-0 text-muted-foreground text-sm">불러오는 중…</p>
				) : (
					options.map((option) => (
						<BoostOptionRow
							key={option.optionType}
							option={option as BoostOptionRow}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}
