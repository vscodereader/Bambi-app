"use client";

// 밤비 — "예정된 면접" 화면. 구직자·구인자 공용이다(운영자만 메뉴에서 숨긴다).
// 카드의 상대 이름은 호출자 기준으로 서버가 정하므로(chats.listMyUpcomingInterviews →
// resolveCounterpartNames) 구직자에겐 업소명, 구인자에겐 구직자 닉네임이 나온다.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import { CalendarIcon, ChevronRightIcon } from "@/components/bambi/icons";
import { MyPageShell } from "@/components/bambi/my-page-shell";
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
		<MyPageShell title="예정된 면접">
			<div className="flex flex-col gap-3">
				{query.isLoading ? (
					<InterviewSkeletonList />
				) : (
					<InterviewList interviews={interviews} />
				)}
			</div>
		</MyPageShell>
	);
}

function InterviewSkeletonList() {
	const placeholders = ["a", "b", "c"];
	return (
		<>
			{placeholders.map((key) => (
				<div
					className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
					key={key}
				>
					<Skeleton className="size-10 rounded-lg" />
					<div className="flex flex-1 flex-col gap-2">
						<Skeleton className="h-6 w-48 rounded-md" />
						<Skeleton className="h-4 w-32 rounded-md" />
					</div>
					<Skeleton className="h-6 w-16 rounded-full" />
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
					// 카드의 주 정보는 일시다 — 상대·공고는 보조로 내리고, 셰브런으로
					// "누르면 해당 채팅방으로 간다"는 것을 드러낸다.
					<Link
						className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
						href={`/seeker/chats/${interview.chatRoomId}` as Route}
						key={interview.id}
					>
						<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
							<span className="inline-flex size-5">
								<CalendarIcon />
							</span>
						</span>
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="break-words font-extrabold text-foreground text-lg [font-family:var(--font-display)]">
									{formatSchedule(interview.scheduledAt)}
								</span>
								<StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
							</div>
							<div className="break-words text-muted-foreground text-sm">
								{counterpart} · {job}
							</div>
							{interview.locationNote ? (
								<div className="break-words text-muted-foreground text-xs">
									{interview.locationNote}
								</div>
							) : null}
						</div>
						<span className="inline-flex size-4 shrink-0 self-center text-muted-foreground">
							<ChevronRightIcon />
						</span>
					</Link>
				);
			})}
		</>
	);
}
