import { describe, expect, it } from "vitest";

import {
	configureBambiChatRealtime,
	emitChatListUpdated,
	emitMessageCreated,
	emitRoomUpdated,
	getActiveParticipantIds,
	getChatRoomIdFromSocketRoom,
	getChatRoomSocketRoom,
	getUserSocketRoom,
	isParticipantActiveInRoom,
	markParticipantActive,
	markParticipantInactive,
	markSocketInactiveEverywhere,
	resetBambiChatRealtimeForTests,
} from "./bambi-chat-realtime";

class FakeRealtimeServer {
	events: Array<{ event: string; payload: unknown; room: string }> = [];

	to(room: string) {
		return {
			emit: (event: string, payload: unknown) => {
				this.events.push({ event, payload, room });
			},
		};
	}
}

describe("bambi chat realtime", () => {
	it("uses stable Socket.IO room names for chat rooms", () => {
		expect(getChatRoomSocketRoom("room-1")).toBe("chat:room-1");
	});

	it("tracks active participants with multiple sockets per user", () => {
		resetBambiChatRealtimeForTests();

		markParticipantActive({
			roomId: "room-1",
			socketId: "socket-a",
			userId: "user-1",
		});
		markParticipantActive({
			roomId: "room-1",
			socketId: "socket-b",
			userId: "user-1",
		});
		markParticipantActive({
			roomId: "room-1",
			socketId: "socket-c",
			userId: "user-2",
		});

		expect(isParticipantActiveInRoom("room-1", "user-1")).toBe(true);
		expect(getActiveParticipantIds("room-1")).toEqual(["user-1", "user-2"]);

		markParticipantInactive({
			roomId: "room-1",
			socketId: "socket-a",
			userId: "user-1",
		});

		expect(isParticipantActiveInRoom("room-1", "user-1")).toBe(true);

		markParticipantInactive({
			roomId: "room-1",
			socketId: "socket-b",
			userId: "user-1",
		});

		expect(isParticipantActiveInRoom("room-1", "user-1")).toBe(false);
		expect(getActiveParticipantIds("room-1")).toEqual(["user-2"]);
	});

	it("removes a disconnected socket from every active room", () => {
		resetBambiChatRealtimeForTests();

		markParticipantActive({
			roomId: "room-1",
			socketId: "socket-a",
			userId: "user-1",
		});
		markParticipantActive({
			roomId: "room-2",
			socketId: "socket-a",
			userId: "user-1",
		});
		markParticipantActive({
			roomId: "room-2",
			socketId: "socket-b",
			userId: "user-1",
		});

		markSocketInactiveEverywhere("socket-a");

		expect(isParticipantActiveInRoom("room-1", "user-1")).toBe(false);
		expect(isParticipantActiveInRoom("room-2", "user-1")).toBe(true);
	});

	// 소켓 정리는 역인덱스만 보므로, 명시적으로 나간 방이 나중에 되살아나면 안 된다.
	it("does not resurrect rooms the socket already left", () => {
		resetBambiChatRealtimeForTests();

		markParticipantActive({
			roomId: "room-1",
			socketId: "socket-a",
			userId: "user-1",
		});
		markParticipantActive({
			roomId: "room-2",
			socketId: "socket-a",
			userId: "user-1",
		});
		markParticipantInactive({
			roomId: "room-1",
			socketId: "socket-a",
			userId: "user-1",
		});

		markSocketInactiveEverywhere("socket-a");

		expect(isParticipantActiveInRoom("room-1", "user-1")).toBe(false);
		expect(isParticipantActiveInRoom("room-2", "user-1")).toBe(false);
		expect(getActiveParticipantIds("room-2")).toEqual([]);
	});

	it("ignores disconnects of sockets that never joined a room", () => {
		resetBambiChatRealtimeForTests();

		expect(() => markSocketInactiveEverywhere("socket-unknown")).not.toThrow();
	});

	// 재연결 복구 소켓은 socket.io 룸만 복원되므로, 룸 이름에서 방 id를 되짚어 프레즌스를 되살린다.
	it("reads the chat room id back from a socket room name", () => {
		expect(getChatRoomIdFromSocketRoom(getChatRoomSocketRoom("room-1"))).toBe(
			"room-1"
		);
		expect(getChatRoomIdFromSocketRoom(getUserSocketRoom("user-1"))).toBeNull();
		expect(getChatRoomIdFromSocketRoom("chat:")).toBeNull();
	});

	it("emits message-created without message body or sensitive fields", () => {
		resetBambiChatRealtimeForTests();
		const server = new FakeRealtimeServer();
		configureBambiChatRealtime(server);

		emitMessageCreated({
			createdAt: "2026-06-24T10:00:00.000Z",
			messageId: "message-1",
			roomId: "room-1",
			senderUserId: "user-1",
		});

		expect(server.events).toEqual([
			{
				event: "chat:message:created",
				payload: {
					createdAt: "2026-06-24T10:00:00.000Z",
					messageId: "message-1",
					roomId: "room-1",
					senderUserId: "user-1",
				},
				room: "chat:room-1",
			},
		]);
		expect(JSON.stringify(server.events[0]?.payload)).not.toContain("body");
		expect(JSON.stringify(server.events[0]?.payload)).not.toContain("contact");
		expect(JSON.stringify(server.events[0]?.payload)).not.toContain("location");
	});

	it("uses stable Socket.IO room names for user channels", () => {
		expect(getUserSocketRoom("user-1")).toBe("user:user-1");
	});

	it("emits list-updated to each participant's user channel without duplicates", () => {
		resetBambiChatRealtimeForTests();
		const server = new FakeRealtimeServer();
		configureBambiChatRealtime(server);

		emitChatListUpdated(["user-1", "user-2", "user-1"], { roomId: "room-1" });

		expect(server.events).toEqual([
			{
				event: "chat:list:updated",
				payload: { roomId: "room-1" },
				room: "user:user-1",
			},
			{
				event: "chat:list:updated",
				payload: { roomId: "room-1" },
				room: "user:user-2",
			},
		]);
	});

	it("emits room-updated to the chat room socket room", () => {
		resetBambiChatRealtimeForTests();
		const server = new FakeRealtimeServer();
		configureBambiChatRealtime(server);

		emitRoomUpdated({ roomId: "room-1" });

		expect(server.events).toEqual([
			{
				event: "chat:room:updated",
				payload: { roomId: "room-1" },
				room: "chat:room-1",
			},
		]);
	});
});
