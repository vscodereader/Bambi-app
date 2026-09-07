import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import {
	type ImagePickerAsset,
	type ImagePickerResult,
	launchImageLibraryAsync,
} from "expo-image-picker";

import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import { resolveUploadUrl } from "@/src/lib/dev-web-url";
import { sliceDetailImage } from "@/src/lib/employer/detail-image-slicing";
import {
	type JobMediaUploadItem,
	type PickedJobImage,
	resolveJobImagePick,
	toJobMediaItem,
} from "@/src/lib/employer/job-media";
import { readLocalFileBytes } from "@/src/lib/local-file-bytes";

// createMediaUpload 프로시저의 입력·출력을 orpc 라우터에서 그대로 따온다. 호출부가 넘기는
// mutateAsync가 이 시그니처에 맞아떨어져야 하므로 손으로 다시 쓰지 않는다 — 서버 스키마가
// 바뀌면 여기서 바로 컴파일 오류가 난다(any로 뭉개지 않는다).
type CreateMediaUpload = AppRouterClient["bambi"]["jobs"]["createMediaUpload"];
export type JobImageUploadInput = Parameters<CreateMediaUpload>[0];
type JobImageUploadIntent = Awaited<ReturnType<CreateMediaUpload>>;

type CreateUpload = (
	input: JobImageUploadInput
) => Promise<JobImageUploadIntent>;
type JobMediaUsage = "ad_horizontal" | "ad_vertical" | "cover" | "detail";

// 픽·업로드 한 번의 결과. Alert는 호출부가 띄우도록 사유(error)만 돌려준다.
export type JobImageUploadResult =
	| { cancelled: true }
	| { error: string }
	| { item: JobMediaUploadItem; previewUri: string };

// 상세 픽 하나가 만드는 결과. 조각이 여러 장이면 items가 조각 수만큼, 아니면 한 장.
// previews는 storageKey→화면 미리보기 uri.
export type JobDetailUploadResult =
	| { cancelled: true }
	| { error: string }
	| { items: JobMediaUploadItem[]; previews: Record<string, string> };

const pickImageAsset = async (): Promise<
	{ asset: ImagePickerAsset } | { cancelled: true } | { error: string }
> => {
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

	return { asset };
};

// 바이트 실측 → 규격 확인 → 업로드 인텐트 발급 → PUT 업로드. 단일 이미지와 조각 각각이
// 공유한다(픽·조각내기 로직은 호출부).
const uploadResolvedSource = async (params: {
	bytes: Uint8Array<ArrayBuffer>;
	createUpload: CreateUpload;
	organizationId: string;
	source: {
		fileName?: null | string;
		height?: number;
		mimeType?: string;
		uri: string;
		width?: number;
	};
	teamId: null | string;
	usage: JobMediaUsage;
}): Promise<
	{ error: string } | { picked: PickedJobImage; storageKey: string }
> => {
	const { bytes, createUpload, organizationId, source, teamId, usage } = params;
	const resolved = resolveJobImagePick(source, bytes.byteLength);

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

	// dev 서버(GCS 미구성)는 web 앱의 로컬 업로드 경로("/bambi/local-job-media?…", 상대 URL)를
	// 내려준다. web은 같은 출처라 그대로 PUT하지만 앱은 EXPO_PUBLIC_WEB_URL에 붙여야 닿는다 —
	// 거기 올려야 web의 검수 큐·상세가 같은 경로(GET)로 이미지를 읽는다. 주소가 없으면 web의
	// 플레이스홀더 건너뛰기처럼 업로드만 생략하고 storageKey를 실어 흐름을 잇는다(그 경우 web엔
	// 이미지가 안 보인다). 운영에서 서명 URL이 아니면 서버 구성 오류이므로 종전대로 막는다.
	const uploadUrl = resolveUploadUrl(intent.uploadUrl);

	if (uploadUrl === null) {
		return {
			error: "지금은 이미지를 등록할 수 없어요. 잠시 후 다시 시도해 주세요.",
		};
	}

	if (uploadUrl === "") {
		return { picked: resolved, storageKey: intent.storageKey };
	}

	try {
		const response = await fetch(uploadUrl, {
			body: bytes,
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

	return { picked: resolved, storageKey: intent.storageKey };
};

// 사진 선택 → 업로드까지의 공통 로직. cover·banner가 함께 쓰므로 화면 의존(Alert 등)을
// 걷어내고 결과만 돌려준다. 상세 이미지 슬라이싱은 pickAndUploadDetailImages가 담당한다.
export const pickAndUploadJobImage = async (args: {
	createUpload: CreateUpload;
	organizationId: string;
	teamId: null | string;
	usage: JobMediaUsage;
}): Promise<JobImageUploadResult> => {
	const { createUpload, organizationId, teamId, usage } = args;
	const asset = await pickImageAsset();

	if ("cancelled" in asset || "error" in asset) {
		return asset;
	}

	// 서명 content-length에 실측 바이트가 묶인다 — asset.fileSize가 아니라 읽은 바이트 길이.
	const { bytes } = await readLocalFileBytes(asset.asset.uri);
	const result = await uploadResolvedSource({
		bytes,
		createUpload,
		organizationId,
		source: {
			fileName: asset.asset.fileName,
			height: asset.asset.height,
			mimeType: asset.asset.mimeType,
			uri: asset.asset.uri,
			width: asset.asset.width,
		},
		teamId,
		usage,
	});

	if ("error" in result) {
		return { error: result.error };
	}

	return {
		item: toJobMediaItem(result.picked, result.storageKey),
		previewUri: asset.asset.uri,
	};
};

const detailSliceFileName = (
	original: null | string | undefined,
	index: number
): string => {
	const base = (original ?? "").trim();
	const dot = base.lastIndexOf(".");
	const stem = dot > 0 ? base.slice(0, dot) : base;

	return `${stem || "detail"}-${index + 1}.jpg`;
};

// 상세 이미지 픽: 세로가 길면 조각내 각 조각을 개별 업로드하고 같은 sliceGroupId·0부터의
// sliceIndex를 실어 돌려준다. 조각내기가 필요 없거나 실패하면(sliceDetailImage가 null) 원본
// 한 장을 그대로 올린다 — 슬라이싱 실패가 업로드 자체를 막지 않는다. 진행 표시는 픽 하나가
// 한 단위(호출부가 이 함수 한 번을 감싼다).
export const pickAndUploadDetailImages = async (args: {
	createUpload: CreateUpload;
	organizationId: string;
	teamId: null | string;
}): Promise<JobDetailUploadResult> => {
	const { createUpload, organizationId, teamId } = args;
	const asset = await pickImageAsset();

	if ("cancelled" in asset || "error" in asset) {
		return asset;
	}

	const source = asset.asset;
	const sliced =
		typeof source.width === "number" && typeof source.height === "number"
			? await sliceDetailImage({
					height: source.height,
					uri: source.uri,
					width: source.width,
				})
			: null;

	if (sliced) {
		const sliceGroupId = generateChatMessageId();
		const items: JobMediaUploadItem[] = [];
		const previews: Record<string, string> = {};

		for (const slice of sliced) {
			const { bytes } = await readLocalFileBytes(slice.uri);
			const result = await uploadResolvedSource({
				bytes,
				createUpload,
				organizationId,
				source: {
					fileName: detailSliceFileName(source.fileName, slice.sliceIndex),
					height: slice.height,
					mimeType: "image/jpeg",
					uri: slice.uri,
					width: slice.width,
				},
				teamId,
				usage: "detail",
			});

			if ("error" in result) {
				return { error: result.error };
			}

			items.push(
				toJobMediaItem(
					{ ...result.picked, sliceGroupId, sliceIndex: slice.sliceIndex },
					result.storageKey
				)
			);
			previews[result.storageKey] = slice.uri;
		}

		return { items, previews };
	}

	const { bytes } = await readLocalFileBytes(source.uri);
	const result = await uploadResolvedSource({
		bytes,
		createUpload,
		organizationId,
		source: {
			fileName: source.fileName,
			height: source.height,
			mimeType: source.mimeType,
			uri: source.uri,
			width: source.width,
		},
		teamId,
		usage: "detail",
	});

	if ("error" in result) {
		return { error: result.error };
	}

	return {
		items: [toJobMediaItem(result.picked, result.storageKey)],
		previews: { [result.storageKey]: source.uri },
	};
};
