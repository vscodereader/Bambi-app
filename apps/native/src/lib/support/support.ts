export const supportInquiryHref = (id: string): string =>
	`/(seeker)/support/inquiries/${id}`;

export const supportChatHref = (id: string): string =>
	`/(seeker)/support/chat/${id}`;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// 상담 목록 우측 시각. 채팅 목록의 formatChatListTime(시각·어제·날짜)과 규칙이 달라
// 재사용하지 않는다 — 상담은 "며칠 전 문의"가 한눈에 들어와야 해 상대 표기를 쓴다.
// now를 주입받아 테스트가 시계에 흔들리지 않는다. 시계 오차로 미래가 와도 "방금 전".
export const formatRelativeTime = (
	value: Date | string,
	now: Date = new Date()
): string => {
	const elapsed = now.getTime() - new Date(value).getTime();

	if (elapsed < MINUTE_MS) {
		return "방금 전";
	}
	if (elapsed < HOUR_MS) {
		return `${Math.floor(elapsed / MINUTE_MS)}분 전`;
	}
	if (elapsed < DAY_MS) {
		return `${Math.floor(elapsed / HOUR_MS)}시간 전`;
	}
	return `${Math.floor(elapsed / DAY_MS)}일 전`;
};

export const canSubmitInquiry = (input: {
	bodyText: string;
	hasImage: boolean;
	title: string;
}): boolean =>
	input.title.trim().length >= 2 &&
	input.title.trim().length <= 100 &&
	(input.bodyText.trim().length >= 5 || input.hasImage);

export const canSendSupportMessage = (
	body: string,
	isBlocked: boolean,
	status: string
): boolean => body.trim().length > 0 && !isBlocked && status !== "closed";

export const supportPlainDocument = (text: string): string =>
	JSON.stringify({
		content: text.split("\n").map((line) => ({
			content: line ? [{ text: line, type: "text" }] : undefined,
			type: "paragraph",
		})),
		type: "doc",
	});
