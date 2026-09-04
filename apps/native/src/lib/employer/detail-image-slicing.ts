// 세로로 긴 순수 공고 상세 이미지를 업로드 전에 조각낸다. Android RN Image(Fresco)는 GPU
// 텍스처 한계(기기별 4096~, 구형 2048)를 넘는 비트맵을 2의 거듭제곱으로 다운샘플해 가로
// 해상도까지 깎아 흐려진다. 각 조각을 한계 아래로 잘라 올리면 원본 화질로 디코드된다. 웹은
// canvas로 자르지만 native는 expo-image-manipulator로 같은 계획(planDetailSlices)을 실행한다.
import { planDetailSlices } from "@bambi-app/api/services/bambi-job-media-policy";

export interface SliceCropRegion {
	height: number;
	originX: number;
	originY: number;
	sliceIndex: number;
	width: number;
}

export interface DetailImageSlice {
	height: number;
	sliceIndex: number;
	uri: string;
	width: number;
}

// 원본 매니플레이터를 다시 열지 않도록 재인코딩 품질만 웹(0.92)과 맞춘다.
const SLICE_JPEG_QUALITY = 0.92;

// planDetailSlices를 crop 사각형 목록으로 옮기는 순수 변환. 자를 필요가 없으면 빈 배열.
export const toSliceCropRegions = (
	width: number,
	height: number,
	maxHeight?: number
): SliceCropRegion[] =>
	planDetailSlices(height, maxHeight).map((plan) => ({
		height: plan.height,
		originX: 0,
		originY: plan.offsetY,
		sliceIndex: plan.index,
		width,
	}));

// 세로가 임계값을 넘는 상세 이미지를 가로 전폭·세로 조각들로 자른다. 자를 필요가 없거나
// 조작이 실패하면 null — 호출부는 원본을 그대로 한 장 업로드한다(슬라이싱 실패가 업로드를
// 막으면 안 된다). expo-image-manipulator는 native 모듈이라 지연 import로 불러온다(vitest가
// 순수 함수 테스트에서 native 모듈을 로드하지 않게).
export const sliceDetailImage = async ({
	height,
	uri,
	width,
}: {
	height: number;
	uri: string;
	width: number;
}): Promise<DetailImageSlice[] | null> => {
	const regions = toSliceCropRegions(width, height);

	if (regions.length === 0) {
		return null;
	}

	try {
		const { ImageManipulator, SaveFormat } = await import(
			"expo-image-manipulator"
		);
		const slices: DetailImageSlice[] = [];

		for (const region of regions) {
			// 조각마다 원본에서 새 컨텍스트를 연다 — crop은 현재 이미지에 누적되므로 재사용하면
			// 두 번째 조각부터 좌표가 어긋난다.
			const rendered = await ImageManipulator.manipulate(uri)
				.crop({
					height: region.height,
					originX: region.originX,
					originY: region.originY,
					width: region.width,
				})
				.renderAsync();
			const saved = await rendered.saveAsync({
				compress: SLICE_JPEG_QUALITY,
				format: SaveFormat.JPEG,
			});

			slices.push({
				height: saved.height,
				sliceIndex: region.sliceIndex,
				uri: saved.uri,
				width: saved.width,
			});
		}

		return slices;
	} catch {
		return null;
	}
};
