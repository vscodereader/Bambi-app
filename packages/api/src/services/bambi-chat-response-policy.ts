export const CHAT_RESPONSE_WINDOW_DAYS = 30;
export const CHAT_RESPONSE_TEN_MINUTES_SECONDS = 10 * 60;
export const CHAT_RESPONSE_THIRTY_MINUTES_SECONDS = 30 * 60;
export const CHAT_RESPONSE_SIXTY_MINUTES_SECONDS = 60 * 60;

export type ChatResponseBucket =
	| "low"
	| "sixty_minutes"
	| "ten_minutes"
	| "thirty_minutes";

export const resolveChatResponseBucket = (
	averageResponseSeconds: null | number
): ChatResponseBucket | null => {
	if (averageResponseSeconds === null) {
		return null;
	}
	if (averageResponseSeconds <= CHAT_RESPONSE_TEN_MINUTES_SECONDS) {
		return "ten_minutes";
	}
	if (averageResponseSeconds <= CHAT_RESPONSE_THIRTY_MINUTES_SECONDS) {
		return "thirty_minutes";
	}
	if (averageResponseSeconds <= CHAT_RESPONSE_SIXTY_MINUTES_SECONDS) {
		return "sixty_minutes";
	}
	return "low";
};

export const chatMessageActivityKey = (messageId: string): string =>
	`message:${messageId}`;

export const chatInterviewStatusActivityKey = (
	interviewScheduleId: string,
	status: string
): string => `interview-status:${interviewScheduleId}:${status}`;

export const chatContactRevealActivityKey = (
	interviewScheduleId: string,
	contactMethod: string
): string => `contact-reveal:${interviewScheduleId}:${contactMethod}`;

export const chatContactResponseActivityKey = (
	messageId: string,
	decision: string
): string => `contact-response:${messageId}:${decision}`;
