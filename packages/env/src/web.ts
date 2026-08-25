import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_SERVER_URL: z.url(),
		// 개발에서만 선택 구성이다. 미설정 시 공고 이미지가 샘플 썸네일로 폴백한다(GCS 없이 개발 가능).
		NEXT_PUBLIC_GCS_PUBLIC_BASE_URL: z.url().optional(),
		// 포트원 본인인증(인증창) 공개 식별자. 관리자 콘솔에서 발급. 개발에서는 선택 —
		// 비어 있으면 본인인증 다이얼로그가 목 폼으로 폴백한다.
		NEXT_PUBLIC_PORTONE_STORE_ID: z.string().min(1).optional(),
		NEXT_PUBLIC_PORTONE_CHANNEL_KEY: z.string().min(1).optional(),
	},
	server: {
		// 포트원 V2 API Secret. 게스트 본인인증 라우트(/api/guest)가 인증 결과를 서버에서
		// 검증할 때 쓴다. 클라이언트에 노출 금지.
		PORTONE_API_SECRET: z.string().min(1).optional(),
		// 게스트 인증 쿠키(HMAC 서명 토큰)의 서명 키. 평문 쿠키는 devtools에서 위조되므로
		// 서명 없이는 게이트를 열 수 없게 한다.
		BAMBI_GUEST_TOKEN_SECRET: z.string().min(32).optional(),
		// better-auth 세션 쿠키 prefix. 미들웨어(proxy)가 서버(auth)와 같은 prefix로
		// getSessionCookie를 읽어야 세션 판정이 어긋나지 않는다. 서버 env와 같은 값
		// (prod=bambi, dev=bambi-dev). 미설정이면 better-auth 기본 prefix.
		BAMBI_COOKIE_PREFIX: z.string().optional(),
		// IndexNow 검증 키. proxy(edge 미들웨어)가 /{key}.txt 요청에 이 값을 그대로
		// 돌려준다 — 서버(server.ts INDEXNOW_KEY)와 같은 값이어야 핑 host·keyLocation이
		// 실제 서빙 위치와 맞는다. 미설정이면 키 파일이 404가 되고 핑도 no-op이다.
		INDEXNOW_KEY: z.string().optional(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
		NEXT_PUBLIC_GCS_PUBLIC_BASE_URL:
			process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL,
		NEXT_PUBLIC_PORTONE_STORE_ID: process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
		NEXT_PUBLIC_PORTONE_CHANNEL_KEY:
			process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
		PORTONE_API_SECRET: process.env.PORTONE_API_SECRET,
		BAMBI_GUEST_TOKEN_SECRET: process.env.BAMBI_GUEST_TOKEN_SECRET,
		BAMBI_COOKIE_PREFIX: process.env.BAMBI_COOKIE_PREFIX,
		INDEXNOW_KEY: process.env.INDEXNOW_KEY,
	},
	emptyStringAsUndefined: true,
});

// 빌드타임에 인라인되는 값이라, 배포 환경에 빠져 있어도 빌드는 성공하고 화면에는 업로드한
// 적 없는 샘플 썸네일이 뜬다(에러 없음 → 발견이 늦고 GCS 설정 문제로 오진하기 쉽다).
// 프로덕션 빌드에서는 빌드를 실패시켜 누락을 즉시 드러낸다. next.config.ts가 이 모듈을
// import 하므로 빌드 시작 시점에 걸린다.
if (
	process.env.NODE_ENV === "production" &&
	!env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL
) {
	throw new Error(
		"NEXT_PUBLIC_GCS_PUBLIC_BASE_URL은 프로덕션 빌드에서 필수입니다. 값이 없으면 업로드된 공고 이미지 대신 샘플 썸네일이 표시됩니다."
	);
}

// 본인인증 구성이 빠지면 프로덕션에서 목 폼이 노출되거나 게스트 인증이 통째로 막힌다.
// 서버 전용 변수는 클라이언트 번들에서 접근하면 t3-env가 throw 하므로, 이 검사는 서버
// 컨텍스트에서만 수행한다(next.config import 시점 = 빌드 시작 시점에 걸린다).
if (process.env.NODE_ENV === "production" && typeof window === "undefined") {
	if (
		!(env.NEXT_PUBLIC_PORTONE_STORE_ID && env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY)
	) {
		throw new Error(
			"NEXT_PUBLIC_PORTONE_STORE_ID/NEXT_PUBLIC_PORTONE_CHANNEL_KEY는 프로덕션 빌드에서 필수입니다. 값이 없으면 본인인증이 목 폼으로 폴백합니다."
		);
	}
	if (!env.PORTONE_API_SECRET) {
		throw new Error(
			"PORTONE_API_SECRET은 프로덕션(web)에서 필수입니다. 게스트 본인인증 결과 검증에 사용됩니다."
		);
	}
	if (!env.BAMBI_GUEST_TOKEN_SECRET) {
		throw new Error(
			"BAMBI_GUEST_TOKEN_SECRET은 프로덕션에서 필수입니다. 값이 없으면 게스트 인증 쿠키를 서명할 수 없습니다."
		);
	}
}
