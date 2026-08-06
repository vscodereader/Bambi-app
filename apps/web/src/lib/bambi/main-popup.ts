import type { JSONContent } from "@tiptap/react";

const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

export interface PopupImageAsset {
	dataUrl: string;
	height: number;
	mimeType: "image/jpeg" | "image/png" | "image/webp";
	width: number;
}

export interface MainPopupDraft {
	audience: "common" | "job_seeker" | "employer";
	contentHeight: number;
	contentType: "image" | "text";
	contentWidth: number;
	editedImage: PopupImageAsset | null;
	enabled: boolean;
	endsAt: Date | null;
	id: string;
	linkPath: string | null;
	originalImage: PopupImageAsset | null;
	revision: number;
	slotIndex: number;
	startsAt: Date | null;
	textDocument: JSONContent | null;
	updatedAt: Date;
	updatedByName?: string | null;
}

export const EMPTY_TEXT_DOCUMENT: JSONContent = {
	content: [{ type: "paragraph" }],
	type: "doc",
};

export const readPopupImage = async (file: File): Promise<PopupImageAsset> => {
	if (
		!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
		file.size > 10 * 1024 * 1024
	) {
		throw new Error("JPEG·PNG·WebP 10MB 이하 파일만 사용할 수 있습니다.");
	}
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
		reader.onload = () => resolve(String(reader.result));
		reader.readAsDataURL(file);
	});
	const image = new window.Image();
	image.src = dataUrl;
	await image.decode();
	return {
		dataUrl,
		height: image.naturalHeight,
		mimeType: file.type as PopupImageAsset["mimeType"],
		width: image.naturalWidth,
	};
};

export const clonePopupDraft = (draft: MainPopupDraft): MainPopupDraft =>
	structuredClone(draft);

export const hiddenPopupStorageKey = (id: string) =>
	`bambi:main-popup:hidden:${id}`;

export const popupLoginTargetStorageKey = "bambi:main-popup:login-target";

export const popupExpandedStorageKey = (id: string) =>
	`bambi:main-popup:expanded:${id}`;

export const parseNonNegativeInteger = (value: string): number | null => {
	if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
		return null;
	}
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
};

export const popupSaveErrorMessage = (message: string): string => {
	const normalized = message.toLowerCase();
	return normalized.includes("failed to fetch") ||
		normalized.includes("request body too large") ||
		normalized.includes("request body is too large") ||
		normalized.includes("content too large") ||
		normalized.includes("413")
		? "이미지 용량이 커서 팝업을 저장할 수 없습니다. 이미지 용량을 줄인 뒤 다시 시도해 주세요."
		: message || "팝업 설정을 저장하지 못했습니다.";
};
