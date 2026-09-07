// 세로로 긴 순수 공고 상세 이미지를 업로드 전에 브라우저 canvas로 조각낸다. Android RN
// Image(Fresco)는 GPU 텍스처 한계(기기별 4096~, 구형 2048)를 넘는 비트맵을 2의 거듭제곱으로
// 다운샘플해 가로 해상도까지 깎아 흐려진다. 각 조각을 한계 아래로 잘라 저장하면 원본 화질로
// 디코드된다(웹은 브라우저가 원본을 그리므로 무관). 서버는 바이트를 만지지 않고 서명 URL로
// 브라우저가 GCS에 직접 올리므로, 무의존성 정공법은 클라이언트 canvas다.
import {
	DETAIL_SLICE_MAX_HEIGHT,
	planDetailSlices,
} from "@bambi-app/api/services/bambi-job-media-policy";

// planDetailSlices·groupDetailMediaBySlice·DetailSlicePlan은 순수 로직이라 서비스로 옮겨
// native와 공유한다. 웹은 재수출만 하고 canvas 조각 생성(sliceDetailImageFile)만 유지한다.
// biome-ignore lint/performance/noBarrelFile: 정본(packages/api) 이전에 따른 경로 호환용 재수출.
export {
	type DetailSlicePlan,
	groupDetailMediaBySlice,
	planDetailSlices,
} from "@bambi-app/api/services/bambi-job-media-policy";

export interface SlicedDetailFile {
	file: File;
	height: number;
	sliceIndex: number;
	width: number;
}

// canvas가 낼 수 있는 정적 포맷만 원본 mime을 유지한다. 그 외(gif 등 — 상세엔 오지 않지만)는
// jpeg로 인코딩한다.
const CANVAS_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FALLBACK_MIME_TYPE = "image/jpeg";
const JPEG_QUALITY = 0.92;

const MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

const sliceFileName = (
	original: string,
	index: number,
	extension: string
): string => {
	const dot = original.lastIndexOf(".");
	const stem = dot > 0 ? original.slice(0, dot) : original;

	return `${stem}-${index + 1}.${extension}`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string) =>
	new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error("이미지 조각을 만들지 못했습니다.")),
			mimeType,
			mimeType === "image/jpeg" ? JPEG_QUALITY : undefined
		);
	});

// 세로가 임계값을 넘는 상세 이미지 파일을 가로 전폭·세로 조각 파일들로 자른다. 슬라이싱이
// 필요 없거나(짧은 이미지) 환경이 canvas를 지원하지 않으면 null — 호출부는 원본을 그대로
// 단일 업로드한다.
export const sliceDetailImageFile = async (
	file: File,
	maxHeight: number = DETAIL_SLICE_MAX_HEIGHT
): Promise<null | SlicedDetailFile[]> => {
	if (
		typeof document === "undefined" ||
		typeof createImageBitmap !== "function"
	) {
		return null;
	}

	const bitmap = await createImageBitmap(file);
	const plans = planDetailSlices(bitmap.height, maxHeight);

	if (plans.length === 0) {
		bitmap.close();

		return null;
	}

	const { width } = bitmap;
	const mimeType = CANVAS_MIME_TYPES.has(file.type)
		? file.type
		: FALLBACK_MIME_TYPE;
	const extension = MIME_EXTENSIONS[mimeType] ?? "jpg";
	const results: SlicedDetailFile[] = [];

	try {
		for (const plan of plans) {
			const canvas = document.createElement("canvas");

			canvas.width = width;
			canvas.height = plan.height;

			const context = canvas.getContext("2d");

			if (!context) {
				return null;
			}

			context.drawImage(
				bitmap,
				0,
				plan.offsetY,
				width,
				plan.height,
				0,
				0,
				width,
				plan.height
			);

			const blob = await canvasToBlob(canvas, mimeType);

			results.push({
				file: new File(
					[blob],
					sliceFileName(file.name, plan.index, extension),
					{
						type: mimeType,
					}
				),
				height: plan.height,
				sliceIndex: plan.index,
				width,
			});
		}
	} finally {
		bitmap.close();
	}

	return results;
};
