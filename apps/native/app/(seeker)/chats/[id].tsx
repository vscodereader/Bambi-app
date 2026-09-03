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
	type OptimisticChatMessage,
	toInvertedTimeline,
} from "@/src/lib/chat/chat-optimistic";
import { CHAT_MESSAGE_PAGE_SIZE } from "@/src/lib/chat/chat-types";
import { useChatAutoRead } from "@/src/lib/chat/use-chat-auto-read";
import { useChatMessages } from "@/src/lib/chat/use-chat-messages";
import { useChatRoomRealtime } from "@/src/lib/chat/use-chat-room-realtime";
import { MAX_SEND_ATTEMPTS, useChatSend } from "@/src/lib/chat/use-chat-send";
import { orpc } from "@/src/lib/orpc";

// inverted 리스트에서 "맨 아래(최신)를 보고 있다"로 칠 오프셋 상한.
const BOTTOM_STICK_THRESHOLD = 80;
const SYSTEM_KINDS = new Set(["contact_request", "interview_proposal"]);
const SKELETON_ROWS = [0, 1, 2, 3, 4];

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

function RoomLoadErrorScreen({
	error,
	onBack,
	onRetry,
}: {
	error: unknown;
	onBack: () => void;
	onRetry: () => void;
}) {
	const blockMessage = getChatBlockMessage(error);
	return (
		<View className="flex-1 bg-background">
			<ChatRoomHeader
				counterpartName={null}
				counterpartProfileImageUrl={null}
				jobTitle={null}
				onBack={onBack}
				statusLine={null}
			/>
			{blockMessage ? (
				<View className="flex-1 items-center justify-center p-6">
					<Text className="text-center text-muted leading-6">
						{blockMessage}
					</Text>
				</View>
			) : (
				<ErrorState onRetry={onRetry} />
			)}
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

// 재전송 3회 소진 여부. 낙관적 목록에서 이 메시지의 시도 횟수를 찾는다.
function canRetryOptimistic(
	optimistic: readonly OptimisticChatMessage[],
	messageId: string
): boolean {
	const attempts = optimistic.find((item) => item.id === messageId)?.attempts;
	return (attempts ?? 0) < MAX_SEND_ATTEMPTS;
}

function resolveSendBlockedMessage({
	blockMessage,
	counterpartWithdrawn,
}: {
	blockMessage: null | string;
	counterpartWithdrawn: boolean;
}): null | string {
	// 보던 중 차단되면 getById가 FORBIDDEN을 던진다 — 그 사유 문구를 우선 안내한다.
	if (blockMessage) {
		return blockMessage;
	}
	if (counterpartWithdrawn) {
		return "상대가 탈퇴해 메시지를 보낼 수 없어요.";
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
		currentUserId: roomForUser?.currentUserId ?? "",
		onIncomingMessage: (messageId) => {
			autoRead.queueMarkRead(messageId);
			if (!isAtBottom) {
				setHasUnseenNew(true);
			}
		},
		onUnreadRemaining: autoRead.reassertMarkRead,
		roomId: id,
	});

	// 첫 로드가 끝나면 지연 없이 읽음 처리한다. 같은 라우트에서 방만 갈아탈 수 있으므로
	// boolean이 아니라 "읽음 처리한 방 id"를 들어 방이 바뀌면 다시 돈다.
	const firstLoadedRoomIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (room && firstLoadedRoomIdRef.current !== id) {
			firstLoadedRoomIdRef.current = id;
			autoRead.markReadNow(latestMessageId);
			setHasUnseenNew(false);
		}
	}, [autoRead, id, latestMessageId, room]);

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

	// 캐시된 방 데이터가 아예 없는 초기 실패만 전체 화면을 갈아 끼운다. 보던 중 차단되면
	// room(직전 성공 데이터)이 남아 이력을 유지하고, 사유는 입력바 자리에 띄운다(아래).
	if (roomQuery.isError && !room) {
		return (
			<RoomLoadErrorScreen
				error={roomQuery.error}
				onBack={() => router.back()}
				onRetry={() => roomQuery.refetch()}
			/>
		);
	}

	// 최초 로딩(데이터 없음)도 여기로 떨어져 스켈레톤을 그린다 — 위 에러 분기만 통과하면 된다.
	if (!room) {
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

	const confirmedScheduleId = getConfirmedScheduleId(room.schedules);
	const statusLine = resolveStatusLine({
		counterpartWithdrawn: room.counterpartWithdrawn,
		jobStatus: room.jobPost?.status ?? null,
	});
	const sendBlockedMessage = resolveSendBlockedMessage({
		blockMessage: getChatBlockMessage(roomQuery.error),
		counterpartWithdrawn: room.counterpartWithdrawn,
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
				canRetry={canRetryOptimistic(send.optimistic, message.id)}
				counterpartName={room.counterpartName}
				counterpartProfileImageUrl={room.counterpartProfileImageUrl}
				isGroupEnd={isGroupEnd}
				isGroupStart={isGroupStart}
				isMine={isMine}
				isReadByCounterpart={
					isMine && realtime.counterpartReadMessageIds.has(message.id)
				}
				message={message}
				onDiscard={send.discardFailed}
				onRetry={send.retry}
			/>
		);

		// inverted여도 각 셀은 scaleY:-1이 두 번 걸려 내용이 정방향이라 JSX 순서가 곧
		// 시각 순서 — 날짜 칩은 메시지 "위"에 오도록 body 앞에 둔다.
		return (
			<View>
				{dateLabel ? <ChatDateChip label={dateLabel} /> : null}
				{body}
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
				{realtime.realtimeError ? (
					<Text className="px-4 py-1 text-center text-danger text-xs">
						{realtime.realtimeError}
					</Text>
				) : null}
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
