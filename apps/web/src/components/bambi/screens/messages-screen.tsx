"use client";

// 밤비 — 전 역할 공용 쪽지함. 라우트는 /seeker/me/messages 하나이고 구직자·구인자·
// 법률자문이 함께 쓴다(마이페이지 하위 화면 패턴 — MyPageShell). 운영자는 발송자라
// 이 화면을 쓰지 않는다(마이페이지 메뉴에서 감춘다). 답장 없음(수신 전용).

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PostBodyViewer } from "@/components/bambi/community-post-detail-parts";
import { EmptyState } from "@/components/bambi/empty-state";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { communityBodyToText } from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;

type MessagesTab = "archived" | "inbox";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

function formatSentAt(value: Date | string): string {
	const parts = dateFormatter.formatToParts(new Date(value));
	const lookup = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${lookup("year")}.${lookup("month")}.${lookup("day")} ${lookup("hour")}:${lookup("minute")}`;
}

interface MessageCursor {
	createdAt: string;
	messageId: string;
}

interface MessageRow {
	archivedAt: Date | null | string;
	body: string;
	createdAt: Date | string;
	messageId: string;
	readAt: Date | null | string;
	senderName: null | string;
	title: string;
}

export function MessagesScreen() {
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<MessagesTab>("inbox");
	const [selected, setSelected] = useState<MessageRow | null>(null);
	const [pendingDelete, setPendingDelete] = useState<MessageRow | null>(null);

	const query = useInfiniteQuery(
		orpc.bambi.directMessages.listMine.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as MessageCursor | null,
			input: (cursor: MessageCursor | null) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
				tab,
			}),
		})
	);

	// read·remove가 돌려주는 정본 안읽음 수로 벨과 공유하는 배지 캐시를 직접 덮는다 —
	// 재조회 타이밍에 기대지 않는다(notifications-screen과 같은 규칙).
	const applyUnreadCount = (unreadCount: number) => {
		queryClient.setQueryData(orpc.bambi.directMessages.unreadCount.queryKey(), {
			unreadCount,
		});
	};

	const invalidateList = () => {
		queryClient
			.invalidateQueries({
				queryKey: orpc.bambi.directMessages.listMine.key(),
			})
			.catch(() => undefined);
	};

	const read = useMutation(
		orpc.bambi.directMessages.read.mutationOptions({
			onError: () => {
				toast.error("쪽지를 읽음 처리하지 못했어요");
			},
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
				invalidateList();
			},
		})
	);

	const setArchived = useMutation(
		orpc.bambi.directMessages.setArchived.mutationOptions({
			onError: () => {
				toast.error("보관 상태를 바꾸지 못했어요");
			},
			onSuccess: () => {
				setSelected(null);
				invalidateList();
			},
		})
	);

	const remove = useMutation(
		orpc.bambi.directMessages.remove.mutationOptions({
			onError: () => {
				toast.error("쪽지를 삭제하지 못했어요");
			},
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
				setPendingDelete(null);
				setSelected(null);
				invalidateList();
				toast.success("쪽지를 삭제했어요");
			},
		})
	);

	const items = (query.data?.pages.flatMap((page) => page.items) ??
		[]) as MessageRow[];

	const openMessage = (item: MessageRow) => {
		setSelected(item);
		if (item.readAt === null) {
			read.mutate({ messageId: item.messageId });
		}
	};

	const isArchivedTab = tab === "archived";

	return (
		<MyPageShell title="쪽지함">
			<ToggleGroup
				aria-label="쪽지 보기"
				className="w-full max-w-xs"
				onValueChange={(value) => {
					const next = value.at(-1);
					if (next === "inbox" || next === "archived") {
						setTab(next);
					}
				}}
				value={[tab]}
			>
				<ToggleGroupItem className="flex-1" value="inbox">
					받은 쪽지
				</ToggleGroupItem>
				<ToggleGroupItem className="flex-1" value="archived">
					보관함
				</ToggleGroupItem>
			</ToggleGroup>

			{query.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-20 w-full rounded-xl" />
					<Skeleton className="h-20 w-full rounded-xl" />
					<Skeleton className="h-20 w-full rounded-xl" />
				</div>
			) : null}

			{query.isLoading || items.length > 0 ? null : (
				<EmptyState
					description={
						isArchivedTab
							? "보관한 쪽지가 여기에 표시돼요."
							: "운영자가 보낸 쪽지가 여기에 도착해요."
					}
					title={
						isArchivedTab ? "보관한 쪽지가 없어요" : "도착한 쪽지가 없어요"
					}
				/>
			)}

			{items.length > 0 ? (
				<ul className="flex list-none flex-col gap-3 p-0">
					{items.map((item) => {
						const isUnread = item.readAt === null;
						return (
							<li key={item.messageId}>
								<button
									className={cn(
										"flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-secondary",
										isUnread ? "border-primary" : "border-border"
									)}
									onClick={() => openMessage(item)}
									type="button"
								>
									<div className="flex flex-wrap items-center gap-2">
										{isUnread ? <Badge>새 쪽지</Badge> : null}
										<span
											className={cn(
												"text-foreground text-sm",
												isUnread ? "font-extrabold" : "font-semibold"
											)}
										>
											{item.title}
										</span>
									</div>
									<p className="m-0 truncate text-muted-foreground text-sm">
										{communityBodyToText(item.body)}
									</p>
									<span className="text-muted-foreground text-xs">
										{formatSentAt(item.createdAt)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			) : null}

			{query.hasNextPage ? (
				<Button
					className="self-center"
					disabled={query.isFetchingNextPage}
					onClick={() => {
						query.fetchNextPage().catch(() => undefined);
					}}
					type="button"
					variant="outline"
				>
					{query.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
				</Button>
			) : null}

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setSelected(null);
					}
				}}
				open={selected !== null}
			>
				{selected ? (
					<DialogContent>
						<DialogTitle>{selected.title}</DialogTitle>
						<DialogDescription>
							{formatSentAt(selected.createdAt)}
						</DialogDescription>
						<PostBodyViewer body={selected.body} />
						<div className="flex flex-wrap justify-end gap-2">
							<Button
								disabled={setArchived.isPending}
								onClick={() =>
									setArchived.mutate({
										archived: selected.archivedAt === null,
										messageId: selected.messageId,
									})
								}
								type="button"
								variant="outline"
							>
								{selected.archivedAt === null ? "보관" : "보관 해제"}
							</Button>
							<Button
								onClick={() => setPendingDelete(selected)}
								type="button"
								variant="outline"
							>
								삭제
							</Button>
						</div>
					</DialogContent>
				) : null}
			</Dialog>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
					}
				}}
				open={pendingDelete !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>쪽지를 삭제할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							삭제한 쪽지는 쪽지함에서 사라지고 되돌릴 수 없어요.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={remove.isPending}
							onClick={() => {
								if (pendingDelete) {
									remove.mutate({ messageId: pendingDelete.messageId });
								}
							}}
							variant="destructive"
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</MyPageShell>
	);
}
