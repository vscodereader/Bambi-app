// 로컬 파일 uri를 바이트로 읽는다. Expo SDK 56의 전역 fetch는 expo/fetch로 교체되는데,
// 그 FetchResponse.blob()은 내부에서 new Blob([arrayBuffer])를 호출하고 RN Blob이
// ArrayBuffer 파트를 못 받아 던진다("Creating blobs from 'ArrayBuffer' ... not supported").
// 그래서 Blob을 거치지 않고 arrayBuffer()로 읽는다 — expo/fetch는 file:// 읽기·arrayBuffer()를
// 지원한다. 반환 bytes는 그대로 fetch PUT body로 쓸 수 있고 byteLength가 실측 크기다.
// bytes는 Uint8Array<ArrayBuffer>로 좁힌다 — 기본 Uint8Array<ArrayBufferLike>는 SharedArrayBuffer를
// 포함해 fetch body(BodyInit)에 그대로 못 넘긴다(TS). arrayBuffer()가 준 순수 ArrayBuffer 뷰라 안전하다.
export const readLocalFileBytes = async (
	uri: string
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: null | string }> => {
	const response = await fetch(uri);

	if (!response.ok) {
		throw new Error(`local file read failed: ${response.status}`);
	}

	const buffer = await response.arrayBuffer();

	return {
		bytes: new Uint8Array(buffer),
		// content-type은 Android OkHttpFileUrlInterceptor가 파일명으로 추정해 준다 — 없을 수 있다.
		mimeType: response.headers.get("content-type"),
	};
};
