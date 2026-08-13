import z from "zod";

export const POPUP_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const POPUP_TEXT_DEFAULT_WIDTH = 420;
export const POPUP_TEXT_DEFAULT_HEIGHT = 320;

const imageDataUrl = z
	.string()
	.regex(/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i)
	.refine((value) => {
		const payload = value.slice(value.indexOf(",") + 1).replace(/\s/g, "");
		return Math.floor((payload.length * 3) / 4) <= POPUP_IMAGE_MAX_BYTES;
	}, "이미지는 10MB 이하여야 합니다.");

export const popupImageAssetSchema = z.object({
	dataUrl: imageDataUrl,
	height: z.number().int().positive(),
	mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
	width: z.number().int().positive(),
});

export const popupTextDocumentSchema = z.record(z.string(), z.unknown());

export const isInternalPopupPath = (value: string): boolean =>
	value.startsWith("/") &&
	!value.startsWith("//") &&
	!value.includes("\\") &&
	Array.from(value).every((character) => character.charCodeAt(0) >= 32);

const isAllowedPopupHost = (hostname: string): boolean => {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "localhost" ||
		normalized === "bambialba.com" ||
		normalized.endsWith(".bambialba.com")
	);
};

export const normalizePopupLink = (value: string | null | undefined) => {
	const trimmed = value?.trim() ?? "";
	if (trimmed.length === 0) {
		return null;
	}
	if (isInternalPopupPath(trimmed)) {
		return trimmed;
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("밤비 내부 주소만 입력할 수 있습니다.");
	}
	if (
		!(
			isAllowedPopupHost(parsed.hostname) &&
			["http:", "https:"].includes(parsed.protocol)
		)
	) {
		throw new Error(
			"localhost 또는 bambialba.com 내부 주소만 입력할 수 있습니다."
		);
	}
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

export const isPopupScheduledNow = (
	startsAt: Date | null,
	endsAt: Date | null,
	now: Date
): boolean => (!startsAt || startsAt <= now) && (!endsAt || now < endsAt);

export const hasPopupContent = (popup: {
	contentType: "image" | "text";
	editedImage: unknown;
	textDocument: unknown;
}): boolean =>
	popup.contentType === "image"
		? popup.editedImage !== null
		: hasTextNode(popup.textDocument);

const hasTextNode = (value: unknown): boolean => {
	if (!value || typeof value !== "object") {
		return false;
	}
	const node = value as { content?: unknown[]; text?: unknown; type?: unknown };
	if (node.type === "text" && typeof node.text === "string") {
		return node.text.trim().length > 0;
	}
	return Array.isArray(node.content) && node.content.some(hasTextNode);
};
