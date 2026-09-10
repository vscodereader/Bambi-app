export const supportInquiryHref = (id: string): string =>
	`/(seeker)/support/inquiries/${id}`;

export const supportChatHref = (id: string): string =>
	`/(seeker)/support/chat/${id}`;

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
