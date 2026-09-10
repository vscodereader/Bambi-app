import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { launchImageLibraryAsync } from "expo-image-picker";

import { publicObjectUri } from "@/src/lib/bambi-native";
import { resolveUploadUrl, resolveWebUrl } from "@/src/lib/dev-web-url";
import { readLocalFileBytes } from "@/src/lib/local-file-bytes";

type CreateUpload = AppRouterClient["bambi"]["community"]["createMediaUpload"];

export type CommunityImageUploadResult =
	| { cancelled: true }
	| { error: string }
	| { previewUri: string; publicUri: string };

export async function pickAndUploadCommunityImage(args: {
	createUpload: CreateUpload;
	gcsPublicBaseUrl: string | undefined;
}): Promise<CommunityImageUploadResult> {
	try {
		const picked = await launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.9,
		});
		const asset = picked.canceled ? null : picked.assets[0];
		if (!asset) {
			return { cancelled: true };
		}
		const { bytes, mimeType } = await readLocalFileBytes(asset.uri);
		const intent = await args.createUpload({
			byteSize: bytes.byteLength,
			fileName: asset.fileName?.trim() || "community-image.jpg",
			mimeType: asset.mimeType ?? mimeType ?? "image/jpeg",
		});
		const uploadUrl = resolveUploadUrl(intent.uploadUrl);
		if (uploadUrl === null) {
			return { error: "이미지 업로드 주소를 확인할 수 없어요." };
		}
		if (uploadUrl) {
			const response = await fetch(uploadUrl, {
				body: bytes,
				headers: { "Content-Type": intent.mimeType },
				method: "PUT",
			});
			if (!response.ok) {
				return { error: "이미지를 올리지 못했어요." };
			}
		}
		const publicUri = intent.uploadUrl.startsWith("/")
			? resolveWebUrl(intent.uploadUrl)
			: publicObjectUri(intent.storageKey, args.gcsPublicBaseUrl);
		return publicUri
			? { previewUri: asset.uri, publicUri }
			: { error: "업로드한 이미지 주소를 만들 수 없어요." };
	} catch (error) {
		return {
			error:
				error instanceof Error && error.message
					? error.message
					: "이미지를 올리지 못했어요.",
		};
	}
}
