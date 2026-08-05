import { describe, expect, it } from "vitest";

import {
	COUNTERPART_LEFT_NOTICE,
	getChatBlockMessage,
	getChatEntryBlockMessage,
} from "./chat-block";

const blockError = (chatBlockReason: string, counterpartName?: string) => ({
	data: { chatBlockReason, counterpartName: counterpartName ?? null },
});

describe("채팅 차단 사유 안내", () => {
	it("사유를 못 읽으면 null을 돌려 오류 카드에 맡긴다", () => {
		expect(getChatBlockMessage(new Error("network"))).toBeNull();
		expect(getChatBlockMessage(null)).toBeNull();
		expect(getChatBlockMessage({ data: "nope" })).toBeNull();
	});

	it("차단 방향에 따라 다른 문구를 준다", () => {
		expect(
			getChatBlockMessage(blockError("blocked_by_me", "밤비업소"))
		).toContain("차단 관리");
		expect(
			getChatBlockMessage(blockError("blocked_by_counterpart", "밤비업소"))
		).toBe("밤비업소님이 차단했어요.");
	});

	it("상대가 나간 방은 이름이 있으면 이름을 넣어 안내한다", () => {
		expect(
			getChatBlockMessage(blockError("counterpart_left", "밤비업소"))
		).toBe("밤비업소님이 채팅방을 나가서 더 이상 메시지를 보낼 수 없어요.");
		expect(getChatBlockMessage(blockError("counterpart_left"))).toBe(
			COUNTERPART_LEFT_NOTICE
		);
	});

	it("신고 검토 중인 방은 처리 후 다시 볼 수 있다고 알린다", () => {
		expect(getChatBlockMessage(blockError("pending_report"))).toContain(
			"신고를 검토하고"
		);
	});
});

describe("방 진입 차단 판정", () => {
	it("상대가 나간 방은 진입까지 막지 않는다(지난 대화는 읽을 수 있다)", () => {
		expect(getChatEntryBlockMessage(blockError("counterpart_left"))).toBeNull();
	});

	it("운영자 조치·차단·신고 검토는 진입을 막는다", () => {
		expect(getChatEntryBlockMessage(blockError("moderation"))).not.toBeNull();
		expect(
			getChatEntryBlockMessage(blockError("blocked_by_me"))
		).not.toBeNull();
		expect(
			getChatEntryBlockMessage(blockError("pending_report"))
		).not.toBeNull();
	});
});
