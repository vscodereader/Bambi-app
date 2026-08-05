import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./seeker-chat-room-responsive.tsx", import.meta.url),
	"utf8"
);

describe("채팅방 연락처 재설계", () => {
	it("구인자 버튼을 연락처 공개 요청으로 바꾼다", () => {
		expect(source).toContain("연락처 공개 요청");
		expect(source).toContain("requestContactReveal");
	});

	it("연락처 공개 요청 안내 문구를 렌더한다", () => {
		expect(source).toContain("연락처 공개 요청이 왔습니다");
	});

	it("옛 reveal 페이지 이동을 제거한다", () => {
		expect(source).not.toContain("/reveal");
		expect(source).not.toContain("getContactReveal");
	});

	it("shadcn message 컴포넌트를 쓴다", () => {
		expect(source).toContain("@bambi-app/ui/components/message");
	});

	it("채팅 이미지 첨부에 시그니처 검증을 배선한다", () => {
		expect(source).toContain("detectImageSignature");
	});

	// 이미지·PDF만 받는다. 파일 선택 input의 accept와 선택 시점 검증이 같은 목록을 봐야 한다.
	it("첨부를 이미지와 PDF로만 제한한다", () => {
		expect(source).toContain('ACCEPTED_ATTACHMENT_MIME_TYPES.join(",")');
		expect(source).toContain("isPdfSignature");
		expect(source).not.toContain("image/gif");
	});

	// 인텐트만 받고 파일을 올리지 않던 게 "내 이미지 대신 목 이미지" 증상의 원인이었다.
	it("첨부 파일을 서명 URL로 실제 업로드한다", () => {
		expect(source).toContain("uploadFileToSignedUrl");
		// 업로드가 끝난 뒤에 메시지를 남겨야 한다(import가 아니라 호출부 위치로 본다).
		expect(source.indexOf("uploadFileToSignedUrl({")).toBeLessThan(
			source.indexOf("sendMediaMessageMutation.mutateAsync")
		);
	});

	it("채팅방 헤더에서 공고 상세로 이동시킨다", () => {
		expect(source).toContain("/seeker/jobs/");
		expect(source).toContain("ChatJobPostLink");
		// 상세가 published + paid만 열어 주므로 그 밖의 공고는 이동 대신 사유를 남긴다.
		expect(source).toContain("공고 삭제됨");
		expect(source).toContain("공고 비공개");
	});
});

describe("상대가 나간 채팅방", () => {
	// 서버가 발신을 FORBIDDEN(counterpart_left)으로 막으므로, 화면은 눌러서 실패하기
	// 전에 입력창을 잠그고 이유를 보여줘야 한다.
	it("서버가 내려준 counterpartLeft로 입력창을 잠근다", () => {
		expect(source).toContain("counterpartLeft");
		expect(source).toContain("disabledNotice={composerDisabledNotice}");
		expect(source).toContain("disabled={isDisabled}");
	});

	it("상대가 나가도 지난 대화는 읽게 둔다(목록으로 튕기지 않는다)", () => {
		expect(source).toContain("getChatEntryBlockMessage(roomQuery.error)");
	});

	it("보낼 곳이 없는 액션(면접 제안·연락처 요청·요청 응답)은 감춘다", () => {
		expect(source).toContain("isJobSeeker || counterpartLeft ? null");
		expect(source).toContain("isSendBlocked={counterpartLeft}");
		expect(source).toContain("!isSendBlocked &&");
	});
});

describe("신고한 채팅 숨김", () => {
	// 신고 완료 안내가 "해당 채팅은 잠시 숨겨둘게요"라고 약속한다. 서버가 방을 감추므로
	// 창을 닫을 때 방 조회를 다시 돌려 그 안내와 함께 목록으로 나가야 한다.
	it("신고 창을 닫으면 방 조회를 다시 받는다", () => {
		expect(source).toContain("handleReportOpenChange");
		// 방 조회 입력에 페이지 크기가 들어가므로 부분 일치 키(key)로 무효화해야 한다
		// — 정확 일치(queryKey)는 "더 보기"로 늘린 페이지를 놓친다.
		expect(source).toContain("orpc.bambi.chats.getById.key");
	});
});

describe("채팅방 메시지 페이지네이션·재연결", () => {
	// 이력 전체를 매 조회마다 다시 받던 구조라, 소켓 이벤트 한 건이 전량 재전송을 불렀다.
	it("최근 한 페이지만 받고 더 보기로 늘린다", () => {
		expect(source).toContain("CHAT_MESSAGE_PAGE_SIZE");
		expect(source).toContain("이전 메시지 더 보기");
		expect(source).toContain("hasMoreMessages");
	});

	// 끊겼다 붙으면 서버 쪽 입장 기록이 사라져 있어 방 이벤트가 한 건도 오지 않는다.
	it("재연결하면 방에 다시 입장한다", () => {
		expect(source).toContain("const handleConnect = () => {");
		expect(source).toContain("joinRoom();");
	});

	// 상한(50)을 넘는 id 목록을 보내 읽음 처리가 통째로 거절되던 문제.
	it("읽음 처리는 기준선 하나만 보낸다", () => {
		expect(source).toContain("upToMessageId");
		expect(source).not.toContain("readCandidateMessageIds");
	});
});
