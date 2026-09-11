import { describe, expect, it } from "vitest";

import { resolveChatAvailabilityBadges } from "@/lib/bambi/chat-availability";

const base = {
	counterpartIsOnline: true,
	counterpartResponseBucket: null,
	counterpartWithdrawn: false,
	isBlocked: false,
	showRealtimeBadge: true,
	viewerIsOnline: true,
} as const;

describe("채팅 접속·응답 뱃지", () => {
	it("양쪽 온라인이고 소켓이 연결되면 성공 뱃지 두 개를 표시한다", () => {
		expect(resolveChatAvailabilityBadges(base)).toEqual([
			"conversation_available",
			"realtime_connected",
		]);
	});

	it("양쪽 온라인이어도 소켓이 끊겼으면 실시간 뱃지를 표시하지 않는다", () => {
		expect(
			resolveChatAvailabilityBadges({ ...base, showRealtimeBadge: false })
		).toEqual(["conversation_available"]);
	});

	it("상대가 오프라인이면 오프라인과 평균 응답 뱃지를 표시한다", () => {
		expect(
			resolveChatAvailabilityBadges({
				...base,
				counterpartIsOnline: false,
				counterpartResponseBucket: "thirty_minutes",
			})
		).toEqual(["offline", "thirty_minutes"]);
	});

	it("응답 표본이 없으면 오프라인만 표시한다", () => {
		expect(
			resolveChatAvailabilityBadges({
				...base,
				counterpartIsOnline: false,
			})
		).toEqual(["offline"]);
	});

	it("차단과 탈퇴는 presence보다 우선한다", () => {
		expect(resolveChatAvailabilityBadges({ ...base, isBlocked: true })).toEqual(
			["blocked"]
		);
		expect(
			resolveChatAvailabilityBadges({ ...base, counterpartWithdrawn: true })
		).toEqual(["counterpart_withdrawn"]);
	});
});
