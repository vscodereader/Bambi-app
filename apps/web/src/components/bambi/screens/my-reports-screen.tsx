"use client";

// 밤비 — 구직자(Seeker) "내 신고 내역" 화면.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/bambi/empty-state";
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

export function MyReportsScreen() {
	const query = useQuery(
		orpc.bambi.moderation.listMyReports.queryOptions({ input: { limit: 50 } })
	);
	const reports = query.data ?? [];

	return (
		<div className="flex min-h-0 flex-1 flex-col py-5">
			<div className="mx-auto w-full max-w-[860px] px-4 pt-2 pb-1 md:px-6">
				<h1 className="m-0 font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					내 신고 내역
				</h1>
			</div>
			<div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col gap-[18px] overflow-y-auto px-4 py-4 md:px-6">
				{query.isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-24 w-full rounded-2xl" />
						<Skeleton className="h-24 w-full rounded-2xl" />
						<Skeleton className="h-24 w-full rounded-2xl" />
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
							<div
								className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
								key={item.id}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 flex-col gap-1">
										<span className="font-semibold text-[15px] text-foreground">
											{reportReasonLabel(item.reason)}
										</span>
										<span className="text-[13px] text-muted-foreground">
											{targetTypeLabel(item.targetType)} ·{" "}
											{formatDate(item.createdAt)}
										</span>
									</div>
									<StatusBadge tone={statusTone(item.status)}>
										{statusLabel(item.status)}
									</StatusBadge>
								</div>
								{item.details ? (
									<p className="m-0 text-[13px] text-muted-foreground">
										{item.details}
									</p>
								) : null}
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
