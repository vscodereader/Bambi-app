import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_SERVER_URL: z.url(),
		// 미설정 시 공고 이미지가 샘플 썸네일로 폴백한다(GCS 없이 개발 가능).
		NEXT_PUBLIC_GCS_PUBLIC_BASE_URL: z.url().optional(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
		NEXT_PUBLIC_GCS_PUBLIC_BASE_URL:
			process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL,
	},
	emptyStringAsUndefined: true,
});
