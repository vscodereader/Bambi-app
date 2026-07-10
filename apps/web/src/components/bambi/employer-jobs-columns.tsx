"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { buttonVariants } from "@bambi-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import { cn } from "@bambi-app/ui/lib/utils";
import { EllipsisIcon, PencilIcon, Trash2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { DataColumn } from "@/components/bambi/data-table";
import { StatusBadge } from "@/components/bambi/status-badge";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";
import { formatPay } from "@/lib/bambi-format";
import { jobStatusLabels } from "@/lib/bambi-options";

export type EmployerJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["jobs"]["listMine"]>
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
}: EmployerJobsColumnsOptions): DataColumn<EmployerJob>[] {
	return [
		{
			id: "title",
			header: "제목",
			sortValue: (job) => job.title,
			cell: (job) => (
				<Link
					className="font-medium text-foreground underline-offset-4 hover:underline"
					href={`/employer/jobs/${job.id}/edit` as Route}
				>
					{job.title}
				</Link>
			),
		},
		{
			id: "categoryRegion",
			header: "직종·지역",
			sortValue: (job) => `${job.industryCategory} · ${job.region}`,
			cell: (job) => (
				<span className="break-keep text-muted-foreground">
					{`${job.industryCategory} · ${job.region}`}
				</span>
			),
		},
		{
			id: "pay",
			header: "급여",
			sortValue: (job) => job.payAmount,
			cell: (job) => (
				<span className="whitespace-nowrap">
					{formatPay(job.payAmount, job.payUnit)}
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
				<StatusBadge tone={getPaymentStatusTone(job.paymentStatus)}>
					{PAYMENT_STATUS_LABELS[job.paymentStatus]}
				</StatusBadge>
			),
		},
		{
			id: "period",
			header: "기간",
			sortValue: (job) =>
				remainingDays(job.exposureEndsAt) ?? Number.POSITIVE_INFINITY,
			cell: (job) => {
				const label = expiryLabel(job.exposureEndsAt);
				const days = remainingDays(job.exposureEndsAt);
				const showDays = days !== null && days > 0;

				return (
					<StatusBadge tone={getExpiryTone(label)}>
						{showDays ? `${label} · ${days}일` : label}
					</StatusBadge>
				);
			},
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (job) => (
				<DropdownMenu>
					<DropdownMenuTrigger
						aria-label="공고 관리 메뉴"
						className={cn(
							buttonVariants({ size: "icon-sm", variant: "ghost" })
						)}
					>
						<EllipsisIcon />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							render={<Link href={`/employer/jobs/${job.id}/edit` as Route} />}
						>
							<PencilIcon />
							수정
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={deletingJobId === job.id}
							onClick={() => onRequestDelete(job.id)}
							variant="destructive"
						>
							<Trash2 />
							삭제
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	];
}
