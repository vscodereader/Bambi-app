"use client";

// 구인자가 공고 하나에 끌어올리기 추가 옵션을 사는 창(광고 관리 목록 행에서 연다).
// 구매 가능 여부의 정본은 서버다 — 옵션을 미리 비활성화하지 않고, 서버가 돌려준
// BAD_REQUEST 한국어 메시지를 그대로 toast로 보여 준다.

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BankTransferGuide } from "@/components/bambi/bank-transfer-guide";
import { StatusBadge } from "@/components/bambi/status-badge";
import { formatAdPrice } from "@/lib/bambi/ad-catalog";
import {
	formatBoostOptionSpec,
	JOB_BOOST_OPTION_TYPE_LABELS,
	type JobBoostOptionTypeKey,
} from "@/lib/bambi/boost-options";
import { orpc } from "@/utils/orpc";

type PaymentMethod = "bank_transfer" | "card";

const paymentOptions: { label: string; value: PaymentMethod }[] = [
	{ label: "신용카드", value: "card" },
	{ label: "무통장입금", value: "bank_transfer" },
];

const isPaymentMethod = (value: string): value is PaymentMethod =>
	value === "card" || value === "bank_transfer";

const isBoostOptionType = (value: string): value is JobBoostOptionTypeKey =>
	value === "manual_period" ||
	value === "manual_count" ||
	value === "auto_period";

// 카드형 토글: 라벨·스펙·가격이 세 줄로 쌓이므로 좌측 정렬 + 줄바꿈 허용.
const optionItemClassName =
	"h-full w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal px-3 py-2.5 text-left";

interface BoostOptionPurchaseDialogProps {
	jobPostId: string;
	jobTitle: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function BoostOptionPurchaseDialog({
	jobPostId,
	jobTitle,
	onOpenChange,
	open,
}: BoostOptionPurchaseDialogProps) {
	const queryClient = useQueryClient();
	const [selectedType, setSelectedType] =
		useState<JobBoostOptionTypeKey | null>(null);
	const [paymentMethod, setPaymentMethod] =
		useState<PaymentMethod>("bank_transfer");

	const optionsQuery = useQuery({
		...orpc.bambi.boostOptions.listOptions.queryOptions(),
		enabled: open,
	});
	// 목록(listMyAds)에는 구매 id가 없어 취소 대상을 못 만든다 → 창 안에서 공고 편집 조회로
	// 이 공고의 구매 목록을 읽어 미결제 건만 추린다.
	const jobQueryInput = { id: jobPostId } as const;
	const jobQuery = useQuery({
		...orpc.bambi.jobs.getEditableById.queryOptions({ input: jobQueryInput }),
		enabled: open,
	});

	// 판매 중인 옵션만 온다(서버가 price null을 걸러 준다). 타입상 nullable이라 여기서 좁힌다.
	const options = (optionsQuery.data ?? []).flatMap((option) =>
		option.price === null ? [] : [{ ...option, price: option.price }]
	);
	const selectedOption =
		options.find((option) => option.optionType === selectedType) ?? null;
	const unpaidPurchases = (jobQuery.data?.boostPurchases ?? []).filter(
		(purchase) => purchase.paymentStatus === "unpaid"
	);

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.jobs.getEditableById.queryKey({
					input: jobQueryInput,
				}),
			}),
		]);
	};

	const purchaseMutation = useMutation(
		orpc.bambi.boostOptions.purchaseOption.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "옵션을 구매하지 못했어요."),
			onSuccess: async () => {
				await invalidate();
				toast.success("옵션 구매가 접수됐어요. 입금 확인 후 적용됩니다.");
			},
		})
	);

	const cancelMutation = useMutation(
		orpc.bambi.boostOptions.cancelPurchase.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "구매를 취소하지 못했어요."),
			onSuccess: async () => {
				await invalidate();
				toast.success("구매를 취소했어요.");
			},
		})
	);

	const handlePurchase = () => {
		if (!selectedType) {
			return;
		}

		purchaseMutation.mutate({
			jobPostId,
			optionType: selectedType,
			paymentMethod,
		});
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			{/* 폭은 DialogContent 기본값(w-[420px]·max-w-[92vw])을 그대로 쓴다 — w-auto로 덮으면
			    콘텐츠가 짧을 때 데스크톱에서 창이 쪼그라든다. */}
			<DialogContent className="max-h-[85vh]">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<DialogTitle className="text-base">
							끌어올리기 옵션 구매
						</DialogTitle>
						<DialogDescription>
							{jobTitle} 공고에 추가할 옵션을 선택하세요. 입금이 확인되면 바로
							적용됩니다.
						</DialogDescription>
					</div>

					{optionsQuery.isPending ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-16 w-full" />
						</div>
					) : null}

					{optionsQuery.isSuccess && options.length === 0 ? (
						<Alert>
							<Info />
							<AlertDescription>
								지금은 판매 중인 끌어올리기 옵션이 없어요.
							</AlertDescription>
						</Alert>
					) : null}

					{options.length > 0 ? (
						<ToggleGroup
							aria-label="끌어올리기 옵션"
							className="grid w-full grid-cols-1 items-stretch gap-2"
							onValueChange={(value) => {
								const next = value.at(-1);

								if (next && isBoostOptionType(next)) {
									setSelectedType(next);
								}
							}}
							value={selectedType ? [selectedType] : []}
							variant="outline"
						>
							{options.map((option) => {
								const spec = formatBoostOptionSpec(option);

								return (
									<ToggleGroupItem
										className={optionItemClassName}
										key={option.optionType}
										value={option.optionType}
									>
										<span className="w-full text-balance break-words font-medium text-sm">
											{JOB_BOOST_OPTION_TYPE_LABELS[option.optionType]}
										</span>
										{spec ? (
											<span className="w-full break-words text-muted-foreground text-xs">
												{spec}
											</span>
										) : null}
										<span className="w-full break-words font-semibold text-primary text-sm">
											{formatAdPrice(option.price)}
										</span>
									</ToggleGroupItem>
								);
							})}
						</ToggleGroup>
					) : null}

					{selectedOption ? (
						<div className="flex flex-col gap-2">
							<ToggleGroup
								aria-label="결제 방법"
								className="grid w-full grid-cols-2 gap-2"
								onValueChange={(value) => {
									const next = value.at(-1);

									if (next && isPaymentMethod(next)) {
										setPaymentMethod(next);
									}
								}}
								value={[paymentMethod]}
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
							{paymentMethod === "card" ? (
								<Alert variant="warning">
									<Ban />
									<AlertDescription>
										신용카드는 아직 지원하지 않는 결제 방법입니다. 지금은
										무통장입금으로 진행해 주세요.
									</AlertDescription>
								</Alert>
							) : (
								<Alert>
									<Info />
									<AlertDescription>
										<BankTransferGuide
											amount={selectedOption.price}
											purpose="boost"
										/>
									</AlertDescription>
								</Alert>
							)}
						</div>
					) : null}

					{/* 조회 실패를 조용히 빈 목록으로 두면 "입금 대기 없음"과 구별되지 않는다. */}
					{jobQuery.isError ? (
						<Alert variant="warning">
							<Info />
							<AlertDescription>
								입금 대기 내역을 불러오지 못했어요. 공고 수정 화면에서 확인해
								주세요.
							</AlertDescription>
						</Alert>
					) : null}

					{unpaidPurchases.length > 0 ? (
						<div className="flex flex-col gap-2">
							<p className="m-0 font-medium text-sm">
								입금 확인 대기 중인 옵션
							</p>
							<ul className="flex flex-col gap-2">
								{unpaidPurchases.map((purchase) => (
									<li
										className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
										key={purchase.id}
									>
										<div className="flex min-w-0 flex-wrap items-center gap-2">
											<span className="break-words font-medium text-sm">
												{JOB_BOOST_OPTION_TYPE_LABELS[purchase.optionType]}
											</span>
											<StatusBadge tone="warning">입금 대기</StatusBadge>
											<span className="text-muted-foreground text-xs">
												{formatAdPrice(purchase.amount)}
											</span>
										</div>
										<Button
											disabled={cancelMutation.isPending}
											onClick={() =>
												cancelMutation.mutate({ purchaseId: purchase.id })
											}
											size="sm"
											type="button"
											variant="outline"
										>
											취소
										</Button>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="flex flex-wrap items-center justify-end gap-2">
						<DialogClose render={<Button variant="ghost" />}>닫기</DialogClose>
						{/* 신용카드는 아직 미지원이라 위 경고만 띄우고 구매는 막는다(공고 폼 cardPaymentBlocked와 같은 축). */}
						<Button
							disabled={
								!selectedType ||
								paymentMethod === "card" ||
								purchaseMutation.isPending
							}
							onClick={handlePurchase}
							type="button"
						>
							옵션 구매
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
