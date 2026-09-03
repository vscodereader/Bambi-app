import { describe, expect, it } from "vitest";

import { formatChatListTime } from "@/src/lib/chat/chat-time";

const now = new Date(2026, 8, 3, 15, 30);

describe("formatChatListTime", () => {
	it("오늘은 시각", () => {
		expect(formatChatListTime(new Date(2026, 8, 3, 9, 5), now)).toBe(
			"오전 9:05"
		);
	});

	it("어제는 '어제'", () => {
		expect(formatChatListTime(new Date(2026, 8, 2, 23, 59), now)).toBe("어제");
	});

	it("그 이전은 월. 일.", () => {
		expect(formatChatListTime(new Date(2026, 7, 30, 12, 0), now)).toBe(
			"8. 30."
		);
	});
});
