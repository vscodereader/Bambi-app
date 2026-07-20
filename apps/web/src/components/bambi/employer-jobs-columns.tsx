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

// 제목이 이 길이를 넘으면 말줄임(…)으로 처리한다.
const TITLE_MAX_LENGTH = 17;

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

// 공개 상세(/seeker/jobs/[id])는 published+paid 게이트를 통과해야만 열린다. 그렇지 않은
// 공고 제목을 링크로 걸면 클릭 시 404가 나므로, 공개 가능한 공고만 링크로 노출한다.
const isPubliclyViewable = (job: EmployerJob): boolean =>
	job.status === "published" && job.paymentStatus === "paid";

const getTruncatedTitle = (title: string): string =>
	title.length > TITLE_MAX_LENGTH
		? `${title.slice(0, TITLE_MAX_LENGTH)}…`
		: title;

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
			cell: (job) =>
				isPubliclyViewable(job) ? (
					<Link
						className="font-medium text-foreground underline-offset-4 hover:underline"
						href={`/seeker/jobs/${job.id}` as Route}
						title={job.title}
					>
						{getTruncatedTitle(job.title)}
					</Link>
				) : (
					<span className="font-medium text-foreground" title={job.title}>
						{getTruncatedTitle(job.title)}
					</span>
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
