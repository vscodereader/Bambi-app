import { describe, expect, it } from "vitest";

import {
	applyTypingStarted,
	applyTypingStopped,
	pruneTyping,
	TYPING_TTL_MS,
	typingUserIds,
} from "@/src/lib/chat/chat-typing";

describe("타이핑 리듀서", () => {
	it("started는 TTL 뒤 만료 시각을 기록한다", () => {
		const state = applyTypingStarted({}, "u1", 1000);

		expect(typingUserIds(state, 1000)).toEqual(["u1"]);
		expect(typingUserIds(state, 1000 + TYPING_TTL_MS + 1)).toEqual([]);
	});

	it("stopped는 즉시 지운다", () => {
		const state = applyTypingStopped(applyTypingStarted({}, "u1", 0), "u1");

		expect(typingUserIds(state, 0)).toEqual([]);
	});

	it("pruneTyping은 만료된 항목만 제거하고 바뀐 게 없으면 같은 참조", () => {
		const state = applyTypingStarted(
			applyTypingStarted({}, "old", 0),
			"new",
			4000
		);
		const pruned = pruneTyping(state, TYPING_TTL_MS + 1);

		expect(Object.keys(pruned)).toEqual(["new"]);
		expect(pruneTyping(pruned, TYPING_TTL_MS + 1)).toBe(pruned);
	});
});
