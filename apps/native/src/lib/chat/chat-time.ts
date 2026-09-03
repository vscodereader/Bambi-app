import { formatChatTimeLabel } from "@bambi-app/api/services/bambi-chat-message-grouping";

const DAY_MS = 86_400_000;
const listDateFormat = new Intl.DateTimeFormat("ko-KR", {
	day: "numeric",
	month: "numeric",
});

const interviewDateFormat = new Intl.DateTimeFormat("ko-KR", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "long",
	weekday: "short",
});

// 면접 카드 일시 — "9월 22일 (화) 오전 3:30". 연도는 옵션에 없어 표시하지 않는다.
export const formatInterviewDate = (value: Date | string): string =>
	interviewDateFormat.format(new Date(value));

// 채팅 목록 우측 시각 — web seeker-chat-list-responsive의 formatChatListTime과 같은 규칙.
// now를 주입받아 테스트가 시계에 흔들리지 않는다.
export const formatChatListTime = (
	value: Date | string,
	now: Date = new Date()
): string => {
	const at = new Date(value);
	// 로컬 자정 기준으로 오늘/어제를 가른다(UTC로 자르면 새벽 메시지가 어제로 샌다).
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate()
	).getTime();

	if (at.getTime() >= startOfToday) {
		return formatChatTimeLabel(at);
	}
	if (at.getTime() >= startOfToday - DAY_MS) {
		return "어제";
	}
	return listDateFormat.format(at);
};
