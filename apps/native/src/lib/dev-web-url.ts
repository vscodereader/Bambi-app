// dev 서버(GCS 미구성)가 내려주는 web 앱 로컬 라우트(상대 URL, "/bambi/local-…?…")를 앱이
// 실제로 닿을 수 있는 절대 URL로 푼다. web은 같은 출처라 상대 URL을 그대로 쓰지만 앱은
// EXPO_PUBLIC_WEB_URL에 붙여야 한다. 공고 미디어·프로필·채팅 첨부·사업자 서류가 모두 이
// 한 곳을 지나야 "한 경로만 dev에서 멈추는" 어긋남이 다시 생기지 않는다.
// 순수 모듈(테스트가 노드에서 돈다)이라 env 스키마 대신 process.env를 기본 인자로 읽는다
// (Expo가 EXPO_PUBLIC_*를 빌드 시 인라인한다).
const TRAILING_SLASH = /\/$/;
const ABSOLUTE_URL = /^https?:\/\//;

const isDev = (): boolean => process.env.NODE_ENV !== "production";

// 업로드 인텐트의 uploadUrl → PUT 대상. 서명 URL(https)은 그대로, dev의 상대 경로는 web
// 주소에 붙이고, web 주소가 없으면 ""(업로드 생략·흐름은 잇는다), 그 밖(운영 비https)은
// null(서버 구성 오류이므로 차단).
export const resolveUploadUrl = (
	uploadUrl: string,
	webUrl: string | undefined = process.env.EXPO_PUBLIC_WEB_URL
): null | string => {
	if (uploadUrl.startsWith("https://")) {
		return uploadUrl;
	}

	if (isDev() && uploadUrl.startsWith("/")) {
		const base = webUrl?.replace(TRAILING_SLASH, "");

		return base ? `${base}${uploadUrl}` : "";
	}

	return null;
};

// 서버가 내려준 조회 URL(채팅 첨부 objectUrl·서류 view URL 등) → 앱이 열 수 있는 절대 URL.
// 절대 URL은 그대로, dev의 상대 경로는 web 주소에 붙인다. 못 풀면 null — 호출부가 폴백을 고른다.
export const resolveWebUrl = (
	url: string,
	webUrl: string | undefined = process.env.EXPO_PUBLIC_WEB_URL
): null | string => {
	if (ABSOLUTE_URL.test(url)) {
		return url;
	}

	if (isDev() && url.startsWith("/")) {
		const base = webUrl?.replace(TRAILING_SLASH, "");

		return base ? `${base}${url}` : null;
	}

	return null;
};
