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
		// better-auth 세션 쿠키 prefix. dev/prod가 같은 apex(.bambialba.com)를 공유하므로
		// 환경별로 다른 값(prod=bambi, dev=bambi-dev)을 줘 쿠키 충돌을 막는다. 미설정(로컬)
		// 이면 better-auth 기본 prefix를 그대로 써 개발 동작이 변하지 않는다.
		BAMBI_COOKIE_PREFIX: z.string().optional(),
		// Google Generative AI(Gemini) 키. /ai 라우트 전용 선택 기능이라 미설정 시 해당
		// 라우트만 실패한다. @ai-sdk/google 기본 provider가 이 값을 env에서 직접 읽는다.
		GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
		// 퀸알바 크롤링용 쿠키 문자열(브라우저 Cookie 헤더 통째). 이 사이트는 전 페이지가
		// KCB 본인확인 성인인증 게이트 뒤에 있어, 인증 세션 쿠키 없이는 어떤 URL도
		// adult_index.php 스텁만 돌려준다. 만료되면 회차가 "게이트에 막혔다"로 실패하므로
		// 운영자가 갱신해 넣는다. 미설정이면 퀸알바 수집만 실패하고 여우알바는 그대로 돈다.
		QUEENALBA_COOKIE: z.string().optional(),
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
