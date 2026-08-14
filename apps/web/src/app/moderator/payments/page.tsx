"use client";

// 밤비 — 운영자 전용 결제 관리 목록.
// 공개 노출은 published + paymentStatus=paid 게이트를 통과해야 하는데, 유료 노출상품을
// 선택한 공고는 결제완료 처리 전까지 노출되지 않는다. 무료 공고는 등록 즉시 paid라 여기엔
// 유료(미결제) 공고 위주로 남는다. 제목 왼쪽 체크박스로 다중 선택해 일괄 결제 처리한다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";
import { Button } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { JobDetailDesignDialog } from "@/components/bambi/job-detail-design-dialog";
import {
	expiryColumn,
	exposureTypeColumn,
	jobOrganizationColumn,
	jobStatusColumn,
	jobTitleColumn,
	paymentStatusColumn,
} from "@/components/bambi/job-table-columns";
import { StatusBadge } from "@/components/bambi/status-badge";
import { formatAdPrice } from "@/lib/bambi/ad-catalog";
import {
	EXPOSURE_TYPE_LABELS,
	JOB_DETAIL_DESIGN_STATUS_LABELS,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";
import { BoostPurchasesSection } from "./boost-purchases-section";

type PaymentJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listJobsForPayment"]>
>[number];

const paymentTotal = (job: PaymentJob): null | number => {
	const base = sumJobPaymentAmount(job.exposureAmount, job.detailDesignAmount);
	const boostTotal = (job.boostPurchases ?? []).reduce(
		(sum, purchase) => sum + purchase.amount,
		0
	);
	return base === null && boostTotal === 0 ? null : (base ?? 0) + boostTotal;
};

const BUNDLED_PAYMENT_LABELS = {
	auto_period: "자동 끌어올리기",
	manual_count: "횟수권",
	manual_period: "끌어올리기",
} as const;

function PaymentAmountBreakdown({ job }: { job: PaymentJob }) {
	const total = paymentTotal(job);
	if (total === null) {
		return <span className="text-muted-foreground">무료</span>;
	}

	return (
		<div className="flex flex-col items-start gap-0.5">
			<span className="whitespace-nowrap font-medium text-foreground">
				{formatAdPrice(total)}
			</span>
			{job.detailDesignAmount === null ? null : (
				<span className="whitespace-nowrap text-muted-foreground text-xs">
					디자인 +{formatAdPrice(job.detailDesignAmount)}
				</span>
			)}
			{(job.boostPurchases ?? []).map((purchase) => (
				<span
					className="whitespace-nowrap text-muted-foreground text-xs"
					key={purchase.optionType}
				>
					{BUNDLED_PAYMENT_LABELS[purchase.optionType]} +
					{formatAdPrice(purchase.amount)}
				</span>
			))}
		</div>
	);
}

interface PaymentColumnsOptions {
	allSelected: boolean;
	onOpenDesign: (jobId: string) => void;
	onToggleAll: (checked: boolean) => void;
	onToggleRow: (id: string) => void;
	selectedIds: Set<string>;
	someSelected: boolean;
}

function getPaymentColumns({
	allSelected,
	onOpenDesign,
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
		jobTitleColumn<PaymentJob>(),
		jobOrganizationColumn<PaymentJob>(),
		jobStatusColumn<PaymentJob>(),
		exposureTypeColumn<PaymentJob>(),
		{
			id: "exposureAmount",
			header: "결제 금액",
			sortValue: (job) => paymentTotal(job) ?? 0,
			cell: (job) => <PaymentAmountBreakdown job={job} />,
		},
		{
			id: "detailDesign",
			header: "디자인 제작",
			sortValue: (job) => job.detailDesignStatus ?? "",
			cell: (job) =>
				job.detailDesignStatus === null ? (
					<span className="text-muted-foreground">-</span>
				) : (
					<div className="flex flex-col items-start gap-1">
						<StatusBadge
							tone={job.detailDesignStatus === "completed" ? "good" : "warning"}
						>
							{JOB_DETAIL_DESIGN_STATUS_LABELS[job.detailDesignStatus]}
						</StatusBadge>
						<Button
							onClick={() => onOpenDesign(job.id)}
							size="sm"
							type="button"
							variant="outline"
						>
							디자인 제작 관리
						</Button>
					</div>
				),
		},
		paymentStatusColumn<PaymentJob>(),
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
		expiryColumn<PaymentJob>(),
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
	const [onlyDetailDesign, setOnlyDetailDesign] = useState(false);
	const [designJobId, setDesignJobId] = useState<null | string>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const queryInput = { onlyDetailDesign, onlyUnpaid } as const;
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
						// 필터가 둘로 늘어나 키가 갈린다 — 조회와 같은 입력으로 무효화하지
						// 않으면 처리 후 목록이 옛 상태 그대로 남는다.
						await queryClient.invalidateQueries({
							queryKey: orpc.bambi.moderation.listJobsForPayment.queryKey({
								input: queryInput,
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
		[selectedIds, bulkSetPayment, queryClient, queryInput, clearSelection]
	);

	// 선택 상태·전체선택 판정·토글 핸들러 변화에만 컬럼을 재생성한다.
	const columns = useMemo(
		() =>
			getPaymentColumns({
				allSelected,
				onOpenDesign: setDesignJobId,
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
				<div className="flex flex-wrap items-center gap-3">
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
					<div className="flex items-center gap-2">
						<Switch
							checked={onlyDetailDesign}
							id="only-detail-design"
							onCheckedChange={(checked) => {
								setOnlyDetailDesign(checked);
								clearSelection();
							}}
						/>
						<Label htmlFor="only-detail-design">디자인 제작 신청건만</Label>
					</div>
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
				<>
					<div className="hidden overflow-x-auto rounded-xl border border-border md:block">
						<DataTable
							columns={columns}
							data={jobs}
							getRowKey={(job) => job.id}
							pageSize={10}
						/>
					</div>
					<div className="flex flex-col gap-3 md:hidden">
						<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
							<Checkbox
								aria-label="전체 공고 선택"
								checked={allSelected}
								indeterminate={someSelected && !allSelected}
								onCheckedChange={(checked) => toggleAll(checked === true)}
							/>
							전체 선택
						</div>
						{jobs.map((job) => {
							const days = remainingDays(job.exposureEndsAt);
							return (
								<article
									className="rounded-xl border border-border bg-card p-4"
									key={job.id}
								>
									<div className="flex items-start gap-3">
										<Checkbox
											aria-label={`${job.title} 선택`}
											checked={selectedIds.has(job.id)}
											onCheckedChange={() => toggleRow(job.id)}
										/>
										<div className="min-w-0 flex-1">
											<h3 className="m-0 break-words font-semibold text-base">
												{job.title}
											</h3>
											<p className="m-0 text-muted-foreground text-sm">
												{job.organizationDisplayName}
											</p>
										</div>
										<StatusBadge
											tone={job.paymentStatus === "paid" ? "good" : "warning"}
										>
											{PAYMENT_STATUS_LABELS[job.paymentStatus]}
										</StatusBadge>
									</div>
									<div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
										<div>
											<p className="m-0 text-muted-foreground">노출 상품</p>
											<p className="m-0">
												{EXPOSURE_TYPE_LABELS[job.exposureType]}
											</p>
										</div>
										<div>
											<p className="m-0 text-muted-foreground">남은 기간</p>
											<p className="m-0">
												{days === null ? "-" : `${Math.max(0, days)}일`}
											</p>
										</div>
										<div>
											<p className="m-0 text-muted-foreground">결제 금액</p>
											<PaymentAmountBreakdown job={job} />
										</div>
										<div>
											<p className="m-0 text-muted-foreground">등록일</p>
											<p className="m-0">{formatDateTime(job.createdAt)}</p>
										</div>
									</div>
									{job.detailDesignStatus === null ? null : (
										<Button
											className="mt-4 w-full"
											onClick={() => setDesignJobId(job.id)}
											size="sm"
											type="button"
											variant="outline"
										>
											디자인 제작 관리
										</Button>
									)}
								</article>
							);
						})}
					</div>
				</>
			) : null}

			<Separator />

			<BoostPurchasesSection />

			{designJobId ? (
				<JobDetailDesignDialog
					jobPostId={designJobId}
					onOpenChange={(nextOpen) => {
						if (!nextOpen) {
							setDesignJobId(null);
						}
					}}
					open
				/>
			) : null}
		</div>
	);
}
