import { getChatBlockMessage } from "@bambi-app/api/services/bambi-chat-block";
import {
	type AnnotatedChatMessage,
	annotateChatMessages,
} from "@bambi-app/api/services/bambi-chat-message-grouping";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	type Href,
	router,
	useFocusEffect,
	useLocalSearchParams,
} from "expo-router";
import { Button, Dialog, Skeleton, Spinner, useToast } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AppState,
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Text,
	View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { ErrorState } from "@/src/components/bambi-screen";
import { ChatBlockNotice } from "@/src/components/chat/chat-block-notice";
import { ChatComposer } from "@/src/components/chat/chat-composer";
import { ChatDateChip } from "@/src/components/chat/chat-date-chip";
import { ChatMessageBubble } from "@/src/components/chat/chat-message-bubble";
import { ChatNewMessagePill } from "@/src/components/chat/chat-new-message-pill";
import { ChatRoomHeader } from "@/src/components/chat/chat-room-header";
import { ChatRoomMenu } from "@/src/components/chat/chat-room-menu";
import { ChatSystemCard } from "@/src/components/chat/chat-system-card";
import { ChatTypingIndicator } from "@/src/components/chat/chat-typing-indicator";
import { MemberOnly } from "@/src/components/member-only";
import { JobReportDialog } from "@/src/components/report-dialog";
import { getConfirmedScheduleId } from "@/src/lib/bambi-native";
import { chatMutationErrorMessage } from "@/src/lib/chat/chat-errors";
import {
	type ChatTimelineMessage,
	toInvertedTimeline,
} from "@/src/lib/chat/chat-optimistic";
import { CHAT_MESSAGE_PAGE_SIZE } from "@/src/lib/chat/chat-types";
import { useChatAutoRead } from "@/src/lib/chat/use-chat-auto-read";
import { useChatMessages } from "@/src/lib/chat/use-chat-messages";
import { useChatRoomRealtime } from "@/src/lib/chat/use-chat-room-realtime";
import { useChatSend } from "@/src/lib/chat/use-chat-send";
import { orpc } from "@/src/lib/orpc";

// inverted 리스트에서 "맨 아래(최신)를 보고 있다"로 칠 오프셋 상한.
const BOTTOM_STICK_THRESHOLD = 80;
const SYSTEM_KINDS = new Set(["contact_request", "interview_proposal"]);
const SKELETON_ROWS = [0, 1, 2, 3, 4];
const NOT_FOUND_INDEX = -1;

type ConfirmAction = "block" | "leave" | null;

function RoomSkeleton() {
	return (
		<View className="flex-1 gap-4 p-4">
			{SKELETON_ROWS.map((row) => (
				<View className={row % 2 === 0 ? "items-start" : "items-end"} key={row}>
					<Skeleton className="h-12 w-3/5 rounded-2xl" />
				</View>
			))}
		</View>
	);
}

function resolveStatusLine({
	counterpartWithdrawn,
	jobStatus,
}: {
	counterpartWithdrawn: boolean;
	jobStatus: null | string;
}): null | string {
	if (counterpartWithdrawn) {
		return "상대가 탈퇴해 더 이상 대화할 수 없어요.";
	}
	if (jobStatus && jobStatus !== "published") {
		return "마감된 공고예요. 이전 대화만 볼 수 있어요.";
	}
	return null;
}

// Array.prototype.findLastIndex는 Hermes에 없어 역순 for 루프로 대체한다.
function findLastMineIndex(
	messages: readonly ChatTimelineMessage[],
	currentUserId: string | undefined
): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.senderUserId === currentUserId) {
			return index;
		}
	}
	return NOT_FOUND_INDEX;
}

function resolveSendBlockedMessage({
	counterpartWithdrawn,
	isBlocked,
}: {
	counterpartWithdrawn: boolean;
	isBlocked: boolean;
}): null | string {
	if (counterpartWithdrawn) {
		return "상대가 탈퇴해 메시지를 보낼 수 없어요.";
	}
	if (isBlocked) {
		return "차단된 채팅방이에요.";
	}
	return null;
}

function SeekerChatRoomInner() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	// @react-navigation/native는 직접 의존성이 아니라 useIsFocused를 못 쓴다 — expo-router의
	// useFocusEffect로 포커스 상태를 직접 든다.
	const [isFocused, setIsFocused] = useState(false);
	useFocusEffect(
		useCallback(() => {
			setIsFocused(true);
			return () => setIsFocused(false);
		}, [])
	);
	const [appActive, setAppActive] = useState(
		AppState.currentState === "active"
	);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [hasUnseenNew, setHasUnseenNew] = useState(false);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
	const [isReportOpen, setIsReportOpen] = useState(false);
	const listRef =
		useRef<FlatList<AnnotatedChatMessage<ChatTimelineMessage>>>(null);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) =>
			setAppActive(state === "active")
		);
		return () => subscription.remove();
	}, []);

	const showError = useCallback(
		(message: string) => toast.show({ label: message, variant: "danger" }),
		[toast]
	);

	// 전송 훅은 currentUserId가 필요하지만 방 조회 전엔 모른다 — 빈 문자열로 시작하고
	// 실제 전송 버튼은 room이 로드된 뒤에만 활성화된다.
	const roomForUser = queryClient.getQueryData<{ currentUserId: string }>(
		orpc.bambi.chats.getById.queryKey({
			input: { id, limit: CHAT_MESSAGE_PAGE_SIZE },
		})
	);
	const send = useChatSend({
		currentUserId: roomForUser?.currentUserId ?? "",
		onError: showError,
		roomId: id,
	});
	const { canLoadOlder, isLoadingOlder, loadOlder, room, roomQuery, timeline } =
		useChatMessages({
			optimistic: send.optimistic,
			roomId: id,
		});
	const autoRead = useChatAutoRead({
		chatRoomId: id,
		isActive: isFocused && appActive,
	});
	const latestMessageId = timeline.at(-1)?.id ?? null;

	const realtime = useChatRoomRealtime({
		onIncomingMessage: (messageId) => {
			autoRead.queueMarkRead(messageId);
			if (!isAtBottom) {
				setHasUnseenNew(true);
			}
		},
		onUnreadRemaining: autoRead.reassertMarkRead,
		roomId: id,
	});

	// 첫 로드가 끝나면 지연 없이 읽음 처리한다.
	const firstLoadedRef = useRef(false);
	useEffect(() => {
		if (room && !firstLoadedRef.current) {
			firstLoadedRef.current = true;
			autoRead.markReadNow(latestMessageId);
		}
	}, [autoRead, latestMessageId, room]);

	const invalidateRoom = useCallback(
		() =>
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.getById.key({ input: { id } }),
				})
				.catch(() => undefined),
		[id, queryClient]
	);
	const respondContact = useMutation(
		orpc.bambi.chats.respondContactReveal.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSettled: () => invalidateRoom(),
		})
	);
	const setInterviewStatus = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSettled: () => {
				invalidateRoom();
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMyUpcomingInterviews.queryKey(),
					})
					.catch(() => undefined);
			},
		})
	);
	const leaveRoom = useMutation(
		orpc.bambi.chats.deleteChatRoom.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSuccess: () => {
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMine.queryKey(),
					})
					.catch(() => undefined);
				router.back();
			},
		})
	);
	const blockUser = useMutation(
		orpc.bambi.blocks.blockUser.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSuccess: () => {
				toast.show({
					label: "차단했어요. 차단 관리에서 해제할 수 있어요.",
					variant: "default",
				});
				invalidateRoom();
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMine.queryKey(),
					})
					.catch(() => undefined);
			},
		})
	);

	const annotated = useMemo(() => annotateChatMessages(timeline), [timeline]);
	const inverted = useMemo(() => toInvertedTimeline(annotated), [annotated]);
	// 상대가 읽은 내 마지막 메시지 표시용 — 서버 getById는 영수증을 내려주지 않으므로
	// 소켓 chat:message:read를 받은 뒤 재조회된 unreadCount로 대신 판단하지 않고, 단순히
	// "상대가 보낸 더 새 메시지가 있으면 읽음"으로 근사한다(web과 동일한 한계).
	const lastMineIndex = findLastMineIndex(timeline, room?.currentUserId);
	const isLastMineRead =
		lastMineIndex >= 0 &&
		timeline
			.slice(lastMineIndex + 1)
			.some((message) => message.senderUserId !== room?.currentUserId);

	const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const atBottom =
			event.nativeEvent.contentOffset.y <= BOTTOM_STICK_THRESHOLD;
		setIsAtBottom(atBottom);
		if (atBottom) {
			setHasUnseenNew(false);
		}
	};
	const scrollToBottom = () => {
		listRef.current?.scrollToOffset({ animated: true, offset: 0 });
		setHasUnseenNew(false);
	};

	if (roomQuery.isLoading) {
		return (
			<View className="flex-1 bg-background">
				<ChatRoomHeader
					counterpartName={null}
					counterpartProfileImageUrl={null}
					jobTitle={null}
					onBack={() => router.back()}
					statusLine={null}
				/>
				<RoomSkeleton />
			</View>
		);
	}

	if (roomQuery.isError || !room) {
		const blockMessage = getChatBlockMessage(roomQuery.error);
		return (
			<View className="flex-1 bg-background">
				<ChatRoomHeader
					counterpartName={null}
					counterpartProfileImageUrl={null}
					jobTitle={null}
					onBack={() => router.back()}
					statusLine={null}
				/>
				{blockMessage ? (
					<View className="flex-1 items-center justify-center p-6">
						<Text className="text-center text-muted leading-6">
							{blockMessage}
						</Text>
					</View>
				) : (
					<ErrorState onRetry={() => roomQuery.refetch()} />
				)}
			</View>
		);
	}

	const confirmedScheduleId = getConfirmedScheduleId(room.schedules);
	const statusLine = resolveStatusLine({
		counterpartWithdrawn: room.counterpartWithdrawn,
		jobStatus: room.jobPost?.status ?? null,
	});
	const sendBlockedMessage = resolveSendBlockedMessage({
		counterpartWithdrawn: room.counterpartWithdrawn,
		isBlocked: room.room.isBlocked,
	});
	const isBusy = respondContact.isPending || setInterviewStatus.isPending;

	const renderItem = ({ item }: { item: (typeof inverted)[number] }) => {
		const { dateLabel, isGroupEnd, isGroupStart, message } = item;
		const isMine = message.senderUserId === room.currentUserId;
		const body = SYSTEM_KINDS.has(message.kind) ? (
			<ChatSystemCard
				counterpartName={room.counterpartName}
				currentUserId={room.currentUserId}
				isBusy={isBusy}
				message={message}
				onRespondContact={(messageId, decision) =>
					respondContact.mutate({ decision, messageId })
				}
				onSetInterviewStatus={(interviewScheduleId, status) =>
					setInterviewStatus.mutate({ interviewScheduleId, status })
				}
				schedules={room.schedules}
			/>
		) : (
			<ChatMessageBubble
				counterpartName={room.counterpartName}
				counterpartProfileImageUrl={room.counterpartProfileImageUrl}
				isGroupEnd={isGroupEnd}
				isGroupStart={isGroupStart}
				isMine={isMine}
				isReadByCounterpart={
					isMine && message.id === timeline[lastMineIndex]?.id && isLastMineRead
				}
				message={message}
				onDiscard={send.discardFailed}
				onRetry={send.retry}
			/>
		);

		// inverted라 날짜 칩은 같은 아이템 "위"(=렌더 순서상 뒤)에 붙인다.
		return (
			<View>
				{body}
				{dateLabel ? <ChatDateChip label={dateLabel} /> : null}
			</View>
		);
	};

	return (
		<View className="flex-1 bg-background">
			<ChatRoomHeader
				counterpartName={room.counterpartName}
				counterpartProfileImageUrl={room.counterpartProfileImageUrl}
				jobTitle={room.jobPost?.title ?? null}
				onBack={() => router.back()}
				right={
					<ChatRoomMenu
						canRevealContact={Boolean(confirmedScheduleId)}
						onBlock={() => setConfirmAction("block")}
						onLeave={() => setConfirmAction("leave")}
						onReport={() => setIsReportOpen(true)}
						onRevealContact={() =>
							router.push({
								pathname: "/(seeker)/chats/[id]/reveal",
								params: { id },
							} as unknown as Href)
						}
					/>
				}
				statusLine={statusLine}
			/>
			<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
				<View className="flex-1">
					<FlatList
						contentContainerStyle={{ paddingBottom: 8 }}
						data={inverted}
						inverted
						keyboardDismissMode="interactive"
						keyboardShouldPersistTaps="handled"
						keyExtractor={(item) => item.message.id}
						ListFooterComponent={
							isLoadingOlder ? (
								<View className="items-center py-3">
									<Spinner size="sm" />
								</View>
							) : (
								<View className="h-3" />
							)
						}
						ListHeaderComponent={
							realtime.typingUserIds.length > 0 ? (
								<ChatTypingIndicator
									counterpartName={room.counterpartName}
									counterpartProfileImageUrl={room.counterpartProfileImageUrl}
								/>
							) : (
								<View className="h-3" />
							)
						}
						onEndReached={() => {
							if (canLoadOlder) {
								loadOlder();
							}
						}}
						onEndReachedThreshold={0.6}
						onScroll={handleScroll}
						ref={listRef}
						renderItem={renderItem}
						scrollEventThrottle={100}
					/>
					{hasUnseenNew ? (
						<ChatNewMessagePill onPress={scrollToBottom} />
					) : null}
				</View>
				{sendBlockedMessage ? (
					<ChatBlockNotice message={sendBlockedMessage} />
				) : (
					<ChatComposer
						isDisabled={!room.currentUserId}
						isUploading={send.isUploading}
						onSendAttachment={(picked, body) => {
							scrollToBottom();
							send.sendAttachment(picked, body).catch(() => undefined);
						}}
						onSendText={(body) => {
							scrollToBottom();
							send.sendText(body);
						}}
						roomId={id}
					/>
				)}
			</KeyboardAvoidingView>

			<JobReportDialog
				isOpen={isReportOpen}
				onOpenChange={setIsReportOpen}
				targetId={id}
				targetType="chat_room"
			/>

			<Dialog
				isOpen={confirmAction !== null}
				onOpenChange={(open) => !open && setConfirmAction(null)}
			>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<View className="gap-4">
							<View className="gap-1.5">
								<Dialog.Title>
									{confirmAction === "block"
										? "이 상대를 차단할까요?"
										: "채팅방을 나갈까요?"}
								</Dialog.Title>
								<Dialog.Description>
									{confirmAction === "block"
										? "차단하면 두 사람의 모든 채팅이 막혀요. 차단 관리에서 해제할 수 있어요."
										: "나가면 이 대화는 목록에서 사라지고 되돌릴 수 없어요. 다시 문의하면 새 대화로 시작돼요."}
								</Dialog.Description>
							</View>
							<View className="flex-row gap-3">
								<View className="flex-1">
									<Button
										onPress={() => setConfirmAction(null)}
										variant="tertiary"
									>
										<Button.Label>취소</Button.Label>
									</Button>
								</View>
								<View className="flex-1">
									<Button
										isDisabled={leaveRoom.isPending || blockUser.isPending}
										onPress={() => {
											if (confirmAction === "block") {
												blockUser.mutate({
													blockedUserId: room.room.employerUserId,
													chatRoomId: id,
												});
											} else {
												leaveRoom.mutate({ chatRoomId: id });
											}
											setConfirmAction(null);
										}}
										variant="danger"
									>
										<Button.Label>
											{confirmAction === "block" ? "차단" : "나가기"}
										</Button.Label>
									</Button>
								</View>
							</View>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</View>
	);
}

export default function SeekerChatRoomScreen() {
	return (
		<MemberOnly>
			<SeekerChatRoomInner />
		</MemberOnly>
	);
}
