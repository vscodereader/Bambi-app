// 파일 앞바이트(매직넘버)로 실제 이미지 형식을 판정한다. File.type/확장자 위조를
// 걸러내는 클라이언트 1차 방어. 서버는 실제 바이트를 열지 않으므로 완전 차단은 아니다.
export type DetectedImageType =
	| "image/jpeg"
	| "image/png"
	| "image/webp"
	| "image/gif";

const startsWith = (bytes: Uint8Array, sig: number[]): boolean =>
	sig.every((b, i) => bytes[i] === b);

export async function detectImageSignature(
	file: Blob
): Promise<DetectedImageType | null> {
	const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
		return "image/jpeg";
	}
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
		return "image/gif";
	}
	// WebP: "RIFF"(0-3) + "WEBP"(8-11)
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

export function isSignatureMismatch(
	declaredMime: string,
	detected: DetectedImageType | null
): boolean {
	return detected === null || detected !== declaredMime;
}

// PDF는 이미지가 아니라 DetectedImageType에 넣지 않고 따로 판정한다. 채팅 첨부가 유일한
// PDF 경로이며, 이미지와 같은 이유로 확장자·File.type 위조를 앞바이트로 한 번 걸러낸다.
export async function isPdfSignature(file: Blob): Promise<boolean> {
	const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());

	// "%PDF-"
	return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
}
