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
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { Ban, Info } from "lucide-react";
import { useMemo } from "react";

import { BankTransferGuide } from "@/components/bambi/bank-transfer-guide";
import { FieldError, FieldLabel } from "@/components/bambi/form-message";
import {
	type AdCatalogProduct,
	formatAdDuration,
	formatAdPrice,
} from "@/lib/bambi/ad-catalog";
import type { JobFormErrors, JobPaymentMethod } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

// 광고 상품을 고르지 않은 "일반 구인(무료)" 선택지를 나타내는 센티넬 값.
const FREE_EXPOSURE_VALUE = "__free__";

// 프리미엄 배너 풀로 통합된 미리보기 템플릿. 이 상품을 고르면 전체 정원·대기열이 적용된다.
const BANNER_PREVIEW_TEMPLATES: ReadonlySet<string> = new Set([
	"premium-top",
	"side-horizontal",
	"side-vertical",
]);

const premiumCapacityNote = (
	capacity: { capacity: number; remaining: number } | undefined
): string => {
	if (!capacity) {
		return "프리미엄 광고는 전체 정원 안에서 진행되며, 정원이 차면 대기열에 등록됩니다.";
	}

	if (capacity.remaining === 0) {
		return `프리미엄 광고 정원(${capacity.capacity}자리)이 가득 차, 신청하면 대기열에 등록됩니다. 자리가 나면 입금 확인 순으로 진행돼요.`;
	}

	return `프리미엄 광고 남은 자리 ${capacity.remaining}/${capacity.capacity} — 신청 후 입금이 확인되면 노출됩니다.`;
};

const paymentOptions: { label: string; value: JobPaymentMethod }[] = [
	{ label: "신용카드", value: "card" },
	{ label: "무통장입금", value: "bank_transfer" },
];

// 카드 내부 텍스트가 카드 밖으로 넘치지 않도록 min-w-0 + whitespace-normal + break-words로
// 줄바꿈을 허용한다.
// h-full: 같은 그리드 행에서 부모(ToggleGroup)가 items-stretch일 때 행 안의 가장 높은 카드에
// 맞춰 모든 카드 높이가 같아진다(그리드 행 트랙 자체는 항상 최대 콘텐츠 높이로 결정되므로,
// stretch가 걸려야 나머지 카드도 그 트랙 높이를 실제로 채운다).
// min-h-16: tagline 유무와 무관하게 카드가 시각적으로 너무 낮아지지 않도록 하는 바닥값(로딩
// Skeleton의 h-16과 맞춤). min-height라서 콘텐츠가 넘치면 자연히 더 커지고 텍스트는 잘리지 않는다.
// justify-start: 기본 toggleVariants가 justify-center를 주므로, 카드가 늘어났을 때도
// 상품명이 항상 위쪽에 고정되고 소개가 그 아래로 이어지도록 명시적으로 덮어쓴다.
const exposureToggleItemClassName =
	"h-full min-h-16 w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal px-3 py-2.5 text-left";

const durationSelectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

interface JobExposureFieldsProps {
	adProductId: string | null;
	errors?: Pick<
		JobFormErrors,
		"exposureDurationDays" | "exposureType" | "paymentMethod"
	>;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	onDurationChange: (days: number | null, amount: number | null) => void;
	onPaymentMethodChange: (value: JobPaymentMethod) => void;
	onProductChange: (productId: string | null) => void;
	paymentMethod: JobPaymentMethod | null;
}

const isJobPaymentMethod = (value: string): value is JobPaymentMethod =>
	value === "card" || value === "bank_transfer";

export function JobExposureFields({
	adProductId,
	errors,
	exposureAmount,
	exposureDurationDays,
	onDurationChange,
	onPaymentMethodChange,
	onProductChange,
	paymentMethod,
}: JobExposureFieldsProps) {
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.getCatalog.queryOptions()
	);
	const products = useMemo<AdCatalogProduct[]>(
		() => (catalogQuery.data ?? []).flatMap((placement) => placement.products),
		[catalogQuery.data]
	);
	const capacityQuery = useQuery(
		orpc.bambi.adProducts.premiumCapacity.queryOptions()
	);
	const selectedProduct =
		products.find((product) => product.id === adProductId) ?? null;
	const isBannerProduct = selectedProduct
		? BANNER_PREVIEW_TEMPLATES.has(selectedProduct.previewTemplate)
		: false;
	const toggleValue = adProductId ?? FREE_EXPOSURE_VALUE;
	const showPaidOptions = Boolean(selectedProduct);
	const showTotal =
		showPaidOptions &&
		typeof exposureDurationDays === "number" &&
		typeof exposureAmount === "number";

	const handleExposureValueChange = (value: string[]) => {
		const next = value.at(-1);

		if (!next || next === FREE_EXPOSURE_VALUE) {
			onProductChange(null);
			return;
		}

		if (products.some((product) => product.id === next)) {
			onProductChange(next);
		}
	};

	return (
		<section aria-labelledby="new-exposure" className="flex flex-col gap-3">
			<div>
				<h2 className="font-semibold text-lg" id="new-exposure">
					노출 상품·결제
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					운영자가 등록한 노출 상품 중에서 고르고, 이용 기간과 결제 방법을
					선택하세요.
				</p>
			</div>
			<Card>
				<CardContent className="grid gap-6">
					<div className="flex flex-col gap-2">
						<FieldLabel htmlFor="exposureType">노출 상품</FieldLabel>
						{catalogQuery.isLoading ? (
							<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
							</div>
						) : (
							<ToggleGroup
								aria-label="노출 상품"
								className="grid w-full grid-cols-1 items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-3"
								onValueChange={handleExposureValueChange}
								value={[toggleValue]}
								variant="outline"
							>
								{products.map((product) => (
									<ToggleGroupItem
										className={exposureToggleItemClassName}
										key={product.id}
										value={product.id}
									>
										<span className="w-full text-balance break-words font-medium text-sm">
											{product.name}
										</span>
										{product.tagline ? (
											<span className="w-full break-words text-muted-foreground text-xs">
												{product.tagline}
											</span>
										) : null}
									</ToggleGroupItem>
								))}
								<ToggleGroupItem
									className={exposureToggleItemClassName}
									value={FREE_EXPOSURE_VALUE}
								>
									<span className="w-full text-balance break-words font-medium text-sm">
										일반 구인(무료)
									</span>
									<span className="w-full break-words text-muted-foreground text-xs">
										일반 목록에 노출합니다. 추가 비용이 없습니다.
									</span>
								</ToggleGroupItem>
							</ToggleGroup>
						)}
						<FieldError
							id="exposureType-error"
							message={errors?.exposureType}
						/>
						{isBannerProduct ? (
							<Alert>
								<Info />
								<AlertDescription>
									{premiumCapacityNote(capacityQuery.data)}
								</AlertDescription>
							</Alert>
						) : null}
					</div>

					{showPaidOptions ? (
						<div className="flex flex-col gap-2">
							<FieldLabel htmlFor="exposureDurationDays">이용 기간</FieldLabel>
							<Select
								items={(selectedProduct?.priceOptions ?? []).map(
									(priceOption) => ({
										label: `${formatAdDuration(priceOption.days)} · ${formatAdPrice(priceOption.amount)}`,
										value: String(priceOption.days),
									})
								)}
								name="exposureDurationDays"
								onValueChange={(value) => {
									const days = value ? Number(value) : null;
									const option =
										days === null
											? undefined
											: selectedProduct?.priceOptions.find(
													(priceOption) => priceOption.days === days
												);
									onDurationChange(
										option?.days ?? null,
										option?.amount ?? null
									);
								}}
								value={exposureDurationDays ? String(exposureDurationDays) : ""}
							>
								<SelectTrigger
									aria-describedby={
										errors?.exposureDurationDays
											? "exposureDurationDays-error"
											: undefined
									}
									aria-invalid={Boolean(errors?.exposureDurationDays)}
									className={durationSelectTriggerClassName}
									id="exposureDurationDays"
								>
									<SelectValue placeholder="이용 기간을 선택하세요" />
								</SelectTrigger>
								<SelectContent>
									{selectedProduct?.priceOptions.map((priceOption) => (
										<SelectItem
											key={priceOption.days}
											value={String(priceOption.days)}
										>
											{formatAdDuration(priceOption.days)} ·{" "}
											{formatAdPrice(priceOption.amount)}
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

					{showTotal ? (
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
							<span className="font-medium text-muted-foreground text-sm">
								결제 예정 금액
							</span>
							<span className="min-w-0 break-words font-semibold text-lg text-primary">
								{formatAdPrice(exposureAmount)}
							</span>
						</div>
					) : null}

					{showPaidOptions ? (
						<div className="flex flex-col gap-2">
							<FieldLabel htmlFor="paymentMethod">결제 방법</FieldLabel>
							<ToggleGroup
								aria-label="결제 방법"
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
							{paymentMethod === "card" ? (
								<Alert variant="warning">
									<Ban />
									<AlertDescription>
										신용카드는 아직 지원하지 않는 결제 방법입니다. 곧 지원할
										예정이에요. 지금은 무통장입금으로 진행해 주세요.
									</AlertDescription>
								</Alert>
							) : null}
							{paymentMethod === "bank_transfer" ? (
								<Alert>
									<Info />
									<AlertDescription>
										<BankTransferGuide amount={exposureAmount} />
									</AlertDescription>
								</Alert>
							) : null}
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
