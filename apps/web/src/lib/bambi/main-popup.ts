import type { JSONContent } from "@tiptap/react";

export interface PopupImageAsset {
	dataUrl: string;
	height: number;
	mimeType: "image/jpeg" | "image/png" | "image/webp";
	width: number;
}

export interface MainPopupDraft {
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
