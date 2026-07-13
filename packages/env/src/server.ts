import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		// GCS는 선택 구성이다. 버킷이 비어 있으면 업로드 인텐트가 로컬 플레이스홀더로
		// 폴백하므로, GCP 자격 증명 없이도 개발·테스트가 그대로 돌아간다.
		GCP_PROJECT_ID: z.string().min(1).optional(),
		GCS_PUBLIC_BUCKET: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
