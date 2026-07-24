"use client";

// 밤비 — 운영자 전용 전체 공고 통합 관리 목록.
// 검수 큐(pending_review 전용)와 달리 모든 상태의 공고를 상태·업소명·제목으로 필터/검색하고,
// 공개(published) 공고를 강제로 내리거나(hidden) 숨긴 공고를 재공개한다. 본문/이미지 수정은
// 행의 "수정"에서 운영자 편집 페이지(/moderator/jobs/[id]/edit)로 이동한다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	expiryColumn,
	exposureTypeColumn,
	jobOrganizationColumn,
	jobStatusColumn,
	jobTitleColumn,
	paymentStatusColumn,
} from "@/components/bambi/job-table-columns";
import { RowActions } from "@/components/bambi/row-actions";
import { NEGOTIABLE_PAY_TEXT } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

type JobRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listJobPosts"]>
>[number];

// "all"은 서버에 status 미전달(전체 조회)로 매핑한다. 서버 스키마상 draft는 검수/관리
// 대상이 아니라 필터 선택지에서 제외한다(전체 조회에는 포함될 수 있음).
type StatusFilter =
	| "all"
	| "pending_review"
	| "published"
	| "hidden"
	| "rejected";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "pending_review", label: "검수 대기" },
	{ value: "published", label: "공개" },
	{ value: "hidden", label: "숨김" },
	{ value: "rejected", label: "반려" },
];

// 조회 상한은 관리 목록 특성상 넉넉히(서버 max 100). 검색·정렬은 클라이언트에서 처리한다.
const LIST_LIMIT = 100;

const formatPay = (job: JobRow): string =>
	job.payAmount === null
		? NEGOTIABLE_PAY_TEXT
		: `${job.payUnit} ${job.payAmount.toLocaleString("ko-KR")}원`;

// 강제 내림/재공개 확인 대상(어떤 공고를 어떤 상태로 바꾸는지).
interface PendingAction {
	jobPostId: string;
	label: string;
	status: "hidden" | "published";
	title: string;
}

function getJobColumns(
	onRequestStatus: (job: JobRow) => void
): DataColumn<JobRow>[] {
	return [
		jobTitleColumn<JobRow>(),
		jobOrganizationColumn<JobRow>(),
		{
			id: "industryCategory",
			header: "업종",
			sortValue: (job) => job.industryCategory,
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{job.industryCategory}
				</span>
			),
		},
		{
			id: "region",
			header: "지역",
			sortValue: (job) => job.region,
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{job.region}
				</span>
			),
		},
		{
			id: "pay",
			header: "급여",
			sortValue: (job) => job.payAmount ?? -1,
			cell: (job) => (
				<span className="whitespace-nowrap text-foreground">
					{formatPay(job)}
				</span>
			),
		},
		jobStatusColumn<JobRow>(),
		exposureTypeColumn<JobRow>(),
		paymentStatusColumn<JobRow>(),
		expiryColumn<JobRow>({ withRemainingDays: true }),
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (job) => (
				<RowActions
					actions={[
						...(job.status === "published"
							? [
									{
										key: "hide",
										label: "숨김",
										onSelect: () => onRequestStatus(job),
										variant: "destructive" as const,
									},
								]
							: []),
						...(job.status === "hidden"
							? [
									{
										key: "show",
										label: "재공개",
										onSelect: () => onRequestStatus(job),
									},
								]
							: []),
						{
							key: "edit",
							label: "수정",
							href: `/moderator/jobs/${job.id}/edit` as Route,
						},
					]}
					ariaLabel={`${job.title} 관리 메뉴`}
				/>
			),
		},
	];
}

export default function ModeratorJobsPage() {
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [search, setSearch] = useState("");
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");

	const jobsQuery = useQuery(
		orpc.bambi.moderation.listJobPosts.queryOptions({
			input: {
				limit: LIST_LIMIT,
				status: statusFilter === "all" ? undefined : statusFilter,
			},
		})
	);
	const setStatusMutation = useMutation(
		orpc.bambi.moderation.setJobPostStatus.mutationOptions({
			onSuccess: async () => {
				toast.success(
					pending?.status === "hidden"
						? "공고를 숨김 처리했어요."
						: "공고를 다시 공개했어요."
				);
				setPending(null);
				setReason("");
				// 부분 키(status 생략)로 모든 상태 필터 캐시를 함께 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
						input: { limit: LIST_LIMIT },
					}),
				});
			},
			onError: () =>
				toast.error("공고 상태를 변경하지 못했어요. 다시 시도해 주세요."),
		})
	);

	const jobs = jobsQuery.data ?? [];

	const visibleJobs = useMemo(() => {
		const keyword = search.trim().toLowerCase();

		if (!keyword) {
			return jobs;
		}

		return jobs.filter(
			(job) =>
				job.title.toLowerCase().includes(keyword) ||
				job.organizationDisplayName.toLowerCase().includes(keyword)
		);
	}, [jobs, search]);

	const requestStatusChange = useCallback((job: JobRow) => {
		const toHidden = job.status === "published";
		const defaultReason = toHidden
			? "운영자가 공고를 숨김 처리했습니다."
			: "운영자가 공고를 다시 공개했습니다.";
		setPending({
			jobPostId: job.id,
			label: toHidden ? "숨김" : "재공개",
			status: toHidden ? "hidden" : "published",
			title: job.title,
		});
		setReason(defaultReason);
	}, []);

	const columns = useMemo(
		() => getJobColumns(requestStatusChange),
		[requestStatusChange]
	);

	const canConfirm = reason.trim().length >= 2 && !setStatusMutation.isPending;

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">공고 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					모든 상태의 공고를 검색·확인하고, 공개된 공고를 강제로 내리거나 숨긴
					공고를 재공개합니다. 본문·이미지 수정은 각 행의 "수정"에서 진행합니다.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Tabs
					onValueChange={(value) => setStatusFilter(value as StatusFilter)}
					value={statusFilter}
				>
					<TabsList className="max-w-full flex-wrap">
						{STATUS_FILTERS.map((option) => (
							<TabsTrigger key={option.value} value={option.value}>
								{option.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Input
					className="max-w-xs"
					onChange={(event) => setSearch(event.target.value)}
					placeholder="공고 제목·업소명 검색"
					value={search}
				/>
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

			{jobsQuery.isSuccess && visibleJobs.length === 0 ? (
				<EmptyState
					description={
						search.trim()
							? "검색 조건에 맞는 공고가 없어요."
							: "해당 상태의 공고가 없어요."
					}
					title="표시할 공고가 없어요"
				/>
			) : null}

			{jobsQuery.isSuccess && visibleJobs.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={visibleJobs}
						getRowKey={(job) => job.id}
						pageSize={10}
					/>
				</div>
			) : null}

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setPending(null);
						setReason("");
					}
				}}
				open={pending !== null}
			>
				<DialogContent>
					<DialogTitle>공고 {pending?.label}</DialogTitle>
					<DialogDescription>
						"{pending?.title}" 공고를 {pending?.label} 처리합니다. 사유는 감사
						로그에 남아요(2자 이상).
					</DialogDescription>
					<Textarea
						onChange={(event) => setReason(event.target.value)}
						placeholder="조치 사유를 입력해 주세요."
						value={reason}
					/>
					<div className="flex justify-end gap-2">
						<DialogClose
							nativeButton={false}
							render={
								<Button size="sm" type="button" variant="ghost">
									취소
								</Button>
							}
						/>
						<Button
							disabled={!canConfirm}
							onClick={() => {
								if (!pending) {
									return;
								}

								setStatusMutation.mutate({
									jobPostId: pending.jobPostId,
									reason: reason.trim(),
									status: pending.status,
								});
							}}
							size="sm"
							type="button"
							variant={pending?.status === "hidden" ? "destructive" : "default"}
						>
							{pending?.label} 확정
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
