"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import { Trash2 } from "lucide-react";
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
			id: "exposureType",
			header: "노출 상품",
			sortValue: (job) => EXPOSURE_TYPE_LABELS[job.exposureType],
			cell: (job) => (
				<StatusBadge>{EXPOSURE_TYPE_LABELS[job.exposureType]}</StatusBadge>
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
			id: "employerVerificationStatus",
			header: "사업자 인증",
			sortValue: (job) =>
				getVerificationStatusLabel(job.employerVerificationStatus),
			cell: (job) => (
				<StatusBadge
					tone={getVerificationStatusTone(job.employerVerificationStatus)}
				>
					{getVerificationStatusLabel(job.employerVerificationStatus)}
				</StatusBadge>
			),
		},
		{
			id: "updatedAt",
			header: "수정일",
			sortValue: (job) => job.updatedAt.getTime(),
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{formatDateTime(job.updatedAt)}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			cell: (job) => (
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
			),
		},
	];
}
