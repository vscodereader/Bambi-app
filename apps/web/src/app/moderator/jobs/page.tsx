"use client";

// 밤비 — 운영자 전용 전체 공고 통합 관리 목록.
// 검수 큐(pending_review 전용)와 달리 모든 상태의 공고를 상태·업소명·제목으로 필터/검색하고,
// 공개(published) 공고를 강제로 내리거나(hidden) 숨긴 공고를 재공개하고, 검수에서 보류한
// (on_hold) 공고를 승인·반려로 마무리한다. 본문/이미지 수정은 행의 "수정"에서 운영자 편집
// 페이지(/moderator/jobs/[id]/edit)로 이동한다(상태 무관).
// 제목 링크는 공개 상세(/seeker/jobs/[id])로 가는데, 이 상세는 published+paid만 열어 주므로
// 그 게이트를 통과한 행만 링크로 만든다.

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
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	expiryColumn,
	exposureTypeColumn,
	jobOrganizationColumn,
	jobStatusColumn,
	paymentStatusColumn,
} from "@/components/bambi/job-table-columns";
import { ListingCapacityOverview } from "@/components/bambi/listing-capacity-overview";
import { RowActions } from "@/components/bambi/row-actions";
import { getJobDisplayStatus, isQueuedListing } from "@/lib/bambi/exposure";
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
	| "on_hold"
	| "published"
	| "hidden"
	| "rejected";

// 검수 큐는 pending_review만 조회하므로, 보류(on_hold)한 공고를 운영자가 다시 찾는
// 유일한 경로가 이 탭이다.
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "pending_review", label: "검수 대기" },
	{ value: "on_hold", label: "검수 보류" },
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

// 강제 내림/재공개/보류 해소 확인 대상(어떤 공고를 어떤 상태로 바꾸는지).
type ActionStatus = "hidden" | "published" | "rejected";

interface PendingAction {
	jobPostId: string;
	label: string;
	status: ActionStatus;
	title: string;
}

// 상태 변경별 기본 사유(감사 로그 프리필)와 성공 토스트. 보류(on_hold) 공고는 재공개가
// 아니라 검수 결론(승인·반려)을 내는 자리라 문구도 검수 어투로 둔다.
const ACTION_COPY: Record<
	ActionStatus,
	{ defaultReason: string; success: string }
> = {
	hidden: {
		defaultReason: "운영자가 공고를 숨김 처리했습니다.",
		success: "공고를 숨김 처리했어요.",
	},
	published: {
		defaultReason: "운영자가 공고를 다시 공개했습니다.",
		success: "공고를 공개했어요.",
	},
	rejected: {
		defaultReason: "운영자가 정책 위반으로 공고를 반려했습니다.",
		success: "공고를 반려했어요.",
	},
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 광고 기간 조정 대상. 연장/단축은 부호만 다르므로 다이얼로그 하나를 공유한다.
// exposureEndsAt이 null(미결제·무기한)이면 기준일은 지금이다(서버와 동일 규칙).
interface PendingExposure {
	direction: "extend" | "shorten";
	exposureEndsAt: JobRow["exposureEndsAt"];
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
	// 종료일이 없으면 지금이 기준일. 렌더 시각과 서버 적용 시각의 초 단위 오차는 허용한다.
	const baseEndsAt = pendingExposure.exposureEndsAt
		? new Date(pendingExposure.exposureEndsAt)
		: new Date();

	return {
		days: signedDays,
		nextEndsAt: new Date(baseEndsAt.getTime() + signedDays * MS_PER_DAY),
	};
}

// 상태별 처리 메뉴. 공개 공고는 내리고, 숨긴 공고는 되올리고, 검수 보류 공고는
// 결론(승인·반려)을 낸다 — 보류에 "재공개"만 주면 검수를 건너뛴 채 게시된다.
const STATUS_ACTIONS: Record<
	string,
	{ key: string; label: string; status: ActionStatus; destructive?: boolean }[]
> = {
	published: [
		{ key: "hide", label: "숨김", status: "hidden", destructive: true },
	],
	hidden: [{ key: "show", label: "재공개", status: "published" }],
	on_hold: [
		// 승인해도 유료 상품 공고는 입금 확인 전까지 게시되지 않아 라벨에 "공개"를 쓰지 않는다.
		{ key: "approve", label: "승인", status: "published" },
		{ key: "reject", label: "반려", status: "rejected", destructive: true },
	],
};

// 공개 상세(/seeker/jobs/[id])는 published AND paid 게이트를 통과한 공고만 연다.
// 그 외(검수 대기·보류·숨김·반려·미결제) 제목을 링크로 걸면 눌렀을 때 404가 난다.
// 구인자 목록(employer-jobs-columns)의 isPubliclyViewable과 같은 판정이다.
const isPubliclyViewable = (job: JobRow): boolean =>
	job.status === "published" && job.paymentStatus === "paid";

// 공개 상세로 이동할 수 있는 행만 제목을 링크로 만든다. 나머지는 왜 못 가는지
// 한 줄로 알린다 — 상태 원값이 아니라 공용 라벨 헬퍼가 만든 표시 문구를 쓴다.
const publicDetailTitleColumn: DataColumn<JobRow> = {
	id: "title",
	header: "공고 제목",
	sortValue: (job) => job.title,
	cell: (job) =>
		isPubliclyViewable(job) ? (
			<Link
				className="break-keep font-medium text-foreground underline-offset-4 hover:underline"
				href={`/seeker/jobs/${job.id}` as Route}
			>
				{job.title}
			</Link>
		) : (
			<div className="flex flex-col gap-0.5">
				<span className="break-keep font-medium text-foreground">
					{job.title}
				</span>
				<span className="text-muted-foreground text-xs">
					비공개 공고 · 상세 보기 불가(
					{getJobDisplayStatus(job).label})
				</span>
			</div>
		),
};

function getJobColumns(
	onRequestStatus: (job: JobRow, status: ActionStatus, label: string) => void,
	onRequestDelete: (job: JobRow) => void,
	onRequestExposure: (job: JobRow, direction: "extend" | "shorten") => void,
	onRequestQueueRemoval: (job: JobRow) => void
): DataColumn<JobRow>[] {
	return [
		publicDetailTitleColumn,
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
						...(STATUS_ACTIONS[job.status] ?? []).map((action) => ({
							key: action.key,
							label: action.label,
							onSelect: () => onRequestStatus(job, action.status, action.label),
							...(action.destructive
								? { variant: "destructive" as const }
								: {}),
						})),
						// 종료일이 없는 공고(미결제·무기한)도 지금 기준으로 새 종료일을 잡을 수 있다.
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
						// 유료 대기열에 묶인 리스팅 공고만 큐에서 빼낼 수 있다(미결제로 되돌리며
						// 결제 승인 흐름과 대칭). 활성·비리스팅 공고에는 노출하지 않는다.
						...(isQueuedListing(job)
							? [
									{
										key: "dequeue",
										label: "대기열에서 빼기",
										onSelect: () => onRequestQueueRemoval(job),
										variant: "destructive" as const,
									},
								]
							: []),
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

// 대기열에서 빼기 확인 다이얼로그. 자체 사유 입력·뮤테이션을 소유해 상위 페이지 컴포넌트의
// 인지 복잡도를 낮춘다(상위는 어떤 공고를 뺄지 pending만 넘긴다).
function QueueRemovalDialog({
	pending,
	onClose,
}: {
	pending: { jobPostId: string; title: string } | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [reason, setReason] = useState("");
	const mutation = useMutation(
		orpc.bambi.moderation.removeFromListingQueue.mutationOptions({
			onSuccess: async () => {
				toast.success("대기열에서 뺐어요.");
				onClose();
				setReason("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
						input: { limit: LIST_LIMIT },
					}),
				});
			},
			onError: () =>
				toast.error("대기열에서 빼지 못했어요. 다시 시도해 주세요."),
		})
	);
	const canConfirm = reason.trim().length >= 2 && !mutation.isPending;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
					setReason("");
				}
			}}
			open={pending !== null}
		>
			<DialogContent>
				<DialogTitle>대기열에서 빼기</DialogTitle>
				<DialogDescription>
					"{pending?.title}" 공고를 리스팅 대기열에서 뺍니다. 결제가 미결제로
					되돌아가고 순번에서 제외돼요. 사유는 감사 로그에 남아요(2자 이상).
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

							mutation.mutate({
								jobPostId: pending.jobPostId,
								reason: reason.trim(),
							});
						}}
						size="sm"
						type="button"
						variant="destructive"
					>
						대기열에서 빼기 확정
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
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
	const [pendingQueueRemoval, setPendingQueueRemoval] = useState<{
		jobPostId: string;
		title: string;
	} | null>(null);

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
					pending ? ACTION_COPY[pending.status].success : "공고를 처리했어요."
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

	const requestStatusChange = useCallback(
		(job: JobRow, status: ActionStatus, label: string) => {
			setPending({ jobPostId: job.id, label, status, title: job.title });
			setReason(ACTION_COPY[status].defaultReason);
		},
		[]
	);

	const requestDelete = useCallback((job: JobRow) => {
		setPendingDelete({ jobPostId: job.id, title: job.title });
		setDeleteReason("");
	}, []);

	const requestExposure = useCallback(
		(job: JobRow, direction: "extend" | "shorten") => {
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

	const requestQueueRemoval = useCallback((job: JobRow) => {
		setPendingQueueRemoval({ jobPostId: job.id, title: job.title });
	}, []);

	const columns = useMemo(
		() =>
			getJobColumns(
				requestStatusChange,
				requestDelete,
				requestExposure,
				requestQueueRemoval
			),
		[requestStatusChange, requestDelete, requestExposure, requestQueueRemoval]
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
					공고를 재공개합니다. 검수에서 <strong>보류</strong>한 공고도 "검수
					보류" 탭에서 찾아 승인·반려로 마무리합니다. 본문·이미지 수정은 각 행의
					"수정"에서 진행합니다.
				</p>
			</div>

			<ListingCapacityOverview />

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
							variant={
								pending?.status === "published" ? "default" : "destructive"
							}
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
						{pendingExposure?.exposureEndsAt
							? formatDateTime(pendingExposure.exposureEndsAt)
							: "종료일 없음(무기한·미결제)"}
						{" → "}
						{exposureAdjustment
							? formatDateTime(exposureAdjustment.nextEndsAt)
							: "-"}
						.{" "}
						{pendingExposure && !pendingExposure.exposureEndsAt
							? "적용하면 지금부터 계산한 종료일이 새로 설정돼요(무기한 → 기한부). "
							: null}
						사유는 감사 로그에 남아요(2자 이상).
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

			<QueueRemovalDialog
				onClose={() => setPendingQueueRemoval(null)}
				pending={pendingQueueRemoval}
			/>
		</div>
	);
}
