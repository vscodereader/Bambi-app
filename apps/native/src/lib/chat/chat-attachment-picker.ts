import { validateChatMediaUpload } from "@bambi-app/api/services/bambi-media-policy";

import { attachmentPolicyMessage } from "./chat-errors";

export interface PickedAttachment {
	byteSize: number;
	fileName: string;
	mimeType: string;
	uri: string;
}

const fileNameFromUri = (uri: string): string =>
	uri.split("?")[0]?.split("/").pop() || "attachment";

// expo-image-picker(asset.fileName/mimeType/fileSize)·expo-document-picker(name/mimeType/size)
// 결과를 한 모양으로 맞춘다. 크기가 비어 있으면 0 — 전송 직전에 bytes.byteLength로 덮는다
// (서명 URL이 content-length에 묶여 있어 실제 바이트가 정본).
export const toPickedAttachment = (
	input: {
		fileName?: null | string;
		mimeType?: null | string;
		size?: null | number;
		uri: string;
	},
	fallbackMimeType: string
): PickedAttachment => ({
	byteSize: input.size ?? 0,
	fileName: input.fileName || fileNameFromUri(input.uri),
	mimeType: input.mimeType || fallbackMimeType,
	uri: input.uri,
});

export const validatePickedAttachment = (
	picked: PickedAttachment
): { ok: true } | { message: string; ok: false } => {
	const result = validateChatMediaUpload({
		byteSize: Math.max(1, picked.byteSize),
		fileName: picked.fileName,
		mimeType: picked.mimeType,
	});

	return result.ok
		? { ok: true }
		: { message: attachmentPolicyMessage(result.code), ok: false };
};

export const isImageMimeType = (mimeType: string): boolean =>
	mimeType.startsWith("image/");
