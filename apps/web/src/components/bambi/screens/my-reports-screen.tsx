"use client";

// 밤비 — 구직자(Seeker) "내 신고 내역" 화면.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/bambi/empty-state";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import { reportReasonLabel, targetTypeLabel } from "@/lib/bambi/report-labels";
import { orpc } from "@/utils/orpc";

type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

const STATUS_LABELS: Record<ReportStatus, string> = {
	open: "접수됨",
	reviewing: "검토 중",
	resolved: "처리 완료",
	dismissed: "반려됨",
};

const STATUS_TONES: Record<
	ReportStatus,
	"default" | "good" | "warning" | "danger"
> = {
	open: "warning",
	reviewing: "default",
	resolved: "good",
	dismissed: "danger",
};

function pad2(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

function formatDate(value: Date | string): string {
	const date = new Date(value);
	const year = date.getFullYear();
	const month = pad2(date.getMonth() + 1);
	const day = pad2(date.getDate());
	return `${year}.${month}.${day}`;
}

function statusLabel(status: string): string {
	return STATUS_LABELS[status as ReportStatus] ?? status;
}

function statusTone(status: string): "default" | "good" | "warning" | "danger" {
	return STATUS_TONES[status as ReportStatus] ?? "default";
}

const preview = (value: string, max = 12): string =>
	value.length > max ? `${value.slice(0, max)}...` : value;

interface ReportContext {
	chatRoom?: { jobPostTitle: string; organizationDisplayName: string };
	communityComment?: { bodyPreview: string };
	communityPost?: { title: string };
	jobPost?: {
		id: string;
		organizationDisplayName: string;
		payAmount: number | null;
		payUnit: string;
		title: string;
	};
}

interface TargetSummaryItem {
	resolutionReason?: string | null;
	status: string;
	targetContext: ReportContext | null;
	targetUnavailable: boolean;
}

function TargetSummary({ item }: { item: TargetSummaryItem }) {
	const context = item.targetContext;
	if (!context || item.targetUnavailable) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				삭제되었거나 확인할 수 없는 대상입니다.
			</p>
		);
	}
	if ("jobPost" in context && context.jobPost) {
		const job = context.jobPost;
		return (
			<a
				className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm no-underline"
				href={`/seeker/jobs/${job.id}`}
			>
				<strong>{job.title}</strong>
				<span>{job.organizationDisplayName}</span>
				<span>
					{job.payUnit} {job.payAmount?.toLocaleString()}원
				</span>
			</a>
		);
	}
	if ("chatRoom" in context && context.chatRoom) {
		return (
			<div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm">
				<strong>{context.chatRoom.jobPostTitle}</strong>
				<span>{context.chatRoom.organizationDisplayName}</span>
			</div>
		);
	}
	if ("communityPost" in context && context.communityPost) {
		return (
			<p className="m-0 text-sm">
				원글 : {preview(context.communityPost.title)}
			</p>
		);
	}
	if ("communityComment" in context && context.communityComment) {
		return (
			<p className="m-0 text-sm">
				원 댓글 : {preview(context.communityComment.bodyPreview)}
			</p>
		);
	}
	return null;
}

export function MyReportsScreen() {
	const query = useQuery(
		orpc.bambi.moderation.listMyReports.queryOptions({ input: { limit: 50 } })
	);
	const reports = query.data ?? [];

	return (
		<MyPageShell title="내 신고 내역">
			{query.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-24 w-full rounded-xl" />
					<Skeleton className="h-24 w-full rounded-xl" />
					<Skeleton className="h-24 w-full rounded-xl" />
				</div>
			) : null}

			{query.isLoading || reports.length > 0 ? null : (
				<EmptyState
					description="접수한 신고가 여기에 표시됩니다."
					title="신고 내역이 없어요"
				/>
			)}

			{reports.length > 0 ? (
				<div className="flex flex-col gap-3">
					{reports.map((item) => (
						<details
							className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
							key={item.id}
						>
							<summary className="flex cursor-pointer list-none items-start justify-between gap-3">
								<div className="flex min-w-0 flex-col gap-1">
									<span className="font-semibold text-foreground text-sm">
										{reportReasonLabel(item.reason)}
									</span>
									<span className="text-muted-foreground text-xs">
										{targetTypeLabel(item.targetType)} ·{" "}
										{formatDate(item.createdAt)}
									</span>
								</div>
								<StatusBadge tone={statusTone(item.status)}>
									{statusLabel(item.status)}
								</StatusBadge>
							</summary>
							<div className="mt-3 grid gap-2">
								<TargetSummary item={item as TargetSummaryItem} />
								{item.details ? (
									<p className="m-0 text-muted-foreground text-sm">
										{item.details}
									</p>
								) : null}
								{(item.status === "dismissed" || item.status === "resolved") &&
								item.resolutionReason ? (
									<div className="rounded-lg bg-muted/40 p-3 text-sm">
										<strong className="block">
											{item.status === "dismissed" ? "기각 사유" : "조치"}
										</strong>
										<p className="m-0 mt-1 whitespace-pre-wrap text-muted-foreground">
											{item.resolutionReason}
										</p>
									</div>
								) : null}
							</div>
						</details>
					))}
				</div>
			) : null}
		</MyPageShell>
	);
}
