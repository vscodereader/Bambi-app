import { describe, expect, it } from "vitest";

import {
	attachmentPolicyMessage,
	chatMutationErrorMessage,
	readOrpcErrorCode,
	startChatErrorMessage,
} from "@/src/lib/chat/chat-errors";

const orpcError = (code: string, extra: Record<string, unknown> = {}) =>
	Object.assign(new Error(extra.message as string | undefined), {
		code,
		...extra,
	});

describe("readOrpcErrorCode", () => {
	it("code 문자열을 읽고 없으면 null", () => {
		expect(readOrpcErrorCode(orpcError("FORBIDDEN"))).toBe("FORBIDDEN");
		expect(readOrpcErrorCode(new Error("x"))).toBeNull();
		expect(readOrpcErrorCode(null)).toBeNull();
	});
});

describe("chatMutationErrorMessage", () => {
	it("차단 사유가 있으면 공유 문구", () => {
		expect(
			chatMutationErrorMessage(
				orpcError("FORBIDDEN", { data: { chatBlockReason: "moderation" } })
			)
		).toBe("신고에 대한 운영자 조치로 종료된 채팅방이에요.");
	});

	it("TOO_MANY_REQUESTS는 서버 문구를 그대로", () => {
		expect(
			chatMutationErrorMessage(
				orpcError("TOO_MANY_REQUESTS", { message: "채팅 요청이 너무 잦아요." })
			)
		).toBe("채팅 요청이 너무 잦아요.");
	});

	it("UNAUTHORIZED·FORBIDDEN·기타 폴백", () => {
		expect(chatMutationErrorMessage(orpcError("UNAUTHORIZED"))).toBe(
			"로그인 후 다시 시도해 주세요."
		);
		expect(chatMutationErrorMessage(orpcError("FORBIDDEN"))).toBe(
			"권한이 없거나 차단된 채팅방입니다."
		);
		expect(chatMutationErrorMessage(new Error("boom"))).toBe(
			"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
		);
	});
});

describe("startChatErrorMessage", () => {
	it("서버가 한국어 message를 실은 FORBIDDEN은 그대로", () => {
		expect(
			startChatErrorMessage(
				orpcError("FORBIDDEN", {
					message:
						"업체 인증 변경사항이 제출되기 전에는 새 채팅을 시작할 수 없습니다.",
				})
			)
		).toBe(
			"업체 인증 변경사항이 제출되기 전에는 새 채팅을 시작할 수 없습니다."
		);
	});

	it("message 없는 FORBIDDEN(영어 기본값 포함)은 자격 안내", () => {
		expect(startChatErrorMessage(orpcError("FORBIDDEN"))).toBe(
			"휴대폰 인증을 마친 구직자만 게재 중인 공고에 채팅을 시작할 수 있어요."
		);
		expect(
			startChatErrorMessage(orpcError("FORBIDDEN", { message: "Forbidden" }))
		).toBe(
			"휴대폰 인증을 마친 구직자만 게재 중인 공고에 채팅을 시작할 수 있어요."
		);
	});

	it("NOT_FOUND", () => {
		expect(startChatErrorMessage(orpcError("NOT_FOUND"))).toBe(
			"공고를 찾을 수 없어요."
		);
	});
});

describe("attachmentPolicyMessage", () => {
	it("정책 코드별 문구", () => {
		expect(attachmentPolicyMessage("file_too_large")).toBe(
			"10MB 이하 파일만 보낼 수 있어요."
		);
		expect(attachmentPolicyMessage("unsupported_type")).toBe(
			"JPG·PNG·WebP 이미지 또는 PDF만 보낼 수 있어요."
		);
		expect(attachmentPolicyMessage("empty_file_name")).toBe(
			"파일 이름을 읽을 수 없어요. 다른 파일을 선택해 주세요."
		);
	});
});
