"use client";

// 밤비 — 구직자(Seeker) "예정된 면접" 화면.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import { StatusBadge } from "@/components/bambi/status-badge";
import { orpc } from "@/utils/orpc";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const STATUS_LABELS = {
	confirmed: "확정됨",
	proposed: "제안됨",
} as const;

const STATUS_TONES = {
	confirmed: "good",
	proposed: "default",
} as const;

type InterviewStatus = keyof typeof STATUS_LABELS;

function padTwo(value: number): string {
	return value < 10 ? `0${value}` : `${value}`;
}

function formatSchedule(scheduledAt: Date | string): string {
	const date = new Date(scheduledAt);
	const year = date.getFullYear();
	const month = padTwo(date.getMonth() + 1);
	const day = padTwo(date.getDate());
	const weekday = WEEKDAY_LABELS[date.getDay()];
	const hours = padTwo(date.getHours());
	const minutes = padTwo(date.getMinutes());
	return `${year}.${month}.${day} (${weekday}) ${hours}:${minutes}`;
}

function isKnownStatus(status: string): status is InterviewStatus {
	return status === "proposed" || status === "confirmed";
}

function resolveStatusLabel(status: string): string {
	return isKnownStatus(status) ? STATUS_LABELS[status] : status;
}

function resolveStatusTone(status: string): "default" | "good" {
	return isKnownStatus(status) ? STATUS_TONES[status] : "default";
}

export function UpcomingInterviewsScreen() {
	const query = useQuery(
		orpc.bambi.chats.listMyUpcomingInterviews.queryOptions()
	);
	const interviews = query.data ?? [];

	return (
		<div className="flex min-h-0 flex-1 flex-col py-5">
			<div className="mx-auto w-full max-w-[860px] px-4 pt-2 pb-1 md:px-6">
				<h1 className="m-0 font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					예정된 면접
				</h1>
			</div>
			<div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col gap-[14px] overflow-y-auto px-4 py-4 md:px-6">
				{query.isLoading ? (
					<InterviewSkeletonList />
				) : (
					<InterviewList interviews={interviews} />
				)}
			</div>
		</div>
	);
}

function InterviewSkeletonList() {
	const placeholders = ["a", "b", "c"];
	return (
		<>
			{placeholders.map((key) => (
				<div
					className="flex flex-col gap-3 rounded-2xl border border-border p-[18px]"
					key={key}
				>
					<div className="flex items-start justify-between gap-3">
						<Skeleton className="h-5 w-40 rounded-md" />
						<Skeleton className="h-6 w-16 rounded-full" />
					</div>
					<Skeleton className="h-4 w-32 rounded-md" />
					<Skeleton className="h-4 w-24 rounded-md" />
				</div>
			))}
		</>
	);
}

function InterviewList({
	interviews,
}: {
	interviews: {
		chatRoomId: string;
		counterpartName: string | null;
		id: string;
		jobTitle: string | null;
		locationNote: string | null;
		scheduledAt: Date | string;
		status: string;
	}[];
}) {
	if (interviews.length === 0) {
		return (
			<EmptyState
				description="확정되었거나 제안된 다가오는 면접이 여기에 표시됩니다."
				title="예정된 면접이 없어요"
			/>
		);
	}

	return (
		<>
			{interviews.map((interview) => {
				const counterpart = interview.counterpartName ?? "상대 정보 없음";
				const job = interview.jobTitle ?? "공고 정보 없음";
				const statusLabel = resolveStatusLabel(interview.status);
				const statusTone = resolveStatusTone(interview.status);
				return (
					<Link
						className="flex flex-col gap-3 rounded-2xl border border-border p-[18px] transition-colors hover:border-primary"
						href={`/seeker/chats/${interview.chatRoomId}` as Route}
						key={interview.id}
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 flex-1">
								<div className="break-words font-extrabold text-[16px] text-foreground">
									{counterpart}
								</div>
								<div className="mt-0.5 break-words text-[13px] text-muted-foreground">
									{job}
								</div>
							</div>
							<StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
						</div>
						<div className="font-semibold text-[15px] text-foreground">
							{formatSchedule(interview.scheduledAt)}
						</div>
						{interview.locationNote ? (
							<div className="break-words text-[13px] text-muted-foreground">
								{interview.locationNote}
							</div>
						) : null}
					</Link>
				);
			})}
		</>
	);
}
