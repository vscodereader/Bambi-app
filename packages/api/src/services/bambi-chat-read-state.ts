import {
	chatMessage,
	chatMessageReadReceipt,
} from "@bambi-app/db/schema/bambi";
import { and, eq, inArray, ne } from "drizzle-orm";

interface ChatParticipantRoom {
	employerUserId: string;
	jobSeekerUserId: string;
}

interface BuildReadReceiptValuesInput {
	chatRoomId: string;
	messageIds: string[];
	readAt?: Date;
	readerUserId: string;
}

interface CountUnreadMessageIdsInput {
	messageIds: string[];
	readMessageIds: string[];
}

interface MarkChatMessagesReadInput {
	chatRoomId: string;
	messageIds: string[];
	readAt?: Date;
	readerUserId: string;
}

interface GetUnreadMessageCountInput {
	chatRoomId: string;
	userId: string;
}

export interface ReadReceiptResult {
	messageId: string;
	readAt: Date;
}

const getUniqueMessageIds = (messageIds: string[]): string[] =>
	Array.from(new Set(messageIds));

export const getChatRecipientUserId = (
	room: ChatParticipantRoom,
	senderUserId: string
): string => {
	if (senderUserId === room.employerUserId) {
		return room.jobSeekerUserId;
	}

	if (senderUserId === room.jobSeekerUserId) {
		return room.employerUserId;
	}

	throw new Error("Sender must be a chat participant.");
};

export const buildReadReceiptValues = ({
	chatRoomId,
	messageIds,
	readAt = new Date(),
	readerUserId,
}: BuildReadReceiptValuesInput) =>
	getUniqueMessageIds(messageIds).map((messageId) => ({
		chatRoomId,
		messageId,
		readAt,
		readerUserId,
	}));

export const countUnreadMessageIds = ({
	messageIds,
	readMessageIds,
}: CountUnreadMessageIdsInput): number => {
	const readMessageIdSet = new Set(readMessageIds);

	return messageIds.filter((messageId) => !readMessageIdSet.has(messageId))
		.length;
};

export const getUnreadMessageCount = async ({
	chatRoomId,
	userId,
}: GetUnreadMessageCountInput): Promise<number> => {
	const { db } = await import("@bambi-app/db");
	const unreadCandidateMessages = await db
		.select({ id: chatMessage.id })
		.from(chatMessage)
		.where(
			and(
				eq(chatMessage.chatRoomId, chatRoomId),
				ne(chatMessage.senderUserId, userId)
			)
		);
	const messageIds = unreadCandidateMessages.map(({ id }) => id);

	if (messageIds.length === 0) {
		return 0;
	}

	const readReceipts = await db
		.select({ messageId: chatMessageReadReceipt.messageId })
		.from(chatMessageReadReceipt)
		.where(
			and(
				eq(chatMessageReadReceipt.chatRoomId, chatRoomId),
				eq(chatMessageReadReceipt.readerUserId, userId),
				inArray(chatMessageReadReceipt.messageId, messageIds)
			)
		);

	return countUnreadMessageIds({
		messageIds,
		readMessageIds: readReceipts.map(({ messageId }) => messageId),
	});
};

export const markChatMessagesRead = async ({
	chatRoomId,
	messageIds,
	readAt = new Date(),
	readerUserId,
}: MarkChatMessagesReadInput): Promise<ReadReceiptResult[]> => {
	const uniqueMessageIds = getUniqueMessageIds(messageIds);

	if (uniqueMessageIds.length === 0) {
		return [];
	}

	const { db } = await import("@bambi-app/db");
	const readableMessages = await db
		.select({ id: chatMessage.id })
		.from(chatMessage)
		.where(
			and(
				eq(chatMessage.chatRoomId, chatRoomId),
				inArray(chatMessage.id, uniqueMessageIds),
				ne(chatMessage.senderUserId, readerUserId)
			)
		);
	const readableMessageIds = readableMessages.map(({ id }) => id);

	if (readableMessageIds.length === 0) {
		return [];
	}

	return await db
		.insert(chatMessageReadReceipt)
		.values(
			buildReadReceiptValues({
				chatRoomId,
				messageIds: readableMessageIds,
				readAt,
				readerUserId,
			})
		)
		.onConflictDoNothing({
			target: [
				chatMessageReadReceipt.messageId,
				chatMessageReadReceipt.readerUserId,
			],
		})
		.returning({
			messageId: chatMessageReadReceipt.messageId,
			readAt: chatMessageReadReceipt.readAt,
		});
};
