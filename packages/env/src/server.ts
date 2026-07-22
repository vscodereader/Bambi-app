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
		// GCS는 개발·테스트에서만 선택 구성이다. 버킷이 비어 있으면 업로드 인텐트가 로컬
		// 플레이스홀더로 폴백하므로, GCP 자격 증명 없이도 개발이 그대로 돌아간다.
		GCP_PROJECT_ID: z.string().min(1).optional(),
		GCS_PUBLIC_BUCKET: z.string().min(1).optional(),
		// 포트원 V2 API Secret(본인인증 단건조회). 개발에서는 선택 — 비어 있으면 회원
		// 본인인증이 목 핸들러(verifyMyPhoneMock)로 폴백한다.
		PORTONE_API_SECRET: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

// 프로덕션에서 버킷이 빠지면 업로드 인텐트가 local:// 플레이스홀더를 200으로 돌려주고,
// 웹은 그걸 보면 PUT을 건너뛴다. 즉 아무것도 업로드되지 않은 채 DB에는 키만 남는다.
// 조용한 데이터 손상 대신 부팅을 실패시켜, 잘못된 구성이 배포되지 못하게 한다.
if (env.NODE_ENV === "production" && !env.GCS_PUBLIC_BUCKET) {
	throw new Error(
		"GCS_PUBLIC_BUCKET은 프로덕션에서 필수입니다. 값이 없으면 공고 이미지 업로드가 조용히 무시됩니다."
	);
}

// 프로덕션에서 포트원 시크릿이 빠지면 회원 본인인증이 통째로 실패한다(목 폴백은
// 개발 전용으로 잠겨 있다). 조용한 기능 마비 대신 부팅을 실패시킨다.
if (env.NODE_ENV === "production" && !env.PORTONE_API_SECRET) {
	throw new Error(
		"PORTONE_API_SECRET은 프로덕션에서 필수입니다. 값이 없으면 휴대폰 본인인증이 동작하지 않습니다."
	);
}
