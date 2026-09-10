import { describe, expect, it } from "vitest";
import {
	chatActionDecision,
	resolveChatAvailabilityBadges,
} from "./chat-availability";

const base = {
	counterpartIsOnline: false,
	counterpartResponseBucket: null,
	counterpartWithdrawn: false,
	isBlocked: false,
	showRealtimeBadge: false,
	viewerIsOnline: true,
};

describe("chat availability", () => {
	it("양쪽 온라인과 소켓 연결을 구분한다", () => {
		expect(
			resolveChatAvailabilityBadges({ ...base, counterpartIsOnline: true })
		).toEqual(["conversation_available"]);
		expect(
			resolveChatAvailabilityBadges({
				...base,
				counterpartIsOnline: true,
				showRealtimeBadge: true,
			})
		).toEqual(["conversation_available", "realtime_connected"]);
	});
	it("오프라인이면 응답시간을 함께 표시한다", () => {
		expect(
			resolveChatAvailabilityBadges({
				...base,
				counterpartResponseBucket: "ten_minutes",
			})
		).toEqual(["offline", "ten_minutes"]);
	});
	it("탈퇴와 차단이 presence보다 우선한다", () => {
		expect(
			resolveChatAvailabilityBadges({
				...base,
				counterpartWithdrawn: true,
				isBlocked: true,
			})
		).toEqual(["counterpart_withdrawn"]);
		expect(resolveChatAvailabilityBadges({ ...base, isBlocked: true })).toEqual(
			["blocked"]
		);
	});
	it("확인과 본문의 취소를 연락처·면접 상태로 변환한다", () => {
		expect(chatActionDecision("contact", true)).toBe("reveal");
		expect(chatActionDecision("contact", false)).toBe("decline");
		expect(chatActionDecision("interview", true)).toBe("confirmed");
		expect(chatActionDecision("interview", false)).toBe("declined");
	});
});
