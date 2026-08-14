/**
 * 채팅 메시지 전파의 transactional outbox — **채팅 메시지 전용**이다(범용 이벤트 버스로
 * 일반화하지 않는다).
 *
 * 예전에는 메시지를 INSERT한 뒤 곧바로 소켓 emit·알림 INSERT를 이어 했다. 그 사이에
 * 프로세스가 죽거나 알림 INSERT가 실패하면 메시지는 남고 상대에겐 아무 신호도 가지
 * 않아, 다음 조회 전까지 새 메시지가 온 줄 모르는 방이 생겼다. 이제 메시지와 **같은
 * 트랜잭션**으로 큐 행을 쌓고(enqueue), 커밋 직후 인프로세스로 즉시 비운다(drain).
 * 실패한 행은 남아 부팅·주기 스윕이 다시 시도한다.
 *
 * 이음새는 enqueue/drain 두 함수뿐이라, 나중에 Redis Stream 컨슈머로 갈아끼울 때
 * 이 파일만 바꾸면 된다.
 */

import type { db } from "@bambi-app/db";
import {
	chatMessage,
	chatMessageSyncQueue,
	chatRoom,
} from "@bambi-app/db/schema/bambi";
import { asc, eq, lt } from "drizzle-orm";

import {
	getChatRecipientUserId,
	getUnreadMessageCount,
} from "./bambi-chat-read-state";
import {
	emitChatListUpdated,
	emitMessageCreated,
	emitUnreadUpdated,
	isParticipantActiveInRoom,
} from "./bambi-chat-realtime";
import { createBambiNotification } from "./bambi-notifications";

/** 메시지 INSERT와 같은 트랜잭션에서 쓰기 위해 드리즐 트랜잭션 핸들도 받는다. */
type ChatMessageSyncWriter = Pick<typeof db, "insert">;

export interface ChatMessageSyncEvent {
	chatRoomId: string;
	createdAt: Date;
	messageId: string;
	senderUserId: string;
}

interface NotifyChatMessageInput {
	createdAt: Date | string;
	/** 메시지 종류. 전용 알림이 이미 나간 시스템 메시지를 알림에서 제외하는 데 쓴다. */
	kind?: null | string;
	messageId: string;
	profileUserId: string;
	room: {
		employerUserId: string;
		id: string;
		jobSeekerUserId: string;
	};
}

/** 이 횟수만큼 실패하면 더 시도하지 않고 행을 남긴 채 로그만 남긴다(사후 조사용). */
const MAX_SYNC_ATTEMPTS = 3;
/** 한 번의 drain이 처리하는 행 수. 평소엔 0~1건이고, 밀린 경우에만 의미가 있다. */
const DRAIN_BATCH_SIZE = 100;

const toIsoDateTime = (value: Date | string): string =>
	value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/**
 * 새 메시지 한 건의 전파. 방을 열어 둔 상대에겐 소켓으로, 아니면 알림 행 + SSE 뱃지로 간다.
 *
 * drain이 부르는 것이 정상 경로다. 메시지 행을 새로 만들지 않는 상태 전이
 * (연락처 공개 응답)만 라우터에서 직접 부른다.
 */
export const notifyChatMessageCreated = async ({
	createdAt,
	kind,
	messageId,
	profileUserId,
	room,
}: NotifyChatMessageInput): Promise<void> => {
	const recipientUserId = getChatRecipientUserId(room, profileUserId);
	const recipientUnreadCount = await getUnreadMessageCount({
		chatRoomId: room.id,
		userId: recipientUserId,
	});

	emitMessageCreated({
		createdAt: toIsoDateTime(createdAt),
		messageId,
		roomId: room.id,
		senderUserId: profileUserId,
	});
	emitUnreadUpdated({
		roomId: room.id,
		unreadCount: recipientUnreadCount,
		userId: recipientUserId,
	});
	// 방 소켓룸에 입장하지 않은 목록 화면도 새 방/새 메시지를 반영하도록
	// 양쪽 참여자의 유저 채널로 목록 갱신 신호를 보낸다.
	emitChatListUpdated([room.employerUserId, room.jobSeekerUserId], {
		roomId: room.id,
	});

	// 면접 제안 시스템 메시지는 전용 interview_schedule 알림(action: proposed)이 이미
	// 나갔다. 여기서 chat_message 알림까지 만들면 미접속 수신자에게 알림이 두 번 간다.
	// 소켓 브로드캐스트(위)는 그대로 두고 알림 행 생성만 건너뛴다.
	if (
		kind !== "interview_proposal" &&
		!isParticipantActiveInRoom(room.id, recipientUserId)
	) {
		await createBambiNotification({
			actorUserId: profileUserId,
			chatRoomId: room.id,
			metadata: { source: "chat" },
			recipientUserId,
			targetId: messageId,
			targetType: "chat_message",
		});
	}
};

/**
 * 메시지 INSERT와 같은 트랜잭션에서 부른다. 커밋되지 않으면 이벤트도 없다 —
 * "메시지는 있는데 아무도 못 받는" 창이 사라진다.
 */
export const enqueueChatMessageSync = async (
	tx: ChatMessageSyncWriter,
	event: ChatMessageSyncEvent
): Promise<void> => {
	await tx.insert(chatMessageSyncQueue).values({
		chatRoomId: event.chatRoomId,
		messageCreatedAt: event.createdAt,
		messageId: event.messageId,
		senderUserId: event.senderUserId,
	});
};

const runDrain = async (): Promise<void> => {
	const { db: database } = await import("@bambi-app/db");
	const rows = await database
		.select({
			attempts: chatMessageSyncQueue.attempts,
			employerUserId: chatRoom.employerUserId,
			id: chatMessageSyncQueue.id,
			jobSeekerUserId: chatRoom.jobSeekerUserId,
			// 메시지 종류를 여기서 함께 읽어(전용 알림이 이미 나간 시스템 메시지 판별).
			// 큐 테이블에 컬럼을 더하지 않으려 조인으로 가져온다(마이그레이션 없음). 메시지가
			// 사라진 큐 행도 놓치지 않도록 leftJoin — kind null은 일반 메시지로 취급한다.
			kind: chatMessage.kind,
			messageCreatedAt: chatMessageSyncQueue.messageCreatedAt,
			messageId: chatMessageSyncQueue.messageId,
			roomId: chatMessageSyncQueue.chatRoomId,
			senderUserId: chatMessageSyncQueue.senderUserId,
		})
		.from(chatMessageSyncQueue)
		.innerJoin(chatRoom, eq(chatRoom.id, chatMessageSyncQueue.chatRoomId))
		.leftJoin(chatMessage, eq(chatMessage.id, chatMessageSyncQueue.messageId))
		.where(lt(chatMessageSyncQueue.attempts, MAX_SYNC_ATTEMPTS))
		.orderBy(asc(chatMessageSyncQueue.createdAt))
		.limit(DRAIN_BATCH_SIZE);

	for (const row of rows) {
		try {
			await notifyChatMessageCreated({
				createdAt: row.messageCreatedAt,
				kind: row.kind,
				messageId: row.messageId,
				profileUserId: row.senderUserId,
				room: {
					employerUserId: row.employerUserId,
					id: row.roomId,
					jobSeekerUserId: row.jobSeekerUserId,
				},
			});
			await database
				.delete(chatMessageSyncQueue)
				.where(eq(chatMessageSyncQueue.id, row.id));
		} catch (error) {
			const attempts = row.attempts + 1;

			await database
				.update(chatMessageSyncQueue)
				.set({ attempts })
				.where(eq(chatMessageSyncQueue.id, row.id));

			console.warn(
				`[chat-sync] 메시지 전파 실패 (${attempts}/${MAX_SYNC_ATTEMPTS})`,
				{ error, messageId: row.messageId, roomId: row.roomId }
			);
		}
	}
};

// 동시 호출을 직렬화한다. 앞선 drain이 도는 중에 새 메시지가 커밋되면, 그 요청의 호출이
// 뒤에 붙어 한 번 더 훑는다 — 그냥 건너뛰면 그 메시지는 다음 스윕(60초)까지 밀린다.
// ponytail: 인프로세스 직렬 처리. 처리량이 문제되면 Redis Stream 컨슈머로 교체한다.
let drainChain: Promise<void> = Promise.resolve();

/** 큐에 남은 행을 비운다. 커밋 직후·부팅 시·주기 스윕에서 부른다. */
export const drainPendingChatMessageSyncs = (): Promise<void> => {
	drainChain = drainChain.then(runDrain, runDrain).catch((error) => {
		console.warn("[chat-sync] drain 실패", error);
	});

	return drainChain;
};
