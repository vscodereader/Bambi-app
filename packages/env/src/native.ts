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
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
