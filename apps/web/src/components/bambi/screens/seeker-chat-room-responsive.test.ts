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

	it("면접 상태 변경 후 예정된 면접 목록을 갱신한다", () => {
		expect(source).toContain("listMyUpcomingInterviews.queryKey()");
	});

	it("완료 전환 버튼의 의미를 면접 완료로 명확히 한다", () => {
		expect(source).toContain("면접 완료");
	});
});
