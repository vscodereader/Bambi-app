import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	type BambiNotificationView,
	notificationBody,
	notificationTitle,
} from "@bambi-app/api/services/bambi-notification-labels";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	type NotificationRole,
	notificationRoute,
} from "@/src/lib/notification-route";
import { orpc, queryClient } from "@/src/lib/orpc";

const PAGE_SIZE = 20;

type NotificationCursor = null | { createdAt: string; id: string };
type NotificationItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["notifications"]["list"]>
>["items"][number];

// 서버 행 → 문구·경로 맵이 받는 뷰. metadata는 jsonb라 unknown으로 오므로 여기서 한 번 좁힌다.
const toView = (item: NotificationItem): BambiNotificationView => ({
	chatRoomId: item.chatRoomId,
	metadata:
		item.metadata && typeof item.metadata === "object"
			? (item.metadata as Record<string, unknown>)
			: null,
	recipientRole: item.recipientRole,
	targetId: item.targetId,
	targetType: item.targetType,
});

// markRead·markAllRead·clearAll 응답의 unreadCount가 정본이다 — 벨 배지 캐시를 바로 덮어
// 재조회 전에도 숫자가 맞는다(web notifications-screen applyUnreadCount와 같은 계약).
const applyUnreadCount = (unreadCount: number) => {
	queryClient.setQueryData(orpc.bambi.notifications.unreadCount.queryKey(), {
		unreadCount,
	});
	queryClient
		.invalidateQueries({ queryKey: orpc.bambi.notifications.list.key() })
		.catch(() => undefined);
};

function NotificationCard({
	item,
	onPress,
}: {
	item: NotificationItem;
	onPress: () => void;
}) {
	const view = toView(item);
	const title = notificationTitle(view);
	const body = notificationBody(view);
	const isUnread = item.readAt === null;

	// 테두리는 항상 두고 색만 바꾼다(안읽음=accent, 읽음=transparent). 카드를 눌러 읽음 처리되면
	// 이 컴포넌트가 마운트된 채로 클래스가 바뀌는데, heroui Surface는 overflow-hidden이라
	// Android에서 borderWidth가 1→0으로 바뀌는 순간 자식이 통째로 클리핑돼 빈 카드만 남았다
	// (화면 재진입=재마운트 때만 복구). boost-options·attendance의 border 상시 유지 패턴과 같다.
	return (
		<Surface
			className={`rounded-lg border ${isUnread ? "border-accent" : "border-transparent"}`}
			variant="secondary"
		>
			<Pressable
				accessibilityLabel={`${isUnread ? "안 읽은" : "읽은"} 알림, ${title}`}
				accessibilityRole="button"
				className="gap-2 p-4 active:opacity-75"
				onPress={onPress}
			>
				{isUnread ? <Pill tone="accent">새 알림</Pill> : null}
				<Text
					className={`text-foreground ${isUnread ? "font-extrabold" : "font-semibold"}`}
				>
					{title}
				</Text>
				{body ? <Text className="text-muted text-sm">{body}</Text> : null}
				<Text className="text-muted text-xs">
					{formatDateTime(item.createdAt)}
					{item.recipientRole && item.readByName
						? ` · 확인: ${item.readByName}`
						: ""}
				</Text>
			</Pressable>
		</Surface>
	);
}

// 헤더 우측 액션(모두 확인·비우기). 화면 본체와 분리해 둔다.
function NotificationActions({
	canClear,
	hasUnread,
	isClearing,
	isMarking,
	onClear,
	onMarkAllRead,
}: {
	canClear: boolean;
	hasUnread: boolean;
	isClearing: boolean;
	isMarking: boolean;
	onClear: () => void;
	onMarkAllRead: () => void;
}) {
	return (
		<View className="flex-row gap-2">
			<Button
				isDisabled={!hasUnread || isMarking}
				onPress={onMarkAllRead}
				size="sm"
				variant="secondary"
			>
				<Button.Label>모두 확인</Button.Label>
			</Button>
			{canClear ? (
				<Button
					isDisabled={isClearing}
					onPress={onClear}
					size="sm"
					variant="secondary"
				>
					<Button.Label>비우기</Button.Label>
				</Button>
			) : null}
		</View>
	);
}

function NotificationSkeleton() {
	return (
		<View className="gap-3">
			<Skeleton className="h-20 rounded-lg" />
			<Skeleton className="h-20 rounded-lg" />
			<Skeleton className="h-20 rounded-lg" />
		</View>
	);
}

export function NotificationsScreen({ role }: { role: NotificationRole }) {
	const query = useInfiniteQuery(
		orpc.bambi.notifications.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as NotificationCursor,
			input: (cursor: NotificationCursor) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
			}),
		})
	);
	const unreadQuery = useQuery(
		orpc.bambi.notifications.unreadCount.queryOptions()
	);

	const markRead = useMutation(
		orpc.bambi.notifications.markRead.mutationOptions({
			onSuccess: (result) => applyUnreadCount(result.unreadCount),
		})
	);
	const markAllRead = useMutation(
		orpc.bambi.notifications.markAllRead.mutationOptions({
			onError: () => Alert.alert("알림을 확인 처리하지 못했어요"),
			onSuccess: (result) => applyUnreadCount(result.unreadCount),
		})
	);
	const clearAll = useMutation(
		orpc.bambi.notifications.clearAll.mutationOptions({
			onError: () => Alert.alert("알림을 비우지 못했어요"),
			onSuccess: (result) => applyUnreadCount(result.unreadCount),
		})
	);

	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const hasUnread =
		(unreadQuery.data?.unreadCount ?? 0) > 0 ||
		items.some((item) => item.readAt === null);
	const hasSharedItems = items.some((item) => item.recipientRole !== null);

	const open = (item: NotificationItem) => {
		if (item.readAt === null) {
			markRead.mutate({ ids: [item.id] });
		}
		const href = notificationRoute(toView(item), role);
		if (href) {
			router.push(href as Href);
		}
	};

	const confirmClear = () => {
		Alert.alert(
			"알림을 모두 비울까요?",
			`읽은 알림과 읽지 않은 알림이 모두 삭제되고 되돌릴 수 없어요.${
				hasSharedItems
					? " 함께 받는 처리 요청 알림은 비우면 같은 역할의 다른 담당자에게서도 사라집니다."
					: ""
			}`,
			[
				{ style: "cancel", text: "취소" },
				{
					onPress: () => clearAll.mutate({}),
					style: "destructive",
					text: "비우기",
				},
			]
		);
	};

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<NotificationActions
						canClear={items.length > 0}
						hasUnread={hasUnread}
						isClearing={clearAll.isPending}
						isMarking={markAllRead.isPending}
						onClear={confirmClear}
						onMarkAllRead={() => markAllRead.mutate({})}
					/>
				}
				title="알림"
			/>
			{query.isPending ? <NotificationSkeleton /> : null}
			{/* 데이터가 있는 실패(배경 재조회·다음 페이지)는 전체 에러 카드로 뒤집지 않는다 —
			    이미 불러온 페이지가 통째로 사라진다. 목록 하단 한 줄로만 알린다. */}
			{query.isPending || query.data ? null : (
				<StateCard
					action={
						<Button
							isDisabled={query.isFetching}
							onPress={() => query.refetch()}
							size="sm"
							variant="secondary"
						>
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			)}
			{query.data && items.length === 0 ? (
				<StateCard
					description="면접 제안·검수 결과처럼 바로 알아야 하는 소식이 여기에 쌓여요."
					title="아직 받은 알림이 없어요"
				/>
			) : null}
			{items.length > 0 ? (
				<View className="gap-3">
					{items.map((item) => (
						<NotificationCard
							item={item}
							key={item.id}
							onPress={() => open(item)}
						/>
					))}
					{query.isError ? (
						<Text className="text-center text-danger text-xs">
							최신 알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
						</Text>
					) : null}
					{query.hasNextPage ? (
						<Button
							isDisabled={query.isFetchingNextPage}
							onPress={() => query.fetchNextPage()}
							variant="secondary"
						>
							<Button.Label>
								{query.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
							</Button.Label>
						</Button>
					) : null}
				</View>
			) : null}
		</BambiScreen>
	);
}
