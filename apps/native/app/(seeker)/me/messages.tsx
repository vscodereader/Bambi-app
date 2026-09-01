import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Button, Chip, Separator, Skeleton, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { directMessageBodyToText } from "@/src/lib/me-messages";
import { orpc, queryClient } from "@/src/lib/orpc";

const PAGE_SIZE = 20;

type MessagesTab = "archived" | "inbox";
type MessageCursor = null | { createdAt: string; messageId: string };

// 수신자용 상세 엔드포인트가 없고 listMine 응답에 body까지 들어 있어, 목록 아이템 타입을
// 클라이언트 반환형에서 끌어온다(수동 인터페이스는 서버 필드가 바뀌어도 안 잡힌다).
type MessageItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["directMessages"]["listMine"]>
>["items"][number];

function MessageCard({
	isMutating,
	isOpen,
	item,
	onArchive,
	onDelete,
	onToggle,
}: {
	isMutating: boolean;
	isOpen: boolean;
	item: MessageItem;
	onArchive: () => void;
	onDelete: () => void;
	onToggle: () => void;
}) {
	// readAt·archivedAt은 RPC 직렬화 경계에서 null/undefined가 갈릴 수 있어 falsy로 본다.
	const isUnread = !item.readAt;
	const isArchived = Boolean(item.archivedAt);
	const sender = item.senderName ?? "운영자";
	const sentAt = formatDateTime(item.createdAt);
	// targetRoles는 응답에 있지만 그리지 않는다(enum 원값 노출 금지).
	const text = directMessageBodyToText(item.body);

	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<Pressable
				accessibilityLabel={`${isUnread ? "안 읽은" : "읽은"} 쪽지, ${item.title}, ${sender}, ${sentAt}`}
				accessibilityRole="button"
				accessibilityState={{ expanded: isOpen }}
				className="gap-2 active:opacity-75"
				onPress={onToggle}
			>
				{isUnread ? <Pill tone="accent">새 쪽지</Pill> : null}
				<Text
					className={`text-foreground ${isUnread ? "font-extrabold" : "font-semibold"}`}
					numberOfLines={2}
				>
					{item.title}
				</Text>
				<Text className="text-muted text-xs">{`${sender} · ${sentAt}`}</Text>
				{isOpen ? null : (
					<Text className="text-muted text-sm" numberOfLines={2}>
						{text}
					</Text>
				)}
			</Pressable>
			{isOpen ? (
				<>
					<Separator />
					{/* 본문 Text는 Pressable 바깥에 둔다 — Android에서 selectable Text는 스스로
					    clickable이 되어 부모 Pressable로 탭이 전파되지 않는다(Pill 주석과 같은 함정).
					    ponytail: 본문은 Tiptap JSON을 평문으로 눌러 보여준다(링크는 텍스트, 이미지는
					    "[이미지]" 자리표시). 리치 렌더가 필요해지면 노드 렌더러를 붙인다. */}
					<Text className="text-foreground text-sm leading-6" selectable>
						{text}
					</Text>
					<View className="flex-row justify-end gap-2 pt-1">
						<Button
							isDisabled={isMutating}
							onPress={onArchive}
							size="sm"
							variant="secondary"
						>
							<Button.Label>{isArchived ? "보관 해제" : "보관"}</Button.Label>
						</Button>
						<Button
							isDisabled={isMutating}
							onPress={onDelete}
							size="sm"
							variant="danger-soft"
						>
							<Button.Label>삭제</Button.Label>
						</Button>
					</View>
				</>
			) : null}
		</Surface>
	);
}

function MessagesTabs({
	onChange,
	tab,
}: {
	onChange: (next: MessagesTab) => void;
	tab: MessagesTab;
}) {
	// 웹 ToggleGroup의 native 대응. heroui-native에 토글 그룹이 없어 Chip 두 개로 만든다
	// (홈 업종 필터와 같은 규칙 — Chip이 PressableProps를 상속하므로 직접 터치를 건다).
	// hitSlop은 부모 뷰 경계를 넘지 못하므로 래퍼에 py-2.5를 줘 칩 28dp+20dp=48dp 터치
	// 타깃을 확보한다 — (tabs)/index.tsx 업종 필터와 같은 처방.
	return (
		<View accessibilityRole="tablist" className="flex-row gap-2 py-2.5">
			{(["inbox", "archived"] as const).map((value) => {
				const selected = tab === value;

				return (
					<Chip
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						color={selected ? "accent" : "default"}
						hitSlop={10}
						key={value}
						onPress={() => onChange(value)}
						size="md"
						variant={selected ? "primary" : "soft"}
					>
						<Chip.Label>
							{value === "inbox" ? "받은 쪽지" : "보관함"}
						</Chip.Label>
					</Chip>
				);
			})}
		</View>
	);
}

function MessageList({ tab }: { tab: MessagesTab }) {
	const query = useInfiniteQuery(
		orpc.bambi.directMessages.listMine.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as MessageCursor,
			input: (cursor: MessageCursor) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
				tab,
			}),
		})
	);
	const [openId, setOpenId] = useState<string | null>(null);

	const invalidateList = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.directMessages.listMine.key(),
		});
	};

	const read = useMutation(
		orpc.bambi.directMessages.read.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"쪽지를 읽음 처리하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: invalidateList,
		})
	);

	const setArchived = useMutation(
		orpc.bambi.directMessages.setArchived.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"보관 상태를 바꾸지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			// 보관하면 그 쪽지는 지금 탭에서 사라지므로 펼친 상태도 같이 닫는다.
			onSuccess: async () => {
				setOpenId(null);
				await invalidateList();
			},
		})
	);

	const remove = useMutation(
		orpc.bambi.directMessages.remove.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"쪽지를 삭제하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				setOpenId(null);
				await invalidateList();
			},
		})
	);

	const isArchivedTab = tab === "archived";

	if (query.isPending) {
		return (
			<View className="gap-3">
				<Skeleton className="h-20 rounded-lg" />
				<Skeleton className="h-20 rounded-lg" />
				<Skeleton className="h-20 rounded-lg" />
			</View>
		);
	}

	// 데이터가 있는 실패(배경 재조회·다음 페이지)는 전체 에러 카드로 뒤집지 않는다 —
	// 이미 불러온 N페이지와 펼쳐 둔 본문이 통째로 사라진다. 목록 하단 한 줄로만 알린다.
	if (!query.data) {
		return (
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
				description="로그인 상태와 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
				title="쪽지를 불러오지 못했어요"
			/>
		);
	}

	const items = query.data.pages.flatMap((page) => page.items);

	if (items.length === 0) {
		return (
			<StateCard
				description={
					isArchivedTab
						? "보관한 쪽지가 여기에 표시돼요."
						: "운영자가 보낸 쪽지가 여기에 도착해요."
				}
				title={isArchivedTab ? "보관한 쪽지가 없어요" : "도착한 쪽지가 없어요"}
			/>
		);
	}

	// 여는 방향일 때만 읽음 처리(멱등이지만 닫을 때 헛 호출을 남기지 않는다).
	const toggle = (item: MessageItem) => {
		const willOpen = openId !== item.messageId;
		setOpenId(willOpen ? item.messageId : null);

		if (willOpen && !item.readAt) {
			read.mutate({ messageId: item.messageId });
		}
	};

	// 삭제는 되돌릴 수 없어 확인을 받는다(웹 AlertDialog와 같은 문구).
	const confirmDelete = (item: MessageItem) => {
		Alert.alert(
			"쪽지를 삭제할까요?",
			"삭제한 쪽지는 쪽지함에서 사라지고 되돌릴 수 없어요.",
			[
				{ style: "cancel", text: "취소" },
				{
					onPress: () => remove.mutate({ messageId: item.messageId }),
					style: "destructive",
					text: "삭제",
				},
			]
		);
	};

	const isMutating = setArchived.isPending || remove.isPending;

	return (
		<View className="gap-3">
			{items.map((item) => (
				<MessageCard
					isMutating={isMutating}
					isOpen={openId === item.messageId}
					item={item}
					key={item.messageId}
					onArchive={() =>
						setArchived.mutate({
							archived: !item.archivedAt,
							messageId: item.messageId,
						})
					}
					onDelete={() => confirmDelete(item)}
					onToggle={() => toggle(item)}
				/>
			))}
			{query.isError ? (
				<Text className="text-center text-danger-soft-foreground text-xs dark:text-danger">
					최신 쪽지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
				</Text>
			) : null}
			{query.hasNextPage ? (
				<Button
					accessibilityLabel="쪽지 더 보기"
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
	);
}

export default function SeekerMeMessagesScreen() {
	const [tab, setTab] = useState<MessagesTab>("inbox");

	return (
		<BambiScreen>
			{/* 상태와 무관하게 항상 렌더한다 — 로딩·에러에서 화면을 통째로 갈아끼우면 이 노드가
			    언마운트돼 스택 헤더 제목이 빈칸으로 깜빡인다. */}
			<Stack.Screen options={{ title: "쪽지함" }} />
			<BambiHeader
				description="운영자가 보낸 쪽지를 확인할 수 있어요."
				title="쪽지함"
			/>
			<MessagesTabs onChange={setTab} tab={tab} />
			<MessageList tab={tab} />
		</BambiScreen>
	);
}
