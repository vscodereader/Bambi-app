import { annotateChatMessages } from "@bambi-app/api/services/bambi-chat-message-grouping";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	type Href,
	router,
	useFocusEffect,
	useLocalSearchParams,
} from "expo-router";
import { Button, Spinner, useThemeColor } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	Text,
	View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/src/components/bambi-screen";
import { ChatBlockNotice } from "@/src/components/chat/chat-block-notice";
import { ChatDateChip } from "@/src/components/chat/chat-date-chip";
import { ChatNewMessagePill } from "@/src/components/chat/chat-new-message-pill";
import { SupportChatBubble } from "@/src/components/support-chat-bubble";
import { SupportChatComposer } from "@/src/components/support-chat-composer";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc, queryClient } from "@/src/lib/orpc";
import { supportChatHref } from "@/src/lib/support/support";
import { ensureSupportChatToken } from "@/src/lib/support/support-chat-store";

// 목록의 "새 문의하기"가 이 값으로 push한다 — 아직 방이 없는 상태.
const NEW_ROOM_ID = "new";
const NEW_ROOM_HREF = supportChatHref(NEW_ROOM_ID) as unknown as Href;
// inverted 리스트에서 "맨 아래(최신)를 보고 있다"로 칠 오프셋 상한.
const BOTTOM_STICK_THRESHOLD = 80;
const GREETING_BODY = "안녕하세요 👋\n무엇을 도와드릴까요?";
const BLOCKED_MESSAGE = "운영자가 메시지 발신을 잠갔어요.";

const invalidateSupportChat = () =>
	queryClient.invalidateQueries({ queryKey: orpc.bambi.supportChat.key() });

// 그룹 _layout이 headerShown:false를 걸어 화면이 헤더를 직접 그린다. 룩은 SeekerStackHeader와
// 같은 축(border-b + h-14 행 + outline 아이콘 버튼).
function SupportChatHeader() {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center gap-3 px-4">
				<Pressable
					accessibilityLabel="뒤로 가기"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
					hitSlop={8}
					onPress={() => router.back()}
				>
					<Ionicons color={foreground} name="arrow-back" size={22} />
				</Pressable>
				<Text className="font-bold text-foreground text-lg">1:1 상담</Text>
			</View>
		</View>
	);
}

// 종료된 대화의 입력바 자리 — 이력은 그대로 보이고 새 대화로만 이어 간다.
function ClosedNotice() {
	const insets = useSafeAreaInsets();

	return (
		<View
			className="items-center gap-3 border-border border-t bg-background px-4 pt-3"
			style={{ paddingBottom: insets.bottom + 12 }}
		>
			<Text className="text-muted text-sm">종료된 대화예요.</Text>
			<Button
				onPress={() => router.replace(NEW_ROOM_HREF)}
				size="sm"
				variant="secondary"
			>
				<Button.Label>새 대화 시작</Button.Label>
			</Button>
		</View>
	);
}

// 차단 > 종료 > 입력 순으로 하단을 고른다(차단은 새 대화로도 못 푼다 — 소유자 축).
function RoomFooter({
	isBlocked,
	isClosed,
	isSending,
	onSend,
}: {
	isBlocked: boolean;
	isClosed: boolean;
	isSending: boolean;
	onSend: (body: string) => void;
}) {
	if (isBlocked) {
		return <ChatBlockNotice message={BLOCKED_MESSAGE} />;
	}
	if (isClosed) {
		return <ClosedNotice />;
	}
	return (
		<SupportChatComposer
			isDisabled={false}
			isSending={isSending}
			onSend={onSend}
		/>
	);
}

// 방이 없는 상태. 첫 발신이 roomId 없이 sendMessage를 호출하면 서버가 방을 만들어 주고,
// 응답 roomId로 실제 방 화면을 갈아 끼운다(뒤로 갔을 때 빈 /new가 남지 않게 replace).
function NewSupportChatScreen() {
	const visitor = useVisitor();
	const send = useMutation(
		orpc.bambi.supportChat.sendMessage.mutationOptions({
			onError: (error) =>
				Alert.alert("메시지를 보내지 못했어요", error.message),
			onSuccess: async (result) => {
				await invalidateSupportChat();
				router.replace(supportChatHref(result.roomId) as unknown as Href);
			},
		})
	);

	const handleSend = (body: string) => {
		// 비회원은 첫 발신 전에 상담 세션 토큰이 있어야 서버가 신원을 잡는다(목록 화면과 같은 흐름).
		const ready =
			visitor.state === "member"
				? Promise.resolve()
				: ensureSupportChatToken().then(() => undefined);
		ready
			.then(() => send.mutate({ body }))
			.catch((error: unknown) =>
				Alert.alert(
					"상담을 시작하지 못했어요",
					error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."
				)
			);
	};

	return (
		<View className="flex-1 bg-background">
			<SupportChatHeader />
			<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
				<View className="flex-1 pt-2">
					<SupportChatBubble
						body={GREETING_BODY}
						// isGroupEnd=false라 시각은 렌더되지 않는다 — 정적 인사에는 시간이 없다.
						createdAt={new Date()}
						isGroupEnd={false}
						isGroupStart
						isMine={false}
					/>
				</View>
				<SupportChatComposer
					isDisabled={visitor.state === "pending"}
					isSending={send.isPending}
					onSend={handleSend}
				/>
			</KeyboardAvoidingView>
		</View>
	);
}

function SupportChatRoomView({ roomId }: { roomId: string }) {
	const [hasUnseenNew, setHasUnseenNew] = useState(false);
	const listRef = useRef<FlatList>(null);
	// 마운트 이후 새로 도착한 id만 등장 애니메이션 대상이다. 첫 응답분은 통째로 seen 처리한다.
	const seenIdsRef = useRef(new Set<string>());
	const hasLoadedRef = useRef(false);
	const isAtBottomRef = useRef(true);

	const query = useQuery({
		...orpc.bambi.supportChat.getRoomMessages.queryOptions({
			input: { roomId },
		}),
		refetchInterval: 3000,
	});
	const markRead = useMutation(
		orpc.bambi.supportChat.markRead.mutationOptions()
	);
	useFocusEffect(
		useCallback(() => {
			markRead.mutate({ roomId });
			query.refetch();
		}, [roomId, markRead.mutate, query.refetch])
	);
	const send = useMutation(
		orpc.bambi.supportChat.sendMessage.mutationOptions({
			onError: (error) =>
				Alert.alert("메시지를 보내지 못했어요", error.message),
			onSuccess: async () => {
				await invalidateSupportChat();
			},
		})
	);

	const data = query.data;
	// 새로 들어온 메시지만 골라 seen에 넣고, 운영자 발신이면 읽음 처리·새 메시지 칩을 띄운다.
	useEffect(() => {
		if (!data) {
			return;
		}
		const incoming = data.messages.filter(
			(message) => !seenIdsRef.current.has(message.id)
		);
		for (const message of incoming) {
			seenIdsRef.current.add(message.id);
		}
		if (!hasLoadedRef.current) {
			hasLoadedRef.current = true;
			return;
		}
		if (incoming.some((message) => message.senderType === "admin")) {
			markRead.mutate({ roomId });
			if (!isAtBottomRef.current) {
				setHasUnseenNew(true);
			}
		}
	}, [data, markRead.mutate, roomId]);

	// 기존 채팅방과 같은 inverted 리스트 — 날짜 칩·그룹 경계는 시간순 배열에서 계산하고
	// 화면에 꽂을 때만 뒤집는다. senderType을 발신자 축으로 그대로 쓴다.
	const items = useMemo(
		() =>
			annotateChatMessages(
				(data?.messages ?? []).map((message) => ({
					...message,
					kind: "text",
					senderUserId: message.senderType,
				}))
			).reverse(),
		[data]
	);

	const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const atBottom =
			event.nativeEvent.contentOffset.y <= BOTTOM_STICK_THRESHOLD;
		isAtBottomRef.current = atBottom;
		if (atBottom) {
			setHasUnseenNew(false);
		}
	};
	const scrollToBottom = () => {
		listRef.current?.scrollToOffset({ animated: true, offset: 0 });
		isAtBottomRef.current = true;
		setHasUnseenNew(false);
	};

	const renderItem = ({ item }: { item: (typeof items)[number] }) => (
		// inverted여도 셀 안은 정방향이라 JSX 순서가 곧 시각 순서 — 날짜 칩이 메시지 위에 온다.
		<View>
			{item.dateLabel ? <ChatDateChip label={item.dateLabel} /> : null}
			<SupportChatBubble
				animateIn={
					hasLoadedRef.current && !seenIdsRef.current.has(item.message.id)
				}
				body={item.message.body}
				createdAt={item.message.createdAt}
				isGroupEnd={item.isGroupEnd}
				isGroupStart={item.isGroupStart}
				isMine={item.message.senderType === "inquirer"}
			/>
		</View>
	);

	return (
		<View className="flex-1 bg-background">
			<SupportChatHeader />
			{query.isPending ? (
				<View className="flex-1 items-center justify-center">
					<Spinner size="lg" />
					<Text className="mt-3 text-muted text-sm">
						상담 내용을 불러오고 있어요.
					</Text>
				</View>
			) : null}
			{query.isError ? <ErrorState onRetry={() => query.refetch()} /> : null}
			{data ? (
				<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
					<View className="flex-1">
						<FlatList
							data={items}
							inverted
							keyboardDismissMode="interactive"
							keyboardShouldPersistTaps="handled"
							keyExtractor={(item) => item.message.id}
							ListFooterComponent={<View className="h-3" />}
							ListHeaderComponent={<View className="h-3" />}
							onScroll={handleScroll}
							ref={listRef}
							renderItem={renderItem}
							scrollEventThrottle={100}
						/>
						{hasUnseenNew ? (
							<ChatNewMessagePill onPress={scrollToBottom} />
						) : null}
					</View>
					<RoomFooter
						isBlocked={data.room.isBlocked}
						isClosed={data.room.status === "closed"}
						isSending={send.isPending}
						onSend={(body) => {
							scrollToBottom();
							send.mutate({ body, roomId });
						}}
					/>
				</KeyboardAvoidingView>
			) : null}
		</View>
	);
}

export default function SupportChatRoomScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();

	// 방 유무로 컴포넌트를 갈라 둔다 — 훅 구성이 서로 달라 한 컴포넌트에 섞지 않는다.
	return id === NEW_ROOM_ID ? (
		<NewSupportChatScreen />
	) : (
		<SupportChatRoomView roomId={id} />
	);
}
