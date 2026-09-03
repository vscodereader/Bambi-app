import { describe, expect, it } from "vitest";

import {
	buildChatTimeline,
	createOptimisticTextMessage,
	dropSettledOptimistic,
	toInvertedTimeline,
} from "@/src/lib/chat/chat-optimistic";
import type { ChatRoomMessage } from "@/src/lib/chat/chat-types";

const serverMessage = (id: string, createdAt: string): ChatRoomMessage =>
	({
		attachments: [],
		body: `서버 ${id}`,
		chatRoomId: "room",
		createdAt: new Date(createdAt),
		id,
		kind: "text",
		metadata: null,
		revealedPhone: null,
		riskFlags: [],
		senderUserId: "me",
	}) as unknown as ChatRoomMessage;

const optimistic = (id: string) =>
	createOptimisticTextMessage({
		body: id,
		chatRoomId: "room",
		id,
		senderUserId: "me",
	});

describe("buildChatTimeline", () => {
	it("낙관적 메시지를 서버 메시지 뒤에 시간순으로 붙인다", () => {
		const timeline = buildChatTimeline({
			optimistic: [optimistic("opt")],
			server: [serverMessage("a", "2026-09-01T00:00:00.000Z")],
		});

		expect(timeline.map(({ id }) => id)).toEqual(["a", "opt"]);
		expect(timeline[1].sendStatus).toBe("sending");
	});

	it("같은 id의 서버 행이 오면 낙관적 항목을 대체하고 sendStatus가 사라진다", () => {
		const timeline = buildChatTimeline({
			optimistic: [optimistic("a")],
			server: [serverMessage("a", "2026-09-01T00:00:00.000Z")],
		});

		expect(timeline).toHaveLength(1);
		expect(timeline[0].body).toBe("서버 a");
		expect(timeline[0].sendStatus).toBeUndefined();
	});
});

describe("dropSettledOptimistic", () => {
	it("서버에 도착한 id만 걷어낸다", () => {
		expect(
			dropSettledOptimistic(
				[optimistic("a"), optimistic("b")],
				[serverMessage("a", "2026-09-01T00:00:00.000Z")]
			).map(({ id }) => id)
		).toEqual(["b"]);
	});
});

describe("toInvertedTimeline", () => {
	it("최신이 0번이 된다(FlatList inverted)", () => {
		const timeline = buildChatTimeline({
			optimistic: [],
			server: [
				serverMessage("a", "2026-09-01T00:00:00.000Z"),
				serverMessage("b", "2026-09-02T00:00:00.000Z"),
			],
		});

		expect(toInvertedTimeline(timeline).map(({ id }) => id)).toEqual([
			"b",
			"a",
		]);
	});
});
