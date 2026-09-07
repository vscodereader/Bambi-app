// 로컬 파일 uri를 바이트로 읽는다. Expo SDK 56의 전역 fetch는 expo/fetch로 교체되는데,
// 그 FetchResponse.blob()은 내부에서 new Blob([arrayBuffer])를 호출하고 RN Blob이
// ArrayBuffer 파트를 못 받아 던진다("Creating blobs from 'ArrayBuffer' ... not supported").
// 그래서 Blob을 거치지 않고 arrayBuffer()로 읽는다 — expo/fetch는 file:// 읽기·arrayBuffer()를
// 지원한다. 반환 bytes는 그대로 fetch PUT body로 쓸 수 있고 byteLength가 실측 크기다.
// bytes는 Uint8Array<ArrayBuffer>로 좁힌다 — 기본 Uint8Array<ArrayBufferLike>는 SharedArrayBuffer를
// 포함해 fetch body(BodyInit)에 그대로 못 넘긴다(TS). arrayBuffer()가 준 순수 ArrayBuffer 뷰라 안전하다.
//
// 경로의 퍼센트 인코딩을 한 번 푼다. Expo Go의 스코프 캐시 디렉토리 이름에는 '%'가 그대로
// 들어 있고(ExperienceData/%40anonymous%2F<slug>), Uri.fromFile이 그 '%'를 '%25'로 다시 감싼다.
// expo/fetch의 Android 인터셉터(OkHttpFileUrlInterceptor)는 경로를 디코드하지 않고 File()에
// 넘기므로 '%2540anonymous…'라는 없는 디렉토리를 찾아 404를 낸다. 한 번 풀면 디스크 이름과
// 맞는다. 인코딩할 게 없는 경로(개발 빌드·실기기)에서는 no-op이다.
// ponytail: 파일명에 공백·한글이 있으면 인터셉터가 어떻게 해도 못 찾는다(문서 픽커 원본명) —
// 그 경우가 실제로 나오면 expo-file-system File API(의존성 추가)로 갈아탄다.
export const readLocalFileBytes = async (
	uri: string
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: null | string }> => {
	const response = await fetch(decodeURI(uri));

	if (!response.ok) {
		throw new Error(`local file read failed: ${response.status} (${uri})`);
	}

	const buffer = await response.arrayBuffer();

	return {
		bytes: new Uint8Array(buffer),
		// content-type은 Android OkHttpFileUrlInterceptor가 파일명으로 추정해 준다 — 없을 수 있다.
		mimeType: response.headers.get("content-type"),
	};
};
