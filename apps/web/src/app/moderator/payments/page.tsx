"use client";

// 밤비 — 운영자 전용 결제 관리 목록.
// 공개 노출은 published + paymentStatus=paid 게이트를 통과해야 하는데, 유료 노출상품을
// 선택한 공고는 결제완료 처리 전까지 노출되지 않는다. 무료 공고는 등록 즉시 paid라 여기엔
// 유료(미결제) 공고 위주로 남는다. 제목 왼쪽 체크박스로 다중 선택해 일괄 결제 처리한다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { StatusBadge } from "@/components/bambi/status-badge";
import { formatAdPrice } from "@/lib/bambi/ad-catalog";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	getJobDisplayStatus,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

type PaymentJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listJobsForPayment"]>
>[number];

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const getExpiryTone = (label: string): Tone => {
	if (label === "진행중") {
		return "good";
	}

	if (label === "만료") {
		return "danger";
	}

	return "default";
};

interface PaymentColumnsOptions {
	allSelected: boolean;
	onToggleAll: (checked: boolean) => void;
	onToggleRow: (id: string) => void;
	selectedIds: Set<string>;
	someSelected: boolean;
}

function getPaymentColumns({
	allSelected,
	onToggleAll,
	onToggleRow,
	selectedIds,
	someSelected,
}: PaymentColumnsOptions): DataColumn<PaymentJob>[] {
	return [
		{
			id: "select",
			headerClassName: "w-10",
			cellClassName: "w-10",
			header: (
				<Checkbox
					aria-label="전체 선택"
					checked={allSelected}
					indeterminate={someSelected && !allSelected}
					onCheckedChange={(checked) => onToggleAll(checked === true)}
				/>
			),
			cell: (job) => (
				<Checkbox
					aria-label="공고 선택"
					checked={selectedIds.has(job.id)}
					onCheckedChange={() => onToggleRow(job.id)}
				/>
			),
		},
		{
			id: "title",
			header: "공고 제목",
			sortValue: (job) => job.title,
			cell: (job) => (
				<span className="break-keep font-medium text-foreground">
					{job.title}
				</span>
			),
		},
		{
			id: "organizationDisplayName",
			header: "업체",
			sortValue: (job) => job.organizationDisplayName,
			cell: (job) => (
				<span className="break-keep text-muted-foreground">
					{job.organizationDisplayName}
				</span>
			),
		},
		{
			id: "status",
			header: "공고 상태",
			sortValue: (job) =>
				getJobDisplayStatus({
					paymentStatus: job.paymentStatus,
					status: job.status,
				}).label,
			cell: (job) => {
				const display = getJobDisplayStatus({
					paymentStatus: job.paymentStatus,
					status: job.status,
				});

				return <StatusBadge tone={display.tone}>{display.label}</StatusBadge>;
			},
		},
		{
			id: "exposureType",
			header: "노출 상품",
			sortValue: (job) => EXPOSURE_TYPE_LABELS[job.exposureType],
			cell: (job) => (
				<StatusBadge>{EXPOSURE_TYPE_LABELS[job.exposureType]}</StatusBadge>
			),
		},
		{
			id: "exposureAmount",
			header: "결제 금액",
			sortValue: (job) => job.exposureAmount ?? 0,
			cell: (job) =>
				job.exposureAmount === null ? (
					<span className="text-muted-foreground">무료</span>
				) : (
					<span className="whitespace-nowrap font-medium text-foreground">
						{formatAdPrice(job.exposureAmount)}
					</span>
				),
		},
		{
			id: "paymentStatus",
			header: "결제 상태",
			sortValue: (job) => PAYMENT_STATUS_LABELS[job.paymentStatus],
			cell: (job) => (
				<StatusBadge tone={job.paymentStatus === "paid" ? "good" : "warning"}>
					{PAYMENT_STATUS_LABELS[job.paymentStatus]}
				</StatusBadge>
			),
		},
		{
			id: "remainingDays",
			header: "남은 기간",
			sortValue: (job) =>
				remainingDays(job.exposureEndsAt) ?? Number.POSITIVE_INFINITY,
			cell: (job) => {
				const days = remainingDays(job.exposureEndsAt);

				if (days === null) {
					return <span className="text-muted-foreground">-</span>;
				}

				return (
					<span className="whitespace-nowrap">{`${Math.max(0, days)}일`}</span>
				);
			},
		},
		{
			id: "expiry",
			header: "만료 상태",
			sortValue: (job) => expiryLabel(job.exposureEndsAt),
			cell: (job) => {
				const label = expiryLabel(job.exposureEndsAt);

				return <StatusBadge tone={getExpiryTone(label)}>{label}</StatusBadge>;
			},
		},
		{
			id: "createdAt",
			header: "등록일",
			sortValue: (job) => job.createdAt.getTime(),
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{formatDateTime(job.createdAt)}
				</span>
			),
		},
	];
}

export default function ModeratorPaymentsPage() {
	const queryClient = useQueryClient();
	const [onlyUnpaid, setOnlyUnpaid] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const queryInput = { onlyUnpaid } as const;
	const jobsQuery = useQuery(
		orpc.bambi.moderation.listJobsForPayment.queryOptions({
			input: queryInput,
		})
	);
	const bulkPaymentMutation = useMutation(
		orpc.bambi.moderation.bulkSetJobPostPayment.mutationOptions()
	);

	const jobs = jobsQuery.data ?? [];

	const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

	const toggleRow = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);

			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}

			return next;
		});
	}, []);

	const toggleAll = useCallback(
		(checked: boolean) => {
			setSelectedIds(checked ? new Set(jobs.map((job) => job.id)) : new Set());
		},
		[jobs]
	);

	// 현재 목록 기준으로 전체/부분 선택 여부를 판정한다(필터가 바뀌어도 정확).
	const allSelected =
		jobs.length > 0 && jobs.every((job) => selectedIds.has(job.id));
	const someSelected = jobs.some((job) => selectedIds.has(job.id));

	const { mutate: bulkSetPayment, isPending: isBulkPending } =
		bulkPaymentMutation;
	const handleBulkPayment = useCallback(
		(paymentStatus: "paid" | "unpaid") => {
			const jobPostIds = Array.from(selectedIds);

			if (jobPostIds.length === 0) {
				return;
			}

			bulkSetPayment(
				{ jobPostIds, paymentStatus },
				{
					onError: () =>
						toast("결제 상태를 변경하지 못했어요. 다시 시도해 주세요."),
					onSuccess: async (result) => {
						await queryClient.invalidateQueries({
							queryKey: orpc.bambi.moderation.listJobsForPayment.queryKey({
								input: { onlyUnpaid },
							}),
						});
						clearSelection();

						const actionLabel =
							paymentStatus === "paid" ? "결제완료" : "미결제 전환";
						// 항목별 실패(예: 프리미엄 정원 초과)는 첫 사유를 함께 노출한다.
						const failureReason = result.failures[0]?.message;
						toast(
							result.failed > 0
								? `${result.succeeded}건 ${actionLabel} 처리, ${result.failed}건 실패${failureReason ? ` (${failureReason})` : ""}`
								: `${result.succeeded}건 ${actionLabel} 처리했어요`
						);
					},
				}
			);
		},
		[selectedIds, bulkSetPayment, queryClient, onlyUnpaid, clearSelection]
	);

	// 선택 상태·전체선택 판정·토글 핸들러 변화에만 컬럼을 재생성한다.
	const columns = useMemo(
		() =>
			getPaymentColumns({
				allSelected,
				onToggleAll: toggleAll,
				onToggleRow: toggleRow,
				selectedIds,
				someSelected,
			}),
		[allSelected, someSelected, selectedIds, toggleAll, toggleRow]
	);

	const selectedCount = selectedIds.size;

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="m-0 font-extrabold text-2xl">결제 관리</h1>
					<p className="m-0 text-muted-foreground text-sm">
						검수 큐를 거치지 않고 자동 게시되는 공고를 포함해, 결제 상태를 직접
						전환합니다. 공개 노출은 게시 + 결제완료가 모두 충족돼야 합니다.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Switch
						checked={onlyUnpaid}
						id="only-unpaid"
						onCheckedChange={(checked) => {
							setOnlyUnpaid(checked);
							clearSelection();
						}}
					/>
					<Label htmlFor="only-unpaid">미결제만 보기</Label>
				</div>
			</div>

			{selectedCount > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
					<span className="font-medium text-foreground text-sm">
						{selectedCount}개 선택됨
					</span>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							disabled={isBulkPending}
							onClick={() => handleBulkPayment("paid")}
							size="sm"
							type="button"
						>
							결제완료 처리
						</Button>
						<Button
							disabled={isBulkPending}
							onClick={() => handleBulkPayment("unpaid")}
							size="sm"
							type="button"
							variant="outline"
						>
							미결제로 되돌리기
						</Button>
						<Button
							onClick={clearSelection}
							size="sm"
							type="button"
							variant="ghost"
						>
							선택 해제
						</Button>
					</div>
				</div>
			) : null}

			{jobsQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{jobsQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{jobsQuery.isSuccess && jobs.length === 0 ? (
				<EmptyState
					description={
						onlyUnpaid
							? "미결제 상태로 노출 대기 중인 공고가 없어요."
							: "결제 처리가 필요한 공고가 없어요."
					}
					title="표시할 공고가 없어요"
				/>
			) : null}

			{jobsQuery.isSuccess && jobs.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={jobs}
						getRowKey={(job) => job.id}
						pageSize={10}
					/>
				</div>
			) : null}
		</div>
	);
}
