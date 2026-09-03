import { describe, expect, it } from "vitest";
import {
	isScrolledToBottom,
	mergeChatMessagesById,
	resolveOldestChatMessageCursor,
} from "@/services/bambi-chat-room-messages";

const message = (id: string, createdAt: string) => ({ createdAt, id });

describe("mergeChatMessagesById", () => {
	it("이전 페이지를 앞에, 최신 페이지를 뒤에 둔다", () => {
		const merged = mergeChatMessagesById(
			[message("a", "2026-08-01T00:00:00.000Z")],
			[message("b", "2026-08-02T00:00:00.000Z")]
		);

		expect(merged.map(({ id }) => id)).toEqual(["a", "b"]);
	});

	// 큐 재처리·소켓 재전달로 같은 메시지가 두 경로로 들어와도 말풍선이 두 번 뜨면 안 된다.
	it("같은 id는 한 번만 남긴다", () => {
		const merged = mergeChatMessagesById(
			[message("a", "2026-08-01T00:00:00.000Z")],
			[message("a", "2026-08-01T00:00:00.000Z"), message("b", "z")]
		);

		expect(merged).toHaveLength(2);
	});

	it("중복된 id는 최신 페이지 쪽 내용으로 덮되 자리는 유지한다", () => {
		const merged = mergeChatMessagesById(
			[
				{ body: "옛 사본", createdAt: "1", id: "a" },
				{ body: "그대로", createdAt: "2", id: "b" },
			],
			[{ body: "새 사본", createdAt: "1", id: "a" }]
		);

		expect(merged).toEqual([
			{ body: "새 사본", createdAt: "1", id: "a" },
			{ body: "그대로", createdAt: "2", id: "b" },
		]);
	});

	it("입력 배열 순서가 섞여도 실제 최신 메시지를 마지막에 둔다", () => {
		const merged = mergeChatMessagesById(
			[message("c", "2026-08-03T00:00:00.000Z")],
			[
				message("b", "2026-08-02T00:00:00.000Z"),
				message("a", "2026-08-01T00:00:00.000Z"),
			]
		);

		expect(merged.map(({ id }) => id)).toEqual(["a", "b", "c"]);
	});
});

describe("resolveOldestChatMessageCursor", () => {
	it("가장 오래된(맨 앞) 메시지의 createdAt·id를 커서로 만든다", () => {
		expect(
			resolveOldestChatMessageCursor([
				message("a", "2026-08-01T00:00:00.000Z"),
				message("b", "2026-08-02T00:00:00.000Z"),
			])
		).toEqual({ createdAt: "2026-08-01T00:00:00.000Z", id: "a" });
	});

	// 서버 응답이 Date로 역직렬화돼도 커서는 ISO 문자열이어야 한다(zod .datetime()).
	it("Date를 ISO 문자열로 바꾼다", () => {
		expect(
			resolveOldestChatMessageCursor([
				{ createdAt: new Date("2026-08-01T00:00:00.000Z"), id: "a" },
			])
		).toEqual({ createdAt: "2026-08-01T00:00:00.000Z", id: "a" });
	});

	it("메시지가 없으면 커서도 없다", () => {
		expect(resolveOldestChatMessageCursor([])).toBeNull();
	});
});

describe("isScrolledToBottom", () => {
	it("맨 아래면 참", () => {
		expect(
			isScrolledToBottom({
				clientHeight: 400,
				scrollHeight: 1000,
				scrollTop: 600,
			})
		).toBe(true);
	});

	it("소수점 오차 수준으로 떠 있어도 하단 고정을 유지한다", () => {
		expect(
			isScrolledToBottom({
				clientHeight: 400,
				scrollHeight: 1000,
				scrollTop: 599.5,
			})
		).toBe(true);
	});

	it("위로 올려 과거를 읽는 중이면 거짓", () => {
		expect(
			isScrolledToBottom({
				clientHeight: 400,
				scrollHeight: 1000,
				scrollTop: 0,
			})
		).toBe(false);
	});
});
