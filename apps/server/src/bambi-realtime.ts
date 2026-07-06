import { createContext } from "@bambi-app/api/context";
import { requireChatParticipant } from "@bambi-app/api/services/bambi-authz";
import {
	getUnreadMessageCount,
	markChatMessagesRead,
} from "@bambi-app/api/services/bambi-chat-read-state";
import {
	type ChatErrorEvent,
	type ChatRealtimeServerToClientEvents,
	type ChatRealtimeTransport,
	configureBambiChatRealtime,
	emitMessageRead,
	emitUnreadUpdated,
	getChatRoomSocketRoom,
	getUserSocketRoom,
	isParticipantActiveInRoom,
	markParticipantActive,
	markParticipantInactive,
	markSocketInactiveEverywhere,
} from "@bambi-app/api/services/bambi-chat-realtime";
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
			maxDisconnectionDuration: 120_000,
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

		socket.on("chat:join", async (rawPayload, ack) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const { profile, room } = await requireChatParticipant(
					roomId,
					socket.data.session
				);

				if (room.isBlocked) {
					throw new ChatRealtimeError("FORBIDDEN", "차단된 채팅방입니다.");
				}

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

		socket.on("chat:typing:started", (rawPayload) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const userId = assertJoinedParticipant(socket, roomId);

				socket.to(getChatRoomSocketRoom(roomId)).emit("chat:typing:started", {
					roomId,
					userId,
				});
			} catch (error) {
				emitError(socket, error);
			}
		});

		socket.on("chat:typing:stopped", (rawPayload) => {
			try {
				const { roomId } = roomPayloadSchema.parse(rawPayload);
				const userId = assertJoinedParticipant(socket, roomId);

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

				if (room.isBlocked) {
					throw new ChatRealtimeError("FORBIDDEN", "차단된 채팅방입니다.");
				}

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
