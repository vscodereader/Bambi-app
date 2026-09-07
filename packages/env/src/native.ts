import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "EXPO_PUBLIC_",
	client: {
		EXPO_PUBLIC_SERVER_URL: z.url(),
		// 공개 버킷 base URL. 순수 공고 커버는 storageKey만 내려오므로 이 값과 합쳐 URL을
		// 만든다(web의 NEXT_PUBLIC_GCS_PUBLIC_BASE_URL과 같은 축). 미설정이면 커버를 만들 수
		// 없어 카드가 업소명 타일로 폴백한다(개발에서 GCS 없이 동작). 수집 공고는 base64
		// data URI라 이 값과 무관하다.
		EXPO_PUBLIC_GCS_PUBLIC_BASE_URL: z.url().optional(),
		// web 앱 주소(개발 전용). dev 서버는 GCS 대신 web의 로컬 업로드 경로(상대 URL)를
		// 내려주는데, 앱은 그 경로를 이 주소에 붙여야 PUT할 수 있다. 미설정이면 dev에서
		// 업로드를 건너뛰어 검수 큐 등 web 화면에 이미지가 안 보인다. 운영은 서명 URL이라 무관.
		EXPO_PUBLIC_WEB_URL: z.url().optional(),
		// 포트원 본인인증(인증창) 공개 식별자. 관리자 콘솔에서 발급하며, 앱은
		// @portone/react-native-sdk의 인앱 WebView(<IdentityVerification/>)에 이 값을
		// 넘긴다. GCS base URL과 같은 축으로 optional이며, 둘 다 설정돼야 인증이 가능하다
		// (isAvailable). 미설정이면 본인인증 버튼 대신 기존 "웹에서 이용" 안내로 폴백한다.
		EXPO_PUBLIC_PORTONE_STORE_ID: z.string().min(1).optional(),
		EXPO_PUBLIC_PORTONE_CHANNEL_KEY: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
