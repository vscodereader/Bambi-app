"use client";

// 밤비 — 운영자 결제 관리: 끌어올리기 옵션 구매 입금 확인 섹션.
// 공고 유료 노출과 별개로, 구인자가 산 끌어올리기 옵션(무통장 등)의 입금을 여기서 확인한다.
// unpaid → 입금 확인(paid 전환)·취소, paid → 미결제로(사용 흔적 있으면 서버가 거부, 메시지 toast).

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { StatusBadge } from "@/components/bambi/status-badge";
import { formatAdPrice } from "@/lib/bambi/ad-catalog";
import {
	formatBoostOptionSpec,
	JOB_BOOST_OPTION_TYPE_LABELS,
} from "@/lib/bambi/boost-options";
import { PAYMENT_STATUS_LABELS } from "@/lib/bambi/exposure";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

type BoostPurchase = Awaited<
	ReturnType<
		AppRouterClient["bambi"]["boostOptions"]["listPurchasesForPayment"]
	>
>[number];

// DB enum(job_boost_purchase.payment_method) 원값 노출 금지 → 라벨 경유.
const PAYMENT_METHOD_LABELS = {
	bank_transfer: "무통장입금",
	card: "카드",
} as const;

export function BoostPurchasesSection() {
	const queryClient = useQueryClient();
	const [onlyUnpaid, setOnlyUnpaid] = useState(false);

	const queryInput = { onlyUnpaid } as const;
	const purchasesQuery = useQuery(
		orpc.bambi.boostOptions.listPurchasesForPayment.queryOptions({
			input: queryInput,
		})
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.boostOptions.listPurchasesForPayment.queryKey({
				input: queryInput,
			}),
		});

	const confirmMutation = useMutation(
		orpc.bambi.boostOptions.confirmPurchasePayment.mutationOptions({
			onError: (error) =>
				toast(error.message || "입금 상태를 바꾸지 못했어요."),
			onSuccess: async (_data, variables) => {
				await invalidate();
				toast(
					variables.paymentStatus === "paid"
						? "입금을 확인했어요."
						: "미결제로 되돌렸어요."
				);
			},
		})
	);

	const cancelMutation = useMutation(
		orpc.bambi.boostOptions.cancelPurchase.mutationOptions({
			onError: (error) => toast(error.message || "구매를 취소하지 못했어요."),
			onSuccess: async () => {
				await invalidate();
				toast("구매를 취소했어요.");
			},
		})
	);

	const purchases = purchasesQuery.data ?? [];

	const isRowPending = (id: string) =>
		(confirmMutation.isPending &&
			confirmMutation.variables?.purchaseId === id) ||
		(cancelMutation.isPending && cancelMutation.variables?.purchaseId === id);

	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h2 className="m-0 font-bold text-xl">끌어올리기 옵션 결제</h2>
					<p className="m-0 text-muted-foreground text-sm">
						공고에 구매한 끌어올리기 옵션의 입금을 확인합니다. 입금 확인 시
						옵션이 바로 활성화됩니다.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						checked={onlyUnpaid}
						id="boost-only-unpaid"
						onCheckedChange={setOnlyUnpaid}
					/>
					<Label htmlFor="boost-only-unpaid">미결제만 보기</Label>
				</div>
			</div>

			{purchasesQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{purchasesQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{purchasesQuery.isSuccess && purchases.length === 0 ? (
				<EmptyState
					description={
						onlyUnpaid
							? "입금 확인 대기 중인 옵션 구매가 없어요."
							: "표시할 옵션 구매가 없어요."
					}
					title="옵션 구매가 없어요"
				/>
			) : null}

			{purchasesQuery.isSuccess && purchases.length > 0 ? (
				<div className="rounded-xl border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>공고 제목</TableHead>
								<TableHead>업소</TableHead>
								<TableHead>옵션</TableHead>
								<TableHead>스펙</TableHead>
								<TableHead>금액</TableHead>
								<TableHead>결제수단</TableHead>
								<TableHead>상태</TableHead>
								<TableHead>구매일</TableHead>
								<TableHead className="text-right">관리</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{purchases.map((purchase) => (
								<PurchaseRow
									isPending={isRowPending(purchase.id)}
									key={purchase.id}
									onCancel={() =>
										cancelMutation.mutate({ purchaseId: purchase.id })
									}
									onSetPaid={() =>
										confirmMutation.mutate({
											paymentStatus: "paid",
											purchaseId: purchase.id,
										})
									}
									onSetUnpaid={() =>
										confirmMutation.mutate({
											paymentStatus: "unpaid",
											purchaseId: purchase.id,
										})
									}
									purchase={purchase}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}
		</section>
	);
}

interface PurchaseRowProps {
	isPending: boolean;
	onCancel: () => void;
	onSetPaid: () => void;
	onSetUnpaid: () => void;
	purchase: BoostPurchase;
}

function PurchaseRow({
	isPending,
	onCancel,
	onSetPaid,
	onSetUnpaid,
	purchase,
}: PurchaseRowProps) {
	const spec = formatBoostOptionSpec(purchase);
	const isUnpaid = purchase.paymentStatus === "unpaid";

	return (
		<TableRow>
			<TableCell className="whitespace-normal break-keep font-medium text-foreground">
				{purchase.jobPostTitle}
			</TableCell>
			<TableCell className="whitespace-normal break-keep text-muted-foreground">
				{purchase.organizationDisplayName}
			</TableCell>
			<TableCell>{JOB_BOOST_OPTION_TYPE_LABELS[purchase.optionType]}</TableCell>
			<TableCell className="text-muted-foreground">{spec || "-"}</TableCell>
			<TableCell className="font-medium text-foreground">
				{formatAdPrice(purchase.amount)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{purchase.paymentMethod
					? PAYMENT_METHOD_LABELS[purchase.paymentMethod]
					: "-"}
			</TableCell>
			<TableCell>
				<StatusBadge tone={isUnpaid ? "warning" : "good"}>
					{PAYMENT_STATUS_LABELS[purchase.paymentStatus]}
				</StatusBadge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDateTime(purchase.createdAt)}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-2">
					{isUnpaid ? (
						<>
							<Button
								disabled={isPending}
								onClick={onSetPaid}
								size="sm"
								type="button"
							>
								입금 확인
							</Button>
							<Button
								disabled={isPending}
								onClick={onCancel}
								size="sm"
								type="button"
								variant="outline"
							>
								취소
							</Button>
						</>
					) : (
						<Button
							disabled={isPending}
							onClick={onSetUnpaid}
							size="sm"
							type="button"
							variant="outline"
						>
							미결제로
						</Button>
					)}
				</div>
			</TableCell>
		</TableRow>
	);
}
