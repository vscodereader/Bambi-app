import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	type ImagePickerResult,
	launchImageLibraryAsync,
} from "expo-image-picker";

import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import {
	type JobMediaUploadItem,
	resolveJobImagePick,
	toJobMediaItem,
} from "@/src/lib/employer/job-media";

// createMediaUpload 프로시저의 입력·출력을 orpc 라우터에서 그대로 따온다. 호출부가 넘기는
// mutateAsync가 이 시그니처에 맞아떨어져야 하므로 손으로 다시 쓰지 않는다 — 서버 스키마가
// 바뀌면 여기서 바로 컴파일 오류가 난다(any로 뭉개지 않는다).
type CreateMediaUpload = AppRouterClient["bambi"]["jobs"]["createMediaUpload"];
export type JobImageUploadInput = Parameters<CreateMediaUpload>[0];
type JobImageUploadIntent = Awaited<ReturnType<CreateMediaUpload>>;

// 픽·업로드 한 번의 결과. Alert는 호출부가 띄우도록 사유(error)만 돌려준다.
export type JobImageUploadResult =
	| { cancelled: true }
	| { error: string }
	| { item: JobMediaUploadItem; previewUri: string };

// 사진 선택 → blob 실측 → 규격 확인 → 업로드 인텐트 발급 → PUT 업로드까지의 공통 로직.
// picker·banner가 함께 쓰므로 화면 의존(Alert 등)을 걷어내고 결과만 돌려준다.
export const pickAndUploadJobImage = async (args: {
	createUpload: (input: JobImageUploadInput) => Promise<JobImageUploadIntent>;
	organizationId: string;
	teamId: null | string;
	usage: "ad_horizontal" | "ad_vertical" | "cover" | "detail";
}): Promise<JobImageUploadResult> => {
	const { createUpload, organizationId, teamId, usage } = args;
	let picked: ImagePickerResult;

	try {
		picked = await launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.9,
		});
	} catch {
		return { error: "사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
	}

	const asset = picked.canceled ? null : picked.assets[0];

	if (!asset) {
		return { cancelled: true };
	}

	// 서명 content-length에 blob.size가 묶인다 — asset.fileSize가 아니라 실측 바이트.
	const blob = await (await fetch(asset.uri)).blob();
	const resolved = resolveJobImagePick(
		{
			fileName: asset.fileName,
			height: asset.height,
			mimeType: asset.mimeType,
			uri: asset.uri,
			width: asset.width,
		},
		blob.size
	);

	if ("error" in resolved) {
		return { error: resolved.error };
	}

	let intent: JobImageUploadIntent;

	try {
		intent = await createUpload({
			byteSize: resolved.byteSize,
			fileName: resolved.fileName,
			mimeType: resolved.mimeType,
			organizationId,
			teamId: teamId ?? undefined,
			usage,
		});
	} catch (error) {
		// 서버 정책 위반(BAD_REQUEST에 실린 한국어 규격 안내 등)은 사유를 그대로 노출한다.
		return {
			error: localErrorMessage(
				error,
				"이미지를 등록하지 못했어요. 잠시 후 다시 시도해 주세요."
			),
		};
	}

	if (!intent.uploadUrl.startsWith("https://")) {
		return {
			error: "지금은 이미지를 등록할 수 없어요. 잠시 후 다시 시도해 주세요.",
		};
	}

	try {
		const response = await fetch(intent.uploadUrl, {
			body: blob,
			headers: { "Content-Type": intent.mimeType },
			method: "PUT",
		});

		if (!response.ok) {
			throw new Error("upload failed");
		}
	} catch (error) {
		return {
			error: localErrorMessage(
				error,
				"이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요."
			),
		};
	}

	return {
		item: toJobMediaItem(resolved, intent.storageKey),
		previewUri: asset.uri,
	};
};
