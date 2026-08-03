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
import { formatDateTime } from "@/lib/bambi-format";
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 광고 기간 조정 대상. 연장/단축은 부호만 다르므로 다이얼로그 하나를 공유한다.
interface PendingExposure {
	direction: "extend" | "shorten";
	exposureEndsAt: NonNullable<JobRow["exposureEndsAt"]>;
	jobPostId: string;
	title: string;
}

// 입력한 일수 문자열(1~365 정수)을 검증해 서버로 보낼 부호 있는 일수와 적용 후
// 종료일로 환산한다. 유효하지 않으면 null(= 확정 버튼 비활성·미리보기 미표시).
function resolveExposureAdjustment(
	pendingExposure: PendingExposure | null,
	daysInput: string
): { days: number; nextEndsAt: Date } | null {
	const days = Number.parseInt(daysInput, 10);

	if (!(pendingExposure && Number.isInteger(days)) || days < 1 || days > 365) {
		return null;
	}

	const signedDays = pendingExposure.direction === "shorten" ? -days : days;

	return {
		days: signedDays,
		nextEndsAt: new Date(
			new Date(pendingExposure.exposureEndsAt).getTime() +
				signedDays * MS_PER_DAY
		),
	};
}

function getJobColumns(
	onRequestStatus: (job: JobRow) => void,
	onRequestDelete: (job: JobRow) => void,
	onRequestExposure: (job: JobRow, direction: "extend" | "shorten") => void
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
						// 노출 종료일이 없는 공고(미결제·무기한)는 기준점이 없어 조정 불가.
						...(job.exposureEndsAt === null
							? []
							: [
									{
										key: "extend",
										label: "광고 연장",
										onSelect: () => onRequestExposure(job, "extend"),
									},
									{
										key: "shorten",
										label: "광고 단축",
										onSelect: () => onRequestExposure(job, "shorten"),
									},
								]),
						{
							key: "edit",
							label: "수정",
							href: `/moderator/jobs/${job.id}/edit` as Route,
						},
						{
							key: "delete",
							label: "삭제",
							onSelect: () => onRequestDelete(job),
							variant: "destructive" as const,
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
	const [pendingDelete, setPendingDelete] = useState<{
		jobPostId: string;
		title: string;
	} | null>(null);
	const [deleteReason, setDeleteReason] = useState("");
	const [pendingExposure, setPendingExposure] =
		useState<PendingExposure | null>(null);
	const [exposureDays, setExposureDays] = useState("7");
	const [exposureReason, setExposureReason] = useState("");

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
	const deleteMutation = useMutation(
		orpc.bambi.moderation.adminDeleteJobPost.mutationOptions({
			onSuccess: async () => {
				toast.success("공고를 완전히 삭제했어요.");
				setPendingDelete(null);
				setDeleteReason("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
						input: { limit: LIST_LIMIT },
					}),
				});
			},
			onError: () =>
				toast.error("공고를 삭제하지 못했어요. 다시 시도해 주세요."),
		})
	);
	const adjustExposureMutation = useMutation(
		orpc.bambi.moderation.adjustJobPostExposure.mutationOptions({
			onSuccess: async () => {
				toast.success(
					pendingExposure?.direction === "extend"
						? "광고 기간을 연장했어요."
						: "광고 기간을 단축했어요."
				);
				setPendingExposure(null);
				setExposureReason("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
						input: { limit: LIST_LIMIT },
					}),
				});
			},
			onError: () =>
				toast.error("광고 기간을 변경하지 못했어요. 다시 시도해 주세요."),
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

	const requestDelete = useCallback((job: JobRow) => {
		setPendingDelete({ jobPostId: job.id, title: job.title });
		setDeleteReason("");
	}, []);

	const requestExposure = useCallback(
		(job: JobRow, direction: "extend" | "shorten") => {
			if (job.exposureEndsAt === null) {
				return;
			}

			setPendingExposure({
				direction,
				exposureEndsAt: job.exposureEndsAt,
				jobPostId: job.id,
				title: job.title,
			});
			setExposureDays("7");
			setExposureReason("");
		},
		[]
	);

	const columns = useMemo(
		() => getJobColumns(requestStatusChange, requestDelete, requestExposure),
		[requestStatusChange, requestDelete, requestExposure]
	);

	const canConfirm = reason.trim().length >= 2 && !setStatusMutation.isPending;
	const canConfirmDelete =
		deleteReason.trim().length >= 2 && !deleteMutation.isPending;

	const exposureLabel =
		pendingExposure?.direction === "shorten" ? "단축" : "연장";
	const exposureAdjustment = resolveExposureAdjustment(
		pendingExposure,
		exposureDays
	);
	const canConfirmExposure =
		exposureAdjustment !== null &&
		exposureReason.trim().length >= 2 &&
		!adjustExposureMutation.isPending;

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

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
						setDeleteReason("");
					}
				}}
				open={pendingDelete !== null}
			>
				<DialogContent>
					<DialogTitle>공고 삭제</DialogTitle>
					<DialogDescription>
						"{pendingDelete?.title}" 공고를 완전히 삭제합니다. 연결된
						채팅방·미디어가 모두 지워지며 되돌릴 수 없어요. 사유는 감사 로그에
						남아요(2자 이상).
					</DialogDescription>
					<Textarea
						onChange={(event) => setDeleteReason(event.target.value)}
						placeholder="삭제 사유를 입력해 주세요."
						value={deleteReason}
					/>
					<div className="flex justify-end gap-2">
						<DialogClose
							render={
								<Button size="sm" type="button" variant="ghost">
									취소
								</Button>
							}
						/>
						<Button
							disabled={!canConfirmDelete}
							onClick={() => {
								if (!pendingDelete) {
									return;
								}

								deleteMutation.mutate({
									jobPostId: pendingDelete.jobPostId,
									reason: deleteReason.trim(),
								});
							}}
							size="sm"
							type="button"
							variant="destructive"
						>
							삭제 확정
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingExposure(null);
						setExposureReason("");
					}
				}}
				open={pendingExposure !== null}
			>
				<DialogContent>
					<DialogTitle>광고 {exposureLabel}</DialogTitle>
					<DialogDescription>
						"{pendingExposure?.title}" 공고의 광고 종료일을 {exposureLabel}
						합니다. 현재 종료일{" "}
						{pendingExposure
							? formatDateTime(pendingExposure.exposureEndsAt)
							: "-"}
						{" → "}
						{exposureAdjustment
							? formatDateTime(exposureAdjustment.nextEndsAt)
							: "-"}
						. 사유는 감사 로그에 남아요(2자 이상).
					</DialogDescription>
					<Input
						max={365}
						min={1}
						onChange={(event) => setExposureDays(event.target.value)}
						placeholder="일수(1~365)"
						step={1}
						type="number"
						value={exposureDays}
					/>
					<Textarea
						onChange={(event) => setExposureReason(event.target.value)}
						placeholder="조정 사유를 입력해 주세요."
						value={exposureReason}
					/>
					<div className="flex justify-end gap-2">
						<DialogClose
							render={
								<Button size="sm" type="button" variant="ghost">
									취소
								</Button>
							}
						/>
						<Button
							disabled={!canConfirmExposure}
							onClick={() => {
								if (!(pendingExposure && exposureAdjustment)) {
									return;
								}

								adjustExposureMutation.mutate({
									days: exposureAdjustment.days,
									jobPostId: pendingExposure.jobPostId,
									reason: exposureReason.trim(),
								});
							}}
							size="sm"
							type="button"
							variant={
								pendingExposure?.direction === "shorten"
									? "destructive"
									: "default"
							}
						>
							{exposureLabel} 확정
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
