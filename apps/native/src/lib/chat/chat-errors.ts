import { getChatBlockMessage } from "@bambi-app/api/services/bambi-chat-block";
import type { ChatMediaPolicyCode } from "@bambi-app/api/services/bambi-media-policy";

// oRPC는 message 없는 ORPCError에 영어 기본 문구를 채운다(FORBIDDEN→"Forbidden").
// 그래서 서버가 한국어 message를 실었을 때만 그대로 쓰고, 나머지는 code별 우리 문구다.
export const readOrpcErrorCode = (error: unknown): string | null => {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}

	const { code } = error as { code?: unknown };

	return typeof code === "string" ? code : null;
};

// 영어 기본값(라틴 문자·공백·마침표만)은 버린다.
const ENGLISH_FALLBACK_PATTERN = /^[A-Za-z .]+$/;

const readServerMessage = (error: unknown): string | null => {
	if (!(error instanceof Error && error.message)) {
		return null;
	}

	return ENGLISH_FALLBACK_PATTERN.test(error.message) ? null : error.message;
};

const GENERIC_MESSAGE = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
const RATE_LIMIT_MESSAGE = "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";

// web seeker-chat-room-responsive getMutationErrorMessage의 native판 + 레이트리밋·경합 분기.
export const chatMutationErrorMessage = (error: unknown): string => {
	const code = readOrpcErrorCode(error);

	if (code === "UNAUTHORIZED") {
		return "로그인 후 다시 시도해 주세요.";
	}

	const blockMessage = getChatBlockMessage(error);

	if (blockMessage) {
		return blockMessage;
	}

	if (code === "TOO_MANY_REQUESTS") {
		return readServerMessage(error) ?? RATE_LIMIT_MESSAGE;
	}

	if (code === "FORBIDDEN") {
		return "권한이 없거나 차단된 채팅방입니다.";
	}

	if (code === "CONFLICT") {
		return "상태가 이미 바뀌었어요. 채팅방을 새로고침했어요.";
	}

	return GENERIC_MESSAGE;
};

// 공고 상세 "1:1 채팅 시작" 실패 안내. 서버 startFromJobPost는 자격 미달을 message 없는
// FORBIDDEN으로, 업체 미제출은 한국어 message로 돌려준다(chats.ts:785-884).
export const startChatErrorMessage = (error: unknown): string => {
	const code = readOrpcErrorCode(error);
	const serverMessage = readServerMessage(error);

	if (code === "NOT_FOUND") {
		return "공고를 찾을 수 없어요.";
	}

	if (code === "FORBIDDEN") {
		return (
			serverMessage ??
			"휴대폰 인증을 마친 구직자만 게재 중인 공고에 채팅을 시작할 수 있어요."
		);
	}

	if (code === "TOO_MANY_REQUESTS") {
		return serverMessage ?? RATE_LIMIT_MESSAGE;
	}

	return "채팅을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

// validateChatMediaUpload(bambi-media-policy) 실패 코드 → 안내.
export const attachmentPolicyMessage = (code: ChatMediaPolicyCode): string => {
	switch (code) {
		case "file_too_large":
			return "10MB 이하 파일만 보낼 수 있어요.";
		case "unsupported_type":
			return "JPG·PNG·WebP 이미지 또는 PDF만 보낼 수 있어요.";
		default:
			return "파일 이름을 읽을 수 없어요. 다른 파일을 선택해 주세요.";
	}
};
