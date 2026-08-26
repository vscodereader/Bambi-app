import Image from "next/image";

// 치수 메타데이터가 생기기 전 저장된 상세 이미지의 기존 공개 렌더링 규격이다. 신규 미디어는
// 업로드 때 저장한 실제 치수를 쓰고, null인 구버전 행만 이 호환값을 사용한다.
const LEGACY_DETAIL_IMAGE_WIDTH = 1200;
const LEGACY_DETAIL_IMAGE_HEIGHT = 1600;

export function JobDetailImage({
	alt,
	height,
	src,
	width,
}: {
	alt: string;
	height?: null | number;
	src: string;
	width?: null | number;
}) {
	return (
		<Image
			alt={alt}
			className="h-auto w-full rounded-lg border"
			height={height ?? LEGACY_DETAIL_IMAGE_HEIGHT}
			src={src}
			unoptimized
			width={width ?? LEGACY_DETAIL_IMAGE_WIDTH}
		/>
	);
}
