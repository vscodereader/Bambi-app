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

export const INQUIRY_TITLE_MIN = 2;
export const INQUIRY_TITLE_MAX = 100;
const INQUIRY_BODY_MIN = 5;

// 등록 버튼이 꺼져 있는 이유 한 줄. 꺼진 버튼만 두면 사용자가 무엇이 모자란지 못 찾는다.
// 문구는 위에서부터 먼저 걸리는 하나만 — 세 줄을 한꺼번에 띄우면 고정 바가 본문을 덮는다.
export const inquirySubmitBlocker = (input: {
	bodyText: string;
	hasImage: boolean;
	title: string;
}): null | string => {
	const title = input.title.trim();

	if (title.length < INQUIRY_TITLE_MIN) {
		return `제목을 ${INQUIRY_TITLE_MIN}자 이상 입력해 주세요`;
	}
	if (title.length > INQUIRY_TITLE_MAX) {
		return `제목은 ${INQUIRY_TITLE_MAX}자 이내로 입력해 주세요`;
	}
	if (input.bodyText.trim().length < INQUIRY_BODY_MIN && !input.hasImage) {
		return `내용을 ${INQUIRY_BODY_MIN}자 이상 적거나 이미지를 넣어 주세요`;
	}
	return null;
};

// 판정 규칙은 blocker 한 곳에만 둔다 — 두 곳에 두면 문구와 활성 조건이 따로 논다.
export const canSubmitInquiry = (input: {
	bodyText: string;
	hasImage: boolean;
	title: string;
}): boolean => inquirySubmitBlocker(input) === null;

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
