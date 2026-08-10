import { describe, expect, it } from "vitest";
import { resolveNextChatReadWatermark } from "@/lib/bambi/use-chat-room-auto-read";

describe("resolveNextChatReadWatermark", () => {
	it("서버에 더 최신인 안 읽음 메시지가 남으면 그 id로 기준선을 전진시킨다", () => {
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "second-latest",
				latestUnreadMessageId: "latest",
			})
		).toBe("latest");
	});

	it("안 읽음이 없거나 같은 기준선이면 추가 요청을 만들지 않는다", () => {
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "latest",
				latestUnreadMessageId: null,
			})
		).toBeNull();
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "latest",
				latestUnreadMessageId: "latest",
			})
		).toBeNull();
	});
});
