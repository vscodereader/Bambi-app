import {
	chatMessage,
	chatMessageReadReceipt,
	chatRoom,
} from "@bambi-app/db/schema/bambi";
import {
	and,
	count,
	eq,
	inArray,
	isNull,
	lte,
	ne,
	notInArray,
	or,
} from "drizzle-orm";

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

interface GetUnreadMessageCountsByRoomInput {
	roomIds: string[];
	userId: string;
}

interface MarkChatMessagesReadUpToInput {
	chatRoomId: string;
	readAt?: Date;
	readerUserId: string;
	upToMessageId: string;
}

export interface ReadReceiptResult {
	messageId: string;
	readAt: Date;
}

// 한 INSERT에 싣는 읽음영수증 행 수 상한. 행 하나가 4개 컬럼을 바인딩하므로 Postgres의
// 파라미터 상한(65535)까지는 여유가 크지만, 오래 방치한 방을 한 문장으로 밀어 넣지 않도록 끊는다.
const READ_RECEIPT_INSERT_CHUNK_SIZE = 500;

const getUniqueMessageIds = (messageIds: string[]): string[] =>
	Array.from(new Set(messageIds));

export const chunkMessageIds = (
	messageIds: string[],
	chunkSize: number
): string[][] => {
	if (chunkSize < 1) {
		return messageIds.length > 0 ? [messageIds] : [];
	}

	const chunks: string[][] = [];

	for (let index = 0; index < messageIds.length; index += chunkSize) {
		chunks.push(messageIds.slice(index, index + chunkSize));
	}

	return chunks;
};

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

const insertReadReceipts = async ({
	chatRoomId,
	messageIds,
	readAt,
	readerUserId,
}: Required<BuildReadReceiptValuesInput>): Promise<ReadReceiptResult[]> => {
	const { db } = await import("@bambi-app/db");

	return await db
		.insert(chatMessageReadReceipt)
		.values(
			buildReadReceiptValues({
				chatRoomId,
				messageIds,
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

/**
 * 방별 안 읽음 수를 한 번의 집계 쿼리로 센다.
 *
 * 예전에는 방의 상대 메시지 id를 전부 앱으로 끌어와(LIMIT 없음) 두 번째 쿼리의 IN 절에
 * 그대로 넣고 JS에서 차집합을 셌다 — 방 이력이 길수록 전송 1건의 비용이 선형으로 커졌고,
 * 목록(listMine)은 그걸 방 수만큼 반복했다. 아래 anti-join은 행을 하나도 옮기지 않는다.
 *
 * 어느 한쪽이라도 나간 방은 아예 세지 않는다 — 총합과 같은 기준이라야 핀이 유령으로
 * 켜지지 않는다.
 */
export const getUnreadMessageCountsByRoom = async ({
	roomIds,
	userId,
}: GetUnreadMessageCountsByRoomInput): Promise<Map<string, number>> => {
	if (roomIds.length === 0) {
		return new Map();
	}

	const { db } = await import("@bambi-app/db");
	const rows = await db
		.select({
			chatRoomId: chatMessage.chatRoomId,
			value: count(chatMessage.id),
		})
		.from(chatMessage)
		.innerJoin(chatRoom, eq(chatRoom.id, chatMessage.chatRoomId))
		.leftJoin(
			chatMessageReadReceipt,
			and(
				eq(chatMessageReadReceipt.messageId, chatMessage.id),
				eq(chatMessageReadReceipt.readerUserId, userId)
			)
		)
		.where(
			and(
				inArray(chatMessage.chatRoomId, roomIds),
				isNull(chatRoom.employerDeletedAt),
				isNull(chatRoom.seekerDeletedAt),
				ne(chatMessage.senderUserId, userId),
				isNull(chatMessageReadReceipt.messageId)
			)
		)
		.groupBy(chatMessage.chatRoomId);

	return new Map(rows.map((row) => [row.chatRoomId, row.value]));
};

export const getUnreadMessageCount = async ({
	chatRoomId,
	userId,
}: GetUnreadMessageCountInput): Promise<number> => {
	const counts = await getUnreadMessageCountsByRoom({
		roomIds: [chatRoomId],
		userId,
	});

	return counts.get(chatRoomId) ?? 0;
};

// 헤더 채팅 버튼·모바일 탭 뱃지용 전체 집계. 내가 참여한 모든 방에서 상대가 보낸
// 메시지 중 내 읽음 영수증이 없는 메시지 행의 총수를 한 번의 쿼리로 센다.
// 집합은 목록(listMine)과 같아야 한다 — 어느 한쪽이라도 나간 방까지 세면 목록에 없는
// 방 때문에 뱃지가 켜진 채 끌 방법이 없다. 그래서 같은 술어를 건다.
export const getUnreadMessageCountForUser = async ({
	excludedRoomIds = [],
	userId,
}: {
	excludedRoomIds?: string[];
	userId: string;
}): Promise<number> => {
	const { db } = await import("@bambi-app/db");
	const [result] = await db
		.select({ value: count(chatMessage.id) })
		.from(chatMessage)
		.innerJoin(chatRoom, eq(chatRoom.id, chatMessage.chatRoomId))
		.leftJoin(
			chatMessageReadReceipt,
			and(
				eq(chatMessageReadReceipt.messageId, chatMessage.id),
				eq(chatMessageReadReceipt.readerUserId, userId)
			)
		)
		.where(
			and(
				excludedRoomIds.length > 0
					? notInArray(chatRoom.id, excludedRoomIds)
					: undefined,
				or(
					eq(chatRoom.employerUserId, userId),
					eq(chatRoom.jobSeekerUserId, userId)
				),
				isNull(chatRoom.employerDeletedAt),
				isNull(chatRoom.seekerDeletedAt),
				ne(chatMessage.senderUserId, userId),
				isNull(chatMessageReadReceipt.messageId)
			)
		);

	return result?.value ?? 0;
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

	return await insertReadReceipts({
		chatRoomId,
		messageIds: readableMessageIds,
		readAt,
		readerUserId,
	});
};

/**
 * "이 메시지까지 읽었다"를 한 번에 기록한다.
 *
 * 예전에는 클라이언트가 방의 상대 메시지 id를 전부 실어 보냈는데 서버 입력 상한이 50이라,
 * 상대 메시지가 51건을 넘는 순간 요청 전체가 거절돼 읽음영수증이 **한 건도** 안 써졌다
 * (뱃지가 영영 안 꺼짐). 기준선(마지막으로 화면에 올라온 메시지)만 받고 안 읽은 것을
 * 서버가 직접 골라 쓰면 상한도 왕복도 사라지고, 재방문 시엔 고를 행이 없어 0건이 된다.
 */
export const markChatMessagesReadUpTo = async ({
	chatRoomId,
	readAt = new Date(),
	readerUserId,
	upToMessageId,
}: MarkChatMessagesReadUpToInput): Promise<ReadReceiptResult[]> => {
	const { db } = await import("@bambi-app/db");
	const [watermark] = await db
		.select({ createdAt: chatMessage.createdAt })
		.from(chatMessage)
		.where(
			and(
				eq(chatMessage.id, upToMessageId),
				eq(chatMessage.chatRoomId, chatRoomId)
			)
		)
		.limit(1);

	if (!watermark) {
		return [];
	}

	const unreadMessages = await db
		.select({ id: chatMessage.id })
		.from(chatMessage)
		.leftJoin(
			chatMessageReadReceipt,
			and(
				eq(chatMessageReadReceipt.messageId, chatMessage.id),
				eq(chatMessageReadReceipt.readerUserId, readerUserId)
			)
		)
		.where(
			and(
				eq(chatMessage.chatRoomId, chatRoomId),
				ne(chatMessage.senderUserId, readerUserId),
				lte(chatMessage.createdAt, watermark.createdAt),
				isNull(chatMessageReadReceipt.messageId)
			)
		);

	if (unreadMessages.length === 0) {
		return [];
	}

	const receipts: ReadReceiptResult[] = [];

	// 오래 방치한 방은 한 번에 수천 건이 될 수 있다. 하나의 INSERT에 다 싣지 않고
	// 조각내 바인딩 파라미터 상한(행×열)에 걸리지 않게 한다.
	for (const chunk of chunkMessageIds(
		unreadMessages.map(({ id }) => id),
		READ_RECEIPT_INSERT_CHUNK_SIZE
	)) {
		receipts.push(
			...(await insertReadReceipts({
				chatRoomId,
				messageIds: chunk,
				readAt,
				readerUserId,
			}))
		);
	}

	return receipts;
};
