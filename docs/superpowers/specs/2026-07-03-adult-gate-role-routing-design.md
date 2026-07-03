# 19금 게이트 · 역할 기반 라우팅 · 온보딩 제거 설계

- 작성일: 2026-07-03
- 대상: apps/web (Next.js 16 App Router), packages/api, packages/db
- 상태: 설계 확정

## 1. 배경 / 목표

밤비는 성인 대상(19금) 여성 구인구직 & 익명 커뮤니티다. 현재는 미들웨어가
없고, 로그인 보호는 클라이언트 `RequireAuth`(2곳)와 orpc `protectedProcedure`에만
의존한다. 역할(구직자/구인자/운영자)은 `bambi_profile.role`에만 있다. 온보딩
(`/onboarding`)은 로그인 후 역할을 선택받는 별도 단계로 존재한다.

**핵심 아키텍처 제약(조사로 확인):** `apps/web`은 `@bambi-app/auth`·`@bambi-app/db`
의존성이 없어 **서버사이드(RSC)에서 세션을 직접 못 읽는다.** 인증된 데이터는
**오직 orpc**로 얻는다(클라이언트는 `credentials: include`, RSC는 `next/headers`를
Fastify `/rpc`로 전달). role은 이미 `orpc.bambi.onboarding.getMine`로 읽는 패턴이
있다. 따라서 라우팅 판별도 orpc 기반으로 설계한다.

이 작업의 목표:

1. **19금 게이트**: 비로그인·최초 방문자에게 성인 안내 + 로그인/가입/비회원
   진입 화면을 제공한다.
2. **역할 기반 라우팅**: 로그인 여부(미들웨어)와 역할(RSC의 orpc 조회)로
   `/employer` `/seeker` `/moderator`로 자동 분기한다.
3. **온보딩 제거**: 역할 선택을 회원가입 폼으로 흡수하고 온보딩 화면/라우트를
   제거한다.
4. **업소회원 승인 게이트**: 업소회원 가입은 운영자 승인이 있어야 완료되며,
   개인회원은 즉시 완료된다.

## 2. 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 19금 게이트 성격 | 안내화면 + 로그인/가입 진입 + 비회원 버튼 (실제 본인인증 없음) |
| 게이트 노출/기억 | 비로그인 시에만, 통과는 쿠키 저장 (로그인 사용자는 스킵) |
| 로그인 후 라우팅 | 로그인 여부는 미들웨어(로그인 쿠키), 역할 분기는 RSC에서 orpc 조회 |
| role 판별 | `orpc.bambi.onboarding.*`로 role·승인상태 조회 (customSession 미사용) |
| 비회원 핸드폰 인증 | 지금은 스텁(버튼만) → 게스트 쿠키 발급, 실제 SMS는 후속 |
| 역할 선택 | 회원가입 폼이 흡수 (온보딩 완전 제거) |
| 게스트 접근 범위 | `/seeker` 공고 목록만, 상세/커뮤니티/채팅은 회원가입 유도 |
| 업소 가입 생성 | 단일 서버 procedure `registerEmployer`가 profile+org+승인대기 원자 생성 |
| 업소 승인 대기 UX | 로그인은 되되 '승인 대기' 화면만, 승인 후 `/employer` 해금 |
| 승인 상태 저장 | 기존 `employer_organization_profile.verificationStatus` 재사용 |
| 반려 처리 | 사유 안내 + 재신청 가능 |
| 게이트 라우트명 | `/welcome` (변경 가능) |

## 3. 접근 방식

**채택: 미들웨어(낙관적, 로그인·게스트) + RSC 역할 가드(orpc) + AuthClientProvider(UI).**

- **미들웨어**: better-auth `getSessionCookie`로 로그인 쿠키 존재 여부 + 게스트
  쿠키만 보고 19금 게이트와 게스트 범위를 낙관적으로 강제한다. role 로직 없음.
- **RSC 역할 가드**: 서버컴포넌트가 orpc(`getMyRouting`)를 호출해 role·승인상태를
  읽어 역할별 리다이렉트를 서버에서 처리한다. 깜빡임 없음.
- **AuthClientProvider**: `authClient.useSession()`(로그인) + `getMine`(role/승인)
  + 게스트 쿠키를 묶어 UI 분기(내비, 게스트 배너, 가입 유도)용 컨텍스트를 제공.

`customSession`은 채택하지 않는다 — 웹은 서버 `getSession`을 못 쓰고, 클라이언트도
이미 orpc로 role을 읽으므로 실익이 없다(YAGNI). `packages/auth`의 세션 형태는
바꾸지 않는다.

## 4. 아키텍처

### 4.1 역할·승인 데이터 소스 (packages/api / orpc)

기존 `orpc.bambi.onboarding.getMine`(bambiProfile + employerOrganizationProfiles의
verificationStatus 반환)에 더해 다음을 신규 추가한다.

- **`bambi.onboarding.getMyRouting`** (protectedProcedure): 라우팅 판정용 슬림 응답
  `{ role: 'job_seeker'|'employer'|'admin'|null, employerApprovalStatus:
  'none'|'pending'|'verified'|'rejected' }`. RSC 가드가 호출.
- **`bambi.onboarding.registerEmployer`** (protectedProcedure): 업소회원 가입 원자
  처리 — bambiProfile(role=employer) + organization(better-auth) +
  employer_organization_profile(verificationStatus=`pending`) 생성.
- **`bambi.moderation.listPendingEmployers`** + **`setEmployerVerificationStatus`**
  (admin): 승인(`verified`)/반려(`rejected`+note). 기존 `setUserStatus` 패턴 차용
  (requireAdminProfile → update → adminModerationAction insert).

승인상태 파생 순수 함수 `deriveEmployerApprovalStatus(statuses: string[])`:
verified 있으면 `verified`, 아니면 pending 있으면 `pending`, 아니면 rejected 있으면
`rejected`, 아니면 `none`.

### 4.2 미들웨어 (apps/web/middleware.ts) — 신규 (낙관적 리다이렉트만)

경로 판정은 순수 함수 `resolveGate(input): Decision`으로 분리한다.

```
input:  { pathname, hasSession, isGuest }
output: { type: 'next' } | { type: 'redirect', to }
```

판정 규칙:

- 공개 경로(`/welcome`, `/api/*`, `/bambi/*` 미디어, 정적 자산)는 항상 `next`.
- **로그인 쿠키 있음**(`getSessionCookie`, from `better-auth/cookies`): `next`
  (역할 분기는 RSC 가드에 위임).
- **게스트(비회원 쿠키)**:
  - `/seeker`(목록 루트)만 허용.
  - `/seeker/jobs/[id]`·`/seeker/community`·`/seeker/chats`·`/seeker/me`·
    `/employer/*`·`/moderator/*` → `/welcome?signup`.
  - `/` → `/seeker`, 그 외 → `/welcome`.
- **신규 방문자(로그인 쿠키 없음·게스트 아님)**: 모든 경로 → `/welcome`.

`getSessionCookie`는 존재만 확인(검증 아님)하므로 실제 인증/권한은 아래 RSC
가드와 orpc `protectedProcedure`가 담당한다. `better-auth`는 이미 웹의 직접
의존성이라 `better-auth/cookies` import 가능.

### 4.2b RSC 역할 가드 — 신규

- 순수 함수 `resolveRoleRedirect({ role, approvalStatus, pathname }): to | null`
  + 서버 유틸 `requireRole()`(내부에서 orpc `getMyRouting` 서버 호출).
- 적용 지점:
  - `app/page.tsx`("/"): 로그인 사용자 → 역할 홈
    (`admin→/moderator`, `employer→/employer`, `job_seeker→/seeker`).
  - `app/employer/layout.tsx`(서버, 이미 서버컴포넌트): employer 아니면 자기 홈,
    `employerApprovalStatus!=='verified'`면 `/employer/pending`.
  - `app/moderator/layout.tsx`(서버): admin 아니면 자기 홈.
  - `/seeker/*`: 로그인 사용자 공용 허용.
- 서버에서 처리 → 깜빡임 없음. 기존 클라이언트 `RequireAuth` 의존 제거/축소.

### 4.3 19금 게이트 화면 (/welcome) — 신규

- `apps/web/src/app/welcome/page.tsx` +
  `components/bambi/screens/adult-gate-screen.tsx`
- 구성:
  - 19금 안내 배너(청소년 유해매체물 / 만 19세 미만 이용 불가 문구)
  - 로그인 폼(기존 `AuthScreen` 컴포넌트 재사용)
  - 회원가입 링크
  - 비회원(핸드폰 인증) 버튼 — 스텁
- 비회원 버튼 → `POST /api/guest`(route handler)가 게스트 쿠키 발급 →
  `/seeker`로 이동.
- `?signup` 쿼리로 진입 시 회원가입 탭/유도 강조.
- 반응형(모바일 필수), base-ui 컴포넌트·디자인 토큰, 임의 px 금지, primary
  버튼은 로그인 한 곳만.

### 4.4 AuthClientProvider — 신규

- `components/bambi/auth-client-provider.tsx`
- `authClient.useSession()`(로그인) + `useQuery(orpc.bambi.onboarding.getMine)`
  (role·승인) + 게스트 쿠키를 묶어 컨텍스트 제공:
  `{ user, role, employerApprovalStatus, isAuthenticated, isGuest, isPending }`
- `providers.tsx`의 `Providers` 안에 배치.
- 소비처: 내비(`mobile-tab-bar` 등) role 분기, 게스트 배너, 공고 카드 클릭 시
  가입 유도. 산재한 `authClient.useSession()`/개별 `getMine` 호출을 정리.

### 4.5 회원가입이 역할 선택 흡수 / 온보딩 제거

- `auth-screen.tsx` 회원가입 폼에 업소회원(employer)/개인회원(job_seeker)
  선택(`ToggleGroup`) + 필수 프로필(표시명; 업소는 업체명) 추가.
- 가입 성공 후:
  - 개인회원: `orpc.bambi.onboarding.createJobSeekerProfile` → `/seeker`.
  - 업소회원: `orpc.bambi.onboarding.registerEmployer` → `/employer/pending`.
- 로그인 성공 시 `/onboarding` 대신 RSC 가드가 역할 홈으로 보냄(성공 시
  `router.push('/')` 후 RSC가 분기, 또는 직접 역할 홈으로).
- **제거 대상**: `app/onboarding/`,
  `components/bambi/screens/onboarding-screen.tsx`,
  `lib/bambi/onboarding-routes.ts`(+ `.test.ts`) 및 소비처.
- orpc `bambi.onboarding` 네임스페이스: 프로필 생성 서비스가 계속 필요하므로
  유지(경량 리네임은 후속).

### 4.6 비회원 게스트 상세 접근 → 가입 유도

- 미들웨어가 딥링크 차단.
- UI: 게스트가 공고 카드 클릭 시 `/welcome?signup`으로 유도.
  `AuthClientProvider.isGuest`로 판별.
- 게스트 쿠키는 **httpOnly 아님**(클라이언트가 게스트 여부를 읽어야 함).
  게스트는 공개 목록만 접근하므로 위조 위험은 미들웨어·서버 권한으로 흡수.

### 4.7 업소회원 승인 게이트

- 신규 화면 `/employer/pending`:
  - `pending`: "운영자 심사 대기 중" 안내.
  - `rejected`: 반려 사유(`verificationNote`) 표시 + 재신청(다시 pending 전환).
- 승인 대기 게이팅은 4.2b RSC 가드가 담당
  (`/employer/*` → verified 아니면 `/employer/pending`).
- 운영자 승인 UI: moderator 영역에 대기(pending) 업소 목록 →
  승인(`verified`)/반려(`rejected` + 사유). procedure는 4.1 신규.
- 승인 반영: role·승인상태는 매 RSC 요청의 orpc 조회에서 최신값이므로 승인 후
  다음 요청에 즉시 반영.

## 5. 데이터 모델

- 신규 테이블/컬럼 없음. 기존 재사용:
  - `bambi_profile.role`: 역할 원천.
  - `employer_organization_profile.verificationStatus`: 승인 상태 원천.
- 쿠키:
  - better-auth 세션 쿠키: 로그인 여부(미들웨어 `getSessionCookie`).
  - 게스트 쿠키(예: `bambi_guest`, TTL 예 30일, **httpOnly 아님**): 비회원 게이트
    통과 표시.

## 6. 컴포넌트/파일 영향 범위

**신규 (packages/api, packages/db)**

- `packages/api/src/services/bambi-onboarding.ts` 내
  `deriveEmployerApprovalStatus` (+ 서비스 테스트)
- `packages/api/src/routers/bambi/onboarding.ts`에 `getMyRouting`,
  `registerEmployer` procedure
- `packages/api/src/routers/bambi/moderation.ts`에 `listPendingEmployers`,
  `setEmployerVerificationStatus` procedure

**신규 (apps/web)**

- `apps/web/middleware.ts`
- `apps/web/src/lib/bambi/resolve-gate.ts` (+ `.test.ts`)
- `apps/web/src/lib/bambi/resolve-role-redirect.ts` (+ `.test.ts`)
- `apps/web/src/lib/bambi/require-role.ts` (서버 유틸)
- `apps/web/src/lib/bambi/guest.ts` (게스트 쿠키 헬퍼, + `.test.ts`)
- `apps/web/src/app/api/guest/route.ts` (게스트 쿠키 발급)
- `apps/web/src/app/welcome/page.tsx`
- `apps/web/src/components/bambi/screens/adult-gate-screen.tsx`
- `apps/web/src/components/bambi/auth-client-provider.tsx`
- `apps/web/src/app/employer/pending/page.tsx`
- moderator 대기 업소 승인 화면(컴포넌트 + 라우트 또는 기존 화면 확장)

**수정 (apps/web)**

- `apps/web/src/lib/auth-client.ts` (변경 없음 예상; 필요 시 최소)
- `apps/web/src/components/providers.tsx` (AuthClientProvider 래핑)
- `apps/web/src/app/page.tsx` (로그인 사용자 역할 홈 리다이렉트)
- `apps/web/src/app/employer/layout.tsx`, `app/moderator/layout.tsx` (서버 가드)
- `apps/web/src/components/bambi/screens/auth-screen.tsx`
  (역할 선택 흡수, registerEmployer/createJobSeeker 호출, 리다이렉트 변경)
- `apps/web/src/components/bambi/mobile-tab-bar.tsx` 및 내비 (Provider 소비)
- 게스트 공고 카드 상호작용 (가입 유도)

**제거**

- `apps/web/src/app/onboarding/`
- `apps/web/src/components/bambi/screens/onboarding-screen.tsx`
- `apps/web/src/lib/bambi/onboarding-routes.ts` (+ `.test.ts`)

## 7. 검증 계획

프로젝트 규칙상 개발서버·스크린샷 없이 정적 검증만; 시각 확인은 사용자가 수행.

- `resolve-gate.test.ts`: (경로 × 로그인여부 × 게스트) 테이블 테스트.
- `resolve-role-redirect.test.ts`: (경로 × role × 승인상태) 테이블 테스트.
- `deriveEmployerApprovalStatus` 테스트.
- 게스트 쿠키 헬퍼 테스트.
- moderation `setEmployerVerificationStatus`·`registerEmployer` 라우터 테스트
  (기존 `*.test.ts` DB 연동 패턴 차용).
- 온보딩 관련 테스트 정리(제거/대체).
- `pnpm dlx ultracite check` + 타입체크(`tsc`/turbo).

## 8. 리스크 / 미해결

- **역할 매 요청 orpc 조회**: RSC 가드가 요청마다 `getMyRouting`을 호출 → 슬림
  응답 + 단일 조인으로 비용 최소화.
- **미들웨어 낙관적 검사 한계**: `getSessionCookie`는 존재만 확인하므로,
  실제 인증/권한은 RSC 가드 + orpc `protectedProcedure`가 최종 방어선.
- **registerEmployer 원자성**: org 생성(better-auth)과 프로필 insert를 한 흐름에서
  처리하되 실패 시 정합성 확보(트랜잭션 또는 보상). 구현 시 better-auth
  `auth.api.createOrganization` 시그니처 확인.
- **역할 교차 접근 정책**: admin의 `/employer` 접근 허용 여부 등은 기본 "엄격
  분리"로 두되 구현 중 기존 코드와 충돌 시 조정.
- **게이트 라우트명** `/welcome` 확정 여부.

## 9. 범위 밖 (후속)

- 실제 휴대폰 SMS/OTP 본인인증 연동.
- 비회원 게스트의 커뮤니티 열람 확대.
- orpc `bambi.onboarding` → `bambi.profile` 네임스페이스 리네임.
