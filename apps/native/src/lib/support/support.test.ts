import {
	inquiryStatusLabel,
	supportCategoryLabel,
} from "@bambi-app/api/services/bambi-support-labels";
import { describe, expect, it } from "vitest";

import {
	canSendSupportMessage,
	canSubmitInquiry,
	supportChatHref,
	supportInquiryHref,
} from "./support";

describe("support labels and routes", () => {
	it("enum 원값을 한글 라벨로 바꾸고 미지값은 폴백한다", () => {
		expect(supportCategoryLabel("account")).toBe("계정·로그인");
		expect(supportCategoryLabel("future")).toBe("기타");
		expect(inquiryStatusLabel("answered")).toBe("답변완료");
		expect(inquiryStatusLabel("future")).toBe("상태 확인 필요");
	});
	it("문의와 상담 상세 경로를 만든다", () => {
		expect(supportInquiryHref("a")).toBe("/(seeker)/support/inquiries/a");
		expect(supportChatHref("b")).toBe("/(seeker)/support/chat/b");
	});
});

describe("support submission", () => {
	it("제목 2~100자와 본문 5자 또는 이미지를 요구한다", () => {
		expect(
			canSubmitInquiry({ bodyText: "12345", hasImage: false, title: "문의" })
		).toBe(true);
		expect(
			canSubmitInquiry({ bodyText: "", hasImage: true, title: "문의" })
		).toBe(true);
		expect(
			canSubmitInquiry({ bodyText: "1234", hasImage: false, title: "문의" })
		).toBe(false);
	});
	it("종료·차단 방과 빈 메시지를 막는다", () => {
		expect(canSendSupportMessage("질문", false, "open")).toBe(true);
		expect(canSendSupportMessage("질문", false, "closed")).toBe(false);
		expect(canSendSupportMessage("질문", true, "open")).toBe(false);
	});
});
