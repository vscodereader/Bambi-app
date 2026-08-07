"use client";

// 밤비 — 전 역할 공용 알림함. 라우트는 /seeker/notifications 하나이고 구직자·구인자·
// 운영자·법률자문이 함께 쓴다(채팅 /seeker/chats/{roomId} 공유 선례와 같다).
// 운영자·법률자문의 공유 알림은 누가 확인했는지("확인: ○○")를 함께 보여준다 —
// 한 명이 확인하면 전원의 배지에서 사라지는 큐 성격을 화면에서 납득시키기 위해서다.

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
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
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";
import {
	type BambiNotificationView,
	notificationBody,
	notificationHref,
	notificationTitle,
} from "@/lib/bambi/notification-labels";
import {
	osNotificationPermission,
	requestOsNotificationPermission,
} from "@/lib/bambi/os-notification";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

function formatNotifiedAt(value: Date | string): string {
	const parts = dateFormatter.formatToParts(new Date(value));
	const lookup = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";

	return `${lookup("year")}.${lookup("month")}.${lookup("day")} ${lookup("hour")}:${lookup("minute")}`;
}

// 진입 시 권한 팝업을 띄우지 않는다(대부분 거부로 굳는다) — 배너의 버튼을 눌렀을 때만 요청한다.
function OsNotificationBanner() {
	const [permission, setPermission] = useState<null | string>(null);

	useEffect(() => {
		setPermission(osNotificationPermission());
	}, []);

	if (permission !== "default") {
		return null;
	}

	return (
		<Alert>
			<AlertTitle>탭이 꺼져 있어도 알림을 받을 수 있어요</AlertTitle>
			<AlertDescription className="flex flex-col items-start gap-3">
				<span>
					브라우저 알림을 허용하면 다른 탭을 보고 있을 때도 새 알림을 바로
					알려드려요. 허용하지 않아도 알림함은 그대로 쓸 수 있어요.
				</span>
				<Button
					onClick={() => {
						requestOsNotificationPermission()
							.then(setPermission)
							.catch(() => undefined);
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					브라우저 알림 허용
				</Button>
			</AlertDescription>
		</Alert>
	);
}

export function NotificationsScreen() {
	const queryClient = useQueryClient();
	const router = useRouter();
	const [isClearOpen, setIsClearOpen] = useState(false);

	const query = useInfiniteQuery(
		orpc.bambi.notifications.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as null | { createdAt: string; id: string },
			input: (cursor: null | { createdAt: string; id: string }) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
			}),
		})
	);

	// markRead·markAllRead는 정본 안읽음 수를 함께 돌려준다 — 재조회 타이밍에 기대지 않고
	// 벨 배지 캐시를 직접 덮어 "읽었는데 핀이 남는" 상태를 원천 차단한다.
	const applyUnreadCount = (unreadCount: number) => {
		queryClient.setQueryData(orpc.bambi.notifications.unreadCount.queryKey(), {
			unreadCount,
		});
		queryClient
			.invalidateQueries({ queryKey: orpc.bambi.notifications.list.key() })
			.catch(() => undefined);
	};

	const markRead = useMutation(
		orpc.bambi.notifications.markRead.mutationOptions({
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
			},
		})
	);

	const markAllRead = useMutation(
		orpc.bambi.notifications.markAllRead.mutationOptions({
			onError: () => {
				toast.error("알림을 확인 처리하지 못했어요");
			},
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
				toast.success("모든 알림을 확인했어요");
			},
		})
	);

	const clearAll = useMutation(
		orpc.bambi.notifications.clearAll.mutationOptions({
			onError: () => {
				toast.error("알림을 비우지 못했어요");
			},
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
				setIsClearOpen(false);
				toast.success("알림을 모두 비웠어요");
			},
		})
	);

	// 벨 배지와 같은 쿼리(캐시 공유). 미읽음이 2페이지 이후에만 있으면 로드된 목록만으로는
	// 판정이 어긋나 "배지엔 N개인데 모두 확인이 비활성"이 된다 — 정본 카운트로 활성 판정한다.
	const unreadCountQuery = useQuery(
		orpc.bambi.notifications.unreadCount.queryOptions()
	);

	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const hasUnread =
		(unreadCountQuery.data?.unreadCount ?? 0) > 0 ||
		items.some((item) => item.readAt === null);

	// 공유 알림을 받는 역할(운영자·법률자문)인지. 비우기 확인 문구에서 "나만 지워지는 게
	// 아니다"를 알려야 해서, 별도 조회 없이 목록에 온 공유 행 유무로 판정한다.
	const hasSharedItems = items.some((item) => item.recipientRole !== null);

	const openNotification = (item: (typeof items)[number]) => {
		if (item.readAt === null) {
			markRead.mutate({ ids: [item.id] });
		}
		// 착지할 화면이 없는 알림(권한 변경 등)은 읽음 처리만 하고 그대로 머문다.
		const href = notificationHref(toView(item));
		if (href) {
			router.push(href as Route);
		}
	};

	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6",
				APP_CONTENT_WIDTH
			)}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					알림
				</h1>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						disabled={!hasUnread || markAllRead.isPending}
						onClick={() => markAllRead.mutate({})}
						size="sm"
						type="button"
						variant="outline"
					>
						모두 확인
					</Button>
					{/* 지울 게 없으면 버튼 자체를 감춘다 — 빈 알림함에서 누를 수 있는 파괴 동작이 남지 않게. */}
					{items.length > 0 ? (
						<Button
							onClick={() => setIsClearOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							알림 비우기
						</Button>
					) : null}
				</div>
			</div>

			<AlertDialog onOpenChange={setIsClearOpen} open={isClearOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>알림을 모두 비울까요?</AlertDialogTitle>
						<AlertDialogDescription>
							읽은 알림과 읽지 않은 알림이 모두 삭제되고 되돌릴 수 없어요.
							{hasSharedItems
								? " 함께 받는 처리 요청 알림은 비우면 같은 역할의 다른 담당자에게서도 사라집니다."
								: ""}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={clearAll.isPending}
							onClick={() => clearAll.mutate({})}
							variant="destructive"
						>
							비우기
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<OsNotificationBanner />

			{query.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-20 w-full rounded-xl" />
					<Skeleton className="h-20 w-full rounded-xl" />
					<Skeleton className="h-20 w-full rounded-xl" />
				</div>
			) : null}

			{/* 실패를 "빈 알림함"으로 위장하면 사용자가 재시도할 방법이 없다 — 따로 세운다. */}
			{query.isError ? (
				<EmptyState
					action={
						<Button
							onClick={() => {
								query.refetch().catch(() => undefined);
							}}
							type="button"
						>
							다시 시도
						</Button>
					}
					description="알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{query.isLoading || query.isError || items.length > 0 ? null : (
				<EmptyState
					description="면접 제안·검수 결과처럼 바로 알아야 하는 소식이 여기에 쌓여요."
					title="아직 받은 알림이 없어요"
				/>
			)}

			{items.length > 0 ? (
				<ul className="flex list-none flex-col gap-3 p-0">
					{items.map((item) => {
						const view = toView(item);
						const body = notificationBody(view);
						const isUnread = item.readAt === null;

						return (
							<li key={item.id}>
								<button
									className={cn(
										"flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-secondary",
										isUnread ? "border-primary" : "border-border"
									)}
									onClick={() => openNotification(item)}
									type="button"
								>
									<div className="flex flex-wrap items-center gap-2">
										{isUnread ? <Badge>새 알림</Badge> : null}
										<span className="font-semibold text-foreground text-sm">
											{notificationTitle(view)}
										</span>
									</div>
									{body ? (
										<p className="m-0 text-muted-foreground text-sm">{body}</p>
									) : null}
									<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
										<span>{formatNotifiedAt(item.createdAt)}</span>
										{item.recipientRole && item.readByName ? (
											<span>확인: {item.readByName}</span>
										) : null}
									</div>
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
					{query.isFetchingNextPage ? "불러오는 중…" : "더보기"}
				</Button>
			) : null}
		</div>
	);
}

// 서버 응답 행 → 라벨/딥링크 맵이 받는 뷰 모델. metadata는 jsonb라 unknown으로 오므로
// 여기서 한 번만 좁힌다.
function toView(item: {
	chatRoomId: null | string;
	metadata: unknown;
	recipientRole: null | string;
	targetId: string;
	targetType: string;
}): BambiNotificationView {
	return {
		chatRoomId: item.chatRoomId,
		metadata:
			item.metadata && typeof item.metadata === "object"
				? (item.metadata as Record<string, unknown>)
				: null,
		recipientRole: item.recipientRole,
		targetId: item.targetId,
		targetType: item.targetType,
	};
}
