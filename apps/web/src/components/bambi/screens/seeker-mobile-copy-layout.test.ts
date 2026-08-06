import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authPanelSource = readFileSync(
	new URL("../auth/auth-panel.tsx", import.meta.url),
	"utf8"
);
const chatRoomSource = readFileSync(
	new URL("./seeker-chat-room-responsive.tsx", import.meta.url),
	"utf8"
);

describe("구직자 인증 문구와 모바일 채팅 헤더", () => {
	it("비회원 진입 버튼을 인증 동작에 맞게 표시한다", () => {
		expect(authPanelSource).toContain('triggerLabel="비회원으로 인증하기"');
		expect(authPanelSource).not.toContain("비회원으로 목록만 보기");
	});

	it("모바일 제목을 두 줄까지 표시하고 액션을 별도 행에 둔다", () => {
		expect(chatRoomSource).toContain("line-clamp-2");
		expect(chatRoomSource).toContain("w-full flex-wrap items-center gap-2");
	});
});
