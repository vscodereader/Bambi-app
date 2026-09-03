import { describe, expect, it } from "vitest";

import {
	canFlushChatRead,
	resolveNextChatReadWatermark,
} from "@/src/lib/chat/chat-read-watermark";

describe("resolveNextChatReadWatermark", () => {
	it("서버가 더 새 안읽음을 알려주면 그 id로 갈아탄다", () => {
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "m1",
				latestUnreadMessageId: "m2",
			})
		).toBe("m2");
	});

	it("같은 id거나 null이면 끝", () => {
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "m1",
				latestUnreadMessageId: "m1",
			})
		).toBeNull();
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "m1",
				latestUnreadMessageId: null,
			})
		).toBeNull();
	});
});

describe("canFlushChatRead", () => {
	const latest = { chatRoomId: "r", messageId: "m1" };

	it("기준선이 있고 아직 안 보냈고 이번 루프에서 시도 안 했으면 true", () => {
		expect(canFlushChatRead(latest, null, new Set())).toBe(true);
	});

	it("이미 보낸 기준선이면 false", () => {
		expect(canFlushChatRead(latest, "m1", new Set())).toBe(false);
	});

	it("이번 루프에서 시도한 기준선이면 false(무한 루프 방지)", () => {
		expect(canFlushChatRead(latest, null, new Set(["m1"]))).toBe(false);
	});

	it("기준선이 없으면 false", () => {
		expect(canFlushChatRead(null, null, new Set())).toBe(false);
	});
});
