"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/bambi/status-badge";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";
import { formatDateTime, formatPay } from "@/lib/bambi-format";
import { jobStatusLabels, verificationStatusLabels } from "@/lib/bambi-options";

export type EmployerJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["jobs"]["listMine"]>
>[number];

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getVerificationStatusLabel = (status: string): string =>
	verificationStatusLabels[status as keyof typeof verificationStatusLabels] ??
	status;

const getJobStatusTone = (status: string): Tone => {
	if (status === "published") {
		return "good";
	}

	if (status === "pending_review") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

const getVerificationStatusTone = (status: string): Tone => {
	if (status === "verified") {
		return "good";
	}

	if (status === "pending") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

const getPaymentStatusTone = (status: string): Tone =>
	status === "paid" ? "good" : "warning";

const getExpiryTone = (label: string): Tone => {
	if (label === "진행중") {
		return "good";
	}

	if (label === "만료") {
		return "danger";
	}

	return "default";
};

interface EmployerJobsColumnsOptions {
	deletingJobId: null | string;
	onRequestDelete: (jobId: string) => void;
}

export function getEmployerJobsColumns({
	deletingJobId,
	onRequestDelete,
}: EmployerJobsColumnsOptions): ColumnDef<EmployerJob>[] {
	return [
		{
			accessorKey: "title",
			header: "제목",
			cell: ({ row }) => (
				<Link
					className="font-medium text-foreground underline-offset-4 hover:underline"
					href={`/employer/jobs/${row.original.id}/edit` as Route}
				>
					{row.original.title}
				</Link>
			),
		},
		{
			id: "categoryRegion",
			accessorFn: (job) => `${job.industryCategory} · ${job.region}`,
			header: "직종·지역",
			cell: ({ getValue }) => (
				<span className="break-keep text-muted-foreground">
					{getValue<string>()}
				</span>
			),
		},
		{
			id: "pay",
			accessorFn: (job) => job.payAmount,
			header: "급여",
			cell: ({ row }) => (
				<span className="whitespace-nowrap">
					{formatPay(row.original.payAmount, row.original.payUnit)}
				</span>
			),
		},
		{
			accessorKey: "exposureType",
			header: "노출 상품",
			cell: ({ row }) => (
				<StatusBadge>
					{EXPOSURE_TYPE_LABELS[row.original.exposureType]}
				</StatusBadge>
			),
		},
		{
			accessorKey: "status",
			header: "공고 상태",
			cell: ({ row }) => (
				<StatusBadge tone={getJobStatusTone(row.original.status)}>
					{getJobStatusLabel(row.original.status)}
				</StatusBadge>
			),
		},
		{
			accessorKey: "paymentStatus",
			header: "결제 상태",
			cell: ({ row }) => (
				<StatusBadge tone={getPaymentStatusTone(row.original.paymentStatus)}>
					{PAYMENT_STATUS_LABELS[row.original.paymentStatus]}
				</StatusBadge>
			),
		},
		{
			id: "remainingDays",
			accessorFn: (job) => remainingDays(job.exposureEndsAt) ?? Number.NaN,
			header: "남은 기간",
			cell: ({ row }) => {
				const days = remainingDays(row.original.exposureEndsAt);

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
			accessorFn: (job) => expiryLabel(job.exposureEndsAt),
			header: "만료 상태",
			cell: ({ row }) => {
				const label = expiryLabel(row.original.exposureEndsAt);

				return <StatusBadge tone={getExpiryTone(label)}>{label}</StatusBadge>;
			},
		},
		{
			accessorKey: "employerVerificationStatus",
			header: "사업자 인증",
			cell: ({ row }) => (
				<StatusBadge
					tone={getVerificationStatusTone(
						row.original.employerVerificationStatus
					)}
				>
					{getVerificationStatusLabel(row.original.employerVerificationStatus)}
				</StatusBadge>
			),
		},
		{
			accessorKey: "updatedAt",
			header: "수정일",
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{formatDateTime(row.original.updatedAt)}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			enableSorting: false,
			cell: ({ row }) => {
				const job = row.original;

				return (
					<div className="flex items-center gap-2">
						<Link
							className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
							href={`/employer/jobs/${job.id}/edit` as Route}
						>
							수정
						</Link>
						<Button
							disabled={deletingJobId === job.id}
							onClick={() => onRequestDelete(job.id)}
							size="sm"
							type="button"
							variant="destructive"
						>
							<Trash2 data-icon="inline-start" />
							삭제
						</Button>
					</div>
				);
			},
		},
	];
}
