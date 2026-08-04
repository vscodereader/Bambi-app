# 구인자(Employer) 테스트 흐름

> 작성 기준: `C:\Users\user\projects\bambi-app` 브랜치 `feat/region-biznum-role-ux` (커밋 `bd7e2e4`) 소스코드.
> 모든 항목은 코드에서 직접 확인한 내용만 담았다. 코드에 없는 기능은 "없음"으로 명시했다.
> 경로 표기: 웹 라우트는 `apps/web/src/app/...`, tRPC(oRPC) 프로시저는 `bambi.<router>.<procedure>` (구현: `packages/api/src/routers/bambi/<router>.ts`).

---

## 0. 사전 조건

### 0.1 계정·데이터 준비

| 항목 | 내용 |
|---|---|
| 구인자 계정 A (소유자) | 가입 시 "업소회원" 선택. 이후 사업자 정보 제출 → 운영자 승인(verified)까지 완료. `member.role = owner` |
| 구인자 계정 B (매니저) | A의 조직에 `manager`로 초대·승인된 계정 |
| 구인자 계정 C (스태프) | A의 조직에 `staff`로 초대·승인되고, 특정 팀에만 소속된 계정 |
| 구인자 계정 D (미승인) | 가입만 하고 사업자 정보 미제출(`approvalStatus = none`) |
| 구인자 계정 E (반려) | 사업자 정보 제출 후 운영자가 반려(`rejected`) 처리한 계정 |
| 구직자 계정 | 채팅·면접·후기·연락처 응답 시나리오 상대역. 휴대폰 인증 완료 필수(`canStartChat`) |
| 운영자(admin) 계정 | 공고 검수, 결제 확인, 업체 승인, 팀 초대 승인 담당. **구인자 흐름 대부분이 운영자 조치 없이는 끝까지 진행되지 않는다** |
| 광고 상품 | `/moderator/ad-products`에서 배너형(previewTemplate `premium-top`)·리스팅형(`special`/`urgent`/`recommended`) 상품이 최소 1개씩 활성 상태여야 함 |
| 무통장입금 계좌 | `/moderator/site-settings`에서 최소 1건 등록. 없으면 유료 공고 등록 자체가 서버에서 `BAD_REQUEST`로 막힌다 (`packages/api/src/routers/bambi/jobs.ts` `resolveJobPostExposure`) |
| 지역 마스터 | `bambi.regions.list`가 시/도 + 시군구를 반환해야 지역 선택이 동작 |

### 0.2 env 의존성

| 변수 | 없을 때 동작 | 정의 |
|---|---|---|
| `PORTONE_API_SECRET` / `NEXT_PUBLIC_PORTONE_STORE_ID` / `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` | 본인인증이 **목(mock) 폼**으로 폴백. 가입 시 본인인증 없이 프로필 생성 허용. **아이디/비밀번호 찾기 링크가 아예 사라짐** | `packages/env/src/server.ts`, `packages/env/src/web.ts` |
| `NTS_SERVICE_KEY` | 사업자 진위확인 미실행 → 전 건 "미확인" 접수, 화면에 "곧 준비될 기능입니다" 표기 (`getMine.biznumCheckEnabled = false`) | `packages/env/src/server.ts` |
| `GCS_PUBLIC_BUCKET` / `NEXT_PUBLIC_GCS_PUBLIC_BASE_URL` | 업로드 인텐트가 `local://` 플레이스홀더로 폴백, 이미지가 샘플 썸네일로 표시 | 동일 |
| `BAMBI_GUEST_TOKEN_SECRET` | 개발 폴백 키 사용(게스트 쿠키 서명) | `packages/env/src/web.ts` |
| `BAMBI_COOKIE_PREFIX` | 미설정 시 better-auth 기본 prefix. 미들웨어(`apps/web/src/proxy.ts`)와 auth 서버가 같은 값이어야 세션 판정 일치 | — |

프로덕션 빌드는 `GCS_PUBLIC_BUCKET`, `PORTONE_*` 누락 시 부팅/빌드가 실패한다.

### 0.3 전역 접근 게이트 (모든 시나리오의 전제)

`apps/web/src/proxy.ts` + `apps/web/src/lib/bambi/resolve-gate.ts`

| 방문자 | `/seeker` | `/` | 그 외 |
|---|---|---|---|
| anon (세션·게스트 쿠키 없음) | 통과 → 전체화면 인증 게이트 | `/seeker?auth=login` | `/seeker?auth=login` |
| guest (본인인증만 완료, 서명 쿠키 유효) | 통과 → 마켓 목록 | `/seeker` | `/seeker?auth=signup&guestBlocked=1` + 토스트 |
| member (세션 있음) | 통과 | `/seeker` (역할 무관) | 역할 가드 적용 |

공개 prefix: `/api`, `/bambi`, `/terms`, `/privacy`. RSC prefetch 요청은 게이트를 건너뛴다.

### 0.4 상태값(enum) 참고 — `packages/db/src/schema/bambi.ts`

- `bambi_user_role`: `job_seeker` / `employer` / `admin`
- `account_status`: `active` / `warned` / `suspended`
- `employer_verification_status`: `none` / `pending` / `verified` / `rejected`
- `job_post_status`: `draft` / `pending_review` / `published` / `hidden` / `rejected` / `on_hold`
  (`on_hold` = 검수 보류. 운영자 강제 숨김 `hidden`과 구분되며 구인자 목록에 "검수 보류"로 표시)
- `job_payment_status`: `unpaid` / `paid`
- `job_exposure_type`: `premium-banner` / `left-banner` / `right-banner` / `special` / `urgent` / `recommended` / `standard`
- `interview_status`: `proposed` / `confirmed` / `declined` / `canceled` / `completed`
- `support_inquiry_status`: `open` / `answered` / `closed`
- 조직 멤버 역할(정규화): `owner` / `manager`(레거시 `admin`) / `staff`(레거시 `member`) — `packages/api/src/services/bambi-organization-authz.ts`

화면 라벨 맵: `apps/web/src/lib/bambi-options.ts`(`jobStatusLabels`, `verificationStatusLabels`, `biznumStatusLabels`), `apps/web/src/lib/bambi/exposure.ts`(`EXPOSURE_TYPE_LABELS`, `getJobDisplayStatus`).

---

## 1. 가입 · 로그인 · 계정 복구

### 1.1 구인자 회원가입 (2단계)

- **경로**: `/seeker?auth=signup` (파일: `apps/web/src/app/seeker/page.tsx`, `apps/web/src/app/seeker/layout.tsx`, `apps/web/src/components/bambi/auth/auth-panel.tsx`)
- **선행 조건**: 로그아웃 상태. 포트원 env 구성 여부에 따라 실인증/목 인증이 갈린다.
- **절차**:
  1. `/seeker` 진입 → anon이면 전체화면 인증 게이트(블러 처리된 실제 공고 12건 배경). "회원가입" 링크로 전환하거나 `/seeker?auth=signup` 직접 진입
  2. **STEP 1 — 본인인증** (`apps/web/src/components/bambi/auth/auth-verify-step.tsx`): "본인인증하고 계속하기" 클릭 → `bambi.onboarding.startIdentityVerification`으로 인증건 ID 발급 → 포트원 KCP 인증창(PC=팝업, 모바일=리디렉션)
  3. 인증 성공 → `bambi.onboarding.checkIdentityForSignup` → `POST /api/guest`(게스트 서명 쿠키 발급) → STEP 2로 전환
  4. **STEP 2 — 정보 입력** (`apps/web/src/components/bambi/auth/auth-fields.tsx`): 닉네임(2자↑), 아이디(3자↑), 비밀번호(8자↑), 비밀번호 확인, 이메일(`@` 포함), **가입 유형 ToggleGroup에서 "업소회원" 선택**(기본값은 개인회원), 약관+처리방침 통합 동의 체크박스
  5. "회원가입" 제출
- **기대 결과**:
  - `authClient.signUp.email` → `bambi.onboarding.createEmployerProfile` → `bambi.onboarding.recordLegalConsent` 순 호출
  - `bambi_profile.role = employer`, 인증 결과(번호·성별·생년월일·CI/DI 해시)가 서버 값으로 덮어써짐, `isPhoneVerified = true`
  - **역할과 무관하게 `/seeker`로 이동**한다(`window.location.assign` 하드 내비게이션). `/employer`로 자동 진입하지 않음.
    소프트 내비게이션(`router.push`)이면 세션이 없던 시점에 anon으로 렌더된 Router Cache 엔트리를 재생해 **가입 직후 404**가 뜨고 새로고침해야 정상이 됐다 — 로그인 성공 경로와 같은 이유로 하드 내비게이션이다
  - 업소회원 선택 시 안내 문구 노출: "가입 후 업체 정보를 입력하고 운영자 승인을 받으면 구인 기능을 이용할 수 있어요."
- **엣지 케이스 / 실패 케이스**:
  - 이미 같은 CI/DI로 가입된 계정 존재 → `checkIdentityForSignup`이 `hasAccount: true` → **로그인 모드로 강제 전환** + "이미 가입된 계정이 있어요. 로그인해 주세요."
  - 경합으로 뚫려도 `createEmployerProfile`이 `CONFLICT "이미 다른 계정에서 본인인증에 사용된 정보예요."`
  - 만 19세 미만 → `/api/guest` 403 `code: "underage"` (`apps/web/src/app/api/guest/route.ts`)
  - 인증건 TTL **30분** 초과 또는 이미 소진 → `BAD_REQUEST "본인인증 정보가 만료되었거나 이미 사용되었어요. 다시 인증해 주세요."` (`packages/api/src/services/bambi-identity-ticket.ts`)
  - **STEP 2에서 새로고침하면 STEP 1로 되돌아간다**(의도된 동작)
  - 약관 미동의 제출 → 토스트 "이용약관과 개인정보 처리방침에 동의해주세요"
  - 프로필이 이미 있는 계정 → `CONFLICT "Bambi profile already exists."`
  - 모바일 리디렉션 복귀 시 쿼리에 `auth=signup`이 없으면 로그인 모드로 복귀 (intent는 sessionStorage `bambi:phone-verify-intent`로 구분)
- **관련 API**: `bambi.onboarding.startIdentityVerification`, `bambi.onboarding.checkIdentityForSignup`, `bambi.onboarding.createEmployerProfile`, `bambi.onboarding.recordLegalConsent` (`packages/api/src/routers/bambi/onboarding.ts`), `POST /api/guest` (`apps/web/src/app/api/guest/route.ts`)

### 1.2 로그인

- **경로**: `/seeker?auth=login` (파일: `apps/web/src/components/bambi/auth/auth-panel.tsx`, `apps/web/src/components/bambi/auth/auth-fields.tsx`)
- **절차**: 아이디 칸(아이디/이메일 겸용) + 비밀번호(8자↑) 입력 → 로그인
- **기대 결과**:
  - 값에 `@`가 있으면 `authClient.signIn.email`, 없으면 `authClient.signIn.username` (`apps/web/src/lib/bambi/login-id.ts`)
  - 성공 시 게스트 쿠키 삭제 → `window.location.assign("/")` → `/`가 `redirectToRoleHome()`으로 **`/seeker`**로 보낸다
  - `/employer` 진입은 헤더 "구인 관리" 버튼(데스크톱) 또는 모바일 탭바로만
- **엣지 케이스**: 탈퇴 계정 재로그인 → better-auth 세션 생성 훅에서 `FORBIDDEN "탈퇴한 계정이에요. 로그인할 수 없어요."` (`packages/auth/src/index.ts`). 이메일 인증(verification) 요구는 없음, 소셜 로그인 없음
- **관련 API**: better-auth `/api/auth/*`, 라우팅 판정 `bambi.onboarding.getMyRouting`

### 1.3 아이디 찾기 / 비밀번호 재설정

- **경로**: 로그인 폼 내 모달 (별도 URL 없음). 파일: `apps/web/src/components/bambi/auth/account-recovery-dialog.tsx`
- **선행 조건**: 포트원 env 구성. **미구성이면 두 링크가 렌더되지 않음**
- **절차**: 아이디 라벨 옆 "아이디 찾기" / 비밀번호 라벨 옆 "비밀번호를 잊으셨나요?" → 본인인증 → 결과 표시 / 새 비밀번호 입력(8자↑ + 확인 일치)
- **기대 결과**:
  - 아이디 찾기: `{found, loginId}` → 아이디 표시 + "이 아이디로 로그인"(로그인 모드 전환 + 자동 입력). `loginId === null`이면 "이메일로 가입된 계정이에요", `found === false`면 "가입된 계정이 없어요"
  - 비밀번호 재설정: 완료 화면(5초 후 자동 닫힘). 재설정 시 인증건 소진
- **엣지 케이스**: 계정 특정은 CI/DI 해시 + 생년월일·성별 대조로만 한다. 후보가 2건 이상이면 "계정 없음" 처리. 탈퇴 계정 제외. IP당 시간당 10회 레이트리밋 → `TOO_MANY_REQUESTS`
- **관련 API**: `bambi.accountRecovery.lookupAccountByIdentity`, `bambi.accountRecovery.resetPasswordByIdentity` (`packages/api/src/routers/bambi/account-recovery.ts`) — 둘 다 `rateLimitedPublicProcedure`

### 1.4 본인인증 재인증 (계정 설정)

- **경로**: `/seeker/me/settings` (파일: `apps/web/src/app/seeker/me/settings/page.tsx`, `apps/web/src/components/bambi/screens/account-settings-screen.tsx`)
- **선행 조건**: 로그인. 구인자도 하단 탭 "내 정보" → 좌측 메뉴 "계정 설정"으로 진입 (`apps/web/src/components/bambi/my-page-shell.tsx`)
- **절차**: "휴대폰 인증하기" / "휴대폰 재인증" 클릭 → 인증창 → 완료
- **기대 결과**: `bambi.onboarding.verifyMyPhone` 성공 → 토스트 "휴대폰 인증을 완료했어요." + 번호·성별·생년월일·CI/DI 갱신
- **엣지 케이스**:
  - 포트원 미구성 개발환경 → 목 폼(`apps/web/src/components/bambi/mock-phone-verify-dialog.tsx`) → `bambi.onboarding.verifyMyPhoneMock`. 이 프로시저는 `PORTONE_API_SECRET`이 있거나 `NODE_ENV=production`이면 `FORBIDDEN`
  - 표시명만 바꾸고 번호를 그대로 두면 인증 상태가 유지되지만, **번호를 바꾸면 `isPhoneVerified`가 false로 내려간다** (`bambi.onboarding.updateMyProfile`)
  - 프로필 역할 변경 시도 → `FORBIDDEN "Bambi profile role cannot be changed from onboarding."`
- **관련 API**: `bambi.onboarding.verifyMyPhone`, `bambi.onboarding.verifyMyPhoneMock`, `bambi.onboarding.updateMyProfile`

---

## 2. 구인자 영역 진입 · 승인 게이트

### 2.1 `/employer` 진입 게이팅

- **경로**: `/employer` 이하 전체 (파일: `apps/web/src/app/employer/layout.tsx` → `apps/web/src/lib/bambi/require-role.ts` `resolveEmployerAccess()`)
- **절차**: 로그인 후 `/employer` 접근
- **기대 결과**:
  - 세션 없음 / `getMyRouting` 실패 / 프로필 없음 → `/seeker?auth=login`
  - `role === "job_seeker"` → `/seeker`, `role === "admin"` → `/moderator` (`homePathForRole`)
  - `role === "employer"` → **승인 상태와 무관하게 화면·nav 전부 렌더**. 리다이렉트 없음
  - 상단 nav: 내 공고 / 공고 등록 / 광고 안내 / 업체 관리(업체 정보·조직 설정) / 고객센터. 모바일 하단 탭: 내 공고 · 업체 정보 · 공고 등록 · 조직 설정 · 내 정보
- **엣지 케이스**: `/employer/promotions`, `/employer/analytics`, `/employer/settings/teams`는 **nav 항목이 없다**. 각각 `/employer` 대시보드 퀵링크, `/employer/settings`·`/employer/me` 바로가기로만 도달
- **관련 API**: `bambi.onboarding.getMyRouting` (`packages/api/src/routers/bambi/onboarding.ts`)

### 2.2 승인 상태 배너 (`EmployerGateBanner`)

- **파일**: `apps/web/src/components/bambi/employer-gate-banner.tsx`, `apps/web/src/components/bambi/employer-approval-context.tsx`
- **판정**: `deriveEmployerApprovalStatus(내가 속한 조직들의 verificationStatus[])` — verified 하나라도 있으면 `verified`, 없고 pending 있으면 `pending`, 없고 rejected 있으면 `rejected`, 전부 none이면 `none` (`packages/api/src/services/bambi-onboarding.ts`)

| status | 배너 | CTA |
|---|---|---|
| `verified` | 없음 | — |
| `none` | brand / "업체 정보 등록이 필요합니다" / "{action}하려면 업체명과 사업자등록번호를 입력하세요." | "업체 정보 입력" → `/employer/me` |
| `pending` | warning / "운영자 승인 대기 중" / "{action}하려면 운영자 승인이 완료되어야 합니다." | 없음 |
| `rejected` | destructive / "업체 인증이 반려되었습니다" | "업체 정보 다시 제출" → `/employer/me` |

- 배너 노출 화면: `/employer`(action="공고를 등록"), `/employer/new`(동일), `/employer/settings`("조직 설정을 변경"), `/employer/settings/teams`("팀을 관리")
- **배너가 없는 화면**: `/employer/me`, `/employer/jobs/[id]/edit`, `/employer/promotions`, `/employer/analytics`, `/employer/ad-guide`

### 2.3 계정 제재 배너 (`AccountStatusBanner`)

- **파일**: `apps/web/src/components/bambi/account-status-banner.tsx` — `/employer/*` 전 화면 최상단
- **기대 결과**:
  - `warned` → warning "운영자 경고를 받았어요" + **X 닫기 가능**. 닫음 상태는 localStorage `bambi:warned-banner-dismissed:{userId}:{제재시각}` — **새 경고가 오면 다시 뜬다**
  - `suspended` → destructive "계정 이용이 정지되었어요" + **닫기 불가**
  - 공통: "사유: {reason}" + 이의 신청 안내. 사유는 `admin_moderation_action`의 최신 `set_status:*` 기록에서 온다
- **엣지 케이스**: 배너 자체는 UI를 비활성화하지 않는다. 실제 차단은 서버 `requireActiveBambiProfile`(suspended → `FORBIDDEN`). **`warned`는 서버에서 아무것도 막지 않는다**
- **관련 API**: `bambi.onboarding.getMine` (`accountSanction` 필드)

---

## 3. 사업자 정보 제출 · 국세청 진위확인 · 운영자 승인

### 3.1 업체 정보 화면 확인

- **경로**: `/employer/me` (파일: `apps/web/src/app/employer/me/page.tsx`)
- **절차**: 하단 탭 "업체 정보" 또는 상단 nav "업체 관리 → 업체 정보"
- **기대 결과**: 계정 정보 카드(표시명·역할 배지·계정 상태 배지·전화 인증 여부·연락처·가입일) → 사업자 인증 폼 → 조직 프로필 카드 → 내 활동(신고 내역/예정된 면접/차단한 상대) → 설정 바로가기(조직 설정/팀 관리/공고 관리) → 로그아웃
- **엣지 케이스**: 로딩(Skeleton 3개) / 비로그인·`UNAUTHORIZED` / 기타 에러 + 다시 시도 / 프로필 없음 / `role === "job_seeker"` 분기. `role === "admin"`은 별도 분기 없이 정상 본문 진입
- **관련 API**: `bambi.onboarding.getMine`

### 3.2 사업자 정보 제출

- **경로**: `/employer/me` 사업자 인증 섹션 (파일: `apps/web/src/app/employer/me/page.tsx` `BusinessInfoForm`)
- **선행 조건**: 구인자 프로필 보유. **승인 상태와 무관하게 항상 사용 가능**(이 폼만 게이트가 없다)
- **절차**:
  1. 업체명(`business-name`) 입력
  2. 사업자 등록 번호(`business-brn`) — `000-00-00000` 형식
  3. 대표자 성명(`business-representative`)
  4. 개업일자(`business-start-date`) — 네이티브 date input(`YYYY-MM-DD`)
  5. "업체 정보 제출"(반려 상태면 "업체 정보 재제출") 클릭
- **기대 결과**:
  - 토스트 "업체 정보를 제출했습니다. 운영자 승인을 기다려 주세요."
  - owner 조직이 없으면 `organization` + `member(owner)` + `employer_organization_profile`이 트랜잭션으로 신규 생성되고 `verificationStatus = pending`
  - owner 조직이 있으면 값 갱신 후 `pending`으로 전환(재심사)
  - 조직 카드에 사업자 등록 번호 / 대표자 / 개업일자(`YYYY-MM-DD` 표기) / **국세청 확인** / 내 권한 / 검수 메모가 표시됨
- **엣지 케이스 / 실패 케이스**:
  - 검증 메시지(첫 제출 시도 후에만 노출): "업체명을 입력해 주세요." / "사업자등록번호는 000-00-00000 형식으로 입력해 주세요." / "대표자 성명을 입력해 주세요." / "개업일자를 입력해 주세요."
  - **값이 기본값과 전부 동일하면 제출 버튼 비활성**(`blockUnchanged`). 단 `rejected` 상태면 동일 값이어도 재제출 허용
  - 사용자당 시간당 10회 초과 → `TOO_MANY_REQUESTS "요청이 너무 많아요. 잠시 후 다시 시도해 주세요."`
  - 국세청 대조 불일치 → `BAD_REQUEST` "국세청에 등록된 사업자등록정보와 일치하지 않습니다. …최근 개업했다면 국세청 반영까지 1~2일 걸릴 수 있습니다."
  - 휴업/폐업(`b_stt_cd` ≠ `01`) → `BAD_REQUEST` "국세청에 {휴업|폐업} 상태로 등록된 사업자등록번호입니다. …"
  - `NTS_SERVICE_KEY` 미설정 또는 국세청 장애/타임아웃 → **미확인으로 통과**(둘 다 null), 화면 표기 "곧 준비될 기능입니다"
  - **verified 상태에서 값 변경 없이 재제출하면 verified 유지**(pending 강등 없음). 단 UI가 `blockUnchanged`로 먼저 막으므로 이 경로는 사실상 도달 불가
  - **조직이 2개 이상이면 폼 프리필과 `isRejected` 판정 모두 `organizationProfiles[0]` 하나만 본다**
- **관련 API**: `bambi.onboarding.submitEmployerBusinessInfo` (`packages/api/src/routers/bambi/onboarding.ts`), 진위확인 `packages/api/src/services/nts-biznum.ts`

### 3.3 국세청 확인 결과 표기 검증

- **경로**: `/employer/me` 조직 카드
- **기대 결과** (`getBiznumCheckText`):
  - `biznumCheckedAt` 있음 → `확인 완료(계속사업자|휴업자|폐업자|상태 미상) · {일시}`
  - `biznumCheckedAt` 없음 + `biznumCheckEnabled = true` → "미확인"
  - `biznumCheckedAt` 없음 + `biznumCheckEnabled = false` → "곧 준비될 기능입니다"
- **관련 API**: `bambi.onboarding.getMine` (`biznumCheckEnabled = Boolean(env.NTS_SERVICE_KEY)`)

### 3.4 운영자 승인 / 반려 반영 확인

- **경로(운영자)**: `/moderator/employers` (파일: `apps/web/src/app/moderator/employers/page.tsx`)
- **절차**: 운영자 계정으로 승인 또는 반려(사유 입력) → 구인자 계정으로 재로그인/새로고침
- **기대 결과**:
  - `verified` → `EmployerGateBanner` 사라짐, 공고 등록·조직 설정·팀 관리 조작 활성화
  - `rejected` → 조직 카드 "검수 메모"에 반려 사유(`verificationNote`) 표시, 배너 CTA가 "업체 정보 다시 제출"로 바뀜
  - `admin_moderation_action`에 `set_employer_verification:{status}` 감사 로그 기록
- **관련 API**: `bambi.moderation.setEmployerVerificationStatus`, `bambi.moderation.listPendingEmployers`, `bambi.moderation.listEmployers` (`packages/api/src/routers/bambi/moderation.ts`)

---

## 4. 조직 설정 · 팀 · 멤버 초대와 권한

### 4.1 조직 표시 이름 변경

- **경로**: `/employer/settings` (파일: `apps/web/src/app/employer/settings/page.tsx`, `apps/web/src/components/bambi/org-profile-form.tsx`)
- **선행 조건**: 조직 **소유자(owner)** + 조직 `verified`
- **절차**: "조직 표시 이름" 수정 → 저장
- **기대 결과**: 토스트 "조직 프로필을 저장했습니다." + `organizations.getMine`·`onboarding.getMine` 무효화
- **엣지 케이스**:
  - 미승인이면 입력·저장 모두 비활성. 서버도 `FORBIDDEN "운영자 승인 후 조직 설정을 변경할 수 있습니다."`
  - manager/staff → 입력 비활성 + 안내문 "조직 프로필 수정은 소유자만 할 수 있습니다." 서버는 `FORBIDDEN "Organization owner access is required."`
  - 공백만 입력 → "조직 표시 이름을 입력해 주세요." (**이 폼만 즉시 검증**, 다른 폼은 첫 제출 후 검증)
  - `bambi.organizations.getMine`은 **owner/manager 조직만** 반환 → **staff 계정은 "관리 가능한 조직이 없습니다"만 본다**
- **관련 API**: `bambi.organizations.getMine`, `bambi.organizations.updateProfile` (`packages/api/src/routers/bambi/organizations.ts`)

### 4.2 팀 생성 / 수정 / 삭제

- **경로**: `/employer/settings/teams` (파일: `apps/web/src/app/employer/settings/teams/page.tsx`, `apps/web/src/components/bambi/team-form.tsx`)
- **선행 조건**: owner 또는 manager + 조직 `verified`
- **절차**:
  1. "관리 조직" Select 선택(첫 조직 자동 선택)
  2. "새 팀 만들기": 조직 / 팀 이름 / 지역(시도) / 세부지역 입력 → "생성"
  3. 팀 목록 행의 "수정" → 인라인 폼 → "저장" (조직 Select는 항상 잠김)
  4. "삭제" → 인라인 destructive Alert 확인 → "삭제"
- **기대 결과**: 토스트 "팀을 생성했습니다." / "팀 정보를 저장했습니다." / "팀을 삭제했습니다." + `teams.list`·`onboarding.getMine` 무효화. 팀 행에 이름·지역·수정 시각·멤버 수 표시
- **엣지 케이스**:
  - 미승인 → 생성/수정 폼 전체와 삭제 버튼 비활성. 서버 `FORBIDDEN "운영자 승인 후 팀을 관리할 수 있습니다."`
  - **"수정" 버튼 자체에는 disabled가 없다** — 미승인에서도 눌리고, 열린 폼만 잠긴다
  - `memberCount > 0`이면 삭제 버튼 비활성 + 안내 "멤버를 모두 정리하면 삭제할 수 있어요"
  - 서버 CONFLICT: "팀에 멤버가 남아 있어 삭제할 수 없어요…" / "이 팀으로 진행 중인 초대가 있어 삭제할 수 없어요…"
  - 팀 삭제 시 `job_post.team_id`·`chat_room.team_id`는 `set null`(공고·채팅방은 남고 팀 연결만 끊김), 종료 상태 초대의 `teamId`는 수동 null 처리
  - 시/도를 바꾸면 세부지역이 초기화된다. `regionCode`가 비면 `districtCode`도 함께 생략해 제출
- **관련 API**: `bambi.teams.list`, `bambi.teams.create`, `bambi.teams.update`, `bambi.teams.deleteTeam`, `bambi.regions.list` (`packages/api/src/routers/bambi/teams.ts`, `regions.ts`)

### 4.3 멤버 초대 (운영자 승인 필요)

- **경로**: `/employer/settings/teams` "멤버와 초대" (파일: `apps/web/src/components/bambi/team-member-list.tsx`)
- **선행 조건**: owner 또는 manager + 조직 `verified`. **초대 대상이 이미 `employer` 역할로 가입되어 있어야 한다**
- **절차**:
  1. 이메일 칸에 검색어 입력 → Popover에 후보 목록(최대 10건) → 선택 또는 직접 입력
  2. 권한 Select: **스태프 / 매니저** (소유자는 선택 불가)
  3. 팀 Select: "전체 조직" 또는 특정 팀 — **초기값이 첫 번째 팀**임에 주의
  4. "초대" 클릭
- **기대 결과**:
  - 토스트 "멤버 초대를 만들었습니다." + `invitation` 행 생성(`status = pending`, 만료 14일)
  - 멤버 목록에 상태 "운영자 승인 대기"로 표시
- **엣지 케이스 / 실패 케이스**:
  - 대상이 구직자거나 미가입 → `FORBIDDEN "구인자로 가입된 계정만 초대할 수 있습니다."`
  - 검색 결과에서 본인·이미 조직 멤버·pending 초대가 있는 이메일은 제외됨. 검색어가 비면 빈 결과
  - **초대받은 사람이 수락하는 화면·URL은 존재하지 않는다.** `/accept-invitation` 라우트, 초대 이메일 발송, `organization.acceptInvitation` 호출 모두 **없음**
- **관련 API**: `bambi.teams.searchEmployerInvitees`, `bambi.teams.inviteMember`, `bambi.organizations.listMembers`

### 4.4 초대 승인/반려 (운영자) 및 결과 확인

- **경로(운영자)**: `/moderator/team-invites` (파일: `apps/web/src/app/moderator/team-invites/page.tsx`)
- **절차**: 운영자가 [승인] 또는 [반려(사유 필수)] → 구인자 화면 새로고침
- **기대 결과**:
  - 승인 → `member` 행 생성(역할 정규화 적용) + `teamId`가 있으면 `team_member` 행 생성 → 초대 `status = accepted`. **`listMembers`는 accepted 초대를 제외하므로 활성 멤버 행으로만 나타난다**
  - 반려 → 상태 "반려됨" + 이름 칸 아래 destructive "반려 사유: {사유}"
- **엣지 케이스**: 만료된 초대 승인 → `CONFLICT "만료된 초대입니다."`. 대상 employer 계정이 사라졌으면 `NOT_FOUND "초대 대상 구인자 계정을 찾을 수 없습니다."`. 이미 처리된 초대 재처리 → `CONFLICT "이미 처리된 초대입니다."`
- **관련 API**: `bambi.moderation.listPendingTeamInvitations`, `bambi.moderation.setTeamInvitationStatus` (`packages/api/src/routers/bambi/moderation.ts`)

### 4.5 초대 재제출 / 삭제

- **경로**: `/employer/settings/teams` 멤버 행 `⋯` 메뉴
- **선행 조건**: 초대 상태가 `rejected`이고, 로그인 사용자가 **소유자(owner)**
- **절차**: `⋯` → "재제출"(즉시 실행) 또는 "초대 삭제"(확인 Alert 경유)
- **기대 결과**: "초대를 재제출했습니다. 운영자 승인을 기다립니다." / "반려된 초대를 삭제했습니다."
- **엣지 케이스**: `rejected`가 아닌 초대에 호출 → `CONFLICT "반려된 초대만 재제출할 수 있습니다." / "반려된 초대만 삭제할 수 있습니다."` 재제출은 만료일을 14일 뒤로 갱신하고 `rejectionReason`을 지운다. **`deleteInvitation`만 조직 승인 검사가 없다**
- **관련 API**: `bambi.teams.resubmitInvitation`, `bambi.teams.deleteInvitation`

### 4.6 멤버 권한 변경 / 팀 소속 변경 / 소유권 이전 / 내보내기

- **경로**: `/employer/settings/teams` 멤버 행 `⋯` 메뉴
- **선행 조건**: **로그인 사용자가 소유자(owner)** + 조직 `verified`. manager로 로그인하면 `⋯` 버튼 자체가 렌더되지 않는다
- **절차 / 기대 결과**:
  | 액션 | 확인 절차 | 성공 토스트 | 서버 |
  |---|---|---|---|
  | 권한 변경(매니저/스태프 라디오) | 없음(즉시) | "멤버 권한을 변경했습니다." | `bambi.teams.setMemberRole` |
  | 팀 소속 변경 | 다이얼로그(체크박스 다중, 전부 해제 = 무소속) | "팀 소속을 변경했습니다." | `bambi.teams.setMemberTeams` |
  | 소유권 이전 | 인라인 Alert(default 톤) | "소유권을 이전했습니다. 회원님은 매니저로 전환되었습니다." | `bambi.teams.transferOwnership` |
  | 내보내기 | 인라인 Alert(destructive) | "멤버를 내보냈습니다." | `bambi.teams.removeMember` |
- **엣지 케이스**:
  - 소유자 행에는 `⋯` 메뉴가 뜨지 않는다. 서버도 "소유자의 권한은 변경할 수 없습니다." / "소유자는 내보낼 수 없습니다."
  - 권한 변경으로 owner 승격 시도 → `FORBIDDEN "소유권은 '소유권 이전'으로만 넘길 수 있습니다."`
  - 비활성(초대 대기) 멤버에게 소유권 이전 → "활성 멤버에게만 소유권을 이전할 수 있습니다." / 팀 소속 변경 → "활성 멤버의 팀 소속만 변경할 수 있습니다."
  - 소유권 이전은 단일 트랜잭션으로 요청자를 manager로 강등 + 대상을 owner로 승격(조직당 소유자 1명 불변식)
  - 내보내기는 그 조직의 팀 소속(`team_member`)도 함께 삭제한다
  - 멤버 테이블에 **페이지네이션이 없다**(전체 렌더)
- **관련 API**: `bambi.teams.setMemberRole`, `bambi.teams.setMemberTeams`, `bambi.teams.transferOwnership`, `bambi.teams.removeMember`, `bambi.organizations.listMembers`

---

## 5. 공고 등록

### 5.1 공고 등록 폼 진입

- **경로**: `/employer/new` (파일: `apps/web/src/app/employer/new/page.tsx`)
- **선행 조건**: 구인자 프로필 + 등록 가능한 범위(`employerJobPostingScopes`)가 1개 이상
- **절차**: nav "공고 등록" 또는 `/employer`의 "새 공고 등록" 버튼
- **기대 결과**: 소속 정보 → 공고 조건 → 상세 내용 → 공고 이미지 → 노출 상품·결제 순으로 폼 렌더 + 우측(xl↑) 또는 하단에 "작성 중 실시간 미리보기"
- **엣지 케이스** (early return 순서):
  1. 로딩 → Loader
  2. 비로그인/`UNAUTHORIZED` → "로그인이 필요합니다"
  3. `getMine` 에러 → "프로필 정보를 불러올 수 없습니다" + 다시 시도
  4. 프로필 없음 → "밤비알바 프로필이 없습니다"
  5. `role === "job_seeker"` → "공고 등록 권한이 없습니다"
  6. 조직 프로필 0개 또는 posting scope 0개 → "등록 가능한 공고 범위가 없습니다"
  - `/employer` 대시보드에서도 미승인이면 "새 공고 등록" 버튼이 **disabled 버튼**으로 바뀐다(`NewJobButton`)
- **관련 API**: `bambi.onboarding.getMine`(`employerJobPostingScopes` 포함), `bambi.regions.list`, `bambi.adProducts.getCatalog`, `bambi.adProducts.premiumCapacity`, `bambi.siteSettings.getPaymentAccounts`

### 5.2 소속 범위 · 기본 조건 입력

- **경로**: `/employer/new` (필드 파일: `apps/web/src/components/bambi/job-region-fields.tsx`, `apps/web/src/components/bambi/job-pay-fields.tsx`)
- **절차 / 기대 결과**:
  | 필드 | 제약 |
  |---|---|
  | 공고 등록 범위 | Select. 값 = `JSON.stringify([organizationId, teamId])`. 라벨 = `{조직명} / 전체 조직` 또는 `{조직명} / {팀명}`. 마운트 시 첫 옵션 자동 선택 |
  | 공고 제목 | 2~80자 (HTML maxLength 없음, 클라이언트 검증) |
  | 업종 | 9종 Select: 룸싸롱·텐프로/쩜오·노래주점·단란주점·다방·BAR·마사지·요정·기타. 기본 "룸싸롱" |
  | 지역 / 세부지역 | 지역 마스터 코드(10자리)로 전송. 세부지역 첫 항목 "지역 전체"(null). 시/도 변경 시 세부지역 초기화 |
  | 급여 금액 / 단위 | 단위 5종(시급/일급/주급/월급/**협의**). "협의"면 **금액 칸이 사라지고** `payAmount: null`로 전송 |
  | 근무 일정 | 1~200자 |
  | 초보 가능 / 당일면접 가능 | Checkbox |
- **엣지 케이스**:
  - 시급 선택 시 최저시급 안내(`PayAmountHint`), 미만이면 destructive 경고만 표시하고 **제출은 막지 않는다**
  - 서버는 `payUnit === "협의"`면 `payAmount == null`, 아니면 숫자 필수를 zod refine으로 강제 → "급여 단위가 '협의'가 아니면 급여 금액이 필요합니다."
  - 지역 코드 유효성(존재·활성·레벨)은 서버 `resolveRegionSelection`이 마스터 대조로 확인. 표시용 `region`/`district` 문자열은 서버가 채운다
- **관련 API**: `bambi.regions.list`, `bambi.jobs.create`

### 5.3 상세 설명 · 블록 에디터

- **경로**: `/employer/new` 상세 내용 섹션 (파일: `apps/web/src/components/bambi/job-post-block-editor.tsx`)
- **절차 / 기대 결과**:
  - 상세 설명(필수): 10~2000자, `maxLength=2000`
  - 블록형 상세 설명(선택): 문단/제목/목록/강조 4종, 블록당 800자, **최대 12개**, 위/아래 이동·삭제
  - 면접 안내(선택): 500자
  - **블록이 1개라도 있으면 최종 `description`이 블록 텍스트 `\n\n` join으로 대체된다**(기본 상세 설명은 저장되지 않음)
- **엣지 케이스**: 빈 블록 금지, 800자 초과 금지, 13개째 추가 시 "상세 블록은 최대 12개까지 등록할 수 있습니다." (`apps/web/src/lib/bambi-job-form.ts`, 서버 `packages/api/src/services/bambi-job-description-blocks.ts`)
- **관련 API**: `bambi.jobs.create` (`descriptionBlocks` 필드)

### 5.4 이미지 업로드 (썸네일 · 상세)

- **경로**: `/employer/new` 공고 이미지 섹션 (파일: `apps/web/src/components/bambi/job-post-media-uploader.tsx`)
- **절차**: 썸네일 1장 + 상세 최대 5장 선택, 각 이미지에 설명(alt, 120자)
- **기대 결과**: 제출 시점에 `bambi.jobs.createMediaUpload`로 서명 URL 발급 → 브라우저가 GCS에 직접 PUT → `storageKey`를 폼 상태에 되돌려 저장(재시도 시 중복 업로드 방지)
- **엣지 케이스 / 실패 케이스**:
  | 제한 | 값 | 위반 시 |
  |---|---|---|
  | 썸네일·상세 MIME | `image/jpeg`, `image/png`, `image/webp` | `BAD_REQUEST` (서버 `validateJobPostImageUpload`) |
  | 광고 배너 MIME | 위 + `image/gif` | 동일 |
  | 파일 크기 | 10MB | "file_too_large" |
  | 상세 이미지 수 | 5장 | 슬롯 5개로 제한 |
  | alt 텍스트 | 120자 | — |
  | 매직넘버 위조 | — | 토스트 "이미지 형식이 올바르지 않습니다. PNG·JPG·WebP·GIF만 업로드할 수 있습니다." |
  - 남의 조직 prefix의 `storageKey`를 보내면 서버가 `FORBIDDEN "Job post media does not belong to this organization."`
  - 정의: `packages/api/src/services/bambi-job-media-policy.ts`, `apps/web/src/lib/bambi-job-form.ts`, `apps/web/src/lib/bambi/job-media-item.ts`
- **관련 API**: `bambi.jobs.createMediaUpload`

### 5.5 노출 상품 · 결제 방법 선택

- **경로**: `/employer/new` 노출 상품·결제 섹션 (파일: `apps/web/src/components/bambi/job-exposure-fields.tsx`, `apps/web/src/components/bambi/bank-transfer-guide.tsx`)
- **절차**:
  1. 노출 상품 ToggleGroup에서 상품 선택 (마지막 항목 "일반 구인(무료)" = 센티넬 `__free__`)
  2. 유료 상품이면 이용 기간 Select → 결제 예정 금액 박스 확인
  3. 결제 방법 ToggleGroup: 신용카드 / 무통장입금
- **기대 결과**:
  - 무료 선택 → 추가 입력 없음. 저장 시 `exposureType = standard`, `paymentStatus = paid`(결제 게이트 없이 검수만)
  - 유료 + 무통장입금 → 계좌 목록·금액·복사 버튼·"입금자명은 업체명(상호)과 동일하게 입금해 주세요." 안내
  - 배너 상품 선택 → 프리미엄 정원 Alert: 남은 자리 `R/C` / 정원 만석이면 "…신청하면 대기열에 등록됩니다."
  - 할인 옵션이면 원가 취소선 + 할인가 + `N% 할인` 배지, 결제 예정 금액은 할인가로 계산(구매 시점 스냅샷)
- **엣지 케이스 / 실패 케이스**:
  - **신용카드 선택 → warning Alert "신용카드는 아직 지원하지 않는 결제 방법입니다." + 제출 버튼 비활성**
  - 계좌가 0건 → destructive 문구 + 제출 버튼 비활성. 서버도 `BAD_REQUEST "무통장입금 계좌가 준비되지 않아 결제를 진행할 수 없습니다…"`
  - 상품에 없는 이용 기간 전송 → `BAD_REQUEST "선택한 이용 기간이 해당 노출 상품에 없습니다."`
  - 존재하지 않는 `adProductId` → `BAD_REQUEST "선택한 노출 상품을 찾을 수 없습니다."`
  - 배너형 상품은 `manualBoostsPerDay`/`autoBoostsPerDay`가 서버에서 0으로 강제된다
  - `/employer/ad-guide` 카탈로그에서 `side-horizontal`/`side-vertical` 상품은 제외된다(신규 구매 차단, 레거시 데이터만 노출 유지)
- **관련 API**: `bambi.adProducts.getCatalog`, `bambi.adProducts.premiumCapacity`, `bambi.siteSettings.getPaymentAccounts`, 서버 확정 로직 `resolveJobPostExposure` (`packages/api/src/routers/bambi/jobs.ts`)

### 5.6 광고 배너 편집기

- **경로**: `/ad-banner-editor` (파일: `apps/web/src/app/ad-banner-editor/page.tsx`, `apps/web/src/app/ad-banner-editor/ad-banner-editor-window.tsx`, `apps/web/src/components/bambi/ad-banner-editor/*`)
- **선행 조건**: 배너 슬롯을 쓰는 상품(`premium-top`/`side-horizontal`/`side-vertical`)을 선택했거나 배너 이미지가 이미 남아 있을 것
- **절차**:
  1. 공고 폼의 "광고 배너" 영역 → "배너 이미지·문구 편집"
  2. 데스크톱(≥1024px)이면 `window.open`으로 1120×880 팝업, 모바일/팝업 차단 시 전체화면 Dialog 폴백
  3. 가로형/세로형 탭 전환 → 이미지 선택 → 배경(이미지/단색) → 오버레이 스위치·강도 → 문구 추가·드래그·폭 조절·속성 편집
  4. "저장"
- **기대 결과**:
  - 저장 시 **서버 호출 없음**. `postMessage`(팝업) 또는 콜백(Dialog)으로 `{layout, media}`가 공고 폼 상태에 반영되고 `isDirty = true`
  - 폼으로 돌아오면 **광고 배너** 영역의 슬롯 미리보기가 노출 화면과 **같은 렌더러**(`AdBannerLayoutRenderer`)로 다시 그려진다 — 배경(이미지/단색)·스크림·문구 블록·연출까지 실제 노출과 같은 배치로 보인다(`apps/web/src/components/bambi/job-post-media-uploader.tsx`의 `AdBannerStatus`)
  - 배경이 **단색**인 슬롯은 미리보기에서 이미지를 그리지 않고(렌더러가 색으로 덮으므로) 배지가 **"단색 배경"**, 비율 반려 경고도 뜨지 않는다 — 판정은 `isAdBannerImageRequired` 하나만 본다(에디터 저장 가드와 동일)
  - 실제 저장은 공고 폼 제출 시 `bambi.jobs.createMediaUpload` → GCS PUT → `bambi.jobs.create`/`update`의 `adBannerLayout` + `media` 필드로 이뤄진다
  - 규격: 가로형 7:3(최소 700×300, 권장 1400×600), 세로형 4:9(최소 400×900), 허용오차 ±15% (`apps/web/src/lib/bambi/job-ad-banner-spec.ts`)
  - 문구: 슬롯당 최대 5개, 문구 40자, 글자 크기 2~20%, 폭 10~100% (`apps/web/src/lib/bambi/ad-banner-layout.ts`)
- **엣지 케이스 / 실패 케이스**:
  - 저장 가드 순서: ① 필수 슬롯 이미지 누락 → "{가로형/세로형} 광고 배너 이미지를 등록해 주십시오." ② 비율/최소 크기 반려 ③ 빈 문구 블록 → "내용이 비어 있습니다…" ④ 단색 배경 + 문구 0개 → "단색 배경만 있고 문구가 없으면 배너가 빈 색 사각형으로 노출됩니다…"
  - 저대비 경고는 표시만 하고 저장을 막지 않음
  - 닫기(X/취소/Esc/백드롭) 시 편집 이력이 있으면 AlertDialog "편집 내용을 버릴까요?"
  - **라우트 직접 접근(= `window.opener` 없음)** → EmptyState "이 화면은 직접 열 수 없습니다"
  - 서버 게이트: `resolveEmployerAccess()`를 페이지에서 직접 호출 → 구인자만 통과. `robots: noindex, nofollow`
  - 배너 문구도 금칙어 검사 대상(`collectLayoutModerationText`)
- **관련 API**: 전용 프로시저 **없음**. 반영은 `bambi.jobs.create` / `bambi.jobs.update`의 `adBannerLayout` 필드

### 5.7 공고 제출

- **경로**: `/employer/new` 하단 "공고 등록"
- **절차**: 모든 필수 항목 입력 후 제출
- **기대 결과**:
  - 무료 공고 → 토스트 "공고를 등록했습니다. 검수 후 공개됩니다." → `/employer`로 이동
  - 유료 + 무통장입금 → 토스트 "공고를 등록했습니다. 입금 확인 후 게시됩니다." + "무통장입금 안내" Dialog(계좌 재표시) → [확인] → `/employer`
  - DB 저장값: `status = pending_review`(**예외 없이**), `paymentStatus = adProductId ? "unpaid" : "paid"`, `publishedAt = null`, 금칙어 감지 시 `riskFlags = ["banned_word"]` + `detectedTerms`
- **엣지 케이스 / 실패 케이스**:
  - **제출 버튼 비활성 조건**: create pending / 이미지 업로드 pending / 신용카드 선택 / 무통장인데 계좌 0건 / 필수 배너 이미지 누락 / **미승인(`!verified`)**
  - 배너 누락 시 버튼 위 warning Alert. 서버도 `BAD_REQUEST "프리미엄 광고는 가로형·세로형 배너 이미지를 모두 등록해야 합니다."`
  - 검증 실패 → 필드 에러 + 상단 FormError + 첫 에러 토스트 + 첫 `aria-invalid` 요소로 스크롤·포커스
  - 미승인 조직에 직접 API 호출 → `FORBIDDEN "운영자 승인 후 공고를 등록할 수 있습니다."`
  - 조직 프로필 없는 조직 → `FORBIDDEN "Employer organization profile is required."`
  - **임시저장(draft) 기능은 없다.** `jobStatusLabels.draft = "임시 저장"` 라벨만 존재하고, 서버 `create`는 항상 `pending_review`를 세팅한다. draft 상태를 만드는 코드 경로가 리포 전체에 없음
  - 이탈 방지: `beforeunload` + [취소] 시 인라인 Alert "저장하지 않고 나갈까요?"
- **관련 API**: `bambi.jobs.create` (`packages/api/src/routers/bambi/jobs.ts`), 권한 `requireEmployerPostingAccess` (`packages/api/src/services/bambi-authz.ts`)

---

## 6. 검수 · 반려 · 재제출 (상태 전이)

### 6.1 검수 대기 확인

- **경로**: `/employer` (파일: `apps/web/src/app/employer/page.tsx`, `apps/web/src/components/bambi/employer-jobs-columns.tsx`)
- **기대 결과**: 상단 요약 카드에 게시/검수 대기/반려 개수, 목록에 "검수 대기" 배지. 공고 상태 표기는 `getJobDisplayStatus` — **`published` + `unpaid`이면 "미공개"(warning)**
- 배지 아래 보조 문구(`getJobStatusNote`, `employer-jobs-columns.tsx`):
  - `published` + `unpaid` → "입금 확인 후 노출됩니다."
  - `pending_review` + `unpaid` → "검수 통과와 입금 확인을 모두 마쳐야 노출됩니다."
  - `rejected` → "반려 사유: {rejectionReason}" (사유가 없으면 "수정 후 제출하면 재검수를 거칩니다.")
  - 스페셜·급구·추천 섹션 미노출 신고의 대부분은 이 결제 게이트다 — 서버 섹션 쿼리는 `status=published AND paymentStatus=paid AND exposureType=… AND (exposureEndsAt IS NULL OR > now)`로 정상 동작한다(`jobs.list`의 `getExposedJobs`)
- **관련 API**: `bambi.jobs.listMine`

### 6.2 운영자 승인 → 게시

- **경로(운영자)**: `/moderator/queue`, `/moderator/queue/[id]`
- **기대 결과**: `status = published`, `publishedAt`이 없으면 현재 시각으로 세팅, `rejectionReason = null`. **유료 공고는 `paymentStatus = paid`가 되어야 실제 공개된다**(공개 게이트 = `published AND paid`)
- **관련 API**: `bambi.moderation.setJobPostStatus`, `bambi.moderation.bulkSetJobPostStatus`

### 6.3 운영자 결제 확인 (무통장입금)

- **경로(운영자)**: `/moderator/payments`
- **기대 결과**: `paymentStatus = paid` + `exposureEndsAt = now + exposureDurationDays`. 구인자 화면에서 상태가 "미공개" → "공개"로 바뀐다
- **엣지 케이스**: 배너형 승인(unpaid→paid)은 프리미엄 정원(10) 게이트를 통과해야 한다 — 초과 시 `CONFLICT "프리미엄 광고 정원(10자리)이 가득 차 승인할 수 없어요. 자리가 나면 다시 시도해 주세요."` (`packages/api/src/services/bambi-premium-capacity.ts`)
- **관련 API**: `bambi.moderation.setJobPostPayment`, `bambi.moderation.listJobsForPayment`, `bambi.moderation.adjustJobPostExposure`

### 6.4 반려 → 재제출

- **경로**: `/employer` → 행 `⋯` → "수정" → `/employer/jobs/[id]/edit`
- **절차**: 반려된 공고를 수정하고 "공고 수정" 제출
- **기대 결과**: `getUpdatedJobPostStatus`가 `draft`가 아닌 모든 상태를 `pending_review`로 되돌린다 → 재검수. `publishedAt`은 지우지 않음(노출 정렬 키 유지)
  - 반려 공고를 열면 폼 상단에 destructive Alert "검수에서 반려된 공고입니다" + "반려 사유: {reason}"(없으면 "운영자가 사유를 남기지 않았습니다.") + "수정 후 제출하면 재검수를 거쳐 다시 게시됩니다." (`ReviewStatusNotice`)
  - `published` 공고를 열면 warning Alert "수정하면 재검수 동안 노출이 중단됩니다"
  - 목록(`listMine`)도 `rejectionReason`을 함께 내려주고, 상태 배지 아래에 사유가 표시된다(6.1 참고)
- **엣지 케이스**:
  - 금칙어 감지 결과(`riskFlags`/`detectedTerms`)는 여전히 구인자에게 노출되지 않는다 — 공고는 금칙어가 있어도 **차단되지 않고** 플래그만 남긴 채 검수 큐로 간다
  - `applyJobPostUpdate`는 `rejection_reason`을 지우지 않는다 — 재제출로 `pending_review`가 된 뒤에도 DB에는 직전 사유가 남고, 운영자 검수 화면(`moderator.tsx`)이 그 값을 "반려 사유"로 보여준다(구인자 화면은 `status === "rejected"`일 때만 렌더하므로 영향 없음)
- **관련 API**: `bambi.jobs.update` → `applyJobPostUpdate`, 상태 정책 `packages/api/src/services/bambi-policy.ts`

### 6.5 상태 전이 요약 (구인자가 관측 가능한 축)

```
[생성]        → pending_review (paymentStatus: 무료=paid / 유료=unpaid)
pending_review→ published   (운영자 승인)
pending_review→ rejected    (운영자 반려, rejectionReason 기록)
pending_review→ on_hold     (운영자 보류, 검수 결론 보류 — 구인자 화면 "검수 보류")
on_hold       → published / rejected (운영자가 공고 관리 "검수 보류" 탭에서 마무리)
published     → hidden      (운영자 숨김)
any(≠draft)   → pending_review (구인자 수정 시 자동 재검수)
unpaid        → paid        (운영자 결제 확인, exposureEndsAt 설정)
paid          → unpaid      (구인자가 노출 상품/기간을 변경하면 자동 되돌림, exposureEndsAt=null)
유료 → 무료 전환 → paid      (결제 게이트 없이 즉시)
```
**구인자가 직접 실행할 수 있는 상태 전이는 "수정 → pending_review"와 "삭제"뿐이다. 마감·숨김·게시 중단 기능은 없다.**

---

## 7. 공고 관리 (수정 / 삭제 / 공개 확인)

### 7.1 내 공고 목록

- **경로**: `/employer` (파일: `apps/web/src/app/employer/page.tsx`, `apps/web/src/components/bambi/employer-jobs-columns.tsx`)
- **기대 결과**:
  - 상단: 게시/검수 대기/반려 카운트, 진행 중인 광고 수·결제 대기 수·오늘 남은 끌어올리기 횟수
  - 퀵링크 4개: 광고 관리 / 성과 분석 / 광고 안내 / 공개 공고 보기(`/seeker`)
  - 테이블 컬럼: 제목(17자 초과 시 말줄임) / 직종·지역 / 급여 / 공고 상태 / 관리(`⋯`)
  - **`published + paid`인 공고 제목만 `/seeker/jobs/{id}` 링크**로 걸린다(그 외는 텍스트 — 공개 게이트 때문에 클릭 시 404)
  - 아래에 조직 프로필 카드(인증 상태·사업자 등록 번호·검수 메모)와 팀 프로필 카드(지역·조직)
  - 목록 범위: 조직 관리자(owner/manager)면 조직 전체 공고, staff면 소속 팀 공고만 (`getAccessibleTeamPostScopes`)
- **엣지 케이스**: `role === "job_seeker"`면 `listMine`이 `FORBIDDEN`. 접근 가능한 범위가 없으면 빈 배열
- **관련 API**: `bambi.jobs.listMine`, `bambi.promotions.listMyAds`, `bambi.onboarding.getMine`

### 7.2 공고 수정

- **경로**: `/employer/jobs/[id]/edit` (파일: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`)
- **절차**: 목록 `⋯` → "수정" → 항목 수정 → "공고 수정"
- **기대 결과**:
  - 프리필: `bambi.jobs.getEditableById`가 `adBannerLayout`과 `media`까지 함께 내려준다
  - **소속 조직·소속 팀은 읽기 전용**("이 공고의 소속 조직·팀은 변경할 수 없습니다.")
  - 성공 → 토스트 "공고가 수정되었습니다." → `/employer`
- **엣지 케이스 / 실패 케이스**:
  - 렌더 분기: 로딩 / `UNAUTHORIZED` / `NOT_FOUND`("관리 가능한 공고만 수정할 수 있습니다.") / 기타 에러
  - **미승인 구인자도 수정은 가능하다** — edit 화면의 제출 버튼 disabled 조건에 `verified`가 없고, 서버 `jobs.update`도 `isEmployerOrganizationVerified`를 검사하지 않는다(create만 검사)
  - **`EmployerGateBanner`도, 검수 SLA 안내도, 상태 전이 안내도 없다**
  - 조직·팀을 바꿔 API를 직접 호출 → `FORBIDDEN "Changing a job post organization or team is not supported."`
  - `media` 필드를 보내면 기존 미디어 전량 교체, 생략하면 기존 유지. 교체 시 빠진 이미지의 GCS 객체를 삭제
  - `adBannerLayout` 키를 **생략하면 기존 레이아웃 보존**, 명시적 `null`이면 삭제
  - **노출 상품 또는 기간이 바뀌면 `paymentStatus`가 `unpaid`로 되돌아가고 `exposureEndsAt`이 null이 된다**(재결제 필요). 화면에 안내 없음
  - `payUnit`을 "협의"로 바꾸면 서버가 `payAmount`를 명시적 `null`로 지운다
- **관련 API**: `bambi.jobs.getEditableById`, `bambi.jobs.update`, `bambi.jobs.createMediaUpload`

### 7.3 공고 삭제

- **경로**: `/employer` 행 `⋯` → "삭제"
- **절차**: 상단 destructive Alert에서 재확인 → "삭제"
- **기대 결과**: 토스트 "공고가 삭제되었습니다." + `listMine`·`listMyAds` 무효화. 연관 미디어·프로모션·성과 이벤트는 FK cascade, GCS 객체는 별도 삭제
- **엣지 케이스**: 삭제 권한도 `requireEmployerPostingAccess`만 본다(승인 검사 없음). 실패 시 "공고를 삭제하지 못했습니다. 삭제 권한을 확인한 뒤 다시 시도해 주세요."
- **관련 API**: `bambi.jobs.delete`

### 7.4 공개 화면 확인

- **경로**: `/seeker/jobs/[id]` (파일: `apps/web/src/app/seeker/jobs/[id]/page.tsx`)
- **기대 결과**: 구인자도 공개 상세를 열 수 있다(`bambi.jobs.getById`는 `publicProcedure`). 상세에는 구인자의 인증 연락처(`employerVerifiedPhone`)가 인증된 경우에만 노출된다
- **엣지 케이스**: `published + paid`가 아니면 열리지 않는다. **`/employer/jobs/[id]`(상세) 라우트는 존재하지 않는다** — `edit`만 있다
- **관련 API**: `bambi.jobs.getById`, `bambi.reviews.listByJobPost`

---

## 8. 광고 상품 안내 · 프리미엄 정원

### 8.1 광고 상품 카탈로그

- **경로**: `/employer/ad-guide` (파일: `apps/web/src/app/employer/ad-guide/page.tsx` → `apps/web/src/components/bambi/screens/employer-ad-guide.tsx`)
- **기대 결과**:
  - 상단 "광고 등록 안내" 카드: 무통장입금 전용, 업무 시간 30분 이내 / 시간 외 다음 영업일 승인, 끌어올리기는 리스팅 광고 전용, 금칙어·불량 업소 시 광고 삭제 경고
  - 진열대(placement)별 카드 + 상품 행: 노출 위치 미리보기 이미지 / 서비스 내용(끌어올리기 횟수·benefits) / 기간별 요금(할인 시 원가 취소선 + 할인가 + `N% 할인`) / "신청하기" → `/employer/new`
  - 노출 위치 미리보기 이미지는 **클릭하면 Dialog 라이트박스**로 확대된다(`AdPlacementPreview`). 트리거는 `aria-label="{상품명} 게시 위치 미리보기 크게 보기"`, 닫기는 Esc·백드롭
  - **배너 진열대에만** 정원 표기: `남은 자리 R/10`, 0이면 "현재 정원이 가득 찼어요 — 지금 신청하면 대기열에 등록돼요."
  - 정원은 30초마다 자동 갱신
- **엣지 케이스**:
  - 카탈로그 0건 → "준비 중인 광고 상품" / 에러 전용 UI 없음(빈 상태로 폴백)
  - `side-horizontal`/`side-vertical` 상품은 카탈로그에서 제외된다
  - **배너 픽셀 규격 안내는 이 화면에 없다**(퀵링크 설명은 "배너 규격을 확인해요"라고 적혀 있음)
- **관련 API**: `bambi.adProducts.getCatalog`, `bambi.adProducts.premiumCapacity` (`packages/api/src/routers/bambi/ad-products.ts`)

### 8.2 프리미엄 정원 · 대기열 파생 검증

- **선행 조건**: 배너형 공고가 여러 건 등록되어 `active`(published+paid+미만료)와 `pending`(pending_review 또는 published + unpaid + 배너 + adProductId 존재)이 섞여 있을 것
- **기대 결과** (`packages/api/src/services/bambi-premium-capacity.ts`):
  - `capacity = 10` 고정, `active` = 노출 중, `pending` = 입금 대기, `remaining = max(0, 10 - active - pending)`
  - pending은 `createdAt asc, id asc`로 rank 부여. `progressableSlots = max(0, 10 - active)` 이하면 "진행 가능", 초과분은 `대기열 N번째`
  - 앞선 광고가 만료되면 별도 조작 없이 순번이 앞당겨진다(파생 큐, 저장 컬럼 없음)
- **엣지 케이스**: 승인 게이트는 rank를 강제하지 않는다(무통장입금 도착 순서 반영, 의도된 단순화). 카운트는 **전역**(모든 조직 통합)
- **관련 API**: `bambi.adProducts.premiumCapacity`, `bambi.promotions.listMyAds`(`premiumQueue` 필드)

---

## 9. 광고 관리 (끌어올리기)

### 9.1 광고 목록 확인

- **경로**: `/employer/promotions` (파일: `apps/web/src/app/employer/promotions/page.tsx`)
- **선행 조건**: 광고 상품이 적용된 공고 1건 이상. **광고 미적용 일반 공고는 목록에 나타나지 않는다**(`innerJoin(adProduct)`)
- **기대 결과**:
  - 상태 탭: 전체 / 진행 중 / 결제 대기 / 만료. 분류 우선순위 = 만료 > 결제 대기 > 진행 중 > 그 외(전체 탭에만)
  - 컬럼: 공고(제목+팀) / 상태(+ 입금 안내 + 프리미엄 큐 배지) / 노출 위치·상품 / 노출 마감 / 오늘 끌어올리기 / 자동 끌어올리기 / 최근 끌어올림 / `⋯`
  - `⋯` 메뉴: "끌어올리기"(비활성 시 사유 텍스트), 구분선, "공고 보기" → `/employer/jobs/{id}/edit`
  - 헤더 요약 `진행 중 N개 · 전체 N개` + "공고 관리" 버튼
  - 페이지네이션 10건
- **관련 API**: `bambi.promotions.listMyAds` (`packages/api/src/routers/bambi/promotions.ts`)

### 9.2 수동 끌어올리기

- **경로**: `/employer/promotions` 행 `⋯` → "끌어올리기"
- **선행 조건**: 리스팅형 광고(special/urgent/recommended) + `published` + `paid` + 노출 미만료 + 오늘 남은 횟수 > 0
- **절차**: `⋯` 열기 → "끌어올리기" 클릭
- **기대 결과**: 토스트 "공고를 끌어올렸습니다." + `boostedAt = now`, `job_boost_event`(boostType=manual) 1건 기록. 정렬 키는 `GREATEST(boosted_at, published_at)`
- **엣지 케이스 / 실패 케이스** (서버 판정 순서, `packages/api/src/services/bambi-job-boost.ts`):
  1. `not_ad_job` — "광고 상품이 적용된 공고만 끌어올릴 수 있습니다."
  2. `not_publicly_visible` — "공개 중(결제 완료·게시)인 공고만 끌어올릴 수 있습니다."
  3. `exposure_expired` — "광고 노출 기간이 만료되어 끌어올릴 수 없습니다."
  4. `banner_product` — "배너 광고는 끌어올리기 대상이 아닙니다. 리스팅 광고(스페셜·급구·추천)에서만 제공됩니다."
  5. `product_without_boost` — "이 광고 상품에는 끌어올리기가 포함되어 있지 않습니다."
  6. `daily_limit_reached` — "오늘 끌어올리기 횟수를 모두 사용했습니다."
  - **클라이언트 판정(4종)과 서버 판정(6종)의 문구·순서가 다르다.** 예: 미결제 배너 공고는 화면엔 "배너 광고는 끌어올리기 대상이 아닙니다."가 뜨지만 서버는 "공개 중…" 사유를 낸다
  - 한도는 KST 자정 기준(`getKstDayStart`), 수동/자동 쿼터 분리
  - 동시 클릭은 `job_post` 행 `FOR UPDATE` 잠금으로 직렬화 → 한도 초과 불가
  - 횟수는 라이브 상품이 아니라 **구매 시점 스냅샷**(`job_post.manual_boosts_per_day`)으로 판정 — 운영자가 상품을 바꿔도 기존 공고에 소급되지 않음
- **관련 API**: `bambi.promotions.boost`

### 9.3 무통장입금 재안내

- **경로**: `/employer/promotions` 상태 컬럼 "입금 안내" 버튼
- **선행 조건**: `paymentStatus = unpaid`
- **기대 결과**: Popover에 결제 예정 금액 + 계좌 목록 + 복사 버튼 + 입금자명 안내
- **엣지 케이스**: 계좌 0건이면 destructive 안내. 복사 실패 시 "계좌번호를 복사하지 못했어요."
- **관련 API**: `bambi.siteSettings.getPaymentAccounts` (`packages/api/src/routers/bambi/site-settings.ts`)

### 9.4 자동 끌어올리기 표시

- **경로**: `/employer/promotions` "자동 끌어올리기" 컬럼
- **기대 결과**: `오늘 X/N회 실행`. 상품에 자동 횟수가 없으면 `—`
- **엣지 케이스**: 스케줄·다음 실행 시각 UI는 없다. 서버는 KST 09:00~21:00 창을 N등분하고 공고 id 해시로 오프셋을 분산한다(`packages/api/src/services/bambi-job-boost.ts`, `bambi-auto-boost.ts`)

---

## 10. 지원자 응대 — 채팅 · 면접 · 연락처 공개

### 10.1 채팅 진입 경로

- **경로**: `/seeker/chats`, `/seeker/chats/[id]` (파일: `apps/web/src/app/seeker/chats/page.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`, `seeker-chat-room-responsive.tsx`)
- **선행 조건**: 구직자가 공고에서 채팅을 시작하고 **첫 메시지를 보낸 상태**(메시지 0건인 방은 목록에서 숨겨진다)
- **절차**: `/employer` 하단 탭 "내 정보" → `/seeker/me`(SeekerShell) → 헤더 "채팅" 버튼 → `/seeker/chats`
- **기대 결과**: 구인자로 참여 중인 방 목록. 안 읽은 방이 있으면 헤더 채팅 버튼에 코럴 점
- **엣지 케이스**:
  - **구인자 셸(`variant="employer"`)에는 채팅 버튼도 채팅 nav 항목도 없다.** `/seeker/me` 셸을 경유해야만 도달한다
  - `chat_room.employerUserId = job_post.createdByUserId`이므로 **공고를 등록한 본인만 그 채팅방을 본다.** 같은 조직의 다른 owner/manager는 볼 수 없다
  - `/seeker/jobs/[id]/chat`은 `enforceJobSeekerAccess()`로 구직자 전용(구인자가 열면 `/employer`로 리다이렉트). `/seeker/chats`에는 역할 가드가 없다
- **관련 API**: `bambi.chats.listMine`, `bambi.chats.unreadState`, `bambi.chats.getById`

### 10.2 메시지 · 첨부

- **경로**: `/seeker/chats/[id]`
- **절차**: 텍스트 입력 후 전송 / 이미지·PDF 첨부
- **기대 결과**: `sendMessage`/`sendMediaMessage` 성공, 소프트 삭제된 방은 새 메시지로 양쪽 모두 재노출
- **엣지 케이스**: 차단된 방은 `FORBIDDEN` + 안내("…님이 차단했어요." / "…님을 차단했어요. 차단 관리에서 해제할 수 있어요."). 운영자가 방을 차단하면(`setChatRoomBlocked`) 목록으로 되돌려 보낸다
- **관련 API**: `bambi.chats.sendMessage`, `bambi.chats.createAttachmentUpload`, `bambi.chats.sendMediaMessage`, `bambi.chats.markRead`, `bambi.chats.deleteChatRoom`

### 10.3 면접 일정 제안 · 상태 전이

- **경로**: `/seeker/chats/[id]` 우측 "면접 일정" 카드
- **선행 조건**: 구인자로 참여 중인 방. **면접 제안 폼은 구인자에게만 렌더된다**
- **절차**: 면접 일시(datetime-local, 과거 불가) + 장소 메모(300자, 선택) → "면접 일정 제안"
- **기대 결과**: `interview_schedule` 행 생성(`status = proposed`)
- **엣지 케이스 / 실패 케이스** (`canSetInterviewStatus`, `packages/api/src/routers/bambi/chats.ts`):
  | 요청 상태 | 허용 조건 |
  |---|---|
  | `confirmed` / `declined` | 현재 `proposed` **AND 제안자가 아닌 쪽**(= 구직자만) |
  | `canceled` | 현재 `proposed` 또는 `confirmed` (양쪽 다 가능) |
  | `completed` | 현재 `confirmed` (양쪽 다 가능) |
  - 구직자가 아닌 사람(구인자)이 제안하려 하면 `FORBIDDEN`. 구인자가 자기 제안을 확정하려 해도 `FORBIDDEN`
  - 상태가 이미 바뀐 뒤 재시도 → `CONFLICT "Interview schedule status has changed."`
  - 빈 일시 → "면접 일시를 선택해 주세요." / 과거 → "면접 일시를 다시 확인해 주세요."
- **관련 API**: `bambi.chats.proposeInterview`, `bambi.chats.setInterviewStatus`, `bambi.chats.listMyUpcomingInterviews`

### 10.4 연락처 공개 요청 (구인자 → 구직자)

- **경로**: `/seeker/chats/[id]` 면접 일정 카드 하단 "연락처 공개 요청" 버튼
- **선행 조건**: 구인자 본인 + `isPhoneVerified = true`. **면접 확정 여부는 요구하지 않는다**
- **절차**: "연락처 공개 요청" 클릭 → 구직자가 인라인 메시지에서 공개/거절 선택
- **기대 결과**:
  - `kind = "contact_request"` 인라인 메시지 1건 생성(`metadata.status = pending`)
  - 구인자 화면: "연락처 공개를 요청했습니다. (응답 대기 중)" → 응답 후 공개/거절 문구로 전이
  - 토스트 "연락처 공개를 요청했어요."
- **엣지 케이스 / 실패 케이스**:
  - 미인증 구인자 → `BAD_REQUEST "본인인증 후 이용할 수 있습니다."`
  - 이미 pending 요청 존재 → `CONFLICT "이미 연락처 공개 요청이 진행 중입니다."`
  - 구직자가 미인증인데 공개 시도 → `BAD_REQUEST "본인인증 후 연락처를 공개할 수 있습니다."`
  - 이미 처리된 요청 재응답 → `CONFLICT "연락처 공개 요청 상태가 이미 변경되었습니다."`
  - **구인자는 대상이 아니라 요청자이므로 `respondContactReveal`을 호출할 수 없다**(`FORBIDDEN`)
- **관련 API**: `bambi.chats.requestContactReveal`, `bambi.chats.respondContactReveal`

### 10.5 (레거시) 구인자 연락처 공개 — 웹 미사용

- `bambi.chats.getContactReveal` / `bambi.chats.revealContact`는 **웹 채팅 UI에서 호출하지 않는다**(네이티브 잔존 경로). 웹은 10.4의 요청/응답 흐름만 쓴다.
- `revealContact` 서버 조건(참고): 구인자 본인 + 면접 `confirmed`/`completed` + 본인 휴대폰 인증 (`canRevealContact`, `packages/api/src/services/bambi-policy.ts`)
- 구직자 화면에서는 공고 상세의 `employerVerifiedPhone`(구인자 인증 연락처)이 면접 카드에 노출된다.

---

## 11. 리뷰 · 신고 · 차단

### 11.1 후기 확인

- **경로**: `/seeker/jobs/[id]` 후기 섹션 (파일: `apps/web/src/components/bambi/job-review-section.tsx`)
- **기대 결과**: `published` 상태 후기만 노출. 작성자는 "익명" 또는 마스킹된 표시명
- **엣지 케이스**: **구인자가 후기에 답글을 다는 기능은 없다.** `bambi.reviews`에는 `create`(구직자 전용) / `listByJobPost` / `listMine`만 있고 답변 프로시저가 없다. 후기 숨김·상태 변경은 운영자 전용(`bambi.moderation.setReviewStatus`)
- **관련 API**: `bambi.reviews.listByJobPost` (`packages/api/src/routers/bambi/reviews.ts`)

### 11.2 신고

- **경로**: 공고·커뮤니티 화면의 신고 다이얼로그 (파일: `apps/web/src/components/bambi/report-dialog.tsx`), 내역: `/seeker/me/reports`
- **기대 결과**: 사유 선택 + 상세 입력 → `report` 행 생성. 같은 신고자·대상 중복은 멱등(기존 행 반환)
- **엣지 케이스 / 실패 케이스**:
  - **채팅방·채팅 메시지 신고는 구직자 전용** → 구인자가 호출하면 `FORBIDDEN "채팅 신고는 구직자만 할 수 있어요."`
  - 자기 자신 신고 → `BAD_REQUEST "자기 자신은 신고할 수 없어요."`
- **관련 API**: `bambi.moderation.createReport`, `bambi.moderation.listMyReports`

### 11.3 차단

- **경로**: `/seeker/chats/[id]` 안전 안내 바 "차단하기" → 인라인 확인, 목록: `/seeker/me/blocks`
- **기대 결과**: `user_block` 1행이 양방향으로 두 사람의 모든 공유 채팅방을 막는다. 토스트 "상대를 차단했어요."
- **엣지 케이스**: 자기 자신 차단 → `BAD_REQUEST "자기 자신은 차단할 수 없어요."`. 중복 차단은 `onConflictDoNothing`
- **관련 API**: `bambi.blocks.blockUser`, `bambi.blocks.unblockUser`, `bambi.blocks.listMine` (`packages/api/src/routers/bambi/blocks.ts`)

---

## 12. 성과 분석 (통계)

### 12.1 지표 확인

- **경로**: `/employer/analytics` (파일: `apps/web/src/app/employer/analytics/page.tsx`)
- **선행 조건**: **조직 관리자(owner/manager)** 역할. staff 계정은 항상 빈 결과
- **기대 결과**:
  - 상단 요약: `공고 N개 · 상세 전환 X% · 채팅 전환 Y%` + "광고 관리"·"공고 관리" 링크
  - 총계 카드 3개: 노출(impression) / 상세 조회(detail_view) / 채팅 시작(chat_start)
  - "노출 구분": 스페셜 / 급구 / 추천 / 일반 카드 4개 + 프리미엄 배너 카드(상단·좌측·우측 비중 막대)
  - 공고별 표: 공고(제목+상태 배지) / 노출 / 상세 / 채팅 / 상세 전환 / 게재 구분
- **엣지 케이스**:
  - **기간 필터가 없다. 전체 누적(all-time)이다** — `getEmployerJobPerformanceSummary`가 날짜 조건 없이 `jobPerformanceEvent`를 조회
  - 서버가 집계하는 `contactReveals`(연락처 공개 이벤트)는 화면에 표시되지 않는다
  - 공고 0건이면 요약·카드는 0으로 렌더되고 표 자리에만 EmptyState + "새 공고 등록"
  - `role === "job_seeker"` → `FORBIDDEN`
- **관련 API**: `bambi.analytics.summary` (`packages/api/src/routers/bambi/analytics.ts` → `packages/api/src/services/bambi-analytics.ts`)

---

## 13. 커뮤니티(수다방) 접근 — 광고 중 업소 자격

### 13.1 광고주 자격으로 수다방 입장

- **경로**: `/seeker/community` (파일: `apps/web/src/app/seeker/community/page.tsx`, `apps/web/src/components/bambi/require-community-access.tsx`)
- **선행 조건**: 정지 계정이 아니고 (관리자 | 여성 회원 | **광고 중 업소**)
- **기대 결과**: `hasActiveAdExposure`가 true면 남성 구인자도 입장 가능. 판정: 본인이 **owner/manager**인 조직 중 `adProductId` 보유 + `published` + `paid` + 노출 미만료 공고가 1건이라도 있을 것
- **엣지 케이스**:
  - 성별 미확인(`gender = null`) → notice `unverified`
  - 남성 구인자인데 광고 없음 → notice `male_employer`
  - 광고가 만료되면 자격이 자동으로 사라진다(조회 시 파생 판정)
  - staff 역할은 광고 자격을 받지 못한다
- **관련 API**: `bambi.onboarding.getMine`(`community` 필드), 판정 `packages/api/src/services/bambi-community-access.ts`, `bambi-advertiser.ts`

---

## 14. 계정 설정 · 회원 탈퇴

### 14.1 표시명 변경

- **경로**: `/seeker/me/settings` (파일: `apps/web/src/components/bambi/screens/account-settings-screen.tsx`)
- **기대 결과**: `user.name` 갱신. 표시명의 정본은 세션 `user.name`
- **엣지 케이스**: 개인 정보 변경 없이 호출하면 `BAD_REQUEST "At least one personal profile field is required."`. 번호를 바꾸면 `isPhoneVerified`가 false로 내려간다
- **관련 API**: `bambi.onboarding.updateMyProfile`

### 14.2 회원 탈퇴

- **경로**: `/employer/settings` 하단 (파일: `apps/web/src/components/bambi/withdraw-account-section.tsx`)
- **선행 조건**: 본인이 owner인 조직에 **다른 멤버가 남아 있지 않을 것**
- **절차**: "회원 탈퇴" → 다이얼로그 "정말 탈퇴하시겠어요?" → "탈퇴하기"
- **기대 결과**: **소프트 탈퇴만 한다.**
  - `user.deletedAt` 세팅 + 이름 "탈퇴한 회원" + `image` null. **이메일·`login_id`·`account`(비밀번호)·`bambi_profile`의 연락처·성별·생년월일은 그대로 남는다**
  - `team_member`·`member`·전 기기 세션 삭제
  - 탈퇴자가 **유일한 멤버였던 조직**의 `published` 공고는 `hidden`으로 내려간다. 다른 멤버가 남은 조직의 공고는 유지 (`findOrganizationsLeftEmptyBy`)
  - 식별값 파기는 보존기간(기본 30일, 사이트 설정 우선) 경과 후 `bambi.moderation.purgeWithdrawnAccounts` 배치가 전담한다 (§운영자 4.6)
  - 로그아웃 → 게스트 쿠키 삭제 → 토스트 "탈퇴가 완료됐어요…" → `/`
- **엣지 케이스**:
  - 다른 멤버가 남아 있으면 버튼이 사전 비활성 + destructive Alert. 서버도 `CONFLICT "팀에 다른 멤버가 남아 있어 탈퇴할 수 없어요…"`
  - 재로그인 시도(아이디·비밀번호 정상 입력) → better-auth 세션 생성 훅 `FORBIDDEN "탈퇴한 계정이에요. 로그인할 수 없어요."`. 이메일·`login_id`·비밀번호가 남아 있어야 이 경로에 도달한다 — 예전처럼 탈퇴 즉시 파기하면 계정을 못 찾아 "아이디(이메일) 또는 비밀번호가 틀렸습니다."로 뭉개졌다
  - 보존기간 동안은 같은 이메일·`login_id`로 재가입할 수 없다(unique 충돌). 같은 명의 본인인증도 CI/DI 해시로 막힌다. 파기 배치가 돌면 둘 다 열린다
  - 상대 구직자의 채팅방에는 담당자 이름이 팀·조직 표시명 대신 "탈퇴한 회원"으로 보인다 (`chats.ts` `resolveCounterpartNames`)
  - `user` 행 자체는 삭제하지 않는다(상대방 채팅·리뷰·신고가 FK로 물려 있음)
- **관련 API**: `bambi.onboarding.getWithdrawEligibility`, `bambi.onboarding.withdrawMyAccount`, `bambi.siteSettings.getMemberPolicy`

---

## 15. 고객문의 (고객센터) · 법적 문서

### 15.1 FAQ

- **경로**: `/support` (파일: `apps/web/src/app/support/page.tsx`, `apps/web/src/components/bambi/support/faq-list.tsx`)
- **선행 조건**: 로그인(모든 support 프로시저가 `protectedProcedure`)
- **기대 결과**: 카테고리 칩(전체/계정·로그인/공고·지원/결제·광고/신고·제재/기타) + 아코디언 + 하단 "1:1 문의하기"·"내 문의 내역"
- **엣지 케이스**: 비공개 FAQ는 운영자에게만 보인다(`includeUnpublished`는 admin일 때만 유효)
- **관련 API**: `bambi.support.listFaq` (`packages/api/src/routers/bambi/support.ts`)

### 15.2 1:1 문의 등록

- **경로**: `/support/inquiries/new` (파일: `apps/web/src/components/bambi/support/inquiry-form.tsx`)
- **절차**: 문의 유형(기본 "계정·로그인") / 제목(2~100자) / 내용(5~5000자) → "문의 등록"
- **기대 결과**: 토스트 "문의가 등록됐어요." → `/support/inquiries/{id}`로 replace. `authorRole`에 구인자 역할이 기록된다
- **엣지 케이스**: **첨부파일 업로드 UI가 없다.** 금칙어 포함 시 `assertNoBannedWords`가 차단하고 해당 메시지가 그대로 토스트로 노출
- **관련 API**: `bambi.support.createInquiry`

### 15.3 문의 목록 · 상세 · 추가 메시지

- **경로**: `/support/inquiries`, `/support/inquiries/[id]` (파일: `apps/web/src/components/bambi/support/inquiry-list.tsx`, `inquiry-thread.tsx`)
- **기대 결과**:
  - 목록: 카테고리 배지 + 상태 배지(접수됨/답변완료/종료) + 제목 + 최근 메시지 시각
  - 상세: 원문 + 메시지 스레드(운영자/나 배지) + 답장 Textarea + "보내기"
  - 상태 전이: 사용자가 메시지를 보내면 `open`, 운영자가 답하면 `answered`
- **엣지 케이스**:
  - **목록이 `page: 1` 고정이고 페이지 이동 UI가 없다** — 서버 페이지 크기 20이므로 21건째부터 볼 수 없다
  - 메시지는 최대 100건까지만 반환
  - **문의자 화면에 "문의 종료" 버튼이 없다.** 종료는 운영자 전용(`closeInquiry` = `adminProcedure`)이고 재개(reopen) 프로시저는 없다 → 종료 뒤 답장 시도는 서버 `BAD_REQUEST "종료된 문의에는 답변을 남길 수 없습니다."`
  - 운영자가 숨긴 문의·메시지는 작성자에게 `NOT_FOUND` 또는 "운영자가 숨긴 메시지입니다."로 대체된다
- **관련 API**: `bambi.support.listMyInquiries`, `bambi.support.getInquiry`, `bambi.support.createInquiryMessage`

### 15.4 법적 문서

- **경로**: `/terms`, `/privacy` (파일: `apps/web/src/app/(legal)/terms/page.tsx`, `apps/web/src/app/(legal)/privacy/page.tsx`, 레이아웃 `apps/web/src/app/(legal)/layout.tsx`)
- **기대 결과**: 앱 nav 없이 로고 헤더 + 푸터. 시행일 2026-07-27. 비로그인도 접근 가능(게이트 공개 prefix)
- **관련 API**: 페이지 본문은 정적. 개인정보 처리방침의 보존기간·처리자 정보는 `apps/web/src/components/bambi/privacy-contacts.tsx` 경유

---

## 16. 권한 경계 테스트

### 16.1 비로그인 / 게스트

| 시나리오 | 기대 결과 | 근거 |
|---|---|---|
| 비로그인으로 `/employer` 직접 진입 | 미들웨어가 `/seeker?auth=login`으로 307 | `apps/web/src/lib/bambi/resolve-gate.ts` |
| 게스트 쿠키만 있는 상태로 `/employer` | `/seeker?auth=signup&guestBlocked=1` + "회원가입 후에 볼 수 있어요" 토스트 | 동일 |
| 비로그인으로 `/ad-banner-editor` | `/seeker?auth=login` | 미들웨어 + `resolveEmployerAccess()` |
| 비로그인으로 oRPC 직접 호출 | `UNAUTHORIZED` (모든 `protectedProcedure`) | `packages/api/src/index.ts` `requireAuth` |
| 비로그인으로 `/terms`·`/privacy` | 통과 | `PUBLIC_PREFIXES` |
| 게스트 쿠키 위조(서명 불일치) | anon 취급 → `/seeker?auth=login` | `apps/web/src/lib/bambi/guest-token.ts` HMAC 검증 |

### 16.2 역할 경계

| 시나리오 | 기대 결과 | 근거 |
|---|---|---|
| 구직자가 `/employer` 진입 | `/seeker`로 리다이렉트(인증 오버레이 아님) | `resolveEmployerAccess` → `homePathForRole` |
| 운영자(admin)가 `/employer` 진입 | `/moderator`로 리다이렉트 | 동일 |
| 구인자가 `/moderator` 진입 | `/employer`로 리다이렉트 | `enforceModeratorAccess` |
| 구인자가 `/seeker/jobs/[id]/chat` 진입 | `/employer`로 리다이렉트 | `enforceJobSeekerAccess` (`apps/web/src/app/seeker/jobs/[id]/chat/layout.tsx`) |
| 구인자가 `/seeker/chats` 진입 | **통과**(역할 가드 없음). 본인이 등록한 공고의 채팅방만 노출 | `apps/web/src/app/seeker/chats/page.tsx` |
| 구직자 프로필로 `bambi.jobs.listMine` 호출 | `FORBIDDEN` | `packages/api/src/routers/bambi/jobs.ts` |
| 구직자 프로필로 `bambi.analytics.summary` / `bambi.promotions.listMyAds` | `FORBIDDEN` | 각 라우터 첫 줄 |
| 구인자가 `bambi.chats.startFromJobPost` 호출 | `FORBIDDEN`(구직자 전용) | `packages/api/src/routers/bambi/chats.ts` |
| 구인자가 `bambi.reviews.create` 호출 | `FORBIDDEN "Only the job seeker can review this chat room."` | `packages/api/src/routers/bambi/reviews.ts` |
| 구인자가 채팅방/메시지 신고 | `FORBIDDEN "채팅 신고는 구직자만 할 수 있어요."` | `packages/api/src/routers/bambi/moderation.ts` |
| 구인자가 `bambi.moderation.setJobPostStatus` 등 운영자 프로시저 호출 | `FORBIDDEN "Admin Bambi profile is required for this action."` | `requireAdminProfile` / `adminProcedure` |
| 구인자가 `/ad-banner-editor` 직접 URL 접근 | 게이트 통과하지만 `window.opener` 없음 → "이 화면은 직접 열 수 없습니다" | `apps/web/src/app/ad-banner-editor/ad-banner-editor-window.tsx` |

### 16.3 승인(verified) 경계

| 시나리오 | 기대 결과 | 근거 |
|---|---|---|
| 미승인(none/pending/rejected)으로 `/employer` 진입 | **통과**. 배너 노출 + "새 공고 등록" 버튼 비활성 | `apps/web/src/app/employer/layout.tsx` |
| 미승인으로 `bambi.jobs.create` 직접 호출 | `FORBIDDEN "운영자 승인 후 공고를 등록할 수 있습니다."` | `packages/api/src/routers/bambi/jobs.ts` |
| 미승인으로 `bambi.jobs.update` / `bambi.jobs.delete` 직접 호출 | **성공한다** — 승인 검사가 없다 | 동일 파일 (create만 `isEmployerOrganizationVerified` 검사) |
| 미승인으로 `bambi.organizations.updateProfile` | `FORBIDDEN "운영자 승인 후 조직 설정을 변경할 수 있습니다."` | `organizations.ts` |
| 미승인으로 팀 생성/수정/삭제·초대·역할 변경·팀 소속 변경 | `FORBIDDEN "운영자 승인 후 팀을 관리할 수 있습니다."` | `teams.ts` `assertOrganizationVerified` |
| 미승인으로 `bambi.teams.deleteInvitation` | **성공한다** — 이 프로시저만 승인 검사가 없다 | `teams.ts` |
| 조직 A는 verified, 조직 B는 pending인 계정 | 배너는 사라지지만(`deriveEmployerApprovalStatus`가 verified 우선), **조직 B로 공고 등록 시 서버가 FORBIDDEN** | `bambi-onboarding.ts` vs `bambi-authz.ts` |
| 미승인으로 `/employer/settings/teams`의 팀 "수정" 버튼 | **눌린다**(폼만 잠김) | `apps/web/src/app/employer/settings/teams/page.tsx` |

### 16.4 조직 내 권한 차등

| 시나리오 | owner | manager | staff |
|---|---|---|---|
| `bambi.organizations.getMine` 목록에 조직 노출 | O | O | **X (빈 목록)** |
| `/employer/settings` 조직 이름 저장 | O | X(안내문) | X |
| `/employer/settings/teams` 진입·팀 CRUD·초대 | O | O | X("관리 가능한 조직이 없습니다") |
| 멤버 `⋯` 메뉴(권한 변경·팀 소속·소유권 이전·내보내기) | O | **X (버튼 미렌더)** | X |
| `bambi.jobs.listMine` 범위 | 조직 전체 | 조직 전체 | 소속 팀 공고만 |
| `bambi.promotions.listMyAds` 범위 | 조직 전체 | 조직 전체 | 소속 팀 공고만 |
| `bambi.analytics.summary` | 조직 전체 | 조직 전체 | **빈 배열** |
| 공고 등록 범위(`employerJobPostingScopes`) | 조직 전체 + 모든 팀 | 조직 전체 + 모든 팀 | 본인 소속 팀만 |
| 수다방 광고주 자격(`hasActiveAdExposure`) | O | O | **X** |
| `bambi.teams.setMemberRole`/`transferOwnership`/`removeMember` | O | `FORBIDDEN "Organization owner access is required."` | 동일 |

근거: `packages/api/src/services/bambi-organization-authz.ts`, `bambi-job-access.ts`, `bambi-analytics.ts`, `bambi-advertiser.ts`, `packages/api/src/routers/bambi/organizations.ts`, `teams.ts`.

### 16.5 타 조직 / 타 리소스 접근

| 시나리오 | 기대 결과 | 근거 |
|---|---|---|
| 다른 조직의 `jobPostId`로 `bambi.jobs.getEditableById` | `FORBIDDEN "Organization membership is required to post jobs."` | `requireEmployerPostingAccess` |
| 다른 조직의 공고에 `bambi.jobs.update` / `delete` / `promotions.boost` | 동일 `FORBIDDEN` | 각 프로시저가 대상 조회 후 게이트 |
| staff가 본인 팀이 아닌 팀 공고 수정 | `FORBIDDEN "Membership in the selected team is required to post jobs."` | `bambi-authz.ts` |
| 조직에 속하지 않는 `teamId`로 공고 등록 | `FORBIDDEN "Selected team must belong to the organization."` | 동일 |
| 다른 조직 prefix의 `storageKey`를 미디어로 전송 | `FORBIDDEN "Job post media does not belong to this organization."` | `jobs.ts` `requireValidJobPostMediaSet` |
| 다른 조직의 `organizationId`로 `bambi.teams.list` | `FORBIDDEN "Organization owner or manager access is required."` | `teams.ts` |
| 참여하지 않은 채팅방 ID로 `bambi.chats.getById` | `NOT_FOUND "Chat room was not found for this user."` | `requireChatParticipant` |
| 남의 문의 ID로 `bambi.support.getInquiry` | `NOT_FOUND "문의를 찾을 수 없습니다."` | `support.ts` |
| 같은 조직 다른 멤버가 등록한 공고의 채팅방 조회 | `NOT_FOUND` — 채팅은 공고 작성자 본인만 | `chat_room.employerUserId = job_post.createdByUserId` |

### 16.6 계정 상태 경계

| 시나리오 | 기대 결과 | 근거 |
|---|---|---|
| `status = suspended` 계정으로 어떤 구인자 프로시저든 호출 | `FORBIDDEN "Suspended Bambi accounts cannot perform this action."` | `requireActiveBambiProfile` |
| `status = warned` 계정 | **서버에서 아무것도 막지 않는다.** 배너만 표시 | 동일 |
| 정지 계정으로 `/employer` 진입 | 화면은 렌더되고 배너만 뜬다. 각 쿼리가 FORBIDDEN으로 실패 | `apps/web/src/app/employer/layout.tsx` |

---

## 부록: 매뉴얼 갱신 필요 항목 / 확인 필요 사항

대조 대상: `docs/manual/employer-manual.md` (최종 갱신 2026-07-27)

### A. 매뉴얼이 코드와 어긋나는 지점

| # | 매뉴얼 기술 | 코드 실제 | 위치 |
|---|---|---|---|
| 1 | "2-1. 계정 만들기 … **이름**을 입력합니다 … **이메일**과 **비밀번호**를 입력합니다" — 본인인증 단계와 아이디 입력이 빠져 있음 | 가입은 **2단계**다: ① 본인인증(포트원 KCP) → ② 닉네임·**아이디**·비밀번호·비밀번호 확인·이메일·가입 유형·약관 동의. 본인인증 없이는 가입 불가(포트원 구성 환경) | `apps/web/src/components/bambi/auth/auth-panel.tsx`, `auth-fields.tsx` |
| 2 | "**회원가입** 버튼을 누르면 … 곧바로 구인자 첫 화면(**내 공고**)으로 이동합니다" | 가입 직후 이동지는 **`/seeker`**다. `/employer`는 헤더 "구인 관리" 버튼으로 들어가야 한다 | `auth-panel.tsx` `finishSignup`, `apps/web/src/lib/bambi/require-role.ts` `redirectToRoleHome` |
| 3 | "메뉴 위치 안내 … 데스크톱 … **내 공고 · 공고 등록 · 광고 안내 · 조직 설정 · 업체 정보 · 채용정보**" | 실제 nav는 내 공고 / 공고 등록 / 광고 안내 / **업체 관리(드롭다운: 업체 정보·조직 설정)** / **고객센터**. "채용정보" 항목 없음 | `apps/web/src/app/employer/layout.tsx` |
| 4 | 내 공고 바로가기 타일: "광고 관리 / **광고 상품 안내** / 성과 분석 / **조직 설정** / 공개 공고 보기" (5개) | 실제 퀵링크는 4개: 광고 관리 / 성과 분석 / **광고 안내** / 공개 공고 보기. "조직 설정" 타일은 없음 | `apps/web/src/app/employer/page.tsx` `quickLinks` |
| 5 | 내 공고 목록에 "**사업자** 인증 상태, 소속 조직·팀, 최근 수정 시각"이 표시된다 | 실제 컬럼은 제목 / 직종·지역 / 급여 / 공고 상태 / 관리 4+1개뿐. 사업자 인증·조직·팀·수정 시각 컬럼 없음 | `apps/web/src/components/bambi/employer-jobs-columns.tsx` |
| 6 | 공고 등록 "업종 — 룸싸롱 / 텐프로·쩜오 / … / 요정 중에서 선택" (8종) | **9종**이다. "기타"가 추가되어 있음 | `packages/db/src/schema/bambi.ts` `jobIndustryCategory` |
| 7 | 공고 등록 "지역 — 서울 / 경기 / 인천 / 부산 / 대구 / 대전 / 광주 / 기타 중에서 선택" | 지역은 고정 8종 목록이 아니라 **지역 마스터(법정동코드 10자리) 기반 시/도 + 세부지역 2단 Select**다 | `apps/web/src/components/bambi/job-region-fields.tsx`, `bambi.regions.list` |
| 8 | "급여 단위(시급 / 일급 / 주급 / 월급)" | **"협의"가 추가된 5종**이며, 협의 선택 시 금액 칸이 사라지고 "급여 협의"로 게시된다 | `apps/web/src/lib/bambi-options.ts` `payUnitOptions` |
| 9 | 공고 이미지 "(JPG·PNG·WebP 형식)" | 형식은 맞다. 다만 **장당 10MB 상한**과 **이미지 설명(alt) 120자 제한**이 매뉴얼에 없다 | `packages/api/src/services/bambi-job-media-policy.ts`, `apps/web/src/lib/bambi-job-form.ts` |
| 10 | "초보 가능 / 당일면접 가능" 체크박스 | 매뉴얼 공고 등록 절에 **누락**되어 있음(실제 폼에 존재) | `apps/web/src/app/employer/new/page.tsx` |
| 11 | 프리미엄 배너 "자리는 상단 2칸, 좌측·우측 각 3칸으로 **총 8칸**" / "최대 8칸까지 동시에" / "8개를 넘으면" | 실제 링은 **좌 3 + 상단(중간) 3 + 우 3 = 9칸**(`SIDE_BANNER_MAX_SLOTS = 3`, `PREMIUM_BANNER_MAX_SLOTS = 3`, `TOTAL_RING_SLOTS = 9`) | `packages/api/src/services/bambi-ad-exposure.ts` |
| 12 | 광고 관리 "광고 상품을 적용한 공고의 노출 상태와 … 표로 확인합니다" | 맞지만, **광고 상품이 적용된 공고만 목록에 나온다**(무료 일반 공고는 이 화면에 아예 없다)는 점이 명시되어 있지 않아 "내 공고가 안 보인다"는 오인을 부를 수 있다 | `packages/api/src/routers/bambi/promotions.ts` `listMyAds` (`innerJoin(adProduct)`) |
| 13 | "4. 공고 상태와 검수 안내 — **임시 저장**: 아직 검수 신청 전인 초안 상태" | **임시저장 기능이 존재하지 않는다.** 라벨만 있고 `draft` 상태를 만드는 코드 경로가 리포 전체에 없다(서버 `create`는 항상 `pending_review`) | `packages/api/src/routers/bambi/jobs.ts`, `packages/api/src/services/bambi-policy.ts` |
| 14 | ~~공고 반려 사유가 구인자 화면에 표시되지 않는다~~ (해소) | `listMine`이 `rejectionReason`을 내려주고, 목록 상태 배지 아래(`getJobStatusNote`)와 수정 화면 상단 Alert(`ReviewStatusNotice`)에 표시된다 | `packages/api/src/routers/bambi/jobs.ts`, `apps/web/src/components/bambi/employer-jobs-columns.tsx`, `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` |
| 15 | "연락처 보호 … 면접 일정이 확정되면 채팅방의 **연락처 공개하기** 화면에서 사장님이 연락 방식(전화번호·카카오톡·이메일)을 골라 … **내 연락처 공개**를 누르면" | 웹 UI는 이 흐름을 쓰지 않는다. 실제로는 **"연락처 공개 요청" 버튼 한 개**로 구직자에게 요청을 보내고 구직자가 공개/거절한다. 면접 확정도 요구하지 않는다(본인인증만 요구) | `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`, `bambi.chats.requestContactReveal` |
| 16 | "업체 정보 … 5. 화면 맨 아래 **로그아웃** 버튼" + "회원 탈퇴는 **팀 관리** 아래 **회원 탈퇴** 영역에서" | 로그아웃은 `/employer/me` 맨 아래가 맞다. 다만 **회원 탈퇴는 `/employer/settings`(조직 설정) 하단**에 있다 — "팀 관리 아래"라는 표현이 `/employer/settings/teams`로 오해될 수 있음 | `apps/web/src/app/employer/settings/page.tsx` |
| 17 | "성과 분석 … 지표" | **기간 필터가 없고 전체 누적이라는 점**이 매뉴얼에 없다. 또한 **조직 owner/manager만** 지표를 볼 수 있고 staff는 항상 빈 화면이라는 점도 없다 | `packages/api/src/services/bambi-analytics.ts` |
| 18 | "팀 관리 … 담당 직원을 초대해 스태프 또는 매니저 권한을 주면 됩니다" | 초대는 **운영자 승인**을 거쳐야 실제 멤버가 된다. 초대 대상은 **이미 구인자로 가입된 계정**이어야 하고, **초대받은 사람이 수락하는 화면·이메일이 없다**. 이 두 제약이 매뉴얼에 없음 | `packages/api/src/routers/bambi/teams.ts`, `moderation.ts` |
| 19 | "멤버 목록 … 소유자는 멤버의 권한 변경 … 를 할 수 있습니다" | 맞다. 다만 **매니저로 로그인하면 `⋯` 메뉴가 아예 뜨지 않는다**는 점이 명시되어 있지 않다 | `apps/web/src/components/bambi/team-member-list.tsx` |
| 20 | 광고 상품 안내 표의 요금(330,000원 등) | 하드코딩 값이 아니라 운영자가 등록한 `ad_product.priceOptions`에서 온다(매뉴얼도 "예시"라 부기하고 있으나, 표가 실제 값처럼 읽힐 수 있음) | `packages/api/src/routers/bambi/ad-products.ts` |
| 21 | "고객센터" 문의 흐름이 매뉴얼에 **아예 없다** | `/support` FAQ + 1:1 문의(등록·스레드·종료) 흐름이 구인자 nav에 있으나 매뉴얼 목차·본문에 없음 | `apps/web/src/app/support/**` |
| 22 | 커뮤니티(수다방) 접근이 매뉴얼에 **없다** | 광고 중 업소(owner/manager + 활성 유료 공고)면 남성 구인자도 `/seeker/community`에 입장할 수 있다 | `packages/api/src/services/bambi-community-access.ts` |

### B. 코드 자체의 불일치 / 개선 후보 (문서가 아니라 구현 이슈)

| # | 내용 | 위치 |
|---|---|---|
| B1 | 끌어올리기 비활성 사유가 **클라이언트 4종 / 서버 6종**으로 문구·판정 순서가 다르다. 미결제 배너 공고에서 화면과 서버가 서로 다른 사유를 낸다 | `apps/web/src/app/employer/promotions/page.tsx` `getBoostState` vs `packages/api/src/services/bambi-job-boost.ts` |
| B2 | 공고 수정 시 **노출 상품/기간을 바꾸면 `paymentStatus`가 `unpaid`로 되돌아가고 노출이 끊기는데** 화면에 안내가 없다 | `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`, `packages/api/src/routers/bambi/jobs.ts` `applyJobPostUpdate` |
| B3 | ~~게시 중인 공고를 수정하면 노출이 중단되는데 경고가 없다~~ (해소) — 수정 화면 상단에 warning Alert "수정하면 재검수 동안 노출이 중단됩니다" | `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` `ReviewStatusNotice` |
| B4 | **미승인 구인자도 공고 수정·삭제가 가능**하다(create만 승인 검사). 의도인지 확인 필요 | `packages/api/src/routers/bambi/jobs.ts` |
| B5 | `bambi.teams.deleteInvitation`만 `assertOrganizationVerified`를 호출하지 않는다 | `packages/api/src/routers/bambi/teams.ts` |
| B6 | `/employer/me`의 사업자 정보 폼이 **`organizationProfiles[0]`만** 프리필·판정한다. 조직이 2개 이상이면 두 번째 조직은 이 폼으로 갱신할 수 없다 | `apps/web/src/app/employer/me/page.tsx` |
| B7 | `deriveEmployerApprovalStatus`는 **verified 하나만 있으면 verified**를 반환한다. 조직 A verified + 조직 B pending인 계정은 배너가 사라져 "다 됐다"고 오인하지만 조직 B 공고 등록은 서버가 막는다 | `packages/api/src/services/bambi-onboarding.ts` vs `bambi-authz.ts` |
| B8 | 반려 사유는 노출된다(#14). **금칙어 감지 결과(`riskFlags`/`detectedTerms`)는 여전히** 구인자에게 노출되지 않는다 | 웹 employer 전 화면 |
| B9 | `/employer` 퀵링크 "광고 안내" 설명이 "노출 상품과 **배너 규격**을 확인해요"인데, `/employer/ad-guide`에는 배너 규격 정보가 없다 | `apps/web/src/app/employer/page.tsx`, `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` |
| B10 | `/support/inquiries`가 `page: 1` 고정이라 21건째 이후 문의를 볼 수 없다 | `apps/web/src/components/bambi/support/inquiry-list.tsx` |
| B11 | "문의 종료"에 확인 절차가 없고 재개(reopen) 경로도 없다 | `apps/web/src/components/bambi/support/inquiry-thread.tsx`, `packages/api/src/routers/bambi/support.ts` |
| B12 | 성과 분석 서버가 집계하는 `contactReveals`가 화면에 표시되지 않는다 | `packages/api/src/services/bambi-analytics.ts` |
| B13 | 구인자 셸에는 채팅 진입점이 없어, `/seeker/me` 셸을 경유해야만 채팅에 도달한다 | `apps/web/src/components/bambi/responsive-shell.tsx`(`showChatButton`은 seeker/public만), `persona-nav.tsx` |
| B14 | `apps/web/src/lib/bambi/exposure.ts` 주석이 "인증 업체는 등록 즉시 published가 된다"고 하지만, 현재 `create`는 예외 없이 `pending_review`다(주석 낡음) | `apps/web/src/lib/bambi/exposure.ts` |
| B15 | 팀 목록의 "수정" 버튼에만 승인 게이트가 없어, 미승인 상태에서도 열리고 폼만 잠긴다(일관성) | `apps/web/src/app/employer/settings/teams/page.tsx` |

### C. 확인 필요 사항 (코드만으로 판단 불가)

| # | 내용 |
|---|---|
| C1 | 초대받은 구인자에게 **초대 사실을 알리는 채널이 코드에 없다**(이메일 발송·인앱 알림 모두 미구현). 운영 상 어떻게 통지하는지 확인 필요 |
| C2 | 반려 사유는 노출로 확정됐다(#14). 남은 판단은 **금칙어 감지 결과**를 구인자에게 보여줄지, 그리고 재제출 시 `rejection_reason`을 지울지(운영자 재검수 화면에 직전 사유가 남는다) |
| C3 | `NTS_SERVICE_KEY`(국세청 디코딩 키) 미배포 상태에서의 QA는 전 건 "미확인"으로만 검증 가능하다. 진위확인 성공/불일치/휴폐업 경로는 키가 있어야 실측 가능 |
| C4 | 프리미엄 정원 게이트가 대기열 rank를 강제하지 않는 것(입금 도착 순서 우선)이 운영 정책과 맞는지 |
| C5 | `warned` 상태에서 서버가 아무 기능도 막지 않는 것이 의도인지(배너 안내만) |
| C6 | `/employer/jobs/[id]` 상세 라우트가 없어 "공고 보기"가 항상 수정 화면으로 가는 것이 의도인지 |
| C7 | 웹에서 미사용인 레거시 연락처 공개 프로시저(`getContactReveal`/`revealContact`)의 폐기 시점(네이티브 결합으로 보류 중) |
