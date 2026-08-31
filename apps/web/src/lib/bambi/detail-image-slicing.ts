// 세로로 긴 순수 공고 상세 이미지를 업로드 전에 브라우저 canvas로 조각낸다. Android RN
// Image(Fresco)는 GPU 텍스처 한계(기기별 4096~, 구형 2048)를 넘는 비트맵을 2의 거듭제곱으로
// 다운샘플해 가로 해상도까지 깎아 흐려진다. 각 조각을 한계 아래로 잘라 저장하면 원본 화질로
// 디코드된다(웹은 브라우저가 원본을 그리므로 무관). 서버는 바이트를 만지지 않고 서명 URL로
// 브라우저가 GCS에 직접 올리므로, 무의존성 정공법은 클라이언트 canvas다.
import { DETAIL_SLICE_MAX_HEIGHT } from "@bambi-app/api/services/bambi-job-media-policy";

export interface DetailSlicePlan {
	// 조각 세로 픽셀(<= maxHeight).
	height: number;
	// 그룹 내 순서(0부터) = sliceIndex.
	index: number;
	// 원본에서 잘라낼 시작 y.
	offsetY: number;
}

// 세로가 maxHeight를 넘으면 가로 전폭·세로 균등 조각 계획을 돌려준다(합이 정확히 height).
// 넘지 않으면 [] — 슬라이싱 불필요.
export const planDetailSlices = (
	height: number,
	maxHeight: number = DETAIL_SLICE_MAX_HEIGHT
): DetailSlicePlan[] => {
	if (!(Number.isFinite(height) && height > maxHeight)) {
		return [];
	}

	const count = Math.ceil(height / maxHeight);
	const base = Math.floor(height / count);
	// 나머지 픽셀은 앞 조각들에 1px씩 분배해 반올림 손실 없이 합 = height. base < maxHeight가
	// 보장되므로(넘으면 count가 더 컸다) base+1도 maxHeight 이하다.
	const remainder = height - base * count;
	const plans: DetailSlicePlan[] = [];
	let offsetY = 0;

	for (let index = 0; index < count; index += 1) {
		const sliceHeight = base + (index < remainder ? 1 : 0);

		plans.push({ height: sliceHeight, index, offsetY });
		offsetY += sliceHeight;
	}

	return plans;
};

// 같은 sliceGroupId를 공유하는 조각들을 하나의 그룹으로 묶는다. 비-슬라이스 미디어는 단독
// 그룹. 그룹 위치는 첫 조각의 등장 순서를 따르고(서버 position 정렬 유지), 그룹 내부는
// sliceIndex 순으로 정렬한다(서버가 이미 보장하지만 방어적으로).
export const groupDetailMediaBySlice = <
	T extends { sliceGroupId?: null | string; sliceIndex?: null | number },
>(
	images: T[]
): T[][] => {
	const groups: T[][] = [];
	const byGroupId = new Map<string, T[]>();

	for (const image of images) {
		if (!image.sliceGroupId) {
			groups.push([image]);
			continue;
		}

		const existing = byGroupId.get(image.sliceGroupId);

		if (existing) {
			existing.push(image);
		} else {
			const group = [image];

			byGroupId.set(image.sliceGroupId, group);
			groups.push(group);
		}
	}

	for (const group of groups) {
		if (group.length > 1) {
			group.sort((a, b) => (a.sliceIndex ?? 0) - (b.sliceIndex ?? 0));
		}
	}

	return groups;
};

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
