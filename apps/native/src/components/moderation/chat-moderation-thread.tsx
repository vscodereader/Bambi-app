import {
	annotateChatMessages,
	formatChatTimeLabel,
} from "@bambi-app/api/services/bambi-chat-message-grouping";
import { useQuery } from "@tanstack/react-query";
import { cn } from "heroui-native";
import { Text, View } from "react-native";
import { ChatAttachmentMessage } from "@/src/components/chat/chat-attachment-message";
import { ChatDateChip } from "@/src/components/chat/chat-date-chip";
import { orpc } from "@/src/lib/orpc";

interface ThreadMessage {
	attachments: {
		byteSize: number;
		category: "image" | "pdf";
		fileName: string;
		id: string;
		mimeType: string;
		objectUrl: string;
	}[];
	body: string;
	createdAt: Date | string;
	id: string;
	kind: string;
	senderUserId: string;
}

// 읽기 전용 말풍선. 채팅 화면의 ChatMessageBubble은 재전송·읽음 영수증·시스템 카드
// 메타데이터까지 요구하는데 운영 열람 응답에는 그 필드가 없다 — 좌우 정렬과 본문만
// 그리는 얇은 버블을 따로 둔다(운영자는 보내지도 지우지도 않는다).
function ModerationBubble({
	isEmployer,
	isGroupEnd,
	isGroupStart,
	message,
	senderName,
}: {
	isEmployer: boolean;
	isGroupEnd: boolean;
	isGroupStart: boolean;
	message: ThreadMessage;
	senderName: string;
}) {
	return (
		<View
			className={cn(
				"w-4/5",
				isEmployer ? "items-end self-end" : "items-start self-start",
				isGroupStart ? "mt-3" : "mt-1"
			)}
		>
			{isGroupStart ? (
				<Text className="mb-1 text-muted text-xs" numberOfLines={1}>
					{senderName}
					{message.kind === "contact_request" ? " · 연락처 요청" : ""}
				</Text>
			) : null}
			<View
				className={cn(
					"max-w-full rounded-2xl px-3.5 py-2.5",
					isEmployer
						? "rounded-br-md bg-accent"
						: "rounded-bl-md bg-surface-secondary"
				)}
			>
				<Text
					className={cn(
						"text-base leading-6",
						isEmployer
							? "text-accent-foreground"
							: "text-surface-secondary-foreground"
					)}
					selectable
				>
					{message.body}
				</Text>
			</View>
			{message.attachments.map((attachment) => (
				<ChatAttachmentMessage
					attachment={attachment}
					isMine={isEmployer}
					key={attachment.id}
					localImageUri={null}
				/>
			))}
			{isGroupEnd ? (
				<Text className="mt-1 text-muted text-xs">
					{formatChatTimeLabel(message.createdAt)}
				</Text>
			) : null}
		</View>
	);
}

// 신고된 채팅방의 전체 대화. 조회 자체가 감사 로그(view_messages)에 남으므로 신고 상세를
// 열 때가 아니라 이 컴포넌트가 붙을 때 한 번만 읽는다.
export function ChatModerationThread({ chatRoomId }: { chatRoomId: string }) {
	const query = useQuery(
		orpc.bambi.moderation.getChatMessagesForModeration.queryOptions({
			input: { chatRoomId },
		})
	);

	if (query.isPending) {
		return <Text className="text-muted text-sm">대화를 불러오고 있어요.</Text>;
	}

	if (query.isError || !query.data) {
		return (
			<Text className="text-danger text-sm">대화를 불러오지 못했어요.</Text>
		);
	}

	const room = query.data;
	const annotated = annotateChatMessages(room.messages);

	return (
		<View className="gap-1">
			{room.fromDeletedRoom ? (
				<Text className="text-muted text-xs leading-5">
					삭제된 채팅방이라 신고 시점에 기록된 최근 메시지만 보여요.
				</Text>
			) : null}
			{annotated.length === 0 ? (
				<Text className="text-muted text-sm">대화 내용이 없어요.</Text>
			) : null}
			{annotated.map(({ dateLabel, isGroupEnd, isGroupStart, message }) => {
				const isEmployer = message.senderUserId === room.employerUserId;

				return (
					<View key={message.id}>
						{dateLabel ? <ChatDateChip label={dateLabel} /> : null}
						<ModerationBubble
							isEmployer={isEmployer}
							isGroupEnd={isGroupEnd}
							isGroupStart={isGroupStart}
							message={message}
							senderName={isEmployer ? room.employerName : room.jobSeekerName}
						/>
					</View>
				);
			})}
		</View>
	);
}
