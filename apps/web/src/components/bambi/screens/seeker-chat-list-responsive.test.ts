import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./seeker-chat-list-responsive.tsx", import.meta.url),
	"utf8"
);

describe("채팅 목록 액션", () => {
	it("각 채팅에 삭제·신고·차단 액션을 제공한다", () => {
		expect(source).toContain("deleteChatRoom");
		expect(source).toContain("삭제");
		expect(source).toContain("신고");
		expect(source).toContain("차단");
	});
});
