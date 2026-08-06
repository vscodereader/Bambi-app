import { describe, expect, it } from "vitest";

import { getChatBlockMessage } from "./chat-block";

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

	it("신고 검토 중인 방은 처리 후 다시 볼 수 있다고 알린다", () => {
		expect(getChatBlockMessage(blockError("pending_report"))).toContain(
			"신고를 검토하고"
		);
	});

	// 나간 방은 차단이 아니라 "없는 방"이다 — 서버가 NOT_FOUND로 끊고 이 사유를
	// 내려보내지 않으므로 화면 문구도 남기지 않는다.
	it("상대 나감은 더 이상 차단 사유가 아니다", () => {
		expect(getChatBlockMessage(blockError("counterpart_left"))).toBeNull();
	});
});
