import { describe, expect, it } from "vitest";

import {
	buildReadReceiptValues,
	countUnreadMessageIds,
	getChatRecipientUserId,
} from "./bambi-chat-read-state";

describe("bambi chat read state", () => {
	it("resolves the opposite chat participant as recipient", () => {
		const room = {
			employerUserId: "employer-1",
			jobSeekerUserId: "seeker-1",
		};

		expect(getChatRecipientUserId(room, "employer-1")).toBe("seeker-1");
		expect(getChatRecipientUserId(room, "seeker-1")).toBe("employer-1");
	});

	it("deduplicates read receipt values with one shared read timestamp", () => {
		const readAt = new Date("2026-06-24T10:00:00.000Z");

		expect(
			buildReadReceiptValues({
				chatRoomId: "room-1",
				messageIds: ["message-1", "message-1", "message-2"],
				readAt,
				readerUserId: "reader-1",
			})
		).toEqual([
			{
				chatRoomId: "room-1",
				messageId: "message-1",
				readAt,
				readerUserId: "reader-1",
			},
			{
				chatRoomId: "room-1",
				messageId: "message-2",
				readAt,
				readerUserId: "reader-1",
			},
		]);
	});

	it("counts only messages without read receipts as unread", () => {
		expect(
			countUnreadMessageIds({
				messageIds: ["message-1", "message-2", "message-3"],
				readMessageIds: ["message-1", "message-3"],
			})
		).toBe(1);
	});
});
