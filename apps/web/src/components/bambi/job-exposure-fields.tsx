"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { Info } from "lucide-react";

import { FieldError, FieldLabel } from "@/components/bambi/form-message";
import type {
	JobExposureType,
	JobFormErrors,
	JobPaymentMethod,
} from "@/lib/bambi-job-form";

const exposureOptions: {
	description: string;
	label: string;
	value: JobExposureType;
}[] = [
	{
		description: "최상단 대형 배너로 최대 노출합니다.",
		label: "프리미엄 배너",
		value: "premium-banner",
	},
	{
		description: "목록 좌측 고정 배너로 노출합니다.",
		label: "좌측 배너",
		value: "left-banner",
	},
	{
		description: "목록 우측 고정 배너로 노출합니다.",
		label: "우측 배너",
		value: "right-banner",
	},
	{
		description: "스페셜 채용 영역 상단에 노출합니다.",
		label: "스페셜 채용",
		value: "special",
	},
	{
		description: "급구 채용 영역에 우선 노출합니다.",
		label: "급구 채용",
		value: "urgent",
	},
	{
		description: "추천 채용 영역에 노출합니다.",
		label: "추천 채용",
		value: "recommended",
	},
	{
		description: "일반 목록에 노출합니다. 추가 비용이 없습니다.",
		label: "일반 구인",
		value: "standard",
	},
];

const paymentOptions: { label: string; value: JobPaymentMethod }[] = [
	{ label: "신용카드", value: "card" },
	{ label: "무통장입금", value: "bank_transfer" },
];

const durationOptions = [30, 60, 90];

const exposureToggleItemClassName =
	"h-auto min-w-0 flex-col items-start gap-1 px-3 py-2.5 text-left";

interface JobExposureFieldsProps {
	errors?: Pick<
		JobFormErrors,
		"exposureDurationDays" | "exposureType" | "paymentMethod"
	>;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	onExposureDurationDaysChange: (value: number | null) => void;
	onExposureTypeChange: (value: JobExposureType) => void;
	onPaymentMethodChange: (value: JobPaymentMethod) => void;
	paymentMethod: JobPaymentMethod | null;
}

const isJobPaymentMethod = (value: string): value is JobPaymentMethod =>
	value === "card" || value === "bank_transfer";

const isJobExposureValue = (
	value: string | undefined
): value is JobExposureType =>
	exposureOptions.some((option) => option.value === value);

export function JobExposureFields({
	errors,
	exposureDurationDays,
	exposureType,
	onExposureDurationDaysChange,
	onExposureTypeChange,
	onPaymentMethodChange,
	paymentMethod,
}: JobExposureFieldsProps) {
	const showPaidOptions = exposureType !== "standard";

	return (
		<section aria-labelledby="new-exposure" className="flex flex-col gap-3">
			<div>
				<h2 className="font-semibold text-lg" id="new-exposure">
					노출 상품·결제
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					공고를 어디에 노출할지 상품을 고르고 결제 방법을 선택하세요.
				</p>
			</div>
			<Card>
				<CardContent className="grid gap-6">
					<div className="flex flex-col gap-2">
						<FieldLabel htmlFor="exposureType">노출 상품</FieldLabel>
						<ToggleGroup
							aria-labelledby="exposureType"
							className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
							onValueChange={(value) => {
								const next = value.at(-1);

								if (isJobExposureValue(next)) {
									onExposureTypeChange(next);
								}
							}}
							value={[exposureType]}
							variant="outline"
						>
							{exposureOptions.map((option) => (
								<ToggleGroupItem
									className={exposureToggleItemClassName}
									key={option.value}
									value={option.value}
								>
									<span className="font-medium text-sm">{option.label}</span>
									<span className="text-muted-foreground text-xs">
										{option.description}
									</span>
								</ToggleGroupItem>
							))}
						</ToggleGroup>
						<FieldError
							id="exposureType-error"
							message={errors?.exposureType}
						/>
					</div>

					{showPaidOptions ? (
						<div className="flex flex-col gap-2">
							<FieldLabel htmlFor="exposureDurationDays">이용 기간</FieldLabel>
							<Select
								name="exposureDurationDays"
								onValueChange={(value) =>
									onExposureDurationDaysChange(value ? Number(value) : null)
								}
								value={exposureDurationDays ? String(exposureDurationDays) : ""}
							>
								<SelectTrigger
									aria-describedby={
										errors?.exposureDurationDays
											? "exposureDurationDays-error"
											: undefined
									}
									aria-invalid={Boolean(errors?.exposureDurationDays)}
									className="w-full text-sm data-[size=default]:h-9"
									id="exposureDurationDays"
								>
									<SelectValue placeholder="이용 기간을 선택하세요" />
								</SelectTrigger>
								<SelectContent>
									{durationOptions.map((days) => (
										<SelectItem key={days} value={String(days)}>
											{days}일
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError
								id="exposureDurationDays-error"
								message={errors?.exposureDurationDays}
							/>
						</div>
					) : null}

					{showPaidOptions ? (
						<div className="flex flex-col gap-2">
							<FieldLabel htmlFor="paymentMethod">결제 방법</FieldLabel>
							<ToggleGroup
								aria-labelledby="paymentMethod"
								className="grid w-full grid-cols-2 gap-2"
								onValueChange={(value) => {
									const next = value.at(-1);

									if (next && isJobPaymentMethod(next)) {
										onPaymentMethodChange(next);
									}
								}}
								value={paymentMethod ? [paymentMethod] : []}
								variant="outline"
							>
								{paymentOptions.map((option) => (
									<ToggleGroupItem
										className="w-full"
										key={option.value}
										value={option.value}
									>
										{option.label}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
							<FieldError
								id="paymentMethod-error"
								message={errors?.paymentMethod}
							/>
						</div>
					) : null}

					<Alert>
						<Info />
						<AlertDescription>
							결제는 운영자 확인 후 완료되며, 검수·결제완료 시 게시됩니다.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		</section>
	);
}
