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
		// 포트원 "테스트 채널"(통신사 대조 없이 아무 값이나 VERIFIED로 통과)을 프로덕션
		// 빌드에서도 허용할지. test.bambialba.com처럼 NODE_ENV=production으로 도는 검증
		// 환경에서만 true로 켜고, 실서비스 프로덕션에는 절대 넣지 않는다(기본 false = 안전).
		// 로컬(NODE_ENV≠production)은 이 값과 무관하게 아래 파생 상수가 자동 허용한다.
		ALLOW_TEST_IDENTITY_CHANNEL: z.stringbool().default(false),
		// GCS는 개발·테스트에서만 선택 구성이다. 버킷이 비어 있으면 업로드 인텐트가 로컬
		// 플레이스홀더로 폴백하므로, GCP 자격 증명 없이도 개발이 그대로 돌아간다.
		GCP_PROJECT_ID: z.string().min(1).optional(),
		GCS_PUBLIC_BUCKET: z.string().min(1).optional(),
		// 포트원 V2 API Secret(본인인증 단건조회). 개발에서는 선택 — 비어 있으면 회원
		// 본인인증이 목 핸들러(verifyMyPhoneMock)로 폴백한다.
		PORTONE_API_SECRET: z.string().min(1).optional(),
		// 공공데이터포털 "국세청 사업자등록정보 진위확인" 서비스키(디코딩 키를 넣는다 —
		// 인코딩 키를 넣으면 이중 인코딩으로 인증에 실패한다). 프로덕션 포함 선택 값이다 —
		// 공공데이터포털 기업회원 심사 대기로 아직 키가 없다. 비어 있으면 사업자정보 제출 시
		// 진위확인을 건너뛰고(전 건 "미확인" 접수) 운영자 수동 심사만 남으며, 구인자 화면에는
		// "곧 준비될 기능" 안내가 나간다. 키를 넣으면 코드 수정 없이 진위확인이 켜진다.
		NTS_SERVICE_KEY: z.string().min(1).optional(),
		// 게스트 인증 쿠키(HMAC 서명 토큰)의 서명 키. web(web.ts)이 발급한 토큰을 api 서버가
		// 다시 검증하므로 web과 반드시 같은 값이어야 한다 — 어긋나면 비회원 글·댓글·추천이
		// 전부 401이 된다. 개발에서는 선택(양쪽 공용 폴백 키로 떨어진다).
		BAMBI_GUEST_TOKEN_SECRET: z.string().min(32).optional(),
		// better-auth 세션 쿠키 prefix. dev/prod가 같은 apex(.bambialba.com)를 공유하므로
		// 환경별로 다른 값(prod=bambi, dev=bambi-dev)을 줘 쿠키 충돌을 막는다. 미설정(로컬)
		// 이면 better-auth 기본 prefix를 그대로 써 개발 동작이 변하지 않는다.
		BAMBI_COOKIE_PREFIX: z.string().optional(),
		// Google Generative AI(Gemini) 키. /ai 라우트 전용 선택 기능이라 미설정 시 해당
		// 라우트만 실패한다. @ai-sdk/google 기본 provider가 이 값을 env에서 직접 읽는다.
		GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
		// 퀸알바 크롤링용 쿠키 문자열(브라우저 Cookie 헤더 통째). 이 사이트는 전 페이지가
		// KCB 본인확인 성인인증 게이트 뒤에 있어, 인증 세션 쿠키 없이는 어떤 URL도
		// adult_index.php 스텁만 돌려준다. 만료되면 회차가 "게이트에 막혔다"로 실패한다.
		//
		// 선택 값이다. 비워두면 bambi-crawl-ingest.ts의 QUEENALBA_COOKIE_INLINE을 쓴다 —
		// 실제 값에는 인증한 사람의 실명·생년월일·휴대폰번호가 들어 있으므로, 공유 리포나
		// 배포 환경에서는 코드가 아니라 이쪽에 넣는 편이 안전하다(이 값이 코드보다 우선한다).
		QUEENALBA_COOKIE: z.string().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

// 본인인증 테스트 채널 허용 여부의 단일 판정. 통신사 대조를 하지 않는 테스트 채널은
// 이름·생년월일·주민번호를 아무 값이나 통과시키므로, 실서비스 프로덕션에서 허용하면
// 성인·휴대폰 인증 우회와 (비로그인) 아이디/비밀번호 찾기 계정 탈취로 이어진다.
// - 로컬(NODE_ENV≠production): 자동 허용 — 개발자가 별도 플래그를 넣지 않아도 된다.
// - 검증 배포(test.bambialba.com 등, NODE_ENV=production): ALLOW_TEST_IDENTITY_CHANNEL=true로 명시 허용.
// - 실서비스 프로덕션: 플래그를 넣지 않으면 기본 false로 거부된다(default-deny).
// 두 라우터(onboarding·account-recovery)가 이 상수 하나만 쓰도록 여기서 판정한다.
export const isTestIdentityChannelAllowed =
	env.NODE_ENV !== "production" || env.ALLOW_TEST_IDENTITY_CHANNEL;

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

// 서명 키가 없으면 개발 폴백 키로 게스트 토큰을 검증하게 된다 — web이 진짜 키로 서명한
// 토큰이 전부 무효가 되고(비회원 쓰기 401), 반대로 폴백 키를 아는 사람이 신원을 위조할 수
// 있다. web.ts와 같은 가드로 부팅을 실패시킨다.
if (env.NODE_ENV === "production" && !env.BAMBI_GUEST_TOKEN_SECRET) {
	throw new Error(
		"BAMBI_GUEST_TOKEN_SECRET은 프로덕션에서 필수입니다. web과 같은 값을 넣어야 게스트 토큰 서명 검증이 통과합니다."
	);
}
