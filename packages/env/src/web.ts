import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_SERVER_URL: z.url(),
		// 개발에서만 선택 구성이다. 미설정 시 공고 이미지가 샘플 썸네일로 폴백한다(GCS 없이 개발 가능).
		NEXT_PUBLIC_GCS_PUBLIC_BASE_URL: z.url().optional(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
		NEXT_PUBLIC_GCS_PUBLIC_BASE_URL:
			process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL,
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
