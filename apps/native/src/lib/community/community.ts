export const COMMUNITY_PAGE_SIZE = 20;
export const COMMUNITY_PASSWORD_MIN_LENGTH = 4;

export const communityPostHref = (post: {
	board: string;
	id: string;
	source?: string;
}): string =>
	post.source === "crawled"
		? `/(seeker)/community/crawled/${post.id}`
		: `/(seeker)/community/${post.board}/${post.id}`;

export const communityPageCount = (
	totalCount: number,
	pageSize = COMMUNITY_PAGE_SIZE
): number => Math.max(1, Math.ceil(totalCount / pageSize));

export const normalizeCommunityPage = (
	value: string | string[] | undefined
): number => {
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const communityDateLabel = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(new Date(value));

export const plainTextDocument = (text: string): string =>
	JSON.stringify({
		content: text.split("\n").map((line) => ({
			content: line ? [{ text: line, type: "text" }] : undefined,
			type: "paragraph",
		})),
		type: "doc",
	});

export const communityDocumentWithImages = (
	text: string,
	images: readonly string[]
): string => {
	const document = JSON.parse(plainTextDocument(text)) as {
		content: Record<string, unknown>[];
		type: "doc";
	};
	for (const src of images) {
		document.content.push({ attrs: { src }, type: "image" });
	}
	return JSON.stringify(document);
};

export const communityBodyText = (body: string): string => {
	try {
		const value = JSON.parse(body) as {
			content?: Array<{ content?: Array<{ text?: unknown }> }>;
			type?: unknown;
		};
		if (value.type !== "doc" || !Array.isArray(value.content)) {
			return body;
		}
		return value.content
			.map((block) =>
				(block.content ?? [])
					.map((item) => (typeof item.text === "string" ? item.text : ""))
					.join("")
			)
			.join("\n");
	} catch {
		return body;
	}
};

export const canSubmitCommunityPost = (input: {
	body: string;
	isGuest: boolean;
	isLocked: boolean;
	password: string;
	title: string;
}): boolean =>
	input.title.trim().length >= 2 &&
	input.body.trim().length >= 2 &&
	(!input.isGuest ||
		input.password.trim().length >= COMMUNITY_PASSWORD_MIN_LENGTH) &&
	(!input.isLocked ||
		input.password.trim().length >= COMMUNITY_PASSWORD_MIN_LENGTH);

export const communityAccessDestination = (input: {
	boardKey: string;
	gender: null | string;
	isGuest: boolean;
	role: null | string;
}): "legal" | "secret" | null => {
	if (
		input.role === "legal_advisor" &&
		input.boardKey !== "legal" &&
		input.boardKey !== "secret"
	) {
		return "legal";
	}
	if (
		(input.isGuest || input.role === "job_seeker") &&
		input.gender === "male"
	) {
		if (input.isGuest && input.boardKey !== "secret") {
			return "secret";
		}
		if (
			input.role === "job_seeker" &&
			input.boardKey !== "notice" &&
			input.boardKey !== "secret"
		) {
			return "secret";
		}
	}
	return null;
};
