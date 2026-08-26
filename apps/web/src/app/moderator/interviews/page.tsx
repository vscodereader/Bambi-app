"use client";

// 밤비 — 운영자 전용 면접 일정 목록.
// 서버(listInterviewSchedules)는 최근 면접 일정 100건을 일시 내림차순으로 내려준다.
// 방이 삭제·차단됐어도 일정은 남으므로 방 상태를 함께 보여주고, 채팅 관리와 같은
// 읽기 전용 다이얼로그로 해당 방의 대화를 연다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { interviewStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";
import {
	ChatHistoryDialog,
	type ViewingChat,
} from "../chats/chat-history-dialog";

type InterviewRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listInterviewSchedules"]>
>[number];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function padTwo(value: number): string {
	return value < 10 ? `0${value}` : `${value}`;
}

// 구직자·구인자가 보는 "예정된 면접"과 같은 표기(YYYY.MM.DD (요일) HH:MM)를 쓴다.
function formatSchedule(scheduledAt: Date | string): string {
	const date = new Date(scheduledAt);
	const weekday = WEEKDAY_LABELS[date.getDay()];
	return `${date.getFullYear()}.${padTwo(date.getMonth() + 1)}.${padTwo(date.getDate())} (${weekday}) ${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

// 라벨은 lib/bambi-options의 공용 맵을 쓰고(enum 원값 노출 금지), 배지 톤만 여기서 정한다.
const STATUS_BADGE_VARIANT: Record<string, "secondary" | "success"> = {
	confirmed: "success",
	completed: "success",
};

function InterviewStatusBadge({ status }: { status: string }) {
	const label =
		interviewStatusLabels[status as keyof typeof interviewStatusLabels] ??
		"상태 확인 필요";
	return (
		<Badge variant={STATUS_BADGE_VARIANT[status] ?? "secondary"}>{label}</Badge>
	);
}

function RoomStatusBadges({ row }: { row: InterviewRow }) {
	if (!(row.roomIsDeleted || row.roomIsBlocked)) {
		return <Badge variant="outline">정상</Badge>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{row.roomIsBlocked ? <Badge variant="default">차단됨</Badge> : null}
			{row.roomIsDeleted ? <Badge variant="secondary">삭제됨</Badge> : null}
		</div>
	);
}

function getInterviewColumns(
	onViewHistory: (row: InterviewRow) => void
): DataColumn<InterviewRow>[] {
	return [
		{
			id: "scheduledAt",
			header: "면접 일시",
			sortValue: (row) => new Date(row.scheduledAt).getTime(),
			cell: (row) => (
				<span className="whitespace-nowrap font-medium text-foreground">
					{formatSchedule(row.scheduledAt)}
				</span>
			),
		},
		{
			id: "status",
			header: "상태",
			sortValue: (row) => row.status,
			cell: (row) => <InterviewStatusBadge status={row.status} />,
		},
		{
			id: "seekerName",
			header: "구직자",
			sortValue: (row) => row.seekerName,
			cell: (row) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{row.seekerName}
				</span>
			),
		},
		{
			id: "employerName",
			header: "구인자",
			sortValue: (row) => row.employerName,
			cell: (row) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{row.employerName}
				</span>
			),
		},
		{
			id: "jobPostTitle",
			header: "공고 제목",
			sortValue: (row) => row.jobPostTitle,
			cell: (row) => (
				<span className="whitespace-nowrap text-foreground">
					{row.jobPostTitle}
				</span>
			),
		},
		{
			id: "locationNote",
			header: "위치",
			cell: (row) => (
				<span className="text-muted-foreground">{row.locationNote ?? "—"}</span>
			),
		},
		{
			id: "roomStatus",
			header: "방 상태",
			cell: (row) => <RoomStatusBadges row={row} />,
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<Button
					onClick={() => onViewHistory(row)}
					size="sm"
					type="button"
					variant="outline"
				>
					채팅 열람
				</Button>
			),
		},
	];
}

export default function ModeratorInterviewsPage() {
	const [viewing, setViewing] = useState<ViewingChat | null>(null);
	const interviewsQuery = useQuery(
		orpc.bambi.moderation.listInterviewSchedules.queryOptions()
	);

	const columns = useMemo(
		() =>
			getInterviewColumns((row) => {
				setViewing({ chatRoomId: row.chatRoomId, title: row.jobPostTitle });
			}),
		[]
	);

	const interviews = interviewsQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">면접 일정</h1>
				<p className="m-0 text-muted-foreground text-sm">
					채팅에서 제안·확정된 면접 일정을 최근 100건까지 일시 내림차순으로
					봅니다. 방이 삭제·차단돼도 일정은 남으므로 방 상태를 함께 표시하고,
					대화 열람은 채팅 관리와 같은 읽기 전용 경로를 씁니다.
				</p>
			</div>

			{interviewsQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{interviewsQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{interviewsQuery.isSuccess && interviews.length === 0 ? (
				<EmptyState
					description="아직 제안되거나 확정된 면접이 없어요."
					title="면접 일정이 없어요"
				/>
			) : null}

			{interviewsQuery.isSuccess && interviews.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={interviews}
						getRowKey={(row) => row.id}
					/>
				</div>
			) : null}

			<ChatHistoryDialog onClose={() => setViewing(null)} viewing={viewing} />
		</div>
	);
}
