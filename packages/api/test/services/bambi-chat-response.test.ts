import { describe, expect, it } from "vitest";

import {
	CHAT_RESPONSE_SIXTY_MINUTES_SECONDS,
	CHAT_RESPONSE_TEN_MINUTES_SECONDS,
	CHAT_RESPONSE_THIRTY_MINUTES_SECONDS,
	chatContactResponseActivityKey,
	chatInterviewStatusActivityKey,
	chatMessageActivityKey,
	resolveChatResponseBucket,
} from "../../src/services/bambi-chat-response-policy";

describe("채팅 최근 30일 응답시간 정책", () => {
	it("표본이 없으면 표시 구간을 만들지 않는다", () => {
		expect(resolveChatResponseBucket(null)).toBeNull();
	});

	it.each([
		[0, "ten_minutes"],
		[CHAT_RESPONSE_TEN_MINUTES_SECONDS, "ten_minutes"],
		[CHAT_RESPONSE_TEN_MINUTES_SECONDS + 1, "thirty_minutes"],
		[CHAT_RESPONSE_THIRTY_MINUTES_SECONDS, "thirty_minutes"],
		[CHAT_RESPONSE_THIRTY_MINUTES_SECONDS + 1, "sixty_minutes"],
		[CHAT_RESPONSE_SIXTY_MINUTES_SECONDS, "sixty_minutes"],
		[CHAT_RESPONSE_SIXTY_MINUTES_SECONDS + 1, "low"],
	] as const)("%i초 평균을 %s 구간으로 분류한다", (seconds, bucket) => {
		expect(resolveChatResponseBucket(seconds)).toBe(bucket);
	});

	it("액션 종류별 멱등키 namespace를 분리한다", () => {
		expect(chatMessageActivityKey("same-id")).toBe("message:same-id");
		expect(chatInterviewStatusActivityKey("same-id", "confirmed")).toBe(
			"interview-status:same-id:confirmed"
		);
		expect(chatContactResponseActivityKey("same-id", "reveal")).toBe(
			"contact-response:same-id:reveal"
		);
	});
});
