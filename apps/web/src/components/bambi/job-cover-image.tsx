"use client";

import Image from "next/image";
import { useState } from "react";
import { sampleThumbnailUrl } from "@/lib/bambi/sample-thumbnails";
import type { JobMedia } from "@/lib/bambi/types";

interface JobCoverImageProps {
	className?: string;
	height: number;
	media: JobMedia;
	width: number;
}

// 공고 대표 이미지(카드·목록 썸네일). 미디어 행은 있지만 스토리지에 객체가 없는 공고가 있다.
// seed 공고가 대표적이고, 버킷 구성 전에 등록된 공고도 마찬가지다. 객체 존재 여부는 서버가
// 알 수 없으므로(HEAD 조회는 목록마다 비용) 브라우저의 로드 실패를 감지해 public 샘플 썸네일로
// 교체한다. 객체가 실제로 있으면 그대로 렌더되므로 정상 업로드 공고는 영향받지 않는다.
export function JobCoverImage({
	className,
	height,
	media,
	width,
}: JobCoverImageProps) {
	// 실패한 URL 자체를 기억한다. 리스트 재사용으로 media가 바뀌면 새 URL을 다시 시도한다.
	const [failedUrl, setFailedUrl] = useState<null | string>(null);
	const isFailed = failedUrl === media.url;
	const src = isFailed ? sampleThumbnailUrl(media.storageKey) : media.url;

	return (
		<Image
			alt={media.altText || media.fileName}
			className={className}
			height={height}
			onError={() => setFailedUrl(media.url)}
			src={src}
			unoptimized
			width={width}
		/>
	);
}
