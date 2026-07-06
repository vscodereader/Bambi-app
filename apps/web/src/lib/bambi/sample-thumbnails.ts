// 테스트용 샘플 썸네일 — apps/web/public/bambi/sample-thumbnails 에 실제 파일 존재.
// 실제 이미지 파이프라인(스토리지) 연동 전까지 mock·API 공고가 이 샘플을 공유한다.

import type { JobMedia } from "./types";

const SAMPLE_THUMBNAILS: ReadonlyArray<{ fileName: string; mimeType: string }> =
	[
		{ fileName: "sample-1.gif", mimeType: "image/gif" },
		{ fileName: "sample-2.jpeg", mimeType: "image/jpeg" },
		{ fileName: "sample-3.jpeg", mimeType: "image/jpeg" },
		{ fileName: "sample-4.jpeg", mimeType: "image/jpeg" },
		{ fileName: "sample-5.jpeg", mimeType: "image/jpeg" },
		{ fileName: "sample-6.jpeg", mimeType: "image/jpeg" },
		{ fileName: "sample-7.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-8.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-9.png", mimeType: "image/png" },
		{ fileName: "sample-10.png", mimeType: "image/png" },
		{ fileName: "sample-11.gif", mimeType: "image/gif" },
		{ fileName: "sample-12.png", mimeType: "image/png" },
		{ fileName: "sample-13.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-14.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-15.gif", mimeType: "image/gif" },
		{ fileName: "sample-16.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-17.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-18.jpg", mimeType: "image/jpg" },
		{ fileName: "sample-19.gif", mimeType: "image/gif" },
		{ fileName: "sample-20.png", mimeType: "image/png" },
	];

// 키(공고 id·storageKey 등) 기반 결정적 해시 — 같은 키는 항상 같은 샘플을 고른다.
// 결정적이라 새로고침해도 값이 고정돼 SSR/CSR hydration 이 어긋나지 않는다.
// (런타임 Math.random 은 매 렌더 달라져 Next hydration mismatch 를 일으키므로 사용하지 않는다.)
function hashKey(key: string): number {
	let hash = 0;
	for (const char of key) {
		hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
	}
	return hash;
}

function pickSampleThumbnail(key: string): {
	fileName: string;
	mimeType: string;
} {
	return SAMPLE_THUMBNAILS[hashKey(key) % SAMPLE_THUMBNAILS.length];
}

// 키로 결정적 샘플 썸네일 URL 을 반환한다(public 정적 파일 경로).
export function sampleThumbnailUrl(key: string): string {
	return `/bambi/sample-thumbnails/${pickSampleThumbnail(key).fileName}`;
}

// 키로 결정적 샘플 커버 JobMedia 를 생성한다. cover 가 아예 없는 공고의 폴백용.
export function sampleCoverMedia(key: string, altText: string): JobMedia {
	const sample = pickSampleThumbnail(key);
	return {
		altText,
		byteSize: 0,
		fileName: sample.fileName,
		mimeType: sample.mimeType,
		storageKey: `bambi/sample-thumbnails/${sample.fileName}`,
		url: `/bambi/sample-thumbnails/${sample.fileName}`,
		usage: "cover",
	};
}
