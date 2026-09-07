export const JOB_COVER_LIMIT = 1;
export const JOB_DETAIL_LIMIT = 5;
export const JOB_IMAGE_MAX_BYTES = 10_485_760; // 10 * 1024 * 1024, 서버 JOB_POST_IMAGE_MAX_BYTES와 동일
const JOB_IMAGE_NAME_MAX_LENGTH = 180;
const JOB_IMAGE_ALT_TEXT_MAX_LENGTH = 120; // 서버 JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH

const JOB_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_BY_EXTENSION: Record<string, string> = {
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

const lastSegment = (value: string): string =>
	value.split("?")[0].split("/").pop() ?? "";

const fileExtension = (value: string): string => {
	const segment = lastSegment(value);
	const dot = segment.lastIndexOf(".");

	return dot === -1 ? "" : segment.slice(dot + 1).toLowerCase();
};

// expo-image-picker asset. width/height는 asset이 함께 준다 — web처럼 createImageBitmap이
// 필요 없다. byteSize는 호출부가 bytes.byteLength(실측)를 넘긴다(asset.fileSize는 크롭·압축 뒤
// 어긋나 GCS 403).
export interface PickedJobImage {
	byteSize: number;
	fileName: string;
	height?: number;
	mimeType: string;
	// 세로가 긴 상세 이미지를 native에서 조각내면 조각마다 같은 sliceGroupId와 0부터의
	// sliceIndex가 실린다. 조각내지 않은 새 픽·수정 프리필의 web 생성분에도 같은 규칙으로
	// 값이 있을 수 있다(그래야 재저장 시 그룹이 유지된다).
	sliceGroupId?: string;
	sliceIndex?: number;
	uri: string;
	width?: number;
}

// 최종 제출 payload의 미디어 한 장(서버 jobPostMediaInput 부분집합, native가 채우는 키만).
export interface JobMediaUploadItem {
	altText: string;
	byteSize: number;
	fileName: string;
	height?: number;
	mimeType: string;
	// detail 슬라이스 그룹 메타. native가 조각낸 픽과 web 생성분(수정 시 보존) 양쪽에 실린다.
	sliceGroupId?: string;
	sliceIndex?: number;
	storageKey: string;
	width?: number;
}

export const resolveJobImagePick = (
	asset: {
		fileName?: null | string;
		height?: number;
		mimeType?: string;
		uri: string;
		width?: number;
	},
	byteSize: number
): PickedJobImage | { error: string } => {
	const mimeType =
		asset.mimeType && JOB_IMAGE_MIME_TYPES.has(asset.mimeType)
			? asset.mimeType
			: MIME_BY_EXTENSION[
					fileExtension(asset.fileName ?? "") || fileExtension(asset.uri)
				];

	if (!mimeType) {
		return { error: "JPG, PNG, WebP 이미지만 등록할 수 있어요." };
	}

	if (byteSize < 1) {
		return { error: "이미지를 불러오지 못했어요. 다시 선택해 주세요." };
	}

	if (byteSize > JOB_IMAGE_MAX_BYTES) {
		return { error: "이미지는 한 장당 10MB 이하만 등록할 수 있어요." };
	}

	const fileName = (
		(asset.fileName ?? "").trim() ||
		lastSegment(asset.uri) ||
		`image.${mimeType.split("/")[1]}`
	).slice(0, JOB_IMAGE_NAME_MAX_LENGTH);

	return {
		byteSize,
		fileName,
		height: asset.height,
		mimeType,
		uri: asset.uri,
		width: asset.width,
	};
};

export const toJobMediaItem = (
	picked: PickedJobImage,
	storageKey: string
): JobMediaUploadItem => ({
	altText: "".slice(0, JOB_IMAGE_ALT_TEXT_MAX_LENGTH),
	byteSize: picked.byteSize,
	fileName: picked.fileName,
	height: picked.height,
	mimeType: picked.mimeType,
	storageKey,
	width: picked.width,
	...(picked.sliceGroupId === undefined
		? {}
		: { sliceGroupId: picked.sliceGroupId }),
	...(picked.sliceIndex === undefined ? {} : { sliceIndex: picked.sliceIndex }),
});
