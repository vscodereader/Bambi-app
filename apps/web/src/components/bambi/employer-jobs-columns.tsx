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
import { getJobDisplayStatus } from "@/lib/bambi/exposure";
import { formatPay } from "@/lib/bambi-format";

export type EmployerJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["jobs"]["listMine"]>
>[number];

// 제목이 이 길이를 넘으면 말줄임(…)으로 처리한다.
const TITLE_MAX_LENGTH = 17;

// 공개 상세(/seeker/jobs/[id])는 published+paid 게이트를 통과해야만 열린다. 그렇지 않은
// 공고 제목을 링크로 걸면 클릭 시 404가 나므로, 공개 가능한 공고만 링크로 노출한다.
const isPubliclyViewable = (job: EmployerJob): boolean =>
	job.status === "published" && job.paymentStatus === "paid";

// 배지 한 줄로는 "왜 안 보이는지"를 알 수 없다. 스페셜·급구·추천 상품을 붙였는데 목록 섹션에
// 안 뜨는 흔한 원인이 결제 대기(무통장입금 미확인)이고, 반려는 사유를 봐야 다시 낼 수 있다.
// 공개 게이트는 published AND paid라 두 축을 함께 본다.
const getJobStatusNote = (job: EmployerJob): null | string => {
	if (job.paymentStatus !== "paid" && job.status === "published") {
		return "입금 확인 후 노출됩니다.";
	}

	if (job.paymentStatus !== "paid" && job.status === "pending_review") {
		return "검수 통과와 입금 확인을 모두 마쳐야 노출됩니다.";
	}

	// 검수 보류는 운영자가 판단을 미룬 상태다 — "숨김"과 달리 구인자가 할 일이 없다.
	if (job.status === "on_hold") {
		return "운영자가 추가 확인 중입니다. 검수가 끝나면 상태가 바뀝니다.";
	}

	if (job.status === "rejected") {
		return job.rejectionReason
			? `반려 사유: ${job.rejectionReason}`
			: "수정 후 제출하면 재검수를 거칩니다.";
	}

	return null;
};

const getTruncatedTitle = (title: string): string =>
	title.length > TITLE_MAX_LENGTH
		? `${title.slice(0, TITLE_MAX_LENGTH)}…`
		: title;

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
			// 금액 없는 협의 공고는 0으로 취급해 금액 오름차순 맨 앞에 모인다.
			sortValue: (job) => job.payAmount ?? 0,
			cell: (job) => (
				<span className="whitespace-nowrap">
					{formatPay(job.payAmount, job.payUnit)}
				</span>
			),
		},
		{
			id: "status",
			header: "공고 상태",
			sortValue: (job) => getJobDisplayStatus(job).label,
			cell: (job) => {
				const display = getJobDisplayStatus(job);
				const note = getJobStatusNote(job);

				return (
					<div className="flex flex-col items-start gap-1">
						<StatusBadge tone={display.tone}>{display.label}</StatusBadge>
						{note ? (
							// 반려 사유는 길 수 있다. 셀 폭을 붙들어 두고 줄바꿈시킨다 —
							// 안 그러면 표가 가로로 늘어나 다른 열이 밀린다.
							<span className="max-w-56 text-pretty break-words text-muted-foreground text-xs">
								{note}
							</span>
						) : null}
					</div>
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
