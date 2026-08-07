import { clientIpFromHeaders, createContext } from "@bambi-app/api/context";
import {
	findUserBlockBetween,
	requireChatParticipant,
} from "@bambi-app/api/services/bambi-authz";
import {
	getUnreadMessageCount,
	markChatMessagesRead,
} from "@bambi-app/api/services/bambi-chat-read-state";
import {
	type ChatErrorEvent,
	type ChatRealtimeServerToClientEvents,
	type ChatRealtimeTransport,
	configureBambiChatRealtime,
	emitChatListUpdated,
	emitMessageRead,
	emitUnreadUpdated,
	getChatRoomIdFromSocketRoom,
	getChatRoomSocketRoom,
	getUserSocketRoom,
	isParticipantActiveInRoom,
	markParticipantActive,
	markParticipantInactive,
	markSocketInactiveEverywhere,
} from "@bambi-app/api/services/bambi-chat-realtime";
import { getRoomIdsHiddenByActiveReport } from "@bambi-app/api/services/bambi-chat-report-availability";
import {
	resolveRealtimeConnectRateLimit,
	takeRateLimit,
} from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/server";
import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import { z } from "zod";

const roomPayloadSchema = z.object({
	roomId: z.string().uuid(),
});

const readPayloadSchema = roomPayloadSchema.extend({
	messageIds: z.array(z.string().uuid()).min(1).max(50),
});

interface ChatRealtimeAckSuccess {
	ok: true;
}

interface ChatRealtimeAckFailure {
	error: ChatErrorEvent;
	ok: false;
}

type ChatRealtimeAck = (
	response: ChatRealtimeAckFailure | ChatRealtimeAckSuccess
) => void;

interface ChatRealtimeClientToServerEvents {
	"chat:join": (
		payload: unknown,
		ack?: ChatRealtimeAck
	) => Promise<void> | void;
	"chat:leave": (
		payload: unknown,
		ack?: ChatRealtimeAck
	) => Promise<void> | void;
	"chat:message:ack-read": (
		payload: unknown,
		ack?: ChatRealtimeAck
	) => Promise<void> | void;
	"chat:typing:started": (payload: unknown) => Promise<void> | void;
	"chat:typing:stopped": (payload: unknown) => Promise<void> | void;
}

type BambiChatSocket = Socket<
	ChatRealtimeClientToServerEvents,
	ChatRealtimeServerToClientEvents
>;

class ChatRealtimeError extends Error {
	readonly code: ChatErrorEvent["code"];

	constructor(code: ChatErrorEvent["code"], message: string) {
		super(message);
		this.code = code;
	}
}

const assertNoActiveChatReport = async (roomId: string): Promise<void> => {
	const hiddenRoomIds = await getRoomIdsHiddenByActiveReport([roomId]);

	if (hiddenRoomIds.has(roomId)) {
		throw new ChatRealtimeError(
			"FORBIDDEN",
			"신고 처리 중인 채팅방은 이용할 수 없어요."
		);
	}
};

const getErrorPayload = (error: unknown): ChatErrorEvent => {
	if (error instanceof ChatRealtimeError) {
		return { code: error.code, message: error.message };
	}

	if (error instanceof z.ZodError) {
		return {
			code: "BAD_REQUEST",
			message: "채팅 요청 형식을 다시 확인해 주세요.",
		};
	}

	if (error && typeof error === "object" && "code" in error) {
		const code = String(error.code);
		if (
			code === "BAD_REQUEST" ||
			code === "FORBIDDEN" ||
			code === "NOT_FOUND" ||
			code === "UNAUTHORIZED"
		) {
			return {
				code,
				message: "채팅 접근 권한을 확인해 주세요.",
			};
		}
	}

	return {
		code: "BAD_REQUEST",
		message: "채팅 요청을 처리하지 못했어요.",
	};
};

const emitError = (
	socket: BambiChatSocket,
	error: unknown,
	ack?: ChatRealtimeAck
): void => {
	const payload = getErrorPayload(error);
	socket.emit("chat:error", payload);
	ack?.({ error: payload, ok: false });
};

const getSocketUserId = (socket: BambiChatSocket): string => {
	const userId = socket.data.userId;

	if (!userId) {
		throw new ChatRealtimeError(
			"UNAUTHORIZED",
			"로그인 후 다시 시도해 주세요."
		);
	}

	return userId;
};

/**
 * 소켓 경로의 차단 가드. 예전에는 chatRoom.isBlocked(운영자 조치)만 봐서 사용자 간 차단
 * (user_block)을 통째로 놓쳤다 — HTTP는 막히는데 소켓으로는 방에 들어가 이벤트를 받고
 * 읽음 처리까지 밀어 넣을 수 있었다. HTTP 가드(chats.ts)와 같은 조회를 쓴다.
 */
const assertChatRoomNotBlocked = async (
	room: {
		employerUserId: string;
		id: string;
		isBlocked: boolean;
		jobSeekerUserId: string;
	},
	actorUserId: string
): Promise<void> => {
	if (room.isBlocked) {
		throw new ChatRealtimeError("FORBIDDEN", "차단된 채팅방입니다.");
	}

	const otherUserId =
		room.employerUserId === actorUserId
			? room.jobSeekerUserId
			: room.employerUserId;

	if (await findUserBlockBetween(actorUserId, otherUserId)) {
		throw new ChatRealtimeError(
			"FORBIDDEN",
			"차단된 상대와는 채팅할 수 없습니다."
		);
	}
};

const assertJoinedParticipant = (
	socket: BambiChatSocket,
	roomId: string
): string => {
	const userId = getSocketUserId(socket);

	if (!isParticipantActiveInRoom(roomId, userId)) {
		throw new ChatRealtimeError("FORBIDDEN", "채팅방에 먼저 입장해 주세요.");
	}

	return userId;
};

export const attachBambiRealtime = (fastify: FastifyInstance): void => {
	const io = new Server<
		ChatRealtimeClientToServerEvents,
		ChatRealtimeServerToClientEvents
	>(fastify.server, {
		connectionStateRecovery: {
			// 복구 창은 실제 재연결 지연(수 초) 수준이면 충분하다. 길게 잡으면 끊긴 소켓의
			// 세션(사용자 정보 포함)과 그 사이의 모든 브로드캐스트 패킷을 그만큼 들고 있는다.
			maxDisconnectionDuration: 30_000,
			// 복구 소켓도 인증 미들웨어를 다시 태운다(기본값은 건너뛴다). 안 그러면 로그아웃·
			// 정지된 세션이 복구만으로 되살아난다.
			skipMiddlewares: false,
		},
		cors: {
			allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
			credentials: true,
			methods: ["GET", "POST"],
			origin: env.CORS_ORIGIN,
		},
	});

	const realtimeTransport: ChatRealtimeTransport = {
		to(room) {
			return {
				emit(event, payload) {
					const args = [payload] as Parameters<
						ChatRealtimeServerToClientEvents[typeof event]
					>;
					io.to(room).emit(event, ...args);
				},
			};
		},
	};

	configureBambiChatRealtime(realtimeTransport);

	fastify.addHook("preClose", (done) => {
		io.local.disconnectSockets(true);
		configureBambiChatRealtime(null);
		done();
	});

	io.use(async (socket, next) => {
		try {
			// 핸드셰이크마다 세션 조회가 붙고 연결 하나가 인스턴스 동시 슬롯을 잡으므로,
			// 세션을 보기 전에 IP 기준으로 "새로 여는 속도"부터 끊는다.
			const { key, limit, windowMs } = resolveRealtimeConnectRateLimit({
				clientIp: clientIpFromHeaders(socket.request.headers),
				scope: "socket",
			});

			if (!takeRateLimit({ key, limit, now: Date.now(), windowMs })) {
				throw new ChatRealtimeError(
					"BAD_REQUEST",
					"연결 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."
				);
			}

			const context = await createContext(socket.request.headers);
			const userId = context.session?.user.id;

			if (!userId) {
				throw new ChatRealtimeError(
					"UNAUTHORIZED",
					"로그인 후 다시 시도해 주세요."
				);
			}

			socket.data.userId = userId;
			socket.data.session = context.session;
			next();
		} catch (error) {
			const payload = getErrorPayload(error);
			next(new Error(payload.message));
		}
	});

	io.on("connection", (socket) => {
		// 목록 화면 등 특정 방에 입장하지 않은 클라이언트도 새 방/새 메시지를
		// 실시간으로 받도록, 연결 시 유저 채널에 자동 입장한다.
		socket.join(getUserSocketRoom(socket.data.userId));

		// connectionStateRecovery는 socket.io 룸만 되돌리고 앱 레벨 프레즌스는 되살리지
		// 않는다(끊길 때 disconnect가 이미 지웠다). 그대로 두면 복구된 소켓이 방 이벤트는
		// 받으면서 타이핑마다 "채팅방에 먼저 입장해 주세요" FORBIDDEN을 맞고, 알림 판정도
		// "방을 안 보고 있다"로 뒤집힌다.
		if (socket.recovered) {
			for (const socketRoom of socket.rooms) {
				const roomId = getChatRoomIdFromSocketRoom(socketRoom);

				if (roomId) {
					markParticipantActive({
						roomId,
						socketId: socket.id,
						userId: socket.data.userId,
					});
				}
			}
		}

		socket.on("chat:join", async (rawPayload, ack) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const { profile, room } = await requireChatParticipant(
					roomId,
					socket.data.session
				);

				await assertChatRoomNotBlocked(room, profile.userId);
				await assertNoActiveChatReport(room.id);

				await socket.join(getChatRoomSocketRoom(room.id));
				markParticipantActive({
					roomId: room.id,
					socketId: socket.id,
					userId: profile.userId,
				});
				ack?.({ ok: true });
			} catch (error) {
				emitError(socket, error, ack);
			}
		});

		socket.on("chat:leave", async (rawPayload, ack) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const userId = assertJoinedParticipant(socket, roomId);

				await socket.leave(getChatRoomSocketRoom(roomId));
				markParticipantInactive({
					roomId,
					socketId: socket.id,
					userId,
				});
				ack?.({ ok: true });
			} catch (error) {
				emitError(socket, error, ack);
			}
		});

		socket.on("chat:typing:started", async (rawPayload) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const userId = assertJoinedParticipant(socket, roomId);
				await assertNoActiveChatReport(roomId);

				socket.to(getChatRoomSocketRoom(roomId)).emit("chat:typing:started", {
					roomId,
					userId,
				});
			} catch (error) {
				emitError(socket, error);
			}
		});

		socket.on("chat:typing:stopped", async (rawPayload) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const userId = assertJoinedParticipant(socket, roomId);
				await assertNoActiveChatReport(roomId);

				socket.to(getChatRoomSocketRoom(roomId)).emit("chat:typing:stopped", {
					roomId,
					userId,
				});
			} catch (error) {
				emitError(socket, error);
			}
		});

		socket.on("chat:message:ack-read", async (rawPayload, ack) => {
			try {
				const { messageIds, roomId } = readPayloadSchema.parse(rawPayload);
				const { profile, room } = await requireChatParticipant(
					roomId,
					socket.data.session
				);

				await assertChatRoomNotBlocked(room, profile.userId);
				await assertNoActiveChatReport(room.id);

				const readReceipts = await markChatMessagesRead({
					chatRoomId: room.id,
					messageIds,
					readerUserId: profile.userId,
				});
				const unreadCount = await getUnreadMessageCount({
					chatRoomId: room.id,
					userId: profile.userId,
				});

				for (const receipt of readReceipts) {
					emitMessageRead({
						messageId: receipt.messageId,
						readAt: receipt.readAt.toISOString(),
						readerUserId: profile.userId,
						roomId: room.id,
					});
				}

				if (readReceipts.length > 0) {
					emitUnreadUpdated({
						roomId: room.id,
						unreadCount,
						userId: profile.userId,
					});
					// 읽은 본인의 유저 채널로 목록 갱신 신호를 보내 헤더 채팅
					// 버튼·모바일 탭의 안 읽음 핀/뱃지가 즉시 꺼지게 한다.
					emitChatListUpdated([profile.userId], { roomId: room.id });
				}
				ack?.({ ok: true });
			} catch (error) {
				emitError(socket, error, ack);
			}
		});

		socket.on("disconnect", () => {
			markSocketInactiveEverywhere(socket.id);
		});
	});
};
