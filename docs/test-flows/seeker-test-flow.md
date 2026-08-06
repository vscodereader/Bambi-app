# 구직자(Seeker) 테스트 흐름

> 작성 기준: `C:\Users\user\projects\bambi-app` 브랜치 `feat/region-biznum-role-ux` (커밋 `bd7e2e4`) 소스코드.
> 이 문서의 모든 항목은 코드에서 직접 확인한 것만 담았다. `docs/manual/seeker-manual.md`는 낡은 문서이므로 기준으로 삼지 않았고,
> 어긋나는 지점은 **부록**에 "매뉴얼 갱신 필요 항목"으로 모았다.
>
> **API 표기 주의**: 이 리포는 tRPC가 아니라 **oRPC**(`@orpc`)를 쓴다. 클라이언트 호출은 `orpc.bambi.<router>.<procedure>` /
> `client.bambi.<router>.<procedure>` 형태이고, 라우터 등록은 `packages/api/src/routers/bambi/index.ts`다.
> 문서에서는 지시대로 `bambi.<router>.<procedure>` 형식으로 적는다.

---

## 0. 사전 조건

### 0.1 실행 환경 · env

| 구분 | 변수 | 없을 때 동작 | 정의 파일 |
|---|---|---|---|
| web(클라) | `NEXT_PUBLIC_PORTONE_STORE_ID`, `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` | **둘 중 하나라도 비면 본인인증이 목(mock) 폼으로 폴백**. 로그인 화면의 "아이디 찾기 / 비밀번호를 잊으셨나요?" 링크도 **렌더되지 않음** | `packages/env/src/web.ts` |
| web(서버) | `PORTONE_API_SECRET` | 게스트 실인증(`POST /api/guest`)이 **503** | 동일 |
| web(서버) | `BAMBI_GUEST_TOKEN_SECRET` (min 32자) | 개발 폴백 키(`bambi-dev-guest-token-secret-not-for-prod`) 사용 | 동일 |
| server | `BAMBI_GUEST_TOKEN_SECRET` (min 32자) | 개발 폴백 키 사용. web과 값이 어긋나면 게스트 신원(`context.guest`)이 항상 null | `packages/env/src/server.ts` |
| web(서버) | `BAMBI_COOKIE_PREFIX` | better-auth 기본 prefix. 서버(`packages/auth`)와 값이 어긋나면 **세션 판정이 통째로 틀어짐** | 동일 |
| web(클라) | `NEXT_PUBLIC_GCS_PUBLIC_BASE_URL` | 공고 이미지가 샘플 썸네일로 폴백 | 동일 |
| server | `PORTONE_API_SECRET` | 회원 본인인증이 목 핸들러(`verifyMyPhoneMock`)로 폴백 | `packages/env/src/server.ts` |
| server | `DATABASE_URL`, `BETTER_AUTH_SECRET`(min 32), `BETTER_AUTH_URL`, `CORS_ORIGIN` | 필수 | 동일 |
| server | `GCS_PUBLIC_BUCKET`, `GCP_PROJECT_ID` | 업로드 인텐트가 로컬 플레이스홀더로 폴백 | 동일 |

- **프로덕션 빌드 가드**: `NODE_ENV=production`에서 `NEXT_PUBLIC_GCS_PUBLIC_BASE_URL` / 포트원 3종 / `BAMBI_GUEST_TOKEN_SECRET`가 없으면 **빌드가 실패**한다(`packages/env/src/web.ts` 하단). 서버는 `GCS_PUBLIC_BUCKET` / `PORTONE_API_SECRET` 누락 시 **부팅 실패**.
- **목 인증 허용 조건(서버)**: `!PORTONE_API_SECRET && NODE_ENV !== "production"`. 프로덕션·포트원 구성 환경에서는 목 인증이 서버에서 거부된다(`bambi.onboarding.verifyMyPhoneMock`, `POST /api/guest`).

### 0.2 테스트 계정 · 시드

| 계정 | 조건 | 검증 대상 |
|---|---|---|
| A. 구직자(여성, 인증완료) | `bambi_profile.role='job_seeker'`, `gender='female'`, `isPhoneVerified=true`, `status='active'` | 전 기능 정상 경로 + **수다방 입장 가능** |
| B. 구직자(남성, 인증완료) | `gender='male'` | **수다방 입장 차단** 확인 |
| C. 구직자(미인증) | `isPhoneVerified=false`, `gender=null` | 채팅 시작 차단 · 수다방 차단(`notice='unverified'`) |
| D. 구직자(경고) | `status='warned'` | 경고 배너(닫기 가능) |
| E. 구직자(정지) | `status='suspended'` | 정지 배너(닫기 불가) + 대부분 프로시저 FORBIDDEN |
| F. 구인자 | `role='employer'`, 인증 조직 + 결제완료 공개 공고 1건 이상 | 권한 경계 · 채팅 상대역 |
| G. 운영자 | `role='admin'` | 권한 경계 |
| 비회원(게스트) | 세션 없음 + 유효 `bambi_guest` 쿠키 | 목록만 열람 |
| 비로그인(anon) | 세션·쿠키 없음 | 게이트 화면 |

### 0.3 필요한 시드 데이터

- **공개 공고**: `job_post.status='published'` **그리고** `payment_status='paid'`. 둘 중 하나라도 아니면 목록·검색·상세 모두에서 `NOT_FOUND`다(`packages/api/src/routers/bambi/jobs.ts`).
- **인증 업체 공고 / 미인증 업체 공고** 각 1건 이상 — organic 정렬의 1순위 키가 `employer_organization_profile.verification_status='verified'`다.
- **유료 노출 공고**: `exposure_type ∈ {special, urgent, recommended}` + `exposure_ends_at > now` → 상단 섹션 검증. `{premium-banner, left-banner, right-banner}` → 배너 슬롯 검증.
- **수집(크롤링) 공고**: `crawled_job_post.status='active'` + `industry_category/region/shop_name` NOT NULL + 아직 `job_post.crawled_from_id`로 전환되지 않은 행. **사이트 설정 `bambi_site_settings.crawled_job_feed_enabled=true`** 여야 목록에 뜬다.
- **수다방 글**: 게시판별 최소 1건. 수집 커뮤니티 글은 `crawled_community_feed_enabled=true` + `source_posted_at >= now-30일`.
- **면접 확정 채팅방**: 후기 작성 조건(`interview_schedule.status ∈ {confirmed, completed}`)을 만족하는 방 1개.
- **FAQ 엔트리**(`faq_entry.is_published=true`) 및 **금칙어**(`banned_word.is_active=true`) 각 1건 이상.
- **테스트 픽스처 주의**: `organization`·`member` 시드 시 `createdAt`을 수동 지정해야 한다(default 없음).

### 0.4 알아둘 서버 정책 상수

| 정책 | 값 | 파일 |
|---|---|---|
| 채팅 시작 가능 | `status!=='suspended' && isPhoneVerified && jobPostStatus==='published'` | `packages/api/src/services/bambi-policy.ts` (`canStartChat`) |
| 연락처 공개 대상 면접 상태 | `confirmed` 또는 `completed` | 동일 (`isContactRevealEligibleInterviewStatus`) |
| 수다방 입장 | `status!=='suspended' && (role==='admin' \|\| role==='legal_advisor' \|\| gender==='female' \|\| (role==='employer' && isAdvertiser))` | `packages/api/src/services/bambi-community-access.ts` |
| 본인인증 건 유효시간 | **30분**, 1회 소진 | `packages/api/src/services/bambi-identity-ticket.ts` |
| 성인 기준 | 만 **19세** 이상, KST 기준 | `packages/api/src/services/portone-identity.ts` |
| 공개 레이트리밋 | IP당 **시간당 10회**(프로시저별 개별 버킷) | `packages/api/src/index.ts`, `apps/web/src/app/api/guest/route.ts` |
| 탈퇴 보존기간 기본 | **30일** (사이트 설정 우선) | `packages/api/src/services/bambi-policy.ts` |

---

## 1. 진입 · 게이트 · 비회원 둘러보기

### 1.1 비로그인(anon) 방문자 게이트

- **경로**: `/` 또는 임의 경로 (파일: `apps/web/src/proxy.ts`, `apps/web/src/lib/bambi/resolve-gate.ts`)
- **선행 조건**: 세션 쿠키 없음, `bambi_guest` 쿠키 없음
- **절차**:
  1. 브라우저에서 `/` 진입
  2. `/seeker/chats`, `/support`, `/seeker/me` 등 다른 경로도 각각 시도
  3. `/terms`, `/privacy`, `/icon.svg` 도 시도
  4. `/jobs`, `/jobs/seoul`, `/jobs/seoul/room-salon` 도 시도
- **기대 결과**:
  - `/`·`/seeker/chats`·`/support`·`/seeker/me` → **307 리다이렉트 `/seeker?auth=login`**
  - `/seeker` → 리다이렉트 없이 통과(세션 없는 방문자에게 열린 **유일한** 앱 화면)
  - `/terms`, `/privacy`, `/jobs/**`, `/api/*`, `/bambi/*`, 확장자 붙은 정적 파일 → 통과
  - `/seeker`에는 블러 처리된 공고 배경 위에 인증 카드가 뜬다(`apps/web/src/components/bambi/auth/seeker-auth-gate-screen.tsx`). 배경 공고 문자열은 서버에서 마스킹되어 RSC 페이로드에 원문이 실리지 않는다(`apps/web/src/lib/bambi/auth-backdrop.ts`)
  - 배경은 **md 미만에서 숨김**(`hidden md:block`), 푸터는 블러 밖에서 선명·클릭 가능
- **엣지 케이스**:
  - RSC prefetch 요청(`next-router-prefetch` 헤더 또는 `purpose: prefetch`)은 게이트를 건너뛴다 → 한 화면의 다수 `<Link>` prefetch가 307 폭풍을 일으키지 않아야 함
  - 파비콘·OG 이미지 요청이 인증 화면으로 리다이렉트되면 회귀
- **관련 API**: `bambi.jobs.list` (publicProcedure, 배경용 12건)

### 1.2 게스트(본인인증만 마친 비회원) 열람

- **경로**: `/seeker` (파일: `apps/web/src/app/seeker/page.tsx`, `apps/web/src/app/seeker/layout.tsx`)
- **선행 조건**: 1.3 절차로 게스트 쿠키 발급
- **절차**:
  1. 로그인 카드 하단 **[비회원으로 인증하기]** 클릭 → 본인인증(또는 목 폼) 완료
  2. `/seeker` 목록이 뜨는지 확인
  3. 공고 카드 클릭
  4. URL로 `/seeker/chats`, `/seeker/community`, `/seeker/me`, `/support` 직접 진입
  5. URL로 `/` 진입
- **기대 결과**:
  - 2 → 셸(헤더/탭바) 포함 마켓플레이스 목록 노출
  - 3 → 상세로 가지 않고 **`/seeker?auth=signup`** 으로 이동 (`seeker-marketplace.tsx` `openJob`, `seeker-app-shell.tsx` `SeekerHeaderSearch`)
  - 4 → **`/seeker?auth=signup&guestBlocked=1`** 리다이렉트 → 토스트 **"회원가입 후에 볼 수 있어요"** 1회 → URL이 `/seeker?auth=signup`으로 정리됨(`apps/web/src/components/bambi/guest-blocked-toast.tsx`)
  - 5 → `/seeker`로 리다이렉트
  - 게스트가 `?auth=login|signup`을 달고 `/seeker`에 오면 목록 대신 anon과 **동일한 전체화면 게이트**가 뜬다(작은 다이얼로그 아님)
- **엣지 케이스**:
  - `bambi_guest` 쿠키 값을 devtools에서 임의 문자열로 바꾼 뒤 새로고침 → HMAC 서명 검증 실패 → anon으로 강등되어 `/seeker?auth=login`
  - 쿠키 만료(30일) 이후에도 동일
  - 토스트가 새로고침·재렌더로 반복 노출되면 회귀
- **관련 API**: `POST/DELETE /api/guest` (`apps/web/src/app/api/guest/route.ts`), `bambi.onboarding.checkIdentityForSignup` (publicProcedure)

### 1.3 게스트 본인인증(비회원 둘러보기) 발급

- **경로**: `/seeker?auth=login` → [비회원으로 인증하기] (파일: `apps/web/src/components/bambi/auth/auth-panel.tsx`, `apps/web/src/components/bambi/phone-verify-dialog.tsx`)
- **절차(실인증)**:
  1. 버튼 클릭 → `bambi.onboarding.startIdentityVerification`으로 인증 건 ID 발급
  2. 포트원 KCP 인증창(PC=POPUP, 모바일=REDIRECTION)에서 인증 완료
  3. 클라이언트가 `POST /api/guest { identityVerificationId }` 호출
  4. 서버가 `bambi.onboarding.checkIdentityForSignup`으로 진위·연령·재사용을 검증
  5. 통과 시 서명된 `bambi_guest` 쿠키 발급 → `window.location.assign("/seeker")` (하드 내비게이션)
- **절차(목 폼, 포트원 미구성 개발 환경)**: 이름(2자+) / 생년월일(숫자 8자리 YYYYMMDD) / 휴대폰(숫자 10자리+) / 성별(남성·여성) 입력 → [인증하기]
- **기대 결과**: 쿠키 `bambi_guest` (httpOnly=false, secure=true, sameSite=lax, maxAge 30일) 세팅, 값은 `base64url(payload).base64url(HMAC)`, payload는 `{exp, gender, v:2}`. **인증 건 ID는 쿠키에 싣지 않는다.**
- **실패 케이스**:
  | 상황 | 응답 | 사용자 메시지 |
  |---|---|---|
  | 만 19세 미만 | 403 `{code:"underage"}` | "만 19세 이상만 이용할 수 있어요." |
  | 인증 건 만료(30분 초과)·재사용 | 400 | "본인인증 정보가 만료되었거나 이미 사용되었어요. 다시 인증해 주세요." |
  | 인증 미완료(status≠VERIFIED) | 400 | "본인인증이 완료되지 않았습니다. 다시 시도해 주세요." |
  | `PORTONE_API_SECRET` 미설정 | 503 | — |
  | 포트원/서버 장애 | 502 | — |
  | IP당 시간당 10회 초과 | **429** | — |
  | 프로덕션에서 목 payload 전송 | 400 | — |
  | 테스트 채널(`channel.type==='TEST'`)을 프로덕션에서 사용 | 500 | "본인인증이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요." |
- **관련 API**: `bambi.onboarding.startIdentityVerification` (rateLimitedPublicProcedure), `bambi.onboarding.checkIdentityForSignup` (publicProcedure)

---

## 2. 회원가입 · 로그인 · 계정복구

### 2.1 회원가입 1단계 — 본인인증

- **경로**: `/seeker?auth=signup` (파일: `apps/web/src/components/bambi/auth/auth-panel.tsx`, `.../auth-verify-step.tsx`)
- **선행 조건**: 비로그인
- **절차**:
  1. 로그인 카드에서 "회원가입" 텍스트 링크 클릭(또는 `?auth=signup`으로 직접 진입)
  2. 헤더에 단계 표시 `① 본인인증 — ② 정보 입력`(현재=1), 제목 "밤비알바 계정 만들기" 확인
  3. **[본인인증하고 계속하기]** 클릭 → 인증 완료
- **기대 결과**:
  - 이 단계에는 **가입 폼 필드가 하나도 없다**. 인증을 마쳐야만 2단계가 열린다(우회 UI 없음)
  - 인증 성공 → `bambi.onboarding.checkIdentityForSignup` → `hasAccount=false`이면 `POST /api/guest` 후 2단계로 전환
  - 카드 하단에 **19금 고지**(`AdultNotice`)가 로그인·회원가입 모든 단계에서 상시 노출. 이것은 클릭 단계가 아니라 **정적 고지**다
- **엣지 케이스**:
  - **이미 가입된 명의**(CI/DI 해시 충돌) → 모드가 **로그인으로 자동 전환**되고 에러 문구 "이미 가입된 계정이 있어요. 로그인해 주세요."
  - **새로고침** → `step` 초기값이 `"verify"`라 인증 단계로 되돌아간다(인증 건 ID를 보관하지 않으므로 의도된 동작)
  - **모바일 리디렉션 복귀**: `redirectUrl = window.location.href`. `?auth=login`에서 모드만 토글해 회원가입에 들어간 경우 복귀 URL에 `auth=login`이 남아 **로그인 모드로 돌아올 수 있다** → 실기기 필수 검증 항목
  - 같은 화면에 인증 버튼이 둘일 때 `intent`(`auth-panel:guest` vs `auth-panel:signup`)로 처리 주체를 가른다 → 복귀 후 엉뚱한 버튼이 결과를 가로채면 회귀
- **관련 API**: `bambi.onboarding.startIdentityVerification`, `bambi.onboarding.checkIdentityForSignup`

### 2.2 회원가입 2단계 — 정보 입력

- **경로**: 동일 (파일: `apps/web/src/components/bambi/auth/auth-fields.tsx`)
- **입력 필드**:

| 순서 | 라벨 | id | placeholder | 클라이언트 검증 |
|---|---|---|---|---|
| 1 | 닉네임 | `auth-nickname` | 예: 밤비알바 구직자 | `trim().length >= 2` |
| 2 | 아이디 | `auth-username` | 영문·숫자 3자 이상 | `trim().length >= 3` |
| 3 | 비밀번호 | `auth-password` | 비밀번호를 입력해주세요. | `length >= 8` |
| 4 | 비밀번호 확인 | `auth-password-confirm` | 비밀번호를 다시 입력해주세요. | `password === passwordConfirm` |
| 5 | 이메일 | `auth-email` | 이메일을 입력해주세요. | `includes("@")` |
| 6 | 가입 유형 | ToggleGroup | — | **개인회원**(`job_seeker`, 기본) / 업소회원(`employer`) |
| 7 | 약관 동의 | Checkbox `auth-agree-terms` | — | 기본 미체크, 필수 |

- **절차**: 값 입력 → 약관 체크 → **[회원가입]**
- **기대 결과**:
  1. `authClient.signUp.email({ email, name: 닉네임, password, username })` — **닉네임은 `user.name`에 저장되고 프로필 테이블에는 들어가지 않는다**
  2. 성공 콜백에서 게스트 쿠키의 성별을 먼저 읽고 → `DELETE /api/guest`로 게스트 권한 회수
  3. `bambi.onboarding.createJobSeekerProfile({ gender?, identityVerificationId? })` 호출 → 프로필 생성 + 인증 건 **최종 소진**
  4. `bambi.onboarding.recordLegalConsent()` (실패는 무시됨)
  5. `router.push("/seeker")` — **역할과 무관하게 구직자 홈으로 진입**
- **실패 케이스 / 메시지**:
  | 상황 | 메시지 | 표시 방식 |
  |---|---|---|
  | 닉네임 2자 미만 | "닉네임을 2자 이상 입력해 주세요." | 인라인 notice |
  | 아이디 3자 미만 | "아이디를 3자 이상 입력해 주세요." | 인라인 |
  | 이메일에 @ 없음 또는 비번 8자 미만 | "이메일과 8자 이상 비밀번호를 확인해 주세요." | 인라인 |
  | 비번 불일치 | "비밀번호가 일치하지 않아요." | 인라인 |
  | 약관 미동의 | "이용약관과 개인정보 처리방침에 동의해주세요" | **sonner 토스트** |
  | 이메일 중복 | "이미 가입된 이메일이에요." | 인라인(better-auth ko 사전) |
  | 아이디 중복 | "이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요." | 인라인 |
  | 아이디에 특수문자/한글 | better-auth `INVALID_USERNAME` (기본 검증: 영숫자+`_`, 3~30자) | 인라인 |
  | 프로필 생성 실패 | 서버 메시지 또는 "프로필 생성에 실패했어요." | 인라인 |
  | 포트원 구성 환경인데 인증 건 없음 | "본인인증을 먼저 완료해 주세요." (`BAD_REQUEST`) | 인라인 |
  | 명의 중복(경합) | "이미 다른 계정에서 본인인증에 사용된 정보예요." (`CONFLICT`) | 인라인 |
- **검증 포인트**: 이용약관/개인정보 처리방침 링크는 `target="_blank"`로 `/terms`, `/privacy`를 연다. 동의 이력은 `bambi_legal_consent`에 버전 `2026-07-27` 2행으로 쌓인다(중복 저장은 unique index로 무시).
- **관련 API**: `bambi.onboarding.createJobSeekerProfile` (protected), `bambi.onboarding.recordLegalConsent` (protected)

### 2.3 로그인

- **경로**: `/seeker?auth=login` (파일: `apps/web/src/components/bambi/auth/auth-fields.tsx` `AuthSigninFields`, `apps/web/src/lib/bambi/login-id.ts`)
- **입력 필드**: 아이디(`auth-login-id`, placeholder "아이디(이메일)를 입력해주세요.", **type=text**), 비밀번호(표시 토글 눈 아이콘)
- **절차**:
  1. 아이디로 로그인 → `isEmailLoginId()`가 `@` 미포함 판정 → `authClient.signIn.username`
  2. 이메일로 로그인 → `@` 포함 → `authClient.signIn.email`
  3. 성공 후 이동 확인
- **기대 결과**:
  - 성공 시 게스트 쿠키를 회수한 뒤 **`window.location.assign("/")`** (하드 내비게이션으로 Router Cache 우회) → `/`가 `redirectToRoleHome()`으로 `/seeker` 이동
  - 아이디·이메일 어느 쪽으로도 같은 계정에 들어갈 수 있어야 함
- **실패 케이스**:
  | 상황 | 메시지 |
  |---|---|
  | 아이디 공란 또는 비번 8자 미만 | "아이디(이메일)와 8자 이상 비밀번호를 확인해 주세요." (클라이언트) |
  | 아이디/이메일 또는 비번 오류 | **"아이디(이메일) 또는 비밀번호가 틀렸습니다."** (두 경우 동일 문구 — 계정 존재 여부 오라클 방지) |
  | 탈퇴 계정 | "탈퇴한 계정이에요. 로그인할 수 없어요." (`packages/auth/src/index.ts` 세션 생성 훅) |
  | 세션 만료 | "로그인이 만료됐어요. 다시 로그인해 주세요." |
- **회귀 포인트**: 재로그인이 "간혹 되고 간혹 안 되는" 문제(Router Cache stale) — 하드 내비게이션이 유지되는지 확인
- **관련 API**: better-auth `signIn.email` / `signIn.username` (`packages/auth/src/index.ts`, username 플러그인 → `user.login_id`/`user.login_id_display` 매핑)

### 2.4 아이디 찾기

- **경로**: 로그인 폼 아이디 라벨 우측 **"아이디 찾기"** (파일: `apps/web/src/components/bambi/auth/account-recovery-dialog.tsx`)
- **선행 조건**: `NEXT_PUBLIC_PORTONE_STORE_ID` + `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` 구성. **미구성이면 링크 자체가 렌더되지 않는다**(목 인증에는 CI/DI가 없어 계정 특정 불가)
- **절차**: 링크 클릭 → 포트원 인증창 → 인증 완료 → 결과 모달
- **기대 결과**:
  | 결과 | 모달 제목 | 동작 |
  |---|---|---|
  | 계정 있음 + `login_id` 있음 | "가입된 아이디" | 아이디 **마스킹 없이 표시**, [이 아이디로 로그인] → 로그인 모드 전환 + 아이디 자동 입력 |
  | 계정 있음 + `login_id` 없음 | "이메일로 가입된 계정이에요" | [닫기]만 |
  | 계정 없음 | "가입된 계정이 없어요" | [회원가입 하러 가기] → 회원가입 모드 |
- **엣지 케이스**:
  - 프로필의 `birth_date`가 인증 결과 `birth8`과 다르면 → **"계정 없음"과 완전히 동일한 응답**(오라클 방지)
  - 성별도 마찬가지(양쪽 모두 non-null일 때만 대조)
  - DI 매칭 프로필과 CI만 저장된 옛 프로필이 **서로 다른 사용자면 2건 매칭** → 계정 없음으로 처리(수동 확인 대상)
  - 탈퇴 계정(`user.deletedAt` 있음)은 제외
  - IP당 시간당 10회 초과 → "요청이 너무 많아요. 잠시 후 다시 시도해 주세요."
- **관련 API**: `bambi.accountRecovery.lookupAccountByIdentity` (**rateLimitedPublicProcedure**, `packages/api/src/routers/bambi/account-recovery.ts`)

### 2.5 비밀번호 재설정

- **경로**: 로그인 폼 비밀번호 라벨 우측 **"비밀번호를 잊으셨나요?"** (파일: 동일)
- **절차**:
  1. 링크 클릭 → 인증창 → 인증 완료
  2. 내부적으로 `lookupAccountByIdentity`를 먼저 호출해 계정 존재 확인(인증 건은 아직 소진되지 않음)
  3. 모달 "비밀번호 재설정"에서 **새 비밀번호**(`recovery-new-password`) / **새 비밀번호 확인** 입력 → [확인]
- **기대 결과**:
  - 성공 → "비밀번호가 변경되었어요" 화면, "이 창은 5초 뒤 자동으로 닫혀요." → **5초 후 자동 닫힘**
  - **해당 사용자의 모든 기기 세션이 삭제**된다(`internalAdapter.deleteSessions`)
  - 새 비밀번호로만 로그인 가능
- **실패 케이스**:
  | 상황 | 메시지 |
  |---|---|
  | 8자 미만 | "비밀번호를 8자 이상 입력해 주세요." (클라) / 서버 "비밀번호는 8자 이상이어야 해요." |
  | 128자 초과 | "비밀번호는 128자 이하여야 해요." |
  | 확인 불일치 | "비밀번호가 일치하지 않아요." |
  | 계정 없음 | "본인인증 정보와 일치하는 계정을 찾을 수 없어요." (`NOT_FOUND`) |
  | 서버 실패 | "비밀번호를 변경하지 못했어요. 다시 시도해 주세요." |
  | 같은 인증 건으로 재시도 | 인증 건이 **소진**되어 "본인인증 정보가 만료되었거나 이미 사용되었어요." |
- **관련 API**: `bambi.accountRecovery.resetPasswordByIdentity` (**rateLimitedPublicProcedure**)

### 2.6 로그아웃

- **경로**: `/seeker/me` 사이드바 하단(데스크톱) 또는 `/seeker/me/settings` 하단(모바일 전용 `md:hidden`) (파일: `apps/web/src/lib/bambi/auth-actions.ts`)
- **절차**: [로그아웃] 클릭
- **기대 결과**: `authClient.signOut()` → `DELETE /api/guest`로 게스트 쿠키·레거시 쿠키(`adultname/adultbrith/adultphone/adultsex/adultcode`) 만료 → `/`로 이동 → 게이트가 `/seeker?auth=login`으로 보냄
- **엣지 케이스**: 로그아웃 진행 중에 `RequireAuth`가 "로그인이 필요해요" 토스트를 띄우면 회귀(`isSigningOut()` 억제 로직)
- **실패 케이스**: 실패 시 토스트 "로그아웃에 실패했어요. 다시 시도해 주세요."

---

## 3. 본인인증(재인증) · 계정 상태

### 3.1 마이페이지에서 휴대폰 본인인증

- **경로**: `/seeker/me/settings` → "본인인증" 카드 (파일: `apps/web/src/components/bambi/screens/account-settings-screen.tsx`, `apps/web/src/components/bambi/use-portone-verification.ts`)
- **절차**: 버튼(미인증="휴대폰 인증하기" / 인증완료="휴대폰 재인증") 클릭 → 포트원 인증창 → 완료
- **기대 결과**:
  - 배지가 `인증 필요` → `인증완료`로 바뀌고 "인증된 번호"가 표시됨
  - "기본 정보" 카드의 성별·생년월일이 인증 결과로 채워짐(생년월일은 `YYYYMMDD` → `YYYY.MM.DD` 표시)
  - 성별은 **기존 값이 있으면 유지**(`identity.gender ?? existingProfile.gender`)
- **실패 케이스**:
  | 상황 | 응답 |
  |---|---|
  | 만 19세 미만 | `FORBIDDEN` "만 19세 이상만 이용할 수 있어요." |
  | 이미 다른 계정에서 인증한 명의(CI/DI 충돌) | `CONFLICT` "이미 다른 계정에서 본인인증에 사용된 정보예요." |
  | CI 없음 / DI 없음 | `BAD_REQUEST` "인증 정보에 개인 식별값(CI)이 없습니다." / "…중복확인 식별값(DI)이 없습니다." |
  | 인증 건 만료·재사용 | `BAD_REQUEST` "본인인증 정보가 만료되었거나 이미 사용되었어요. 다시 인증해 주세요." |
  | 포트원 미구성 서버 | `INTERNAL_SERVER_ERROR` "본인인증이 아직 구성되지 않았습니다." |
  | 목 인증을 프로덕션/포트원 구성 환경에서 호출 | `FORBIDDEN` "목 인증은 포트원 미구성 개발 환경에서만 사용할 수 있습니다." |
- **관련 API**: `bambi.onboarding.verifyMyPhone` (protected), `bambi.onboarding.verifyMyPhoneMock` (protected, 개발 전용), `bambi.onboarding.startIdentityVerification` (rateLimitedPublic)

### 3.2 계정 상태 배너(경고·정지)

- **경로**: `/seeker/**` 전 화면 상단 (파일: `apps/web/src/components/bambi/account-status-banner.tsx`, `apps/web/src/components/bambi/seeker-shell.tsx`)
- **선행 조건**: 운영자가 `bambi.moderation.setUserStatus`로 `warned` / `suspended` 설정
- **기대 결과**:
  | 상태 | 배너 | 닫기 |
  |---|---|---|
  | `active` | 없음 | — |
  | `warned` | warning "운영자 경고를 받았어요" + "사유: {reason}" | **가능** (X 버튼) |
  | `suspended` | destructive "계정 이용이 정지되었어요" + 사유 | **불가(상시 노출)** |
  - 사유는 별도 알림 테이블이 아니라 `admin_moderation_action`의 최신 `set_status:{status}` 행에서 온다
  - 경고 닫힘은 `localStorage['bambi:warned-banner-dismissed:{userId}:{sanctionCreatedAt}']`에 저장 → **새 경고(제재 시각 변경)면 다시 노출**
- **엣지 케이스**: 배너는 `SeekerShell` 안에만 있으므로 `/support`, `/terms`, `/privacy`, `/employer`, `/moderator`에서는 보이지 않는다
- **정지 계정 실동작**: `requireActiveBambiProfile`을 쓰는 **모든** 프로시저가 `FORBIDDEN` → 채팅·신고·차단·후기·커뮤니티·**고객센터 문의·FAQ까지 전부 막힘**
- **관련 API**: `bambi.onboarding.getMine` (protected, `accountSanction` 필드)

---

## 4. 공고 탐색 · 검색 · 필터

### 4.1 마켓플레이스 목록 기본

- **경로**: `/seeker` (파일: `apps/web/src/app/seeker/page.tsx`, `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`, `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`)
- **절차**: 로그인 후 `/seeker` 진입
- **기대 결과 — 섹션 렌더 순서**:
  1. 상단 프리미엄 배너 3칸 (`PremiumAdBannerSection`)
  2. **스페셜 채용** (`{n}개 · 스페셜 광고`, 빈 칸은 "광고 모집중" 자리표시)
  3. **급구 채용** (`· 급구 광고`, 자리표시)
  4. **커뮤니티 슬롯** (`HomeCommunitySection`)
  5. **추천 채용** (`· 추천 광고`, 자리표시)
  6. **전체 공고** (`· 최신순`, 자리표시 없음)
  7. **[공고 더보기]** 버튼
  - 초광폭(`min-[1720px]`)에서만 좌(가로형)·우(세로형) 광고 레일 노출
  - 헤더 "추천 공고 / {N}개 · 실시간"의 N은 **조건에 맞는 전체 건수**(로드된 수 아님)
- **엣지 케이스**:
  - 결과 0건 → "조건에 맞는 공고가 없어요 / 지역이나 최소 급여 조건을 조금 낮춰보세요"
  - 첫 로딩 → 4개 섹션 골격 스켈레톤
  - 좌우 aside는 판매된 배너가 없어도 폭을 그대로 차지해야 함(한쪽만 렌더하면 중앙 콘텐츠가 헤더·푸터와 어긋남 — 과거 회귀 지점)
- **관련 API**: `bambi.jobs.list` (**publicProcedure**), `bambi.jobs.listAdBanners` (publicProcedure)

### 4.2 검색

- **경로**: 데스크톱 헤더 돋보기 버튼(`/seeker`에서만) 또는 본문 검색 필드(모바일) (파일: `apps/web/src/components/bambi/job-search-command.tsx`)
- **절차**:
  1. 돋보기 클릭 또는 `Ctrl+K` / `⌘K`
  2. 업종·지역·공고 제목·업체명으로 검색
  3. 결과 클릭
- **기대 결과**:
  - **모달(CommandDialog)** 이 열린다(인라인 타이핑 아님)
  - 250ms 디바운스, 빈 검색어는 서버 미조회
  - 검색 대상: 우리 공고 = `title / 조직 displayName / region / district`, 수집 공고 = `title / shopName / region / district / industryRaw`
  - 결과 순서: 우리 공고 먼저 → 수집 공고
  - 결과 클릭 → 게스트면 `/seeker?auth=signup`, 수집이면 `/seeker/jobs/crawled/{id}`, 아니면 `/seeker/jobs/{id}`
- **엣지 케이스**:
  - `%`, `_`, `\` 를 검색어에 넣어도 와일드카드로 동작하지 않아야 한다(`escapeLikePattern`) — `%` 하나로 전량 조회되면 회귀
  - 상태 문구: 빈 입력 "검색어를 입력해 주세요" / 에러 "검색에 실패했어요 + 다시 시도" / "검색 결과가 없어요"
  - 검색 결과에는 HIT 리본이 뜨지 않는다(성과 0으로 채움)
- **관련 API**: `bambi.jobs.search` (**publicProcedure**, `{query: 1~100자, limit: 1~20}`)

### 4.3 탐색 탭 · 필터

- **경로**: `/seeker` (파일: `apps/web/src/components/bambi/marketplace.tsx`, `apps/web/src/lib/bambi/marketplace.ts`)
- **탐색 탭**: 전체 / 지역별 / 업종별 (활성), **지도 · 오늘 본 공고는 `disabled: true`**
- **필터 항목**:

| 필터 | 컨트롤 | 옵션 | 서버 전달 |
|---|---|---|---|
| 지역 | Select | "전체" + `bambi.regions.list` 시/도 (value=법정동코드 10자리) | `regionCode` |
| 세부지역 | Select (시/도 미선택 시 disabled) | "전체" + 해당 시/도의 시군구 | `districtCode` |
| 업종 | Select | 전체 / **룸싸롱 / 텐프로·쩜오 / 노래주점 / 단란주점 / 다방 / BAR / 마사지 / 요정 / 기타** (DB enum `job_industry_category`와 1:1) | `industryCategory` |
| 최소 시급 | number Input (예: 17000) | 양수만 유효 | `minPayAmount` |
| 검증 완료 | Checkbox / 칩 | boolean | **전달 안 함(클라이언트 필터)** |
| 당일면접 가능 | Checkbox / 칩 | boolean | **전달 안 함** |
| 초보 가능 | Checkbox / 칩 | boolean | **전달 안 함** |

- **절차**:
  1. "지역별" 탭 → 시/도 칩 선택 → 목록 변화 확인
  2. "업종별" 탭으로 전환 → **지역 축이 "전체"로 리셋**되는지 확인(축 배타성, `applyDiscoveryAxis`)
  3. 최소 시급 17000 입력 → 일급/주급/월급 공고가 시급 환산(일급×8, 주급×40, 월급×209)으로 비교되는지 확인
  4. 모바일에서 [필터] 버튼 → 활성 필터 개수 배지 확인 → 시트에서 설정
  5. 시/도 변경 시 세부지역이 자동 "전체"로 리셋되는지 확인
- **엣지 케이스**:
  - **필터는 URL 쿼리에 동기화되지 않는다** → 새로고침·뒤로가기 시 초기화(현행 동작)
  - 로컬 전용 필터(검증/당일/초보)를 켜면 헤더 개수가 전체 건수 대신 **화면에 남은 개수**로 바뀐다
  - "급여 협의"처럼 금액을 못 읽는 공고는 최소 시급 하한을 걸면 탈락, 하한 0이면 남는다
- **관련 API**: `bambi.jobs.list` (publicProcedure), `bambi.regions.list` (**publicProcedure**, `packages/api/src/routers/bambi/regions.ts`)

### 4.4 페이지네이션 · 정렬

- **경로**: `/seeker` 하단 [공고 더보기]
- **절차**: 버튼을 끝까지 눌러 목록을 소진
- **기대 결과**:
  - **무한스크롤이 아니라 버튼**. 첫 페이지 `limit=30`, 더보기부터 `limit=50`(서버 max 50)
  - 커서는 `organicOffset: {jobPost, crawled}` 두 축. 응답의 `nextOrganicOffset`을 그대로 되돌려 보낸다. `null`이면 버튼이 사라진다
  - **스페셜·급구·추천 섹션은 1페이지 응답으로 고정**, 2페이지부터는 전체 공고만 이어 받는다
  - 정렬(전체 공고): **인증업체 우선 → `greatest(boosted_at, published_at)` DESC → id DESC**. 사용자가 고르는 정렬 UI는 **없음**
  - 수집 공고는 항상 각 블록의 **뒤에** 붙는다
- **엣지 케이스**: 로컬 전용 필터를 켠 상태에서 더보기를 누르면 페이지마다 남는 건수가 들쭉날쭉하다(서버가 그 조건을 모름)
- **관련 API**: `bambi.jobs.list`

### 4.5 공고 카드

- **파일**: `apps/web/src/components/bambi/visual-job-card.tsx`, `apps/web/src/components/bambi/job-cover-image.tsx`
- **표시 항목**: 커버 이미지(없으면 회사명 앞 2글자 타일) / 회사명(`teamDisplayName ?? employerDisplayName ?? "검증 업체"`, 수집은 `shopName`) / `{지역 · 세부지역} · {업종}` / 급여(단위 Badge + 코럴 금액, 없으면 "급여 협의") / **HIT 리본**
- **카드에 없는 것**: 후기 별점·개수, 태그, 채팅 버튼, 인증 배지, **수집 공고 표시**, **찜/스크랩 버튼**
- **등급별 색**: special=코럴, urgent=앰버, recommended=스카이, organic=회색 테두리
- **HIT 리본 조건**(`apps/web/src/lib/bambi/job-hit.ts`): 최근 7일 `detailViews >= 100` **또는** (`impressions >= 200` 그리고 CTR ≥ 0.12). **organic 카드에는 리본이 뜨지 않는다**
- **엣지 케이스**: 이미지 로드 실패 → 결정적 샘플 썸네일 폴백

### 4.6 스크랩 / 찜 / 최근 본 공고 — **코드에 없음**

- 저장/찜/북마크 관련 **프로시저·DB 테이블·컬럼이 존재하지 않는다**.
- 흔적 2곳은 모두 미사용 프로토타입: `apps/web/src/components/bambi/screens/seeker.tsx`의 `SeekerDetail` 북마크 상태(`SeekerPersona` = `/preview` 데모 전용), `apps/web/src/components/bambi/ds.tsx`의 `DEFAULT_NAV_ITEMS` "저장" 탭(실제 탭바는 별도 목록 사용).
- 탐색 탭 "오늘 본 공고"도 `disabled: true`.
- → **QA 범위에서 제외.**

---

## 5. 공고 상세

### 5.1 우리 공고 상세

- **경로**: `/seeker/jobs/[id]` (파일: `apps/web/src/app/seeker/jobs/[id]/page.tsx`, `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`)
- **선행 조건**: 로그인(게스트·비로그인은 게이트가 막음), 대상 공고가 `published` + `paid`
- **절차**: 목록 카드 클릭 → 상세 진입
- **기대 결과 — 섹션 전부**:
  1. 상단 버튼 줄: `목록으로`, `공고 신고`(**lg 미만에서만**)
  2. 배지: `검수 통과한 공고`, `연락처 보호` (**하드코딩 — 공고 데이터와 무관**)
  3. 제목 `{회사} {제목}`, 부제 `{지역} · {업종}`
  4. InfoTile: 급여(+`{연도}년 최저시급 {금액}원`) / 근무시간(없으면 "채팅으로 확인") / **구인자 연락처**(작성자가 `isPhoneVerified`일 때, `tel:` 링크) / 고용형태 / 후기 `{n}개 · {평점 또는 신규}`
  5. 공고 설명: `descriptionBlocks`(heading/bullet_list/callout/paragraph) 우선, 없으면 텍스트. 이어서 상세 이미지 세로 나열(**커버 이미지는 상세에 노출하지 않음**)
  6. 안전 확인 3카드: 연락처 비공개 / 공고 검수 / 신고 가능
  7. 후기 섹션
  8. 데스크톱 우측 sticky aside: `검증 완료` 배지 + 급여 + 지역 + 근무시간 + `1:1 채팅 시작` + `공고 신고`
  9. 모바일 하단 고정 바: `1:1 채팅 시작`
  - 상세 진입 시 항상 **스크롤 최상단**으로 이동(`window.scrollTo(0,0)`, 재실행 키 = `id`)
- **버튼 전부**: `목록으로`, `공고 신고`(최대 2곳), `1:1 채팅 시작`(2곳), 전화 링크, `후기 더보기`. **공유·스크랩·지원하기 버튼은 없음**(채팅이 지원 경로)
- **역할별 차이**:
  | 뷰어 | 채팅 CTA | 신고 | 후기 |
  |---|---|---|---|
  | 구직자 | 노출 | 노출 | 정상 |
  | 구인자 | **숨김**(하단 고정 바 자체가 사라지고 여백이 `pb-28`→`pb-5`) | 노출·작동 | 정상 |
  | 운영자 | 숨김 | 노출·작동 | 정상 |
  | 역할 로딩 중(`role===null`) | 숨김(안전 측) | 노출 | — |
  | 차단한 구인자의 공고 | CTA 자리에 "차단한 상대의 공고입니다 + 차단 관리 링크" | 노출 | 정상 |
- **실패 케이스**:
  - id가 UUID가 아니면 서버 조회 없이 `notFound()`
  - `status!=='published'` 또는 `paymentStatus!=='paid'` → 서버 `NOT_FOUND` → 404
  - 조회 실패 시 amber 배너 "실제 공고 상세를 불러오지 못했어요." + [다시 연결]
- **관련 API**: `bambi.jobs.getById` (**publicProcedure**, `packages/api/src/routers/bambi/jobs.ts`), `bambi.reviews.listByJobPost` (protected), `bambi.blocks.listMine` (protected), `bambi.siteSettings.getFooter` (publicProcedure, 최저시급)

### 5.2 수집(크롤링) 공고 상세

- **경로**: `/seeker/jobs/crawled/[id]` (파일: `apps/web/src/app/seeker/jobs/crawled/[id]/page.tsx`, `apps/web/src/components/bambi/screens/seeker-crawled-job-detail.tsx`)
- **선행 조건**: `crawled_job_post.status='active'`, 사이트 설정 `crawled_job_feed_enabled=true`
- **우리 공고와의 차이**:
  | 항목 | 수집 공고 |
  |---|---|
  | 상단 안내 | **경고 Alert** "외부에서 수집된 공고예요 … 채팅·지원은 제공되지 않으니 조건은 반드시 원본 게시자에게 직접 확인해 주세요." |
  | 배지 | `외부 수집 공고` 1개 |
  | **원본(외부) 링크** | **없음** — `sourceUrl`은 공개 컬럼에서 의도적으로 제외(그 링크가 담당자명·카톡·사업자명·주소로 가는 우회로라서) |
  | 채팅/지원 | **없음** |
  | 신고 | **없음** — aside에 "밤비알바가 검수한 공고가 아니어서 신고 접수 대상이 아니에요" |
  | 후기 | API 호출 없는 정적 0개 블록 + "외부 수집 공고는 밤비알바 채팅·면접을 거치지 않아 후기가 쌓이지 않아요" |
  | 후기 타일 | 항상 `0개 · 신규` |
  | 연락처 | `contactPhone` **자동 노출**(우리 공고와 동일한 타일 재사용) |
  | 급여 | `payAmount` 있으면 조립, 없으면 **원문 `payRaw`**("면접 후 협의" 등), 없으면 "급여 협의" |
  | 근무시간 | 값 있을 때만 |
  | 안전 확인 3카드 | 외부 수집 공고 / 조건 직접 확인 / 안전 이용 수칙 |
- **실패 케이스**: id가 UUID 아님 → `notFound()`. `status!=='active'`(needs_review/expired/removed) → 서버 `NOT_FOUND` → 404
- **엣지 케이스**: `crawled_job_feed_enabled=false`로 바꾸면 목록·검색에서 수집 공고가 0건이 되지만 **상세 URL 직접 접근은 여전히 열린다**(상세는 스위치를 보지 않음)
- **관련 API**: `bambi.crawledJobs.getById` (**publicProcedure**, `packages/api/src/routers/bambi/crawled-jobs.ts`)

---

## 6. 채팅 시작(지원) 프리플라이트

### 6.1 프리플라이트 화면

- **경로**: `/seeker/jobs/[id]/chat` (파일: `apps/web/src/app/seeker/jobs/[id]/chat/page.tsx`, `.../chat/layout.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-preflight.tsx`)
- **선행 조건**: 로그인 + `role='job_seeker'` (서버 레이아웃 `enforceJobSeekerAccess()`가 렌더 전에 막음)
- **절차**: 공고 상세에서 [1:1 채팅 시작] → 프리플라이트 진입 → [밤비알바 채팅으로 이동]
- **기대 결과 — 보호 체크 4항목**:
  | 라벨 | 판정 근거 | 상태값 |
  |---|---|---|
  | 로그인 상태 | 세션 | `확인됨` / `필요` |
  | 구직자 프로필 | `getMine().bambiProfile.role==='job_seeker'` | `확인됨` / `필요` |
  | 휴대폰 인증 | `bambiProfile.isPhoneVerified` | `확인됨` / `확인 필요` |
  | 공고 안전 상태 | id가 UUID인지 | `확인됨` / `샘플` |
  - **입력 필드가 0개다.** 첫 메시지 템플릿·이력서 첨부·동의 체크박스 모두 **없음**
  - 통과 시 `bambi.chats.startFromJobPost` → `/seeker/chats/{roomId}` 이동
- **실패 케이스**:
  | 상황 | 결과 |
  |---|---|
  | 미로그인 | `/seeker?auth=login`으로 이동 |
  | 프로필 조회 미완 | 피드백 "구직자 프로필을 확인하는 중이에요. 잠시 후 다시 눌러 주세요." |
  | 휴대폰 미인증 | 피드백 "휴대폰 인증을 완료한 뒤 채팅을 시작할 수 있어요." |
  | 차단한 구인자 | CTA 비활성 + 라벨 "차단한 상대의 공고입니다" + "마이페이지 > 차단한 상대에서 해제할 수 있어요." |
  | 서버 `UNAUTHORIZED` | "로그인 후 채팅을 시작할 수 있어요." |
  | 서버 `FORBIDDEN` | "채팅을 시작할 수 없어요. 구직자 프로필, 휴대폰 인증, 계정 상태를 확인해 주세요." |
  | 그 외 | "채팅방을 만들지 못했어요. 잠시 후 다시 시도해 주세요." |
- **서버 검증 순서**(`bambi.chats.startFromJobPost`): `requireActiveBambiProfile`(정지 차단) → `role==='job_seeker'` → 공고 존재 → **자기 공고 금지** → `canStartChat(status/isPhoneVerified/jobPostStatus)` → `chat_room` insert(`onConflictDoNothing(jobPostId, jobSeekerUserId)`)
- **엣지 케이스**:
  - **공고당 구직자 1방 멱등** — 같은 공고로 다시 시작해도 기존 방이 반환된다
  - 신규 생성 시에만 `job_performance_event(chat_start)` 기록
  - **생성 직후 방에는 메시지가 0건이라 채팅 목록에 뜨지 않는다**(방 URL로는 진입 가능)
  - 구인자·운영자가 URL로 직접 진입 → 레이아웃 가드가 각자 홈(`/employer`·`/moderator`)으로 리다이렉트
- **관련 API**: `bambi.chats.startFromJobPost` (protected), `bambi.onboarding.getMine` (protected), `bambi.blocks.listMine` (protected)

---

## 7. 채팅

### 7.1 채팅 목록

- **경로**: `/seeker/chats` (파일: `apps/web/src/app/seeker/chats/page.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`)
- **선행 조건**: 로그인. **역할 게이트 없음** — 구인자·운영자도 진입 가능
- **기대 결과 — 항목당 표시**: 공고 제목 / 상대 이름(구직자 뷰: 팀 프로필 → 조직 프로필 → 구인자 `user.name` 폴백) / 마지막 메시지 / 최근 업데이트(md 이상) / `대화 가능`·`차단됨` 배지 / `N개 미확인` 배지 / `신고 완료 · 조치 대기 중` 배지
- **정렬·필터**: `chat_room.updatedAt DESC`. 본인 측 소프트삭제(`seekerDeletedAt`) 방 제외. **메시지 0건 방 제외**
- **케밥 메뉴**:
  - `신고` — **뷰어가 그 방의 구직자일 때만 노출**(`room.counterpartUserId === room.employerUserId`)
  - `차단` — **확인 단계 없이 즉시 실행**
  - `삭제` — **확인 단계 없이 즉시 실행**(소프트삭제)
- **차단된 방**: 열기 버튼 자체가 렌더되지 않음, 상대명·마지막 메시지 `blur-sm` + `aria-hidden`, "차단된 채팅입니다." 오버레이, 케밥은 **삭제만**
- **빈/오류 상태**: 빈 → "진행 중인 채팅이 없어요 / 관심 있는 공고에서 채팅을 시작하면 여기에 표시됩니다." · 오류 → amber 배너 "실제 채팅 목록을 불러오지 못해 샘플 대화를 표시하고 있어요." + [다시 연결] + 프로토타입 목업 목록
- **실시간**: 소켓 `chat:list:updated` 수신 시 무효화. **폴링 없음**
- **관련 API**: `bambi.chats.listMine` (protected), `bambi.chats.deleteChatRoom` (protected), `bambi.blocks.blockUser` (protected), `bambi.moderation.createReport` (protected)

### 7.2 채팅방 — 메시지

- **경로**: `/seeker/chats/[id]` (파일: `apps/web/src/app/seeker/chats/[id]/page.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`)
- **절차**: 방 진입 → 텍스트 입력 → [전송]
- **기대 결과**:
  - 입력 1~2000자. 내 말풍선 코럴, 상대 말풍선 secondary
  - 전송 시 `chat_room`의 `employerDeletedAt`·`seekerDeletedAt`이 **양쪽 모두 NULL로 리셋** → 상대가 삭제한 방도 재노출
  - 헤더: 공고 제목, 상대 이름, `대화 가능`/`차단됨`, **실시간 배지**(`실시간 연결` / `연결 중` / `오프라인`)
  - 상대 입력 중 → "상대가 입력 중이에요"
- **실시간(socket.io)**: `apps/web/src/lib/bambi-chat-realtime.ts` — 이벤트 `connect`/`disconnect`/`chat:error`/`chat:message:created`/`chat:message:read`/`chat:room:updated`/`chat:unread:updated`/`chat:typing:started`/`chat:typing:stopped`. 재연결 delay 500~5000ms, ack timeout 5000ms. 타이핑은 1200ms 무입력 시 stop 전송
- **읽음 처리**: 방 진입·메시지 변화 시 상대 발신 메시지 id를 모아 `bambi.chats.markRead` 자동 호출. **입력 제약 `messageIds` 1~50개**
- **엣지 케이스**:
  - id가 UUID가 아니면 렌더 없이 `/seeker/chats`로 replace
  - 읽음 실패 시 하단 "읽음 상태를 반영하지 못했어요."
  - 말풍선에 읽음 표시(1/읽음) UI는 **없음** — 읽음은 목록의 미확인 카운트에만 반영
  - **채팅에는 금칙어·개인정보 스캐너가 적용되지 않는다.** `scan()`은 공고 작성용(`safety-kit.tsx`)과 구인자·운영자 프로토타입에서만 쓰이고, `assertNoBannedWords`도 `chats.ts`에는 없다. `chat_message.riskFlags` 컬럼은 존재하나 쓰는 코드가 없다
- **차단 시 진입 차단**(`throwIfChatBlocked`):
  | reason | 화면 토스트 |
  |---|---|
  | `moderation` (`chat_room.isBlocked`) | "신고에 대한 운영자 조치로 종료된 채팅방이에요." |
  | `blocked_by_me` | "{이름}님을 차단했어요. 차단 관리에서 해제할 수 있어요." |
  | `blocked_by_counterpart` | "{이름}님이 차단했어요." |
  → 토스트 후 `/seeker/chats`로 replace
- **관련 API**: `bambi.chats.getById`, `bambi.chats.sendMessage`, `bambi.chats.markRead` (모두 protected + `requireChatParticipant` + 차단 가드)

### 7.3 채팅방 — 첨부

- **경로**: 동일, 입력창 왼쪽 클립 아이콘
- **절차**: 클립 → 파일 선택 → 드래프트 확인 → [전송]
- **기대 결과 / 제한**:
  | 항목 | 클라이언트 | 서버 |
  |---|---|---|
  | 허용 MIME | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | 동일 |
  | 이미지 상한 | **8 MB** | **10 MB** |
  | PDF 상한 | 10 MB | 10 MB |
  | 개수 | **한 번에 1개** | — |
  - 매직넘버 검증(`apps/web/src/lib/bambi/image-signature.ts`)으로 확장자·MIME 위조 차단
  - 드래프트 상태 배지: `첨부 준비` / `업로드 중` / `확인 필요`
  - 전송은 2단계: `createAttachmentUpload`(storageKey·uploadUrl 발급) → `sendMediaMessage`(메시지 + 첨부 행 생성, body는 고정 문구 `"첨부 파일을 보냈습니다."`)
- **실패 케이스**:
  | 상황 | 메시지 |
  |---|---|
  | 미지원 형식 | "JPG, PNG, WebP 이미지 또는 PDF만 첨부할 수 있어요." |
  | 이미지 8MB 초과 | "이미지는 8 MB 이하만 첨부할 수 있어요." |
  | PDF 10MB 초과 | "PDF는 10 MB 이하만 첨부할 수 있어요." |
  | 매직넘버 불일치 | "이미지 형식이 올바르지 않습니다. PNG·JPG·WebP·GIF만 첨부할 수 있어요." |
  | 서버 파일명 공백 | `BAD_REQUEST` "Attachment filename is required." |
- **엣지 케이스**:
  - **첨부와 텍스트를 함께 보내면 텍스트는 버려진다**(첨부 분기가 먼저 return)
  - 로컬 구성에서 첨부 조회 URL은 `/bambi/local-chat-attachments`(파일: `apps/web/src/app/bambi/local-chat-attachments/route.ts`)이며 **실제 파일이 아니라 자리표시 SVG**를 반환한다
- **관련 API**: `bambi.chats.createAttachmentUpload`, `bambi.chats.sendMediaMessage` (protected + 참여자 + 차단 가드 + 미디어 정책)

---

## 8. 연락처 공개 요청 / 응답

> **현행 흐름은 "구인자가 요청 → 구직자가 공개/거절"이다.** 구직자는 **받는 쪽**이며, 공개되는 것은 **구직자의 인증 전화번호**다.

### 8.1 구직자가 연락처 공개 요청을 받고 응답

- **경로**: `/seeker/chats/[id]` 대화 중앙의 시스템 카드 (파일: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` `ContactRequestMessage`)
- **선행 조건**: 구인자 계정으로 [연락처 공개 요청] 버튼을 눌러 `pending` 요청 생성. 구인자는 `isPhoneVerified`여야 함
- **절차**:
  1. 구인자 계정: 채팅방 면접 일정 카드 하단 **[연락처 공개 요청]**
  2. 구직자 계정: 대화에 시스템 카드 "{상대}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?" + **[공개] [거절]**
  3. [공개] 또는 [거절] 클릭
- **상태 전이** (진실원 = `chat_message` 1건, `kind='contact_request'`, `metadata` jsonb):
  ```
  (요청 생성) → pending ──reveal ──→ revealed  (종착)
                       └─decline──→ declined  (종착)
  ```
  `metadata = { requesterUserId: employerUserId, status, targetUserId: jobSeekerUserId }`
- **기대 결과 — 문구**:
  | status | 구인자 화면 | 구직자 화면 |
  |---|---|---|
  | pending | "연락처 공개를 요청했습니다. (응답 대기 중)" | "{상대}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?" + 버튼 |
  | revealed | "{상대}님께서 연락처를 공개했습니다: {번호}" | "연락처를 공개했습니다." |
  | declined | "{상대}님께서 연락처 공개를 거절하셨습니다." | "연락처 공개를 거절했습니다." |
  - 토스트: "연락처를 공개했어요." / "연락처 공개를 거절했어요."
  - **공개되는 값**: 구직자 `bambi_profile.phoneNumber` (단, `isPhoneVerified=true`일 때만). 응답 조립 시점에 **구인자 뷰어에게만** 주입되며 **DB metadata에는 저장되지 않는다**
- **실패 케이스**:
  | 상황 | 응답 |
  |---|---|
  | 구직자가 요청 시도 | `FORBIDDEN` (요청은 구인자만) |
  | 구인자 미인증 | `BAD_REQUEST` "본인인증 후 이용할 수 있습니다." |
  | pending 요청이 이미 있음 | `CONFLICT` "이미 연락처 공개 요청이 진행 중입니다." |
  | 대상이 아닌 사람이 응답 | `FORBIDDEN` |
  | 구직자 미인증 상태로 [공개] | `BAD_REQUEST` "본인인증 후 연락처를 공개할 수 있습니다." |
  | 이미 처리된 요청에 재응답 | `CONFLICT` "연락처 공개 요청 상태가 이미 변경되었습니다." |
- **엣지 케이스**: `declined`/`revealed` 이후 구인자가 **새 요청을 다시 보낼 수 있다**(pending만 중복 차단)
- **관련 API**: `bambi.chats.requestContactReveal` (protected, 구인자 전용), `bambi.chats.respondContactReveal` (protected, `metadata.targetUserId` 본인만) — `packages/api/src/routers/bambi/chats.ts`

### 8.2 구직자가 보는 구인자 연락처

- **경로**: 채팅방 우측 면접 일정 카드 하단 (`ContactRevealAction`) / 공고 상세 InfoTile
- **기대 결과(현행 코드)**: 구직자에게 **구인자의 인증 전화번호(`employerVerifiedPhone`)가 면접 확정 여부와 무관하게** `tel:` 링크로 표시된다. `bambi.chats.getById`가 조건 없이 이 값을 싣고(주석에도 "구인자 인증번호는 양쪽에 노출"로 명시), `bambi.jobs.getById`(**publicProcedure**)도 공고 작성자의 인증번호를 상세 응답에 포함한다.
- **표시 문구**: "구인자 인증 연락처" + 번호 + "밤비알바 보고 연락드렸다고 하시면 정확한 상담을 받으실 수 있어요."
- **주의**: 이 동작은 프리플라이트/안전바의 "면접 확정 전 연락처 보호 중" 문구와 상충한다 → **부록 참조**

### 8.3 옛 연락처 공개 화면(`contact-reveal.tsx`) — 실서비스 도달 불가

- **파일**: `apps/web/src/components/bambi/screens/contact-reveal.tsx`
- **관련 API**: `bambi.chats.getContactReveal`, `bambi.chats.revealContact` (둘 다 protected, 구인자만 공개 가능, 면접 `confirmed|completed` 필요)
- **현황**: 이 화면에 `roomId`를 넘기는 호출부가 리포에 **없다**. 유일한 사용처는 `/preview` 데모(`apps/web/src/components/bambi/screens/seeker.tsx`의 `SeekerPersona`)이고 `roomId` 없이 호출되어 더미 프리뷰만 렌더한다. 회귀 테스트(`seeker-chat-room-responsive.test.ts`)도 채팅방이 `getContactReveal`을 **쓰지 않아야** 한다고 고정한다.
- → **QA 범위에서 제외**(API는 살아 있으나 UI 경로 없음).

---

## 9. 면접 일정

### 9.1 채팅방에서 면접 제안 응답

- **경로**: `/seeker/chats/[id]` 우측 "면접 일정" 영역
- **선행 조건**: 구인자가 `bambi.chats.proposeInterview`로 일정 제안(미래 시각, `locationNote` 최대 300자)
- **절차**: 구직자 계정에서 `제안됨` 카드의 **[확정]** 또는 **[거절]** 클릭 → 확정 후 **[완료]** / **[취소]** 확인
- **상태 전이** (`interview_status`: `proposed`/`confirmed`/`declined`/`canceled`/`completed`):
  ```
  proposed ──confirmed(제안자 아닌 쪽만)──→ confirmed ──completed──→ completed
     │                                         │
     ├──declined(제안자 아닌 쪽만)──→ declined   └──canceled──→ canceled
     └──canceled──────────────────→ canceled
  ```
  - `confirmed`/`declined`: `현재상태==='proposed' && 행위자 !== 제안자`
  - `canceled`: 현재 `proposed` 또는 `confirmed`(제안자 제한 없음)
  - `completed`: 현재 `confirmed`
  - `declined`/`canceled`에서 되돌아가는 전이는 **없음**
- **기대 결과**: 상태 라벨 — 제안됨 / 확정 / 거절 / 취소 / 완료 (`apps/web/src/lib/bambi-options.ts` `interviewStatusLabels`)
- **실패 케이스**:
  - **구직자는 일정을 제안할 수 없다** — `proposeInterview`는 `userId !== room.employerUserId`면 `FORBIDDEN`, UI도 `InterviewProposalForm`을 구직자에게 렌더하지 않음
  - 자기가 제안한 일정을 스스로 확정 → `FORBIDDEN`
  - 동시 전이 경합 → `CONFLICT` "Interview schedule status has changed."
  - 과거 시각 제안 → "Interview schedule must be in the future."
- **관련 API**: `bambi.chats.proposeInterview` (protected, 구인자 전용), `bambi.chats.setInterviewStatus` (protected + 참여자 + 차단 가드 + 낙관적 잠금)

### 9.2 예정된 면접 목록

- **경로**: `/seeker/me/interviews` (파일: `apps/web/src/app/seeker/me/interviews/page.tsx`, `apps/web/src/components/bambi/screens/upcoming-interviews-screen.tsx`)
- **기대 결과**:
  - 조건: 내가 참여자인 방 + `status ∈ {proposed, confirmed}` + `scheduledAt >= now()` + `ORDER BY scheduledAt ASC`
  - 표시: `YYYY.MM.DD (요일) HH:MM` + 배지(`제안됨`/`확정됨`) + `상대 · 공고` + 장소 메모
  - 카드 전체가 `/seeker/chats/{chatRoomId}` 링크
  - **읽기 전용** — 조작 버튼 없음
  - 빈 상태: "예정된 면접이 없어요 / 확정되었거나 제안된 다가오는 면접이 여기에 표시됩니다."
- **엣지 케이스**: **소프트삭제한 방·차단한 방을 제외하지 않는다**(`listMine`과 달리 필터 없음) → 차단·삭제한 방의 면접이 계속 노출되는지 확인
- **관련 API**: `bambi.chats.listMyUpcomingInterviews` (protected + `requireActiveBambiProfile`)

---

## 10. 후기(리뷰)

### 10.1 후기 작성

- **경로**: `/seeker/chats/[id]` 우측 "후기 남기기" 카드 (파일: `apps/web/src/components/bambi/review-form.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` `ReviewSidebarCard`)
- **선행 조건(서버가 순서대로 검사)**:
  1. 그 채팅방의 참여자
  2. **`profile.userId === room.jobSeekerUserId`** (구직자만) — 아니면 `FORBIDDEN` "Only the job seeker can review this chat room."
  3. 해당 방에 `interview_schedule.status ∈ {confirmed, completed}` 1건 이상 — 없으면 `FORBIDDEN` "A confirmed or completed interview is required."
  4. 같은 방 + 같은 작성자 리뷰 없음 — 있으면 `CONFLICT`
- **절차**: 별점(1~5) 선택 → 후기 본문 작성 → (선택) "익명으로 표시" 체크 → **[후기 등록]**
- **입력 제한**: 별점 **1~5 정수**, 본문 trim 후 **20자 이상 1000자 이하**(textarea `maxLength=1000`, 실시간 `{길이}/1000`)
- **기대 결과**:
  - 성공 토스트 "후기가 등록됐어요."
  - 카드 배지가 `작성 가능` → `작성 완료`로 바뀌고, 폼 대신 읽기 카드(`등록된 후기` 또는 `검수 중인 후기`)
  - **위험 표현 감지 시 `status='pending_review'`(비공개)** — 감지 규칙(`packages/api/src/services/bambi-review-policy.ts`):
    | 플래그 | 패턴 |
    |---|---|
    | `phone_number` | `01[016789]` 전화번호 |
    | `external_messenger` | 카톡/카카오/텔레/텔레그램/오픈채팅/오픈톡/라인아이디/디엠/DM |
    | `threat` | 협박/위협/보복/신고하면/찾아가 |
    | `personal_data` | 주민번호/계좌번호/여권번호/집주소/자택주소 |
  - 위험 표현이 없으면 `status='published'`로 즉시 공개
- **실패 케이스**:
  | 상황 | 메시지 |
  |---|---|
  | 별점 미선택 | "별점을 선택해 주세요." |
  | 20자 미만 | "후기는 20자 이상 작성해 주세요." (등록 버튼 비활성) |
  | 서버 `BAD_REQUEST` | "별점과 후기 내용을 다시 확인해 주세요." |
  | 방에 이미 후기 존재 | `CONFLICT` |
  | 차단된 방 | 카드 자체가 노출되지 않음(`!room.isBlocked` 조건) |
- **엣지 케이스**: `jobPostId`·`organizationId`는 사용자가 지정할 수 없고 **채팅방에서 파생**된다
- **관련 API**: `bambi.reviews.create` (protected + `requireChatParticipant` + 구직자 확인), `bambi.reviews.listMine` (protected)

### 10.2 후기 열람

- **경로**: `/seeker/jobs/[id]` 하단 "후기" 섹션 (파일: `apps/web/src/components/bambi/job-review-section.tsx`, `apps/web/src/components/bambi/rating-stars.tsx`)
- **기대 결과**:
  - 5개씩 [후기 더보기]로 이어 로딩(서버 `limit` 1~50, 기본 10)
  - `status='published'` 후기만, `createdAt DESC`
  - 작성자 표기: 익명이면 **"익명"**, 아니면 마스킹(`maskReviewerDisplayName`: 1자→`*`, 2자→`가*`, 3자+→`김**지`, 빈값→"구직자"). **`reviewerUserId`·원본 이름은 응답에 실리지 않는다**
  - 헤더에 별점 + 평균 + "후기 {n}개"
  - 빈 상태 "아직 후기가 없어요 / 면접을 마친 구직자가 남긴 후기가 여기에 표시돼요."
  - **비-UUID(목업) 공고면 섹션 자체를 숨김**
  - 공고 카드/타일의 평점은 `status='published'` 리뷰만 집계, 0개면 "신규"
- **실패 케이스**: 비로그인·정지 계정 → `requireActiveBambiProfile` 실패 → "후기를 불러오지 못했어요…"
- **관련 API**: `bambi.reviews.listByJobPost` (protected + `requireActiveBambiProfile`)

### 10.3 후기 수정·삭제 — **구직자에게 없음**

- `reviewsRouter`에는 `create` / `listByJobPost` / `listMine` 셋뿐이다. 상태 변경은 운영자 전용(`bambi.moderation.setReviewStatus`, `bulkSetReviewStatus`).
- 리뷰 **신고**는 서버 `moderation_target_type`에 `review`가 있으나 **구직자 화면에 리뷰 신고 버튼이 없다**.

---

## 11. 커뮤니티(수다방)

### 11.1 입장 게이트

- **경로**: `/seeker/community` (파일: `apps/web/src/app/seeker/community/layout.tsx`, `apps/web/src/components/bambi/require-community-access.tsx`)
- **입장 조건**(서버 `resolveCommunityAccess`):
  ```
  status !== 'suspended'
  AND ( role === 'admin' OR gender === 'female' OR (role === 'employer' AND isAdvertiser) )
  ```
  | 대상 | 입장 |
  |---|---|
  | 여성 구직자(active/warned) | **가능** |
  | 남성 구직자 | 불가 |
  | 성별 미설정(미인증) | 불가 |
  | 광고 중 업소회원(owner/manager) | 가능 |
  | 광고 없음/만료 업소회원 | 불가 |
  | 운영자 | 가능(성별 무관) |
  | 법률자문(`role='legal_advisor'`) | 가능(성별·광고 무관) — 단 **`legal` 게시판만** 이용 가능. 다른 게시판(가상 `best` 포함)은 목록·상세·댓글·추천·쓰기 전부 `FORBIDDEN` "법률자문 계정은 무료 법률 자문 게시판만 이용할 수 있어요."(`assertLegalAdvisorBoardScope`), 화면은 수다방 홈·seeker 홈 미리보기에 **모든 게시판 카드를 그대로 노출**하되 legal 외 링크 클릭을 가로채 같은 문구를 토스트(`useLegalAdvisorNavGuard`, 통과 판정 `isLegalAdvisorAllowedPath` = 수다방 홈·`/seeker/community/legal*`)하고, 비-legal 게시판 URL 직접 진입 시 `/seeker/community/legal`로 replace |
  | 정지 계정 | 불가 |
  | 게스트·비로그인 | 게이트가 먼저 차단 |
- **기대 결과(미자격)**: 토스트 **"일반 여성회원과 광고 중인 업소회원만 이용가능합니다"** → `/seeker`로 replace. 전용 안내 화면은 **없음**(빈 화면 후 홈으로 튕김)
- **엣지 케이스**:
  - 헤더 nav·하단 탭바의 "수다방" 항목은 **미자격자에게도 그대로 보인다** — 눌러야 토스트+리다이렉트
  - `isAdvertiser`는 저장 컬럼이 아니라 조회 시 라이브 계산(`hasActiveAdExposure`: 결제완료·공개·미만료 광고 공고 1건 이상)
  - 서버 게이트(`requireCommunityMember`)가 별도로 있어 API 직접 호출도 막힌다: `FORBIDDEN` "일반 여성회원과 광고 중인 업소회원만 이용가능합니다"
- **관련 API**: `bambi.onboarding.getMine` (protected, `community.canAccess`)

### 11.2 게시판 목록

- **파일**: `apps/web/src/lib/bambi/community.ts` (`COMMUNITY_BOARDS`)

| key | slug | 라벨 | 글쓰기 | 비고 |
|---|---|---|---|---|
| `notice` | `notice` | 공지사항 | **운영자만** | 서버가 `role!=='admin'` 거부 |
| `best` | `best` | 베스트글 | **불가** | DB enum에 없는 **가상 큐레이션** (최근 30일, 추천 ≥1, 공지 제외) |
| `free` | `free` | 자유수다 | 가능 | |
| `work_talk` | **`work-talk`** | 일 이야기 | 가능 | slug에 하이픈, DB enum은 언더스코어. **수집 글이 합류하는 유일한 게시판** |
| `market` | `market` | 중고거래 | 가능 | |
| `legal` | `legal` | 무료 법률 자문 | 가능 | **전 글 강제 잠금 + 비번 필수**, 연락처 입력, best·공개 `/board` 제외 (11.9) |

- **경로**: `/seeker/community/[board]` — `getBoardBySlug` 실패 시 `notFound()`(404). `/seeker/community/best/write`는 `writable=false`라 404

### 11.3 수다방 홈 · 글 목록

- **경로**: `/seeker/community` (홈), `/seeker/community/[board]` (파일: `apps/web/src/components/bambi/screens/community-home.tsx`, `.../community-board.tsx`)
- **기대 결과 — 목록**:
  - 정렬: 일반 게시판 `createdAt DESC` / 베스트글 `likeCount DESC, createdAt DESC` / work_talk에 수집 글이 섞이면 **순수 글 먼저, 그다음 수집 글**
  - 페이지네이션: 서버 `PAGE_SIZE=20` 고정, URL `?page=N` 동기화, 번호 페이지네이션(`router.replace`로 히스토리 미증가), `page > totalPages`면 마지막 페이지로 자동 클램프
  - **검색 기능 없음**
  - 필터: "필터" 드롭다운의 독립 토글 2개 — **광고 글보기**(`?promotion=1`), **업소 회원 글보기**(`?employer=1`). 켜진 조건들의 **OR**. `free`/`work_talk`/`market`에서만 노출
  - 배지: 잠금 아이콘 / `공지` / `외부 수집` / `광고`(업소회원 광고글) / `업소` / `N`(새 글, **48시간 기준**) / 댓글 수(코럴)
  - 메타: 작성자명(폴백 "회원") · `YYYY.MM.DD` · 조회수 · 추천수
  - **비밀글 마스킹**: 작성자 본인·운영자가 아니면 제목이 서버에서 `"비밀글입니다"`로 치환되어 내려온다
  - 빈 상태: 쓰기 가능이면 "아직 글이 없어요. 첫 글을 남겨보세요.", best면 "최근 30일 추천 글이 아직 없어요.", 그 외 "아직 등록된 글이 없어요."
- **홈**: 게시판별 최신 **4건** 미리보기. 공지사항은 최상단 전폭, 나머지는 2열 그리드이고 **중고거래·무료 법률 자문은 한 칸을 좌우로 나눠 나란히**(모바일 1열에서는 세로 스택, 반폭 카드는 작성인을 접고 날짜만 표시). 수다방 홈과 `/seeker` 홈이 같은 컴포넌트(`CommunityOverviewGrid`)를 쓰므로 두 화면이 항상 같은 배치다. 미자격자가 글을 누르면 `preventDefault` + 토스트 "일반 여성 회원과 광고 중인 업소회원만 가능합니다"
- **관련 API**: `bambi.community.listPosts` (protected + `requireCommunityMember`), `bambi.community.overview` (**publicProcedure**, 미자격·비로그인도 요약 열람 가능)

### 11.4 글 작성

- **경로**: `/seeker/community/[board]/write` (파일: `apps/web/src/components/bambi/community-post-form.tsx`, `.../community-editor.tsx`)
- **입력 필드**:
  | 필드 | 컨트롤 | 클라이언트 | 서버 |
  |---|---|---|---|
  | 작성인 | Input(기본값=세션 `user.name`) | `maxLength=30`, 1자+ | `trim().min(1).max(30)` |
  | 비밀글로 잠그기 | Switch | — | boolean |
  | 비밀번호 | password Input (잠금 ON일 때만) | `maxLength=30`, 4자+ | 잠금 시 4자 미만이면 `BAD_REQUEST` "비밀글은 4자 이상의 비밀번호가 필요합니다." |
  | 광고글로 표시 | Switch (**employer일 때만 노출**) | — | employer 아니면 `BAD_REQUEST` "광고글은 업소회원만 표시할 수 있습니다." |
  | 연락처 | tel Input (**`legal` 게시판일 때만 노출**, 선택) | `maxLength=20` | `trim().max(20).optional()`. legal 외 게시판에 실려 오면 `BAD_REQUEST` "연락처는 무료 법률 자문 게시판에만 남길 수 있습니다." |
  | 제목 | Input | `maxLength=100`, 2자+ | `trim().min(2).max(100)` |
  | 본문 | **Tiptap 에디터** | 텍스트 2자+ **또는** 이미지 1개+ | `min(2).max(30000)` + `assertTiptapDoc` |
- **에디터 툴바**: 굵게 / 기울임 / 취소선 / 글머리목록 / 번호목록 / 링크(Popover) / 이미지(Popover)
- **이미지 삽입**: 파일 업로드(매직넘버 검사 → `createMediaUpload` 인텐트 → 서명 URL PUT → public URL 삽입) **또는** URL 직접 삽입. 서버 정책은 **JPG·PNG·WebP, 최대 8MB**
- **금칙어 검사**: **제목 + 본문 평문**에 `assertNoBannedWords` 적용. 히트 시 `BAD_REQUEST` "게시할 수 없는 단어가 포함되어 있습니다: '{단어}'". 매칭은 소문자화 + 공백·구두점·기호 제거 후 **부분문자열 매칭**(60초 TTL 캐시)
- **기대 결과**: 성공 시 `/seeker/community/{slug}/{postId}`로 replace + 토스트 "글이 등록됐어요."
- **엣지 케이스**:
  - 공지사항 글쓰기 진입(비운영자) → 토스트 "공지사항은 운영자만 작성할 수 있어요." + 목록으로 replace, 글쓰기 버튼도 숨김
  - 비밀번호를 입력하지 않으면 `passwordHash`에 **빈 문자열**이 저장되어 이후 비번 검증이 항상 실패한다(비번 경로가 자연히 막힘)
- **관련 API**: `bambi.community.createPost` (protected + `requireCommunityMember`), `bambi.community.createMediaUpload` (protected + `requireCommunityMember`)

### 11.5 글 수정 · 삭제

- **경로(수정)**: `/seeker/community/[board]/[postId]/edit` (파일: `apps/web/src/app/seeker/community/[board]/[postId]/edit/page.tsx`)
- **절차**: 상세에서 수정 진입 → 작성자 본인(`canEdit`)이면 즉시 폼, 아니면 **"글 비밀번호 확인"** 게이트(4자+ 입력 → `getPost` 재조회)
- **권한**:
  | 동작 | 조건 |
  |---|---|
  | 수정 | **작성자 본인 또는 비밀번호 일치** — **운영자도 비밀번호 없이는 수정 불가** |
  | 삭제 | 작성자 본인 **또는 운영자** 또는 비밀번호 일치. **소프트 삭제**(`status='deleted'`) |
- **실패 메시지**: 수정 "본인이 작성한 글만 수정할 수 있습니다. 비밀번호를 확인해 주세요." / 삭제 "본인이 작성한 글만 삭제할 수 있습니다. 비밀번호를 확인해 주세요."
- **추가 규칙**:
  - 작성 시점 `authorRole`이 employer가 아닌데 `isPromotion=true`로 수정 → `BAD_REQUEST` (**현재 role이 아니라 스냅샷 기준**)
  - `passwordHash===''`인 글을 비밀글로 잠그려 하면 → `BAD_REQUEST` "비밀번호 없이 작성한 글은 비밀글로 잠글 수 없어요."
  - 게시판 이동 불가
- **관련 API**: `bambi.community.getPost`, `bambi.community.updatePost`, `bambi.community.deletePost` (모두 protected + `requireCommunityMember`)

### 11.6 댓글

- **경로**: `/seeker/community/[board]/[postId]` (파일: `apps/web/src/components/bambi/community-post-detail-parts.tsx`)
- **권한**:
  | 동작 | 조건 |
  |---|---|
  | 작성 / 대댓글 | 수다방 회원 + 잠금 게이트 통과 |
  | 수정 | **작성자 본인만**(운영자도 타인 댓글 수정 불가) |
  | 삭제 | 작성자 본인 **또는 운영자** |
- **제한**: 본문 1~1000자, 정렬 `createdAt ASC`, **상한 200건**(댓글 페이지네이션 없음), **대댓글은 1단계만**(답글에 답글 → `BAD_REQUEST` "답글에는 다시 답글을 달 수 없습니다.")
- **금칙어**: 작성·수정 모두 적용
- **엣지 케이스**:
  - 삭제된 댓글은 소프트 삭제. published 대댓글이 달린 부모만 "삭제된 댓글입니다" 플레이스홀더로 남고, 그 외 삭제 댓글은 응답에서 제외
  - 업소 댓글이 있으면 **"업소 댓글 숨기기" Switch** 노출
  - 본인 댓글엔 수정·삭제 아이콘, 타인 댓글엔 신고(깃발) 아이콘
- **관련 API**: `bambi.community.listComments`, `bambi.community.createComment`, `bambi.community.updateComment`, `bambi.community.deleteComment` (모두 protected + `requireCommunityMember`)

### 11.7 추천 · 조회수

- **추천(좋아요)**: `LikeBar`의 "추천 {n}" 버튼, `aria-pressed`, **토글 취소 가능**, 유저당 1회(unique index). 자기 글 추천 제한 없음
- **조회수**: `getPost` 호출마다 **원자 증가**. 중복 방지·본인 제외·쿨다운 **없음** → 새로고침마다 +1. 잠긴 글은 비번 통과 후에만 증가
- **싫어요/비추천**: **없음**
- **관련 API**: `bambi.community.toggleLike` (protected + `requireCommunityMember` + 읽기 권한)

### 11.8 수집(크롤링) 커뮤니티 글

- **경로**: `/seeker/community/crawled/[id]` (파일: `apps/web/src/components/bambi/screens/community-crawled-topic-detail.tsx`)
- **선행 조건**: 사이트 설정 `crawled_community_feed_enabled=true`, `removedAt IS NULL`, `sourcePostedAt >= now-30일`
- **일반 글과의 차이**:
  - **`work_talk`(일 이야기) 한 곳에만 합류**하고, 광고/업소 필터를 켜면 union에서 제외됨
  - 상단 warning Alert: "외부에서 수집된 글이에요 … 좋아요·댓글·신고는 제공되지 않아요."
  - **원문 링크 없음**(`sourceUrl`은 select 목록에 아예 없음)
  - **댓글 작성 불가** — 수집 시점 댓글 배열을 읽기 전용 렌더(작성자 폴백 "익명")
  - **좋아요·수정·삭제·신고 모두 없음**, 비밀글 개념 없음
  - 본문은 `whitespace-pre-line` 평문(Tiptap 아님)
  - 목록 투영: 작성자 자리 = `boardName`(없으면 "밤문화이야기"), `likeCount=0`
- **실패 케이스**: 스위치 OFF → `NOT_FOUND`(존재 자체를 숨김)
- **관련 API**: `bambi.community.getCrawledTopic` (protected + `requireCommunityMember`)

### 11.9 무료 법률 자문 게시판(`legal`)

- **경로**: `/seeker/community/legal` · `/seeker/community/legal/write` · `/seeker/community/legal/[postId]`
  (파일: `apps/web/src/lib/bambi/community.ts` `isLegalBoardKey`, `.../community-post-form.tsx`,
  `packages/api/src/services/bambi-community-authz.ts` `resolveLockedForBoard`·`canBypassLock`)
- **쓸 수 있는 사람**: 수다방 자격자 전부 + 여성 인증 게스트(게스트 쓰기 허용 보드 = `free`·`work_talk`·`legal`)
- **작성 규칙**:
  - 잠금 스위치가 **없고**, 대신 "법률 자문 글은 비밀글로 등록됩니다" 안내 Alert이 뜬다. 서버(`resolveLockedForBoard`)가 `isLocked`를 무조건 true로 덮어쓴다
  - **비밀번호(4자 이상) 필수** — 없으면 `BAD_REQUEST` "비밀글은 4자 이상의 비밀번호가 필요합니다."
  - 연락처(선택) 입력. 다른 게시판에 연락처를 실어 보내면 `BAD_REQUEST`(11.4 표 참고)
  - 게스트도 동일하다(다른 게시판에서는 막히는 잠금글 작성이 `legal`에서만 열린다). 단 잠긴 legal 글에 댓글·추천을 남기는 건 **그 글을 쓴 게스트 본인(gid 일치)** 뿐이다
- **열람 권한**(`canBypassLock`):
  | 대상 | 잠긴 legal 글 |
  |---|---|
  | 작성자 본인 | 비번 없이 열람 |
  | 운영자(`admin`) | 비번 없이 열람 |
  | 법률자문(`legal_advisor`) | 비번 없이 열람 (**`legal` 보드에서만** — 다른 보드 비밀글은 기존대로 비번 필요) |
  | 그 외 회원·게스트 | 목록 제목이 "비밀글입니다"로 마스킹, 상세는 비번 게이트 |
- **연락처 노출**: `getPost`의 **잠금 해제 응답에만** `contactPhone`이 실린다(마스킹 응답·`getPublicPost`·`listPosts`·`listComments`에는 없음). 화면에서는 본문 위 Alert "연락처 {번호} / 작성자 본인과 운영자·법률자문에게만 보이는 번호예요"
- **답변 표시**: `legal_advisor` 계정의 댓글에 **법률자문** 배지(회원 상세) / 공개·게스트 화면에서는 작성자 유형 라벨이 "법률자문"으로 나온다
- **수정**: 저장된 board 기준으로 잠금을 다시 강제하므로 `isLocked:false`를 보내도 **잠금이 풀리지 않는다**. 연락처는 수정 폼이 현재 값을 다시 실어 보내므로 비우면 삭제된다
- **제외 규칙**: 베스트 큐레이션에서 제외(`notInArray(board, ['notice','legal'])`), 공개 `/board`에도 노출되지 않음(`PUBLIC_COMMUNITY_BOARDS` 무변경)
- **게스트 잠금 예외의 범위**: 게스트의 잠금 금지 가드가 legal에서 열리는 건 **자기 글**에 한정된다(`assertGuestPostAccess`가 `authorGuestId === gid`를 확인). 남의 legal 잠금글에 댓글·추천을 시도하면 `FORBIDDEN` "비밀글에는 글쓴이 본인만 댓글·추천을 남길 수 있어요." — 회원이 비밀번호 게이트를 통과해야 하는 것과 같은 축이다(게스트의 `password`는 잠금 열쇠가 아니라 자기 댓글 소유권 비밀번호라 게이트로 쓸 수 없다)
- **관련 API**: `bambi.community.createPost`(`board:'legal'`), `updatePost`, `getPost`, `overview`(응답 키 `legal`)

### 11.10 공개 게시판(비로그인 읽기 + 비회원 쓰기, SEO)

- **경로**: `/board`(허브) · `/board/[boardSlug]`(목록) · `/board/[boardSlug]/[postId]`(상세) ·
  `/board/[boardSlug]/write`(비회원 글쓰기) · `/board/[boardSlug]/[postId]/edit`(비회원 글 수정)
  (파일: `apps/web/src/app/board/**`, `apps/web/src/components/bambi/public-post-body.tsx`,
  `public-post-interactions.tsx`, `guest-verify-card.tsx`)
- **게이트**: `resolve-gate`의 공개 prefix에 `/board` 추가 — 비로그인·게스트 모두 통과. `/seeker/community` 쪽 자격 게이트는 **그대로**다.
- **공개 대상**: 서버 상수 `PUBLIC_COMMUNITY_BOARDS = notice · free · work_talk`(`packages/api/src/routers/bambi/community.ts`).
  `market`·`best`는 비공개 → 슬러그로 직접 들어가도 404. 잠금(비밀)글·`published` 아닌 글·수집 글은 목록·상세 모두 제외.
- **확인 사항**:
  - 로그아웃(또는 JS 비활성) 상태에서 목록·상세가 **서버 렌더된 HTML**로 보인다(본문 텍스트 포함)
  - 페이지 이동은 `?page=` 실제 `<a href>`이고, 1페이지는 쿼리 없이 `/board/free`
  - 상세 `<title>`·`description`·`canonical`이 글마다 다르고, `DiscussionForumPosting` JSON-LD가 실린다
  - 목록·상세 모두 **현재 위치 내비**(커뮤니티 게시판 › 게시판 › 글)와 같은 계층의 `BreadcrumbList` JSON-LD가 함께 나온다(`apps/web/src/lib/bambi/seo.ts` `breadcrumbJsonLd`)
  - 본문 이미지는 렌더되지 않고 "이미지는 회원 화면에서 볼 수 있어요" 자리표시자로 대체
  - 댓글 목록은 항상 SSR HTML에 포함(작성자 계정명 미노출 — `communityAuthorRoleLabel`로 "회원/업소 회원/비회원"만)
  - 로그인 회원에게는 참여 UI 대신 "회원 화면에서 보기"(`/seeker/community/[slug]/[postId]`) 안내가 나온다
  - 상세 조회로 **조회수가 오르지 않는다**(크롤러 방문 방지)
  - slug와 글의 실제 게시판이 다르면 404(중복 URL 색인 방지)
- **관련 API**: `bambi.community.listPublicPosts` · `bambi.community.getPublicPost` (둘 다 `publicProcedure`)

#### 11.10.1 비회원(게스트) 쓰기

- **자격**: 게스트 쿠키(`bambi_guest`) 서명·만료 유효 + **`gid` 포함(v2)** + `gender === "female"`.
  gid 없는 옛 토큰 보유자는 읽기만 되고 쓰기는 401 → 화면이 재인증 카드를 세운다
  (`readGuestCanWrite`, `packages/api/src/context.ts` `resolveGuest`).
- **전달 경로**: 게스트 쿠키는 host-only라 API 서버에 안 실린다 → 클라 oRPC 링크가 `x-bambi-guest`
  헤더로 옮겨 붙이고(`apps/web/src/utils/orpc.ts`), SSR 경유 호출은 `Cookie` 헤더 폴백.
  CORS `allowedHeaders`에 `x-bambi-guest`가 없으면 preflight에서 잘린다(`apps/server/src/plugins/cors.ts`).
  **web·server의 `BAMBI_GUEST_TOKEN_SECRET`이 다르면 전부 401.**
- **허용 범위**: 서버 게스트 쓰기 보드는 `free`·`work_talk`·`legal`(공지는 읽기 전용), 글·댓글·추천.
  비밀글 작성·전환 불가 — **단 `legal`은 강제 잠금이라 예외**(11.9). 공개 `/board` 영역에는 `legal`이
  없으므로 여기서 실제로 쓸 수 있는 건 `free`·`work_talk` 둘뿐이고, `legal`은 회원 수다방 화면에서 쓴다.
- **비밀번호**: 비회원 글·댓글은 **4자 이상 필수**(scrypt 해시). 수정·삭제는 gid가 아니라 **비밀번호로만**
  판정 → 쿠키가 만료돼도 본인 글을 지울 수 있다. 회원 글(`author_guest_id = null`)은 비번이 맞아도
  비회원 경로로 수정·삭제되지 않는다.
- **확인 사항 / 실패 케이스**:
  | 상황 | 결과 |
  |---|---|
  | 미인증 방문자가 게시판 헤더 [본인인증하고 글쓰기] | 본인인증 다이얼로그 → 성공 시 `/board/[slug]/write`로 복귀(`redirectTo`) |
  | 인증된 비회원이 `자유수다`/`밤문화 이야기` 글쓰기 | 작성인 기본 "비회원", 비밀번호 필드 필수, 잠금·광고 스위치 없음 |
  | 인증된 비회원이 `공지사항`에 글·댓글·추천 | 버튼 미노출 / API 직접 호출 시 `BAD_REQUEST` "비회원은 자유수다·밤문화 이야기·무료 법률 자문에만 참여할 수 있어요." |
  | 남성·성별 미상 게스트 | `FORBIDDEN` "일반 여성회원과 광고 중인 업소회원만 이용가능합니다" |
  | 토큰 없음·위조·만료·gid 없는 옛 토큰 | `UNAUTHORIZED` "본인인증 후 이용할 수 있습니다." |
  | 비밀번호 4자 미만 | `BAD_REQUEST` "비회원 글·댓글은 4자 이상의 비밀번호가 필요합니다." |
  | 수정·삭제 비밀번호 불일치 | `FORBIDDEN` "비밀번호가 일치하지 않습니다." |
  | 같은 글 추천 두 번 | 토글(추천 → 취소). `(post_id, guest_id)` unique로 중복 행 불가 |
  | 글 1분 2회 / 댓글 1분 6회 | `TOO_MANY_REQUESTS`. gid·IP **두 버킷 모두** 통과해야 한다 |
  | 로그인 상태에서 게스트 쿠키 보유 | 세션이 정본 → 회원 자격 판정(정지·성별·광고)을 게스트 신분으로 우회 불가 |
  | 비회원 답글(대댓글)·신고·이미지 첨부 | **미구현** — 회원 화면 전용 |
- **관련 API**: `createPost`·`updatePost`·`deletePost`·`toggleLike`·`createComment`·`updateComment`·
  `deleteComment`·`listComments` 전부 `publicProcedure` + `resolveCommunityActor`
  (`packages/api/src/services/bambi-community-authz.ts`). 회원 경로 동작은 회귀 없음.

---

## 12. 신고 · 차단

### 12.1 신고 접수

- **경로(2곳)**:
  1. 공고 상세 `/seeker/jobs/[id]` → [공고 신고] → `targetType='job_post'`
  2. 채팅 목록 `/seeker/chats` 케밥 → [신고] → `targetType='chat_room'`
  3. (커뮤니티) 글 상세 좌하단 깃발 → `targetType='community_post'` / 타인 댓글 깃발 → `community_comment`
- **파일**: `apps/web/src/components/bambi/report-dialog.tsx`, `apps/web/src/components/bambi/safety-kit.tsx`(`ReportForm`/`ReportDone`), `apps/web/src/lib/bambi/report-reasons.ts`
- **사유 목록(UI 라벨 → 서버 enum → 내 신고 내역 라벨)**:
  | UI 라벨 | 심각도 | 서버 enum | 내역 화면 라벨 |
  |---|---|---|---|
  | 성매매·성적 서비스 암시 | 심각 | `illegal_or_prohibited_content` | 불법·금지 콘텐츠 |
  | 강요·협박·착취 | 심각 | `coercion_or_safety` | 강요·안전 위협 |
  | 미성년 관련 | 심각 | `underage_concern` | 미성년 의심 |
  | 허위 공고·사기 | — | `scam_or_fraud` | 사기·기만 |
  | 외부 연락처 유도 | — | `misleading_job_information` | **허위 공고 정보** (라벨 어긋남) |
  | 욕설·혐오 표현 | — | `harassment` | 괴롭힘 |
  | 기타 | — | `other` | 기타 |
- **절차**: 신고 버튼 → 사유 1개 선택(미선택 시 [신고 접수] 비활성) → 상세 입력(선택, 서버 최대 1000자) → [신고 접수] → 완료 화면 → [확인]
- **기대 결과**: `report.status='open'`으로 접수. 완료 화면 "신고가 접수됐어요 / 운영팀이 대화 내용을 검토하고 24시간 내 조치해요. 안전을 위해 해당 채팅은 잠시 숨겨둘게요."
- **엣지 케이스 / 실패 케이스**:
  | 상황 | 결과 |
  |---|---|
  | 같은 신고자·같은 대상 재신고 | **멱등** — 새 행을 만들지 않고 기존 행 반환(사용자에겐 성공으로 보임) |
  | 자기 자신(`targetType='user'`) 신고 | `BAD_REQUEST` "자기 자신은 신고할 수 없어요." |
  | 구인자·운영자가 채팅 신고 | `FORBIDDEN` "채팅 신고는 구직자만 할 수 있어요." (`chat_room`/`chat_message` 한정) |
  | 존재하지 않는 대상 | `assertReportTargetExists` 실패 |
  | 목업(비-UUID) 공고 신고 | 화면이 신고 대신 채팅 이동으로 폴백(`canReport=false`) |
  | 첨부파일 | **없음**(폼에 파일 입력 자체가 없음) |
- **신고 취소·삭제**: **프로시저 없음**
- **관련 API**: `bambi.moderation.createReport` (protected + `requireActiveBambiProfile`, `packages/api/src/routers/bambi/moderation.ts`)

### 12.2 내 신고 내역

- **경로**: `/seeker/me/reports` (파일: `apps/web/src/components/bambi/screens/my-reports-screen.tsx`)
- **기대 결과**:
  | 상태 | 라벨 | 배지 톤 |
  |---|---|---|
  | `open` | 접수됨 | warning |
  | `reviewing` | 검토 중 | default |
  | `resolved` | 처리 완료 | good |
  | `dismissed` | 반려됨 | danger |
  - 행 구성: 사유 라벨 / `대상 타입 · YYYY.MM.DD` / 상태 배지 / 상세(있을 때)
  - 최대 50건(서버 limit 1~100, 기본 50), `createdAt DESC`
  - 빈 상태 "신고 내역이 없어요 / 접수한 신고가 여기에 표시됩니다."
- **관련 API**: `bambi.moderation.listMyReports` (protected, `reporterUserId=본인`)

### 12.3 차단

- **차단하는 곳(구직자 기준 2곳)**:
  1. 채팅방 안전 안내 바 → [차단하기] → 인라인 확인 "이 상대를 정말 차단할까요? 차단하면 서로 대화할 수 없어요." → [취소]/[차단] → 토스트 "상대를 차단했어요." → `/seeker/chats`로 이동
  2. 채팅 목록 케밥 → [차단] (**확인 단계 없이 즉시**)
  - 공고 상세·커뮤니티에는 차단 버튼 **없음**
- **차단 시 효과**:
  - 차단은 **방 단위가 아니라 사용자 단위**이고 **양방향**으로 판정된다(내가 차단 / 상대가 나를 차단)
  - `throwIfChatBlocked`로 `FORBIDDEN`이 되는 프로시저: `getById`, `createAttachmentUpload`, `sendMessage`, `sendMediaMessage`, `markRead`, `proposeInterview`, `setInterviewStatus`, `getContactReveal`, `revealContact`
  - **차단돼도 통과하는 프로시저**: `startFromJobPost`, `listMine`, `unreadState`, `listMyUpcomingInterviews`, `requestContactReveal`, `respondContactReveal`, `deleteChatRoom`
  - 채팅 목록: 해당 행 블러 + "차단된 채팅입니다." + 열기 버튼 제거 + 케밥 삭제만
  - **공고 목록·검색에는 서버 필터가 없다** — 차단 상대의 공고는 그대로 노출되고, 웹에서만 상세·프리플라이트 CTA를 비활성화한다
  - **커뮤니티에는 차단 효과가 전혀 없다**(`community.ts`에 block 관련 코드 없음)
- **해제**: `/seeker/me/blocks` → 행별 [차단 해제] → 인라인 확인([취소]/[차단 해제]) → 토스트 "차단을 해제했어요"
  - 표시: 아바타 + 이름(없으면 "알 수 없는 사용자") + `YYYY.MM.DD 차단`
  - 빈 상태 "차단한 상대가 없어요 / 채팅에서 차단한 상대가 여기에 표시됩니다."
- **실패 케이스**: 자기 자신 차단 → `BAD_REQUEST` "자기 자신은 차단할 수 없어요." / 재차단은 멱등(`onConflictDoNothing`)
- **관련 API**: `bambi.blocks.blockUser`, `bambi.blocks.unblockUser`, `bambi.blocks.listMine` (모두 protected + `requireActiveBambiProfile`, `packages/api/src/routers/bambi/blocks.ts`)

### 12.4 운영자 차단(별개 축)

- `chat_room.isBlocked` 컬럼은 운영자 프로시저(`bambi.moderation.setChatRoomBlocked`)만 조작한다. 사용자 간 차단(`user_block`)과 **별개 저장소**이며, 채팅 목록의 `isBlocked`는 둘을 합친 값이다.

---

## 13. 마이페이지 · 계정설정 · 탈퇴

### 13.1 앱 셸(내비게이션)

- **파일**: `apps/web/src/components/bambi/responsive-shell.tsx`, `.../mobile-tab-bar.tsx`, `.../persona-nav.tsx`, `.../seeker-shell.tsx`
- **데스크톱 헤더(md 이상)**:
  - 좌: 로고 → `/`
  - nav: **채용정보**(`/seeker`) / **수다방**(`/seeker/community`) / **고객센터**(`/support`)
  - 우: **역할 전환 버튼**(employer="구인 관리"→`/employer`, admin="운영자 모드"→`/moderator`, **구직자·비로그인은 없음**) + **채팅**(`/seeker/chats`, 안 읽은 방 있으면 코럴 점) + **내 정보**(`/seeker/me`)
  - `/seeker`에서만 헤더에 검색 돋보기 노출
- **모바일 헤더**: 좌 로고, 우 벨(알림) 아이콘 — **`aria-label="알림"`만 있고 동작 없음**
- **모바일 하단 탭바** — 노출 경로는 `/seeker`, `/seeker/chats`, `/seeker/community`, `/seeker/me`, `/seeker/me/*` 뿐 (**`/support`·`/seeker/jobs/*`·`/seeker/chats/[id]`에는 없음**):
  - 탐색 / 채팅(미확인 수 배지) / [employer만] 구인 관리 / 수다방 / [admin만] 운영자 모드 / 내 정보
- **푸터**: 이용약관(`/terms`) · 개인정보 처리방침(`/privacy`) · 환불 정책(다이얼로그) · 체불사업주 명단(외부, 새 탭) · 고객센터(**`mailto:` — `/support` 링크가 아님**)

### 13.2 마이페이지

- **경로**: `/seeker/me` (파일: `apps/web/src/app/seeker/me/page.tsx`, `apps/web/src/components/bambi/screens/seeker.tsx` `SeekerMe`, `apps/web/src/components/bambi/my-page-shell.tsx`)
- **선행 조건**: 로그인(`RequireAuth` — 미로그인 시 토스트 "로그인이 필요해요" + `/seeker?auth=login`)
- **프로필 카드**: 아바타(이름 이니셜) / 표시 이름(`session.user.name`, 비면 "구직자 회원") / 역할 라벨(관리자·구인자·구직자) / 인증 배지(`인증완료`·`인증 필요`)
  - **표시되지 않는 것**: 이메일, 휴대폰 번호, 성별·생년월일, 가입일
- **메뉴(사이드바 6개)**: 내 정보(`/seeker/me`) · 내 신고 내역(`/seeker/me/reports`) · 예정된 면접(`/seeker/me/interviews`) · 차단한 상대(`/seeker/me/blocks`) · 계정 설정(`/seeker/me/settings`) · 고객센터(`/support`) + 하단 **로그아웃**
- **레이아웃**: md 이상은 좌 sticky 사이드바 + 우 본문(안내 카드 4개, `hidden md:grid`, 고객센터 카드는 없음). md 미만은 허브에 프로필+메뉴 리스트+로그아웃 세로 배치, 하위 화면 상단에 "‹ 내 정보" 복귀 링크
- **주의**: `/seeker/me`는 구직자 전용이 아니다 — 구인자·운영자도 "내 정보"로 같은 화면에 들어온다(역할은 라벨로만 구분)
- **관련 API**: `bambi.onboarding.getMine` (protected)

### 13.3 프로필 수정

- **경로**: `/seeker/me/settings` → "프로필" 카드 (파일: `apps/web/src/components/bambi/screens/account-settings-screen.tsx`)
- **수정 가능한 필드**: **표시 이름(닉네임) 단 1개**
  - 클라이언트: `trim().length >= 2` **이고** 현재 값과 달라야 저장 활성. 안내 "2자 이상 입력해 주세요."
  - 서버 zod: `displayName: z.string().min(1).max(80).optional()` — **서버 최소 1자**
  - 저장 위치: **`user.name`**(프로필 테이블 아님). 성공 시 토스트 "저장했어요." + 세션 refetch로 헤더 동기화
- **읽기 전용 필드**: 성별, 생년월일 (본인인증 결과로만 채워짐)
- **코드에 없는 필드**: 지역, 희망 업종, 경력, 자기소개, 프로필 사진 업로드. `bambi_profile` 컬럼은 `userId/role/status/isPhoneVerified/phoneNumber/gender/birthDate/ciHash/diHash/isAdvertiser/createdAt/updatedAt`이 전부다
- **실패 케이스**:
  - `role`을 다른 값으로 요청 → `FORBIDDEN` "Bambi profile role cannot be changed from onboarding." (**역할 변경 불가**)
  - displayName·phoneNumber 둘 다 없음 → `BAD_REQUEST` "At least one personal profile field is required."
  - 프로필 없음 → `NOT_FOUND` "Bambi profile is required."
  - `phoneNumber`를 이 프로시저로 바꾸면 **`isPhoneVerified`가 자동으로 false로 내려간다**(웹 계정설정 화면은 phoneNumber를 보내지 않음)
- **관련 API**: `bambi.onboarding.updateMyProfile` (protected)

### 13.4 계정 설정 화면 구성

- **경로**: `/seeker/me/settings`
- **카드 순서**: ① 프로필(표시 이름 저장) ② 기본 정보(성별·생년월일, 읽기 전용) ③ 본인인증(3.1 참조) ④ **로그아웃 버튼(`md:hidden` — 모바일 전용)** ⑤ 회원 탈퇴 섹션
- **코드에 없는 항목**: 비밀번호 변경(계정 찾기 다이얼로그에만 존재), 알림 설정, 이메일·아이디 변경, 마케팅 수신 동의, 언어·테마, 데이터 다운로드

### 13.5 회원 탈퇴

- **경로**: `/seeker/me/settings` 최하단 (파일: `apps/web/src/components/bambi/withdraw-account-section.tsx`)
- **절차**:
  1. 진입 시 보존기간 문구 계산(`bambi.siteSettings.getMemberPolicy`, 기본 **30일**)과 탈퇴 가능 여부 조회(`bambi.onboarding.getWithdrawEligibility`)
  2. 안내 문구 확인 — "탈퇴하면 즉시 로그아웃되고 다시 로그인할 수 없어요… 본인인증 식별값만 {N}일 동안 남으며, 그동안에는 같은 명의로 본인인증을 다시 할 수 없어요."
  3. [회원 탈퇴] → **확인 다이얼로그 1단계** "정말 탈퇴하시겠어요?" → [취소]/[탈퇴하기]
- **기대 결과(서버 트랜잭션)**:
  - `user`: `deletedAt=now`, `email='withdrawn-{userId}@invalid.bambi'`, `image=null`, `login_id=null`, `login_id_display=null`, `name='탈퇴한 회원'`
  - `account` 행 삭제(비밀번호 즉시 파기)
  - `bambi_profile`: `birthDate/gender/phoneNumber=null`, `isPhoneVerified=false`. **`ciHash`/`diHash`는 보존**
  - `teamMember`·`member` 삭제, **모든 세션 삭제**
  - **`bambi_profile.status`는 바뀌지 않는다** — 탈퇴 판정 축은 `user.deletedAt`
  - 클라이언트: `signOut()` → 게스트 쿠키 정리 → 토스트 → `/`로 이동
- **실패 케이스**: 본인이 소유한 조직에 다른 멤버가 남아 있으면 버튼이 **사전 비활성화**되고, 서버도 `CONFLICT` "팀에 다른 멤버가 남아 있어 탈퇴할 수 없어요. 팀 관리에서 멤버를 모두 정리한 뒤 다시 시도해 주세요."
- **재가입 검증**:
  | 시도 | 결과 |
  |---|---|
  | 같은 계정 재로그인 | 불가 — "탈퇴한 계정이에요. 로그인할 수 없어요." |
  | 같은 이메일로 신규 가입 | **즉시 가능**(이메일이 tombstone으로 치환됨) |
  | 같은 명의(본인인증)로 신규 가입 | **보존기간 동안 불가** — `CONFLICT` "이미 다른 계정에서 본인인증에 사용된 정보예요." |
  - 해시 파기는 **서버 스케줄러가 매일 1회 자동 실행**한다(`apps/server/src/plugins/withdrawal-purge.ts`). 즉시 확인하려면 운영자가 사이트 정보의 「지금 파기 실행」(`bambi.moderation.purgeWithdrawnAccounts`)을 눌러 앞당긴다 → 보존기간 경과 직후가 아니라 **다음 자동 실행 뒤** 열린다는 점만 유의
- **확인 절차 없는 것**: 비밀번호 재확인, 확인 문구 입력 → **없음**(다이얼로그 1단계뿐)
- **관련 API**: `bambi.onboarding.getWithdrawEligibility`, `bambi.onboarding.withdrawMyAccount` (protected), `bambi.siteSettings.getMemberPolicy` (publicProcedure)

---

## 14. 고객센터 · 약관

### 14.1 FAQ

- **경로**: `/support` (파일: `apps/web/src/app/support/page.tsx`, `apps/web/src/components/bambi/support/faq-list.tsx`)
- **선행 조건**: **로그인 필수**(게이트가 `/support`를 public prefix로 두지 않음) + `requireActiveBambiProfile`(정지 계정 차단)
- **기대 결과**: 카테고리 ToggleGroup(전체 + 5종) + 아코디언 질문/답변(답변은 Tiptap JSON 렌더). 일반 회원은 `isPublished=true`만 노출. 빈 상태 "등록된 FAQ가 없어요". 하단 CTA [1:1 문의하기] / [내 문의 내역]
- **관련 API**: `bambi.support.listFaq` (protected)

### 14.2 1:1 문의 등록

- **경로**: `/support/inquiries/new` (파일: `apps/web/src/components/bambi/support/inquiry-form.tsx`)
- **입력 필드(3개)**:
  | 필드 | 컨트롤 | 검증 |
  |---|---|---|
  | 문의 유형 | Select(기본 `account`) | enum 5종 |
  | 제목 | Input `maxLength=100` | trim 2자 이상 |
  | 내용 | Textarea `maxLength=5000` | trim 5자 이상 |
- **카테고리**: `account`=계정·로그인 / `job_post`=공고·지원 / `payment`=결제·광고 / `report`=신고·제재 / `etc`=기타 (`apps/web/src/lib/bambi/support.ts`)
- **첨부파일**: **없음**
- **기대 결과**: 성공 시 토스트 "문의가 등록됐어요." + `/support/inquiries/{id}`로 replace. 상태 `open`으로 접수
- **실패 케이스**: 금칙어(제목·본문) 히트 시 서버 메시지 토스트
- **관련 API**: `bambi.support.createInquiry` (protected + `requireActiveBambiProfile` + 금칙어)

### 14.3 내 문의 목록 · 상세 · 답변 확인

- **경로**: `/support/inquiries`, `/support/inquiries/[id]` (파일: `apps/web/src/components/bambi/support/inquiry-list.tsx`, `.../inquiry-thread.tsx`)
- **상태값**: `open`=접수됨(outline) / `answered`=답변완료(success) / `closed`=종료(secondary)
- **목록**: `lastMessageAt DESC`, 서버 `PAGE_SIZE=20`, `status='published'`만. 빈 상태 "아직 남긴 문의가 없어요". **페이지네이션 UI가 없어 항상 1페이지 고정**
- **상세**: 카테고리 배지 + 상태 배지 + 제목 + 원문 + 메시지 카드 시간순(최대 **100건**). 작성자 배지 **"운영자"/"나"**(작성 시점 스냅샷). 숨김·삭제 메시지는 작성자에게 "운영자가 숨긴 메시지입니다."로 치환
- **답장**: Textarea(최대 5000자) + [보내기] → 상태 자동 전이(**운영자 답 → `answered`, 사용자 답 → `open`**), `lastMessageAt` 갱신
- **종료**: **문의자 화면에는 종료 버튼이 없다.** 종료는 운영자만 하며(`closeInquiry`가 `adminProcedure`), 종료되면 입력창 대신 "종료된 문의예요. 추가로 문의할 내용이 있으면 새로 등록해 주세요."가 뜬다 (서버도 `BAD_REQUEST` "종료된 문의에는 답변을 남길 수 없습니다.")
- **엣지 케이스**:
  - 타인 문의 id로 접근 → `FORBIDDEN`이 아니라 **`NOT_FOUND`**("문의를 불러오지 못했어요. 접근 권한이 없거나 삭제된 문의일 수 있어요.") — 문의 존재 여부가 새지 않게
  - 운영자가 `hidden` 처리한 문의는 작성자에게도 `NOT_FOUND`
  - **답변 알림이 없다** — 사용자가 직접 목록/상세를 열어야만 확인 가능
  - `/support`에는 **모바일 하단 탭바가 없다** → 마이페이지에서 들어가면 뒤로가기 외 복귀 경로가 없음
- **관련 API**: `bambi.support.listMyInquiries`, `bambi.support.getInquiry`, `bambi.support.createInquiryMessage` (모두 protected). `closeInquiry`는 `adminProcedure`라 문의자가 직접 부르면 `FORBIDDEN`

### 14.4 약관 · 개인정보 처리방침

- **경로**: `/terms`, `/privacy` (파일: `apps/web/src/app/(legal)/terms/page.tsx`, `.../privacy/page.tsx`, `.../layout.tsx`)
- **접근 조건**: **완전 공개** — anon·guest·member 모두. 게이트의 `PUBLIC_PREFIXES`에 포함
- **레이아웃**: 로고 헤더(→ `/`)만, 앱 내비게이션 없음, 공용 푸터
- **시행일**: 두 문서 모두 **2026년 7월 27일** — 서버 동의 버전 상수 `LEGAL_CONSENT_VERSIONS`와 일치해야 한다
- **진입점**: 푸터 링크, 회원가입 동의 체크박스의 링크(새 탭)
- **관련 API**: `bambi.siteSettings.getPrivacyContacts` (publicProcedure, 처리방침의 위탁사·연락처·보존기간 값)

### 14.5 공개 공고 랜딩(SEO)

- **경로**: `/jobs`, `/jobs/{region}`, `/jobs/{region}/{industry}` (파일: `apps/web/src/app/jobs/**`, `apps/web/src/components/bambi/public-job-landing.tsx`, `apps/web/src/lib/bambi/job-landing.ts`)
- **접근 조건**: **완전 공개** — anon·guest·member 모두. 게이트의 `PUBLIC_PREFIXES`에 `/jobs` 포함
- **슬러그**: 시/도 16종(`seoul`·`gyeonggi`·… — 지역 마스터 코드와 1:1), 업종 9종(`room-salon`·`ten-pro`·`karaoke-bar`·`danran`·`dabang`·`bar`·`massage`·`yojeong`·`etc`). 표에 없는 슬러그는 **404**(`notFound()`)
- **절차**:
  1. 세션·게스트 쿠키 없이 `/jobs` 진입 → 리다이렉트 없이 랜딩이 뜨는지 확인
  2. JS를 끈 상태(또는 `view-source:`)에서 공고 제목·업체명·지역·급여가 HTML에 그대로 있는지 확인 — **서버 컴포넌트 렌더가 핵심**
  3. `/jobs/seoul` → 업종 칩 링크, `/jobs/seoul/room-salon` → 다른 지역·업종 링크가 실제 `<a href>`인지 확인
  4. `/jobs/xxxx`, `/jobs/seoul/xxxx` → 404
  5. 공고 카드 클릭 → `/seeker/jobs/{id}`(수집 공고는 `/seeker/jobs/crawled/{id}`)로 이동, **anon이면 여기서 기존 인증 게이트에 걸린다**(의도된 전환 지점)
- **기대 결과**:
  - `<title>`/`description`이 랜딩마다 다르다(예: `서울 룸싸롱 알바 채용 정보 | 밤비알바`), `<link rel="canonical">`이 자기 경로를 가리킨다
  - 소개 문단도 축 조합별로 다르다(`jobLandingIntro`)
  - 지역·업종 랜딩에는 화면 브레드크럼과 같은 계층의 `BreadcrumbList` JSON-LD가 실린다(인덱스 `/jobs`에는 없다 — 항목이 하나뿐이라 무의미)
  - 목록 썸네일은 **블러**(수다방 목록과 같은 기준), 공고 카드는 데스크톱 3열 그리드
  - 상단 CTA(outline)·하단 CTA(primary) 모두 `/seeker?auth=signup`
- **엣지 케이스**: `bambi.jobs.list` 호출이 실패해도 소개 문단·지역 링크는 그대로 떠야 한다(빈 목록 폴백)
- **관련 API**: `bambi.jobs.list` (publicProcedure, `regionCode`·`industryCategory` 필터, published+paid 게이트 그대로)

### 14.6 사이트맵 · robots · 공개 영역 상호 링크(SEO 공통)

- **경로**: `/sitemap.xml`, `/robots.txt` (파일: `apps/web/src/app/sitemap.ts`, `apps/web/src/app/robots.ts`)
- **사이트맵 구성**:
  - 정적: `/seeker`·`/terms`·`/privacy`
  - 공고 랜딩 **161개**: `/jobs` + 지역 16 + 지역×업종 144 (`JOB_LANDING_REGIONS`·`JOB_LANDING_INDUSTRIES`에서 생성 — 표에 슬러그를 추가하면 사이트맵도 자동으로 따라온다)
  - 게시판 **4개**: `/board` + 공개 게시판 3(`notice`·`free`·`work_talk`)
  - 공개 글 상세: 게시판당 **최근 200건 상한**(`bambi.community.listPublicPosts`를 페이지 단위로 재사용). `<lastmod>`는 글의 `updatedAt`
- **확인 사항**:
  - `sitemap.xml`에 `/jobs/seoul/room-salon` 같은 조합과 `/board/notice/{postId}`가 실제로 들어 있다
  - 서버(RPC) 조회가 실패해도 **정적 경로 + 랜딩 + 게시판 목록**은 그대로 나온다(글 URL만 빠진다)
  - 라우트는 `dynamic = "force-dynamic"` — 빌드 시점에 서버가 없어 폴백만 담긴 사이트맵이 굳지 않아야 한다
  - `robots.txt`는 프로덕션(`VERCEL_ENV=production`)에서만 전체 allow + `sitemap:` 줄, 그 외 배포는 전체 disallow (**이번 변경 없음**)
- **공개 영역 상호 링크**: 공용 푸터(`apps/web/src/components/bambi/site-footer.tsx`)에 `지역별 채용 정보`(/jobs)·`커뮤니티 게시판`(/board)·`공지사항`(/board/notice) 링크가 있다. 이 푸터는 공개 랜딩·공개 게시판·약관 셸뿐 아니라 **인증 게이트 화면**(`seeker-auth-gate-screen`)과 로그인 셸(`responsive-shell`)에도 붙으므로, 비로그인 `/seeker`에서도 공개 영역으로 한 홉에 이동할 수 있어야 한다
- **미구현(의도)**: `WebSite` JSON-LD의 `SearchAction`은 넣지 않는다 — 공개 검색 진입점 자체가 없다(공고 검색은 게이트 뒤). `JobPosting` 구조화 데이터도 넣지 않는다 — 구글 채용 검색은 **공개 상세 페이지**를 요구하는데 공고 상세(`/seeker/jobs/[id]`)가 로그인 게이트 뒤라 요건을 못 맞춘다

### 14.7 알림 — 사용자 화면 없음

- `bambi_notification` 테이블은 존재하고 `chats.ts`가 채팅 메시지 발생 시 행을 쓴다(`packages/api/src/services/bambi-notifications.ts`).
- 그러나 **읽기·목록·읽음처리 프로시저가 없고**, `apps/web/src`에 알림 UI가 없다. 모바일 헤더의 벨 아이콘은 `aria-label="알림"`만 있고 핸들러가 없다.
- 사용자에게 실제로 보이는 신호는 **채팅 안 읽은 방 수**뿐(`bambi.chats.unreadState` → 헤더 코럴 점 + 탭바 배지).
- → 알림·푸시·이메일 통지는 **QA 범위에서 제외**.

---

## 15. 권한 경계 테스트

### 15.1 비로그인(anon)

| 시도 | 기대 결과 | 근거 파일 |
|---|---|---|
| `/` | → `/seeker?auth=login` | `apps/web/src/lib/bambi/resolve-gate.ts` |
| `/seeker` | 통과 → 블러 배경 + 인증 카드(`SeekerAuthGateScreen`) | `apps/web/src/app/seeker/layout.tsx` |
| `/seeker/jobs/{uuid}` | → `/seeker?auth=login` | resolve-gate |
| `/seeker/chats`, `/seeker/community`, `/seeker/me`, `/support` | → `/seeker?auth=login` | resolve-gate |
| `/terms`, `/privacy` | 통과 | `PUBLIC_PREFIXES` |
| `/jobs`, `/jobs/seoul`, `/jobs/seoul/room-salon` | 통과 → 공개 공고 랜딩(읽기 전용) | `PUBLIC_PREFIXES` + `apps/web/src/app/jobs/**` |
| `/jobs/{없는 슬러그}` | 404 | `apps/web/src/lib/bambi/job-landing.ts` |
| `/icon.svg`, `/robots.txt`, `/sitemap.xml` | 통과(정적 파일 패턴) | resolve-gate |
| API `bambi.jobs.list` / `search` / `getById` / `crawledJobs.getById` / `regions.list` / `siteSettings.getFooter` 직접 호출 | **성공**(publicProcedure) | `packages/api/src/routers/bambi/*` |
| API `bambi.reviews.listByJobPost`, `bambi.chats.*`, `bambi.community.listPosts` 직접 호출 | `UNAUTHORIZED` | `packages/api/src/index.ts` `requireAuth` |
| API `bambi.community.overview` 직접 호출 | **성공**(publicProcedure, 미자격도 요약 열람 가능) | `packages/api/src/routers/bambi/community.ts` |

### 15.2 게스트(본인인증만 마친 비회원)

| 시도 | 기대 결과 |
|---|---|
| `/seeker` | 목록 열람 가능 |
| 공고 카드 클릭 | `/seeker?auth=signup` (상세 진입 불가) |
| `/jobs/**` | 통과 → 공개 공고 랜딩(anon과 동일) |
| `/seeker/**` 그 외 경로, `/support` | `/seeker?auth=signup&guestBlocked=1` + 토스트 "회원가입 후에 볼 수 있어요" |
| `/` | `/seeker` |
| 쿠키 위조 | 서명 검증 실패 → anon 취급 |

### 15.3 구인자(employer)가 구직자 경로에 접근

| 시도 | 기대 결과 | 근거 |
|---|---|---|
| `/` | `redirectToRoleHome()` → **`/seeker`** (역할 무관 구직자 홈) | `apps/web/src/lib/bambi/require-role.ts` |
| `/seeker` 목록 | **열람 가능** | 게이트 없음 |
| `/seeker/jobs/{id}` 상세 | **열람 가능**, 단 채팅 CTA는 숨김(`canStartChat=false`) | `apps/web/src/app/seeker/jobs/[id]/page.tsx` |
| `/seeker/jobs/{id}/chat` | **`/employer`로 리다이렉트**(서버 레이아웃 `enforceJobSeekerAccess()`, 렌더 전) | `apps/web/src/app/seeker/jobs/[id]/chat/layout.tsx` |
| `/seeker/chats`, `/seeker/chats/{id}` | **진입 가능**(역할 게이트 없음). 자기가 참여한 방만 보임 | `apps/web/src/app/seeker/chats/**` |
| 채팅 목록에서 [신고] | **메뉴 자체가 노출되지 않음**(뷰어가 그 방의 구직자일 때만) + 서버도 `FORBIDDEN` "채팅 신고는 구직자만 할 수 있어요." | `seeker-chat-list-responsive.tsx`, `moderation.ts` |
| `/seeker/me`, `/seeker/me/*` | **진입 가능**(공용 마이페이지). 프로필 카드 역할 라벨만 "구인자" | `my-page-shell.tsx` |
| `/seeker/community` | 광고 중(`isAdvertiser=true`)이면 가능, 아니면 토스트 후 `/seeker` | `bambi-community-access.ts` |
| API `bambi.chats.startFromJobPost` | `FORBIDDEN`(`role!=='job_seeker'`) | `chats.ts` |
| API `bambi.reviews.create` | `FORBIDDEN` "Only the job seeker can review this chat room." | `reviews.ts` |
| API `bambi.jobs.listMine` | 구직자는 `FORBIDDEN`, 구인자는 정상 | `jobs.ts` |

### 15.4 운영자(admin)가 구직자 경로에 접근

| 시도 | 기대 결과 |
|---|---|
| `/` | `/seeker` |
| `/seeker`, `/seeker/jobs/{id}` | 열람 가능(채팅 CTA 숨김) |
| `/seeker/jobs/{id}/chat` | **`/moderator`로 리다이렉트** |
| `/seeker/chats`, `/seeker/me/*` | 진입 가능 |
| `/seeker/community` | **성별 무관 입장 가능**(`role==='admin'`) |
| 커뮤니티 글 수정 | **비밀번호 없이는 불가**(운영자 특권 없음). 삭제는 가능 |
| 커뮤니티 댓글 수정 | **불가**(작성자 본인만). 삭제는 가능 |

### 15.5 구직자가 다른 역할 경로에 접근

| 시도 | 기대 결과 | 근거 |
|---|---|---|
| `/employer/**` | `resolveEmployerAccess()` → `homePathForRole('job_seeker')` = **`/seeker`** | `apps/web/src/lib/bambi/require-role.ts` |
| `/moderator/**` | `enforceModeratorAccess()` → **`/seeker`** | 동일 |
| API `bambi.analytics.summary` | `FORBIDDEN`(구직자 차단) | `packages/api/src/routers/bambi/analytics.ts` |
| API `bambi.jobs.create/update/delete/listMine` | `FORBIDDEN` | `jobs.ts` |
| API `bambi.moderation.*` 운영자 프로시저 | `FORBIDDEN`(`requireAdminProfile`) | `moderation.ts` |
| API `bambi.support.listInquiriesByAdmin`, `bambi.bannedWords.*` | `FORBIDDEN`(adminProcedure) | `support.ts`, `banned-words.ts` |

### 15.6 계정 상태별 경계

| 상태 | 기대 결과 |
|---|---|
| `active` | 전 기능 정상 |
| `warned` | **서버 차단 없음**(안내 배너만). 모든 기능 정상 |
| `suspended` | `requireActiveBambiProfile`을 쓰는 모든 프로시저가 `FORBIDDEN` — 채팅 시작·메시지·신고·차단·후기·커뮤니티·**고객센터 문의·FAQ 열람까지 차단**. 배너는 닫을 수 없음 |
| 프로필 없음(`role===null`) | `getMyRouting`이 `role:null` → `/seeker?auth=login`으로 리다이렉트 |
| 탈퇴(`user.deletedAt`) | 로그인 자체가 차단 |

### 15.7 소유권 경계

| 시도 | 기대 결과 |
|---|---|
| 남의 채팅방 id로 `bambi.chats.getById` | `NOT_FOUND`(`requireChatParticipant`) |
| 남의 문의 id로 `bambi.support.getInquiry` | `NOT_FOUND`(FORBIDDEN 아님) |
| 남의 신고를 `listMyReports`로 조회 | 본인 것만 반환 |
| 남이 차단한 사용자를 `unblockUser`로 해제 | 내 차단 행만 삭제 → 남의 차단은 그대로 |
| 자기 공고에 채팅 시작 | `FORBIDDEN` |
| 자기 자신 차단·신고 | `BAD_REQUEST` |

---

## 부록: 매뉴얼 갱신 필요 항목 / 확인 필요 사항

> `docs/manual/seeker-manual.md`(최종 갱신 2026-07-23)와 현재 코드가 어긋나는 지점. **코드가 정답**이며, 아래는 매뉴얼 갱신 백로그다.

### A. 매뉴얼 갱신 필요 (코드와 명백히 다름)

| # | 매뉴얼 서술 | 실제 코드 | 근거 파일 |
|---|---|---|---|
| A-1 | "회원가입: 시작 화면에서 회원가입 → 가입 유형 → **이름/이메일/비밀번호** 입력" | 회원가입은 **2단계**다. ①본인인증을 마쳐야 ②폼이 열린다. 필드는 **닉네임 / 아이디 / 비밀번호 / 비밀번호 확인 / 이메일 / 가입 유형 / 약관 동의 체크박스** 7개 | `apps/web/src/components/bambi/auth/auth-panel.tsx`, `.../auth-fields.tsx` |
| A-2 | "로그인: **이메일**과 비밀번호를 입력" | 입력 칸 라벨은 **"아이디"**이고 아이디·이메일을 한 칸으로 받는다(`@` 포함 여부로 분기) | `apps/web/src/lib/bambi/login-id.ts` |
| A-3 | "비회원: 로그인 화면 아래쪽 **휴대폰 인증** 버튼 → 이름/생년월일/휴대폰/성별 입력" | 버튼 라벨은 **"비회원으로 인증하기"**이고, 포트원 구성 환경에서는 KCP 인증창이 뜬다. 이름·생년월일 직접 입력 폼은 **포트원 미구성 개발 환경의 목 폼**뿐 | `apps/web/src/components/bambi/auth/auth-panel.tsx`, `.../phone-verify-dialog.tsx` |
| A-4 | "**수다방** (현재 준비 중)" | 수다방은 **완전히 구현되어 있다** — 5개 게시판, 글/댓글/추천, 비밀글, 광고글, 수집 글, 금칙어 검사 | `apps/web/src/app/seeker/community/**`, `packages/api/src/routers/bambi/community.ts` |
| A-5 | 내비게이션 표에 "탐색 / 채팅 / 수다방 / 내 정보" 4개 | 데스크톱 헤더 nav는 **채용정보 / 수다방 / 고객센터**이고, 우측에 역할 전환·채팅·내 정보가 따로 있다. 모바일 탭바는 탐색/채팅/(구인 관리)/수다방/(운영자 모드)/내 정보 | `apps/web/src/components/bambi/responsive-shell.tsx`, `.../mobile-tab-bar.tsx` |
| A-6 | "**연락처는 구인자가 공개**하고 구직자가 확인한다 / 구직자의 전화번호는 공개되지 않는다" | 현행 흐름은 **정반대**다. **구인자가 [연락처 공개 요청]을 보내고 구직자가 [공개]/[거절]** 하며, 공개되는 것은 **구직자의 인증 전화번호**다 | `packages/api/src/routers/bambi/chats.ts` (`requestContactReveal`/`respondContactReveal`) |
| A-7 | "연락처 보기 버튼을 누르면 **연락처 화면으로 이동**" | 전용 연락처 화면(`contact-reveal.tsx`)은 **실서비스에서 도달 불가**하다. 연락처는 채팅방 안 인라인 시스템 메시지로 처리된다 | `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`, 회귀 테스트 `seeker-chat-room-responsive.test.ts` |
| A-8 | "면접 확정 전까지 전화번호는 공개되지 않는다" | **구인자의 인증 전화번호는 면접 확정과 무관하게** 공고 상세(`bambi.jobs.getById`, publicProcedure)와 채팅방(`getById`)에서 구직자에게 노출된다 | `packages/api/src/routers/bambi/jobs.ts`, `.../chats.ts` |
| A-9 | "계정 설정: **표시 이름**을 바꾸고… 로그아웃" | 로그아웃 버튼은 계정설정에서 **`md:hidden`(모바일 전용)**이다. 데스크톱은 마이페이지 사이드바에만 있다. 또 계정설정 최하단에 **회원 탈퇴 섹션**이 있는데 매뉴얼에 없다 | `apps/web/src/components/bambi/screens/account-settings-screen.tsx`, `.../withdraw-account-section.tsx` |
| A-10 | 신고 사유 7종을 그대로 나열 | 사유는 맞지만 **"외부 연락처 유도"가 서버 enum `misleading_job_information`으로 매핑**되어 "내 신고 내역"에서는 **"허위 공고 정보"** 로 표시된다 | `apps/web/src/components/bambi/report-dialog.tsx`, `apps/web/src/lib/bambi/report-labels.ts` |
| A-11 | "채팅방에서 신고한 경우 해당 대화가 **잠시 숨겨질 수 있습니다**" | 신고로 채팅을 숨기는 코드가 **없다**. 완료 화면 문구만 그렇게 말한다 | `apps/web/src/components/bambi/safety-kit.tsx` `ReportDone` |
| A-12 | "채팅 목록: 각 방에 **N개 미확인** 표시" (신고 배지 언급 없음) | `신고 완료 · 조치 대기 중` 배지가 추가로 있다. 또 케밥 메뉴에 **삭제·신고·차단**이 있는데 매뉴얼에 없다 | `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx` |
| A-13 | "면접 일정 제안은 보통 업체가 합니다" | "보통"이 아니라 **구직자는 제안 자체가 불가능**하다(서버 `FORBIDDEN` + UI 미노출) | `packages/api/src/routers/bambi/chats.ts` `proposeInterview` |
| A-14 | "사진은 8MB, PDF는 10MB" | 클라이언트는 8MB/10MB지만 **서버 정책은 이미지·PDF 모두 10MB**다 | `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` vs `packages/api/src/services/bambi-media-policy.ts` |
| A-15 | 매뉴얼에 **고객센터(`/support`)가 전혀 없다** | FAQ + 1:1 문의(등록·목록·상세·답장·종료)가 구현되어 있고 마이페이지·헤더 nav에 링크가 있다 | `apps/web/src/app/support/**`, `packages/api/src/routers/bambi/support.ts` |
| A-16 | 매뉴얼에 **회원 탈퇴가 없다** | 탈퇴 흐름·보존기간·재가입 제약이 구현되어 있다 | `packages/api/src/routers/bambi/onboarding.ts` `withdrawMyAccount` |
| A-17 | 매뉴얼에 **수집(크롤링) 공고가 없다** | 목록·검색·전용 상세 라우트(`/seeker/jobs/crawled/[id]`)가 있고, 채팅·신고·후기가 모두 불가한 별개 흐름이다 | `apps/web/src/app/seeker/jobs/crawled/[id]/page.tsx` |
| A-18 | 매뉴얼에 **아이디 찾기/비번 재설정 링크의 노출 조건**이 없다 | 포트원 공개키 미구성 시 **링크 자체가 렌더되지 않는다** | `apps/web/src/components/bambi/auth/account-recovery-dialog.tsx` |
| A-19 | 매뉴얼에 **찜/스크랩**이 없다 (없는 게 맞음) | 실제로도 없다 — 다만 사용자 문의 대비로 "제공하지 않음"을 명시하는 편이 낫다 | — |
| A-20 | "공고 목록: 각 공고 카드에 **후기 개수와 별점**이 보이고, 인증 업체에 `인증 완료` 표시" | 실제 카드에는 **후기·별점·인증 배지가 없다**(회사명/지역·업종/급여/커버/HIT 리본만) | `apps/web/src/components/bambi/visual-job-card.tsx` |
| A-21 | "빠른 필터 칩: 검증 완료 / **오늘 면접 가능** / 초보 가능" | 라벨은 **"당일면접 가능"** | `apps/web/src/lib/bambi/marketplace.ts` |
| A-22 | 수다방 홈 미리보기 "게시판별 최대 4개" | 맞다(`OVERVIEW_LIMIT=4`). 다만 `/seeker` 홈 섹션은 **중고거래를 제외한 4개 게시판**만 노출한다 | `apps/web/src/components/bambi/home-community-section.tsx` |

### B. 확인 필요 (코드만으로 의도를 단정할 수 없음 — 기획/QA 판단 필요)

1. **구인자 전화번호 무조건 노출** — `bambi.jobs.getById`가 **publicProcedure**인데 공고 작성자의 인증 전화번호를 응답에 싣는다. 화면 문구("면접 확정 전 연락처 보호 중")와 상충. 의도된 정책인지 확인 필요.
2. **`requestContactReveal` / `respondContactReveal` / `deleteChatRoom`에 차단 가드 없음** — 차단 상태에서 연락처 요청·응답이 통과할 수 있는지 실동작 확인 필요.
3. **`listMyUpcomingInterviews`에 차단·소프트삭제 필터 없음** — 차단하거나 삭제한 방의 면접이 "예정된 면접"에 계속 노출되는지 확인 필요.
4. **`startFromJobPost`에 차단 검사 없음** — 차단한 상대 공고로 방 생성 자체는 되고 이후 진입만 막힌다(UI CTA 비활성화로만 커버).
5. **`markRead`의 `messageIds` 상한 50** — 상대 메시지 50건을 넘는 방에서 읽음 처리가 zod 검증에 걸려 실패한다("읽음 상태를 반영하지 못했어요.").
6. **채팅 첨부의 실제 바이트 업로드 경로** — 클라이언트가 `uploadUrl`로 PUT 하는 코드가 web에 없고, 조회 URL(`/bambi/local-chat-attachments`)은 자리표시 SVG를 반환한다. 실제 GCS 경로 존재 여부 확인 필요.
7. **첨부 매직넘버 오류 문구가 GIF를 허용한다고 안내** — 허용 MIME에는 GIF가 없어 다음 단계에서 거부된다(문구/정책 불일치).
8. **커뮤니티 이미지 상한 표기 불일치** — 에디터 UI는 "최대 10MB", 서버 정책은 8MB. 8~10MB 파일은 업로드 시도 후 서버가 거절한다.
9. **채팅에 금칙어·스캐너 미적용** — `chat_message.riskFlags` 컬럼은 있으나 쓰는 코드가 없다. 의도된 설계인지 누락인지 확인 필요.
10. **정지 계정의 고객센터 이용 차단** — 정지 배너는 "고객센터로 문의해 이의를 신청할 수 있어요"라고 안내하지만, `support.*` 프로시저 전부가 `requireActiveBambiProfile`을 거쳐 **정지 계정은 문의도 FAQ도 볼 수 없다**. 정책 확인 필요.
11. **내 문의 목록에 페이지네이션 UI 없음** — 서버는 `page`를 받지만 화면은 항상 1페이지 고정 → 21건 이상은 접근 불가.
12. **`updateMyProfile` 서버 `displayName.min(1)` vs 클라이언트 2자** — 어느 쪽이 정본인지.
13. **커뮤니티 댓글 작성자명이 계정 실명(`user.name`)** — 글은 글별 익명 표시명인데 댓글만 계정명이 노출된다. 익명성 기대치 확인 필요.
14. **본인 커뮤니티 글에도 신고 버튼이 노출** — 서버의 자기 신고 차단은 `targetType==='user'`에만 있어 자기 글 신고가 접수될 수 있는지 확인 필요.
15. **비밀번호 기반 커뮤니티 글 삭제 UI 부재** — 서버는 허용하지만 화면 경로가 없다.
16. **미자격자용 수다방 안내 화면 없음** — `resolveCommunityAccess`의 `notice`(unverified/male_employer/male_seeker)를 소비하는 컴포넌트가 없다. 실제 동작은 토스트 후 `/seeker` 리다이렉트뿐.
17. **수다방 탭이 미자격자에게도 노출** — `canAccessCommunity` 분기가 헤더 nav·탭바에 없다.
18. **커뮤니티 조회수 어뷰징** — 새로고침마다 +1, 본인 조회도 카운트.
19. **커뮤니티 댓글 200건 상한** — 201번째부터 목록에 안 나오지만 `commentCount`는 계속 증가해 표시 수와 실제 목록이 어긋난다.
20. **공고 목록 impression / detail_view 중복 집계** — dedupe·쿨다운이 없어 새로고침마다 누적된다. HIT 리본 임계값(detailViews 100)이 실사용자 수와 어긋날 수 있다.
21. **필터가 URL에 동기화되지 않음** — 새로고침·뒤로가기·딥링크 공유 시 초기화. 의도인지 확인 필요.
22. **로컬 전용 필터(검증/당일/초보)와 페이지네이션 정합성** — 서버가 이 조건을 모르므로 페이지마다 남는 건수가 들쭉날쭉하고 헤더 개수도 화면 기준으로 대체된다.
23. **수집 공고임을 목록 카드에서 알 수 없음** — 클릭 전에는 채팅 가능 공고인지 구분 불가.
24. **공고 상세의 "검수 통과한 공고"/"연락처 보호" 배지가 하드코딩** — 공고 데이터와 무관하게 항상 표시.
25. **마켓플레이스 에러 문구가 사실과 다름** — "샘플 공고를 표시하고 있어요"라고 하지만 실제로는 빈 배열을 반환한다(목업 폴백 경로 없음).
26. **모바일 인증 리디렉션 복귀 시 회원가입 단계 유실 가능** — `?auth=login`에서 모드만 토글해 가입에 들어간 경우 복귀 URL에 `auth=login`이 남아 로그인 모드로 돌아온다. **실기기 QA 필수**.
27. **`checkIdentityForSignup`에 레이트리밋 없음** — 같은 흐름의 `startIdentityVerification`은 rateLimited인데 이쪽은 publicProcedure다.
28. **`recordLegalConsent` 실패를 삼킴** — 약관 동의 이력이 누락돼도 가입은 성공한다.
29. ~~**`purgeWithdrawnAccounts`가 cron 없이 운영자 수동 실행**~~ — 해소됨. 서버 스케줄러가 매일 1회 자동 실행한다(운영자 버튼은 즉시 실행용). 같은 명의 재가입은 보존기간 경과 시점이 아니라 **그 뒤 첫 자동 실행 시점**에 열린다.
30. **모바일 헤더 벨 아이콘이 무동작** — `aria-label="알림"`만 있고 핸들러가 없다. QA 결함으로 볼지 확인 필요.
31. **`/support`에 모바일 하단 탭바 없음** — 마이페이지에서 들어가면 뒤로가기 외 복귀 경로가 없다.
32. **`bambi.jobs.legacyList`** — 웹 화면에서 호출처를 찾지 못했다(네이티브/외부 사용 여부 확인 필요).

### C. QA 범위에서 제외해야 할 사문(死文) 코드

라우트에서 import되지 않아 실서비스에서 도달할 수 없는 화면·컴포넌트:

- `apps/web/src/components/bambi/screens/public-marketplace.tsx` (`PublicMarketplaceScreen`)
- `apps/web/src/components/bambi/marketplace.tsx`의 `JobList` / `ResponsiveJobCard` / `MarketplaceRegionChips`
- `apps/web/src/components/bambi/screens/seeker.tsx`의 `SeekerHome` / `SeekerDetail` / `SeekerChat` / `SeekerPersona` — `/preview` 데모(PhoneFrame) 전용
- `apps/web/src/components/bambi/screens/contact-reveal.tsx` (`ContactReveal`) — `roomId`를 넘기는 호출부 없음 → 더미 프리뷰만 렌더
- `apps/web/src/components/bambi/screens/seeker-chat-preflight.tsx`의 내부 상수 `SEEKER_STEPS` / `PUBLIC_STEPS` 및 `?entry=public` 분기 — 페이지가 항상 `steps`를 덮어쓴다
- `apps/web/src/components/bambi/ds.tsx`의 `DEFAULT_NAV_ITEMS` "저장" 탭 — 실제 탭바가 별도 목록을 넘긴다
- `apps/web/src/components/bambi/screens/seeker.tsx`의 `SeekerChats` — 채팅 목록 API 실패 시의 목업 폴백으로만 사용
