"use client";

// 밤비 — 운영자 전용 채팅 관리 목록.
// 서버(listAllChatsForModeration)는 모든 채팅방을 페이지 단위로 내려주고, "조치 대상"
// 탭을 고르면 삭제됨·차단됨·신고됨 방만 좁혀 준다. 검색은 참여자 이름·공고 제목을 훑는다.
// 각 행에서 대화를 열람(읽기 전용)하거나 차단/차단 해제·하드삭제(사유 필수)하고,
// 구직자·구인자 회원 상세로 이동한다.

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
import { Input } from "@bambi-app/ui/components/input";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageControls } from "@/components/bambi/page-controls";
import { RowActions } from "@/components/bambi/row-actions";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";
import { ChatHistoryDialog, type ViewingChat } from "./chat-history-dialog";

type ChatRow = Awaited<
	ReturnType<
		AppRouterClient["bambi"]["moderation"]["listAllChatsForModeration"]
	>
>["items"][number];

// 목록 탭. 기본은 전체 방이고, 조치가 필요한 방만 보고 싶을 때 좁힌다.
const SCOPE_TABS = [
	{ label: "전체", value: "all" },
	{ label: "조치 대상", value: "flagged" },
] as const;

type ScopeValue = (typeof SCOPE_TABS)[number]["value"];

// 검색어를 칠 때마다 서버를 때리면 조인 3개짜리 목록 쿼리가 키 입력마다 나간다.
// 공고 검색 모달(job-search-command)과 같은 250ms 디바운스를 쓴다.
function useDebouncedValue(value: string, delayMs = 250): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

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
		return <Badge variant="outline">정상</Badge>;
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

// 사유 입력이 필요한 조치 대상(어떤 방에 무엇을 하는지). 차단/차단 해제는 신고 상세와
// 같은 setChatRoomBlocked 흐름(사유 2자 이상)을 그대로 쓴다.
type ChatActionKind = "block" | "delete" | "unblock";

interface PendingAction {
	chatRoomId: string;
	kind: ChatActionKind;
	title: string;
}

const CHAT_ACTION_COPY: Record<
	ChatActionKind,
	{ confirmLabel: string; description: string; title: string }
> = {
	block: {
		confirmLabel: "차단 확정",
		description:
			"채팅방을 차단하면 양쪽 모두 새 메시지를 보낼 수 없어요. 사유는 감사 로그에 남아요(2자 이상).",
		title: "채팅방 차단",
	},
	delete: {
		confirmLabel: "삭제 확정",
		description:
			"채팅방을 완전히 삭제합니다. 메시지·첨부가 모두 지워지며 되돌릴 수 없어요. 사유는 감사 로그에 남아요(2자 이상).",
		title: "채팅방 삭제",
	},
	unblock: {
		confirmLabel: "차단 해제",
		description:
			"차단을 풀면 양쪽이 다시 대화할 수 있어요. 사유는 감사 로그에 남아요(2자 이상).",
		title: "채팅방 차단 해제",
	},
};

function getChatColumns(
	onRequestAction: (row: ChatRow, kind: ChatActionKind) => void,
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
							key: "block",
							label: row.isBlocked ? "차단 해제" : "차단",
							onSelect: () =>
								onRequestAction(row, row.isBlocked ? "unblock" : "block"),
						},
						{
							key: "delete",
							label: "삭제",
							onSelect: () => onRequestAction(row, "delete"),
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
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");
	const [viewing, setViewing] = useState<ViewingChat | null>(null);
	const [scope, setScope] = useState<ScopeValue>("all");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const debouncedSearch = useDebouncedValue(search);

	const chatsQuery = useQuery(
		orpc.bambi.moderation.listAllChatsForModeration.queryOptions({
			input: {
				onlyFlagged: scope === "flagged",
				page,
				search: debouncedSearch.trim(),
			},
		})
	);
	const invalidateChats = async () => {
		setPending(null);
		setReason("");
		await queryClient.invalidateQueries({
			// input 없이 호출해 탭·검색어·페이지 조합 전체를 한 번에 무효화한다.
			queryKey: orpc.bambi.moderation.listAllChatsForModeration.key(),
		});
	};
	const deleteMutation = useMutation(
		orpc.bambi.moderation.hardDeleteChatRoom.mutationOptions({
			onError: () =>
				toast.error("채팅방을 삭제하지 못했어요. 다시 시도해 주세요."),
			onSuccess: async () => {
				toast.success("채팅방을 삭제했어요.");
				await invalidateChats();
			},
		})
	);
	const blockMutation = useMutation(
		orpc.bambi.moderation.setChatRoomBlocked.mutationOptions({
			onError: () =>
				toast.error("차단 상태를 반영하지 못했어요. 다시 시도해 주세요."),
			onSuccess: async (_result, variables) => {
				toast.success(
					variables.isBlocked
						? "채팅방을 차단했어요."
						: "채팅방 차단을 해제했어요."
				);
				await invalidateChats();
			},
		})
	);

	const columns = useMemo(
		() =>
			getChatColumns(
				(row, kind) => {
					setPending({
						chatRoomId: row.chatRoomId,
						kind,
						title: row.jobPostTitle,
					});
					setReason("");
				},
				(row) => {
					setViewing({ chatRoomId: row.chatRoomId, title: row.jobPostTitle });
				}
			),
		[]
	);

	const chats = chatsQuery.data?.items ?? [];
	const totalCount = chatsQuery.data?.totalCount ?? 0;
	const pageSize = chatsQuery.data?.pageSize ?? 10;
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
	const isApplying = deleteMutation.isPending || blockMutation.isPending;
	const canConfirm = reason.trim().length >= 2 && !isApplying;
	const pendingCopy = pending ? CHAT_ACTION_COPY[pending.kind] : null;
	// 빈 목록 안내는 "아직 방이 없다"와 "검색·탭 때문에 안 보인다"를 구분해야 한다.
	let emptyDescription = "아직 만들어진 채팅방이 없어요.";
	if (search.trim()) {
		emptyDescription =
			"검색어와 맞는 채팅방이 없어요. 다른 이름으로 찾아보세요.";
	} else if (scope === "flagged") {
		emptyDescription = "삭제·차단·신고된 채팅방이 아직 없어요.";
	}
	const confirmPendingAction = () => {
		if (!pending) {
			return;
		}

		if (pending.kind === "delete") {
			deleteMutation.mutate({
				chatRoomId: pending.chatRoomId,
				reason: reason.trim(),
			});
			return;
		}

		blockMutation.mutate({
			chatRoomId: pending.chatRoomId,
			isBlocked: pending.kind === "block",
			reason: reason.trim(),
		});
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">채팅 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					모든 채팅방을 훑어보고 대화를 열람합니다. 열람은 읽기 전용이라
					상대에게 읽음으로 보이지 않고, 누가 언제 열었는지는 감사 로그에
					남아요. 필요하면 대화방을 차단하거나 차단을 해제하고, 방을 완전히
					삭제하거나 참여한 회원 상세로 이동합니다. 삭제는 되돌릴 수 없어요.
					사용자끼리 건 개인 차단은 운영자가 풀지 않습니다.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Tabs
					onValueChange={(value) => {
						setScope(value as ScopeValue);
						setPage(1);
					}}
					value={scope}
				>
					<TabsList className="max-w-full flex-wrap">
						{SCOPE_TABS.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value}>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Input
					className="max-w-xs"
					onChange={(event) => {
						setSearch(event.target.value);
						setPage(1);
					}}
					placeholder="구직자·구인자 이름, 공고 제목 검색"
					value={search}
				/>
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
				<EmptyState description={emptyDescription} title="채팅방이 없어요" />
			) : null}

			{chatsQuery.isSuccess && chats.length > 0 ? (
				<>
					{/* 페이지네이션은 서버가 하므로 표에는 pageSize를 주지 않는다(내려온 페이지 전부 표시). */}
					<div className="overflow-x-auto rounded-xl border border-border">
						<DataTable
							columns={columns}
							data={chats}
							getRowKey={(row) => row.chatRoomId}
						/>
					</div>
					<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
						<span className="text-muted-foreground text-sm">
							전체 {totalCount}개 · {page} / {totalPages} 페이지
						</span>
						<PageControls
							disabled={chatsQuery.isFetching}
							onPageChange={setPage}
							page={page}
							pageCount={totalPages}
						/>
					</div>
				</>
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
					<DialogTitle>{pendingCopy?.title}</DialogTitle>
					<DialogDescription>
						"{pending?.title}" — {pendingCopy?.description}
					</DialogDescription>
					<Textarea
						onChange={(event) => setReason(event.target.value)}
						placeholder="사유를 입력해 주세요."
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
							onClick={confirmPendingAction}
							size="sm"
							type="button"
							variant={pending?.kind === "delete" ? "destructive" : "default"}
						>
							{pendingCopy?.confirmLabel}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<ChatHistoryDialog onClose={() => setViewing(null)} viewing={viewing} />
		</div>
	);
}
