"use client";

// 밤비 — 운영자 전용 채팅 관리 목록.
// 서버(listChatsForModeration)는 삭제됨·차단됨·신고됨 플래그가 붙은 방만 내려준다.
// 각 행에서 방을 하드삭제(사유 필수)하거나 구직자·구인자 회원 상세로 이동한다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { RowActions } from "@/components/bambi/row-actions";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

type ChatRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listChatsForModeration"]>
>[number];

// 상태 배지(라벨 맵 경유) — 한 방에 여러 플래그가 동시에 붙을 수 있어 배열로 렌더한다.
const CHAT_STATUS_BADGES: {
	flag: (row: ChatRow) => boolean;
	key: string;
	label: string;
	variant: "default" | "destructive" | "secondary";
}[] = [
	{
		flag: (row) => row.isReported,
		key: "reported",
		label: "신고됨",
		variant: "destructive",
	},
	{
		flag: (row) => row.isBlocked,
		key: "blocked",
		label: "차단됨",
		variant: "default",
	},
	{
		flag: (row) => row.isDeleted,
		key: "deleted",
		label: "삭제됨",
		variant: "secondary",
	},
];

function ChatStatusBadges({ row }: { row: ChatRow }) {
	const active = CHAT_STATUS_BADGES.filter((badge) => badge.flag(row));

	if (active.length === 0) {
		return <span className="text-muted-foreground">정상</span>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{active.map((badge) => (
				<Badge key={badge.key} variant={badge.variant}>
					{badge.label}
				</Badge>
			))}
		</div>
	);
}

// 하드삭제 확인 대상(어떤 방을 지우는지).
interface PendingDelete {
	chatRoomId: string;
	title: string;
}

// 채팅 내역 열람 대상(방 id + 표시용 제목).
interface ViewingChat {
	chatRoomId: string;
	title: string;
}

// 다이얼로그가 열릴 때만 마운트돼 메시지를 조회·렌더한다(support InquiryThread와 동일 패턴).
function ChatHistoryContent({ chatRoomId }: { chatRoomId: string }) {
	const historyQuery = useQuery(
		orpc.bambi.moderation.getChatMessagesForModeration.queryOptions({
			input: { chatRoomId },
		})
	);

	if (historyQuery.isPending) {
		return <Skeleton className="h-40 w-full" />;
	}

	if (historyQuery.isError || !historyQuery.data) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				채팅 내역을 불러오지 못했어요.
			</p>
		);
	}

	const { employerName, employerUserId, jobSeekerName, messages } =
		historyQuery.data;

	if (messages.length === 0) {
		return (
			<p className="m-0 text-muted-foreground text-sm">아직 메시지가 없어요.</p>
		);
	}

	return (
		<div className="flex max-h-[60vh] min-w-0 flex-col gap-3 overflow-y-auto">
			{messages.map((message) => {
				const isEmployer = message.senderUserId === employerUserId;
				return (
					<div className="flex min-w-0 flex-col gap-1" key={message.id}>
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant={isEmployer ? "default" : "secondary"}>
								{isEmployer ? employerName : jobSeekerName}
							</Badge>
							{message.kind === "contact_request" ? (
								<Badge variant="outline">연락처 요청</Badge>
							) : null}
							<span className="text-muted-foreground text-xs">
								{formatDateTime(message.createdAt)}
							</span>
						</div>
						<p className="m-0 whitespace-pre-wrap text-foreground text-sm">
							{message.body}
						</p>
						{message.attachments.length > 0 ? (
							<div className="flex flex-wrap gap-1">
								{message.attachments.map((attachment) => (
									<Badge key={attachment.id} variant="outline">
										첨부 · {attachment.fileName}
									</Badge>
								))}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

function getChatColumns(
	onRequestDelete: (row: ChatRow) => void,
	onViewHistory: (row: ChatRow) => void
): DataColumn<ChatRow>[] {
	return [
		{
			id: "jobPostTitle",
			header: "공고 제목",
			sortValue: (row) => row.jobPostTitle,
			cell: (row) => (
				<span className="whitespace-nowrap font-medium text-foreground">
					{row.jobPostTitle}
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
			id: "jobSeekerName",
			header: "구직자",
			sortValue: (row) => row.jobSeekerName,
			cell: (row) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{row.jobSeekerName}
				</span>
			),
		},
		{
			id: "status",
			header: "상태",
			cell: (row) => <ChatStatusBadges row={row} />,
		},
		{
			id: "lastMessageAt",
			header: "최근 메시지",
			sortValue: (row) => row.lastMessageAt?.getTime() ?? -1,
			cell: (row) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{row.lastMessageAt
						? formatDateTime(row.lastMessageAt)
						: "메시지 없음"}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<RowActions
					actions={[
						{
							key: "history",
							label: "채팅 내역",
							onSelect: () => onViewHistory(row),
						},
						{
							key: "delete",
							label: "삭제",
							onSelect: () => onRequestDelete(row),
							variant: "destructive",
						},
						{
							key: "seeker",
							label: "구직자 상세",
							href: `/moderator/users/${row.jobSeekerUserId}` as Route,
						},
						{
							key: "employer",
							label: "구인자 상세",
							href: `/moderator/users/${row.employerUserId}` as Route,
						},
					]}
					ariaLabel={`${row.jobPostTitle} 채팅 관리 메뉴`}
				/>
			),
		},
	];
}

export default function ModeratorChatsPage() {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState<PendingDelete | null>(null);
	const [reason, setReason] = useState("");
	const [viewing, setViewing] = useState<ViewingChat | null>(null);

	const chatsQuery = useQuery(
		orpc.bambi.moderation.listChatsForModeration.queryOptions()
	);
	const deleteMutation = useMutation(
		orpc.bambi.moderation.hardDeleteChatRoom.mutationOptions({
			onError: () =>
				toast.error("채팅방을 삭제하지 못했어요. 다시 시도해 주세요."),
			onSuccess: async () => {
				toast.success("채팅방을 삭제했어요.");
				setPending(null);
				setReason("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listChatsForModeration.queryKey(),
				});
			},
		})
	);

	const columns = useMemo(
		() =>
			getChatColumns(
				(row) => {
					setPending({ chatRoomId: row.chatRoomId, title: row.jobPostTitle });
					setReason("");
				},
				(row) => {
					setViewing({ chatRoomId: row.chatRoomId, title: row.jobPostTitle });
				}
			),
		[]
	);

	const chats = chatsQuery.data ?? [];
	const canConfirm = reason.trim().length >= 2 && !deleteMutation.isPending;

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">채팅 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					삭제·차단·신고된 채팅방을 확인하고, 필요 시 방을 완전히 삭제하거나
					참여한 회원 상세로 이동합니다. 삭제는 되돌릴 수 없어요.
				</p>
			</div>

			{chatsQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{chatsQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{chatsQuery.isSuccess && chats.length === 0 ? (
				<EmptyState
					description="삭제·차단·신고된 채팅방이 아직 없어요."
					title="관리할 채팅방이 없어요"
				/>
			) : null}

			{chatsQuery.isSuccess && chats.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={chats}
						getRowKey={(row) => row.chatRoomId}
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
					<DialogTitle>채팅방 삭제</DialogTitle>
					<DialogDescription>
						"{pending?.title}" 채팅방을 완전히 삭제합니다. 메시지·첨부가 모두
						지워지며 되돌릴 수 없어요. 사유는 감사 로그에 남아요(2자 이상).
					</DialogDescription>
					<Textarea
						onChange={(event) => setReason(event.target.value)}
						placeholder="삭제 사유를 입력해 주세요."
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

								deleteMutation.mutate({
									chatRoomId: pending.chatRoomId,
									reason: reason.trim(),
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
						setViewing(null);
					}
				}}
				open={viewing !== null}
			>
				<DialogContent className="max-w-2xl">
					<DialogTitle>채팅 내역</DialogTitle>
					<DialogDescription>
						"{viewing?.title}" 채팅방의 전체 대화를 시간순으로 봅니다.
					</DialogDescription>
					{viewing ? (
						<ChatHistoryContent chatRoomId={viewing.chatRoomId} />
					) : null}
					<div className="flex justify-end">
						<DialogClose
							render={
								<Button size="sm" type="button" variant="ghost">
									닫기
								</Button>
							}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
