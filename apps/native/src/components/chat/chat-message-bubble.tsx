import { formatChatTimeLabel } from "@bambi-app/api/services/bambi-chat-message-grouping";
import { Avatar, cn, Spinner } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import type {
	ChatSendStatus,
	ChatTimelineMessage,
} from "@/src/lib/chat/chat-optimistic";

import { ChatAttachmentMessage } from "./chat-attachment-message";

const initialOf = (name: null | string): string =>
	(name ?? "?").trim().charAt(0) || "?";

// 상대 말풍선 왼쪽 아바타 열. 그룹 첫 메시지에만 아바타를 그린다(내 메시지면 없음).
function ChatBubbleAvatarColumn({
	counterpartName,
	counterpartProfileImageUrl,
	isGroupStart,
	isMine,
}: {
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
	isGroupStart: boolean;
	isMine: boolean;
}) {
	if (isMine) {
		return null;
	}

	return (
		<View className="mr-2 w-9">
			{isGroupStart ? (
				<Avatar color="accent" size="sm">
					{counterpartProfileImageUrl ? (
						<Avatar.Image source={{ uri: counterpartProfileImageUrl }} />
					) : null}
					<Avatar.Fallback>{initialOf(counterpartName)}</Avatar.Fallback>
				</Avatar>
			) : null}
		</View>
	);
}

// 말풍선 아래 상태 줄(전송 중·실패·시각·읽음). 본 컴포넌트 분기 복잡도를 낮추려 분리.
function ChatMessageStatusRow({
	canRetry,
	isGroupEnd,
	isMine,
	isReadByCounterpart,
	messageId,
	onDiscard,
	onRetry,
	sendStatus,
	timeLabel,
}: {
	canRetry: boolean;
	isGroupEnd: boolean;
	isMine: boolean;
	isReadByCounterpart: boolean;
	messageId: string;
	onDiscard?: (id: string) => void;
	onRetry?: (id: string) => void;
	sendStatus?: ChatSendStatus;
	timeLabel: null | string;
}) {
	return (
		<View className="mt-1 flex-row items-center gap-1.5">
			{sendStatus === "sending" ? (
				<>
					<Spinner size="sm" />
					<Text className="text-muted text-xs">전송 중</Text>
				</>
			) : null}
			{sendStatus === "failed" ? (
				<>
					<Text className="text-danger text-xs">전송 실패</Text>
					{canRetry ? (
						<Pressable
							accessibilityRole="button"
							hitSlop={8}
							onPress={() => onRetry?.(messageId)}
						>
							<Text className="font-semibold text-accent text-xs">재전송</Text>
						</Pressable>
					) : null}
					<Pressable
						accessibilityRole="button"
						hitSlop={8}
						onPress={() => onDiscard?.(messageId)}
					>
						<Text className="text-muted text-xs">삭제</Text>
					</Pressable>
				</>
			) : null}
			{!sendStatus && timeLabel ? (
				<Text className="text-muted text-xs">{timeLabel}</Text>
			) : null}
			{!sendStatus && isMine && isGroupEnd && isReadByCounterpart ? (
				<Text className="text-muted text-xs">읽음</Text>
			) : null}
		</View>
	);
}

// 카카오톡식 말풍선. 그룹 첫 메시지에만 아바타·이름, 그룹 마지막에만 시각.
// 내 말풍선은 accent, 상대는 surface-secondary. 첨부 메시지는 색 말풍선 없이 콘텐츠만.
export function ChatMessageBubble({
	canRetry = true,
	counterpartName,
	counterpartProfileImageUrl,
	isGroupEnd,
	isGroupStart,
	isMine,
	isReadByCounterpart,
	message,
	onDiscard,
	onRetry,
}: {
	// 재전송 3회 소진 시 false — 재전송 버튼을 숨기고 삭제만 남긴다.
	canRetry?: boolean;
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
	isGroupEnd: boolean;
	isGroupStart: boolean;
	isMine: boolean;
	// 내 마지막 메시지에만 의미 있다. 상대 읽음 영수증 수신 여부.
	isReadByCounterpart: boolean;
	message: ChatTimelineMessage;
	onDiscard?: (id: string) => void;
	onRetry?: (id: string) => void;
}) {
	const attachment = message.attachments[0] ?? null;
	const hasAttachment = attachment !== null || Boolean(message.localImageUri);
	const timeLabel = isGroupEnd ? formatChatTimeLabel(message.createdAt) : null;
	const sendStatus = message.sendStatus;

	return (
		<View
			className={cn(
				"flex-row px-4",
				isMine ? "justify-end" : "justify-start",
				isGroupStart ? "mt-3" : "mt-1"
			)}
		>
			<ChatBubbleAvatarColumn
				counterpartName={counterpartName}
				counterpartProfileImageUrl={counterpartProfileImageUrl}
				isGroupStart={isGroupStart}
				isMine={isMine}
			/>
			<View className={cn("w-4/5", isMine ? "items-end" : "items-start")}>
				{!isMine && isGroupStart ? (
					<Text className="mb-1 text-muted text-xs" numberOfLines={1}>
						{counterpartName ?? "상대"}
					</Text>
				) : null}
				{hasAttachment ? (
					<ChatAttachmentMessage
						attachment={attachment}
						isMine={isMine}
						localImageUri={message.localImageUri ?? null}
						sendStatus={sendStatus}
					/>
				) : (
					<View
						className={cn(
							"max-w-full rounded-2xl px-3.5 py-2.5",
							isMine
								? "rounded-br-md bg-accent"
								: "rounded-bl-md bg-surface-secondary",
							sendStatus === "failed" && "opacity-60"
						)}
					>
						<Text
							className={cn(
								"text-base leading-6",
								isMine
									? "text-accent-foreground"
									: "text-surface-secondary-foreground"
							)}
							selectable
						>
							{message.body}
						</Text>
					</View>
				)}
				<ChatMessageStatusRow
					canRetry={canRetry}
					isGroupEnd={isGroupEnd}
					isMine={isMine}
					isReadByCounterpart={isReadByCounterpart}
					messageId={message.id}
					onDiscard={onDiscard}
					onRetry={onRetry}
					sendStatus={sendStatus}
					timeLabel={timeLabel}
				/>
			</View>
		</View>
	);
}
