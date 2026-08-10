import { describe, expect, it } from "vitest";

import {
	buildReadReceiptValues,
	chunkMessageIds,
	getChatRecipientUserId,
} from "@/services/bambi-chat-read-state";

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

	it("splits a long read-receipt batch into bounded insert chunks", () => {
		const messageIds = Array.from(
			{ length: 5 },
			(_value, index) => `message-${index}`
		);

		expect(chunkMessageIds(messageIds, 2)).toEqual([
			["message-0", "message-1"],
			["message-2", "message-3"],
			["message-4"],
		]);
		expect(chunkMessageIds([], 2)).toEqual([]);
	});

	it("keeps every id in a single chunk when the size is not usable", () => {
		expect(chunkMessageIds(["message-1", "message-2"], 0)).toEqual([
			["message-1", "message-2"],
		]);
		expect(chunkMessageIds([], 0)).toEqual([]);
	});
});
