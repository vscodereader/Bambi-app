import { describe, expect, it } from "vitest";

import {
	configureBambiChatRealtime,
	emitMessageCreated,
	getActiveParticipantIds,
	getChatRoomSocketRoom,
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
});
