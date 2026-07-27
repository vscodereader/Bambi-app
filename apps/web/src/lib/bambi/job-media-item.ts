// 폼 미디어 슬롯이 파일 하나를 받아 만드는 항목. 공고 폼(썸네일·상세·배너)과 배너 에디터가
// 같은 함수를 거쳐야 검증이 한 곳에서만 걸린다.
// 상대 경로 import를 쓴다 — web 전용 vitest config가 없어 테스트에서 `@/` alias가 풀리지 않는다.
import type { JobFormMediaItem } from "../bambi-job-form";
import { detectImageSignature, isSignatureMismatch } from "./image-signature";
import { readImageDimensions } from "./job-ad-banner-spec";

export type MediaItemFailure = "signature-mismatch";

export type MediaItemResult =
	| { item: JobFormMediaItem }
	| { reason: MediaItemFailure };

// 배너는 크기 검증·잘림 경고에 원본 치수가 필요해서 함께 읽는다. 치수를 못 읽어도
// (손상된 파일 등) 업로드 자체는 막지 않고, 폼 검증이 "크기를 확인하지 못했습니다"로 잡아준다.
// 파일 앞바이트(매직넘버)가 선언 mime과 어긋나면(확장자·File.type 위조) 실패 사유를 돌려
// 업로드를 차단한다 — 모든 슬롯이 이 함수를 거치므로 여기서 한 번만 막는다.
// toast는 호출부가 띄운다. 여기서 띄우면 모듈이 UI에 묶여 테스트할 수 없다.
export const createMediaItemFromFile = async (
	file: File,
	altText = ""
): Promise<MediaItemResult> => {
	if (file.type.startsWith("image/")) {
		const detected = await detectImageSignature(file);

		if (isSignatureMismatch(file.type, detected)) {
			return { reason: "signature-mismatch" };
		}
	}

	const base: JobFormMediaItem = {
		altText,
		byteSize: file.size,
		file,
		fileName: file.name,
		mimeType: file.type,
		previewUrl: URL.createObjectURL(file),
	};

	try {
		const { height, width } = await readImageDimensions(file);

		return { item: { ...base, height, width } };
	} catch {
		return { item: base };
	}
};

// 슬롯 교체·삭제 시점에 이전 blob URL을 놓아준다. 안 하면 문서가 살아 있는 동안 원본 파일이
// 통째로 메모리에 남는다. storageKey가 있는 항목의 previewUrl은 공개 GCS URL이라 revoke 대상이
// 아니다 — `blob:` 접두사 검사가 그 가드다.
export const revokeMediaItemPreview = (
	item: JobFormMediaItem | null | undefined
): void => {
	if (item?.previewUrl?.startsWith("blob:")) {
		URL.revokeObjectURL(item.previewUrl);
	}
};
