"use client";

// 밤비 — 운영자 전용 결제 관리 목록.
// 공개 노출은 published + paymentStatus=paid 게이트를 통과해야 하는데, 인증 업체
// 공고는 검수 큐 없이 자동 published라 검수 상세의 결제 패널로는 처리할 수 없다.
// 이 목록에서 draft를 제외한 공고의 결제 상태를 직접 전환한다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { StatusBadge } from "@/components/bambi/status-badge";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { formatDateTime } from "@/lib/bambi-format";
import { jobStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

type PaymentJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listJobsForPayment"]>
>[number];

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getJobStatusTone = (status: string): Tone => {
	if (status === "published") {
		return "good";
	}

	if (status === "pending_review") {
		return "warning";
	}

	return "default";
};

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
	onToggle: (job: PaymentJob) => void;
	pendingId: null | string;
}

function getPaymentColumns({
	onToggle,
	pendingId,
}: PaymentColumnsOptions): DataColumn<PaymentJob>[] {
	return [
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
			sortValue: (job) => getJobStatusLabel(job.status),
			cell: (job) => (
				<StatusBadge tone={getJobStatusTone(job.status)}>
					{getJobStatusLabel(job.status)}
				</StatusBadge>
			),
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
		{
			id: "actions",
			header: "결제 처리",
			cell: (job) => {
				const isPaid = job.paymentStatus === "paid";

				return (
					<Button
						disabled={pendingId === job.id}
						onClick={() => onToggle(job)}
						size="sm"
						type="button"
						variant={isPaid ? "outline" : "default"}
					>
						{isPaid ? "미결제로 되돌리기" : "결제완료 처리"}
					</Button>
				);
			},
		},
	];
}

export default function ModeratorPaymentsPage() {
	const queryClient = useQueryClient();
	const [onlyUnpaid, setOnlyUnpaid] = useState(false);

	const queryInput = { onlyUnpaid } as const;
	const jobsQuery = useQuery(
		orpc.bambi.moderation.listJobsForPayment.queryOptions({
			input: queryInput,
		})
	);
	const setPaymentMutation = useMutation(
		orpc.bambi.moderation.setJobPostPayment.mutationOptions()
	);

	const pendingId = setPaymentMutation.isPending
		? (setPaymentMutation.variables?.jobPostId ?? null)
		: null;

	const { mutate: setPayment } = setPaymentMutation;
	const handleToggle = useCallback(
		(job: PaymentJob) => {
			const nextStatus = job.paymentStatus === "paid" ? "unpaid" : "paid";

			setPayment(
				{ jobPostId: job.id, paymentStatus: nextStatus },
				{
					onError: () =>
						toast("결제 상태를 변경하지 못했어요. 다시 시도해 주세요."),
					onSuccess: async () => {
						await queryClient.invalidateQueries({
							queryKey: orpc.bambi.moderation.listJobsForPayment.queryKey({
								input: { onlyUnpaid },
							}),
						});
						toast(
							nextStatus === "paid"
								? "결제완료로 처리했어요"
								: "미결제로 되돌렸어요"
						);
					},
				}
			);
		},
		[onlyUnpaid, queryClient, setPayment]
	);

	// pendingId(진행 중 결제 대상)와 handleToggle 변화에만 컬럼을 재생성한다.
	const columns = useMemo(
		() => getPaymentColumns({ onToggle: handleToggle, pendingId }),
		[pendingId, handleToggle]
	);

	const jobs = jobsQuery.data ?? [];

	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6",
				APP_CONTENT_WIDTH
			)}
		>
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
						onCheckedChange={setOnlyUnpaid}
					/>
					<Label htmlFor="only-unpaid">미결제만 보기</Label>
				</div>
			</div>

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
					/>
				</div>
			) : null}
		</div>
	);
}
