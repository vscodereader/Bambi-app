import { describe, expect, it } from "vitest";

import { generateChatMessageId } from "./bambi-chat-message-id";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("채팅 메시지 id 생성", () => {
	it("소문자 uuid 형식이다(서버 zod .uuid() 통과)", () => {
		expect(generateChatMessageId()).toMatch(UUID_PATTERN);
	});

	it("버전 7·variant 비트를 세운다", () => {
		const id = generateChatMessageId();

		// 13번째 hex 자리가 버전, 17번째가 variant.
		expect(id[14]).toBe("7");
		expect(["8", "9", "a", "b"]).toContain(id[19]);
	});

	it("앞 48비트가 생성 시각(ms)이다", () => {
		const before = Date.now();
		const id = generateChatMessageId();
		const after = Date.now();
		const timestamp = Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);

		expect(timestamp).toBeGreaterThanOrEqual(before);
		expect(timestamp).toBeLessThanOrEqual(after);
	});

	// 같은 ms 안에서도 서로 다른 값이어야 PK 충돌이 "재시도"로 오해되지 않는다.
	it("연속 생성해도 값이 겹치지 않는다", () => {
		const ids = Array.from({ length: 1000 }, generateChatMessageId);

		expect(new Set(ids).size).toBe(ids.length);
	});

	// 시간이 흐르면 문자열 정렬이 곧 시간순이 된다(커서·타이브레이커의 전제).
	it("나중에 만든 id가 문자열 비교에서 뒤에 온다", () => {
		const older = generateChatMessageId();
		const now = Date.now();
		while (Date.now() === now) {
			// 다음 ms까지 대기 — 같은 ms면 앞 48비트가 같아 순서가 랜덤 구간에 좌우된다.
		}
		const newer = generateChatMessageId();

		expect(older < newer).toBe(true);
	});
});
