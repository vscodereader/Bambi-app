import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const chatSource = readFileSync(
	srcPath("components/bambi/screens/seeker-chat-room-responsive.tsx"),
	"utf8"
);
const employerMeSource = readFileSync(
	srcPath("app/employer/me/page.tsx"),
	"utf8"
);
const myPageShellSource = readFileSync(
	srcPath("components/bambi/my-page-shell.tsx"),
	"utf8"
);
const localBusinessDocumentSource = readFileSync(
	srcPath("app/bambi/local-chat-attachments/route.ts"),
	"utf8"
);

describe("모바일 면접·인증·스크롤 QA", () => {
	it("면접 상태 변경 뒤 예정된 면접 목록을 즉시 갱신한다", () => {
		expect(chatSource).toContain(
			"orpc.bambi.chats.listMyUpcomingInterviews.key()"
		);
	});

	it("채팅 화면은 body 잠금을 직접 소유하지 않고 정보 Sheet가 내부 스크롤된다", () => {
		expect(chatSource).not.toContain('body.style.overflow = "hidden"');
		expect(chatSource).toContain(
			'className="h-[100dvh] min-h-0 overflow-y-auto overscroll-contain"'
		);
	});

	it("내 정보 모바일 콘텐츠는 후기 폼이 늘어나도 스크롤된다", () => {
		expect(myPageShellSource).toContain(
			"overflow-y-auto px-5 py-6 md:flex-row"
		);
	});

	it("인증 완료 텍스트 변경은 제출 시에만 확인하고 취소해도 입력값을 보존한다", () => {
		expect(employerMeSource).toContain(
			'if (verificationStatus === "verified" || isChangesUnsubmitted)'
		);
		expect(employerMeSource).toContain("업체 정보를 변경하시겠습니까?");
		expect(employerMeSource).toContain("변경사항 제출");
		expect(employerMeSource).toContain(
			"<AlertDialogCancel>취소</AlertDialogCancel>"
		);
		expect(employerMeSource).not.toContain(
			'if (verificationStatus === "verified") {\n\t\t\tsetShowChangeConfirm(true);'
		);
		expect(employerMeSource).toContain(
			"onSuccess: async () => {\n\t\t\t\tsetShowChangeConfirm(false);"
		);
	});

	it("개발환경 사업자 서류는 worktree별 폴더가 아닌 본 저장소 공용 경로를 쓴다", () => {
		expect(localBusinessDocumentSource).toContain("resolveMainRepositoryRoot");
		expect(localBusinessDocumentSource).toContain('"/.git/worktrees/"');
		expect(localBusinessDocumentSource).toContain(
			'".local-storage",\n\t"business-documents"'
		);
	});
});
