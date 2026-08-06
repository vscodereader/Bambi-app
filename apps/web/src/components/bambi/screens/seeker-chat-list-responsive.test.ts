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

	// 이 라우트에는 역할 게이트가 없어 구인자도 목록에 들어온다. 신고는 구직자
	// 전용이고(서버 createReport도 같은 기준), 차단 대상은 뷰어의 반대편이어야
	// 한다 — employerUserId 고정이면 구인자가 자기 자신을 차단한다.
	it("신고 항목은 뷰어가 그 방의 구직자일 때만 노출한다", () => {
		expect(source).toContain("room.counterpartUserId === room.employerUserId");
		expect(source).toContain("...(isJobSeekerViewer");
	});

	it("차단 대상은 서버가 뷰어 기준으로 계산한 상대다", () => {
		expect(source).toContain("blockedUserId: room.counterpartUserId");
		expect(source).not.toContain("blockedUserId: room.employerUserId");
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

describe("신고한 채팅 숨김", () => {
	// 신고 대기 방은 서버(listMine)가 아예 빼 준다. 화면에 "조치 대기 중" 라벨이 남으면
	// 운영자가 차단을 해제한 뒤에도 조치가 안 끝난 것처럼 보인다.
	it("신고 대기 라벨과 그 배선을 남기지 않는다", () => {
		expect(source).not.toContain("hasPendingMyReport");
		expect(source).not.toContain("조치 대기 중");
	});

	it("신고 창을 닫으면 목록을 다시 받아 숨김을 반영한다", () => {
		expect(source).toContain("invalidateList().catch");
	});
});

describe("상대가 나간 채팅", () => {
	// 한쪽이 나가면 방은 양쪽 목록에서 아예 사라진다(서버 listMine이 걸러낸다) —
	// 화면에 "나감" 상태를 표시할 방 자체가 없다.
	it("목록에 나감 배지를 남기지 않는다", () => {
		expect(source).not.toContain("hasCounterpartLeft");
		expect(source).not.toContain("상대방 나감");
	});
});
