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

	it("차단된 방에서는 삭제만 남긴다", () => {
		// 신고·차단 항목은 차단되지 않은 분기에서만 만들어져야 한다.
		expect(source).toContain("? [deleteAction]");
	});
});

describe("차단된 채팅 표시", () => {
	// 차단 판정은 서버(chats.listMine)가 운영자 방 차단과 사용자 간 차단을 합쳐
	// 내려준다. 화면이 두 쿼리를 합치던 예전 방식은 "상대가 나를 차단한" 방향을
	// 알 수 없어 그 방이 계속 열리는 것처럼 보였다 — 판정을 다시 클라이언트로
	// 끌어오지 않도록 여기서 못박는다(검증은 packages/api chats.test.ts).
	it("차단 판정을 화면에서 다시 조립하지 않는다", () => {
		expect(source).not.toContain("orpc.bambi.blocks.listMine.queryOptions()");
		expect(source).toContain("isBlocked={room.isBlocked}");
	});

	it("차단된 방은 내용을 블러 처리하고 안내 문구를 겹쳐 띄운다", () => {
		expect(source).toContain('isBlocked && "select-none blur-sm"');
		expect(source).toContain("차단된 채팅입니다.");
	});

	it("차단된 방은 열기 버튼을 렌더하지 않아 채팅방으로 이동할 수 없다", () => {
		expect(source).toContain("isBlocked ? null : (");
		expect(source).toContain("onOpen(room.id)");
	});
});
