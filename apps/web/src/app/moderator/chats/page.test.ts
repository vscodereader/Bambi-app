import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
// 채팅 내역 열람 다이얼로그는 면접 일정 목록과 공유하려고 파일을 분리했다.
const dialogSource = readFileSync(
	new URL("./chat-history-dialog.tsx", import.meta.url),
	"utf8"
);

describe("운영자 채팅 관리 페이지", () => {
	it("전체 채팅방을 검색·페이지네이션과 함께 DataTable로 렌더한다", () => {
		expect(source).toContain("listAllChatsForModeration");
		expect(source).toContain("onlyFlagged");
		expect(source).toContain("DataTable");
	});
	it("대화 열람은 읽기 전용 프로시저를 쓴다", () => {
		expect(source).toContain("ChatHistoryDialog");
		expect(dialogSource).toContain("getChatMessagesForModeration");
	});
	it("RowActions에 하드삭제와 회원 상세 이동을 제공한다", () => {
		expect(source).toContain("hardDeleteChatRoom");
		expect(source).toContain("/moderator/users/");
	});
});
