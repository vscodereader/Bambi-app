import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("운영자 채팅 관리 페이지", () => {
	it("삭제·차단·신고 채팅을 DataTable로 렌더한다", () => {
		expect(source).toContain("listChatsForModeration");
		expect(source).toContain("DataTable");
	});
	it("RowActions에 하드삭제와 회원 상세 이동을 제공한다", () => {
		expect(source).toContain("hardDeleteChatRoom");
		expect(source).toContain("/moderator/users/");
	});
});
