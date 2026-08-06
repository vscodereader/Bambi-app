import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./upcoming-interviews-screen.tsx", import.meta.url),
	"utf8"
);

// 완료 버튼이 "구인자 + 확정" 가드 안에 있는지 본다(들여쓰기 변화에 견디게 느슨히).
const COMPLETE_ACTION_GUARD_PATTERN =
	/interview\.viewerIsEmployer && interview\.status === "confirmed"[\s\S]{0,120}<CompleteInterviewAction/;

describe("예정된 면접 아코디언", () => {
	it("카드를 아코디언으로 렌더한다", () => {
		expect(source).toContain("@bambi-app/ui/components/accordion");
		expect(source).toContain("<AccordionTrigger");
		expect(source).toContain("<AccordionContent");
	});

	// 펼침이 곧 상세라 방으로 보내지 않는다(나간 방이면 오류 카드로 떨어지던 경로도 사라진다).
	it("채팅방 이동 링크를 제거한다", () => {
		expect(source).not.toContain("/seeker/chats/");
		expect(source).not.toContain("next/link");
	});

	// 펼칠 때만 조회한다(닫힌 항목은 언마운트) — 읽기 전용 컨텍스트라 읽음영수증이 없다.
	it("펼침에서 면접 채팅 내역을 커서로 읽는다", () => {
		expect(source).toContain("getInterviewChatContext");
		expect(source).toContain("infiniteOptions");
		expect(source).toContain("이전 메시지 더 보기");
	});
});

describe("면접 완료 처리 이관", () => {
	it("완료 버튼을 구인자·확정 상태에만 노출한다", () => {
		expect(source).toMatch(COMPLETE_ACTION_GUARD_PATTERN);
		expect(source).toContain('status: "completed"');
	});

	it("완료 후 목록을 무효화해 완료 뱃지로 바꾼다", () => {
		expect(source).toContain("orpc.bambi.chats.listMyUpcomingInterviews.key()");
	});

	// enum 원값 노출 금지 — 상태 라벨은 공용 맵(completed 포함)을 경유한다.
	it("상태 라벨을 공용 라벨 맵으로 렌더한다", () => {
		expect(source).toContain("interviewStatusLabels");
		expect(source).not.toContain('"완료됨"');
	});
});
