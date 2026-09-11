# 비회원 본인인증 회원가입 재사용 설계

## 작업 기준

- 최신 `origin/develop`의 `e6b3d38b`에서 생성한 `fix/guest-verification-signup-reuse` 브랜치와 `C:\Users\user\bambi.worktrees\guest-verification-signup-reuse` worktree에서 진행한다.
- 웹 회원가입 흐름만 수정한다. 앱의 `mobile` 브랜치와 native 코드는 변경하지 않는다.
- 사용자가 직접 커밋·푸시하므로 에이전트는 커밋·푸시·PR 생성·머지를 하지 않는다.
- 빌드와 dev 서버는 실행하지 않는다. 변경 범위 테스트, TypeScript, Ultracite, `git diff --check`로 검증하고 브라우저 실측은 사용자가 실행 중인 환경에서 확인한다.
- DB 스키마 변경과 migration은 필요하지 않다. 기존 `bambi_identity_verification_log`의 비회원 인증 기록을 재사용한다.

## 문제

본인인증을 마치고 `/seeker`를 이용하는 비회원이 공고 상세처럼 회원 전용 경로에 진입하면 게이트가 `/seeker?auth=signup&guestBlocked=1`로 보낸다. 이 이동 자체는 맞지만 `AuthPanel`의 회원가입 단계가 항상 `verify`로 초기화되기 때문에, 유효한 비회원 인증 쿠키와 서버 인증 기록이 있어도 다시 본인인증을 요구한다.

브라우저 실측에서 가입 후 역할별 온보딩을 끝내고 `/seeker`로 이동하면 신규회원 코치마크와 메인 팝업이 동시에 열리는 회귀도 확인됐다. 코치마크는 스타일 없는 저수준 `DialogPopup`을 직접 사용해 설명 카드가 깨지고, 메인 팝업의 `z-index`가 코치마크 암막보다 높아 여러 레이어가 겹치면서 검은 화면처럼 보인다.

기존 가입용 `identityVerificationId`는 발급 후 30분 동안만 쓸 수 있고 최종 가입에서 한 번 소비하도록 만든 값이다. 이를 30일 동안 쿠키에 보관하거나 만료 검사를 우회해서는 안 된다. 비회원 인증 쿠키에는 서명된 임의 식별자 `gid`가 있고, 서버의 `bambi_identity_verification_log`에는 이 `gid`와 검증된 이름·생년월일·전화번호·성별이 연결되어 있으므로 이 정본을 사용한다.

## 확정 요구사항

- 유효한 비회원 본인인증이 있으면 어느 회원가입 진입 경로에서든 재인증 없이 정보 입력 단계로 이동한다.
- 재사용 기간은 기존 게스트 토큰 수명과 같은 30일이다. 새 숫자를 만들지 않고 `GUEST_TOKEN_MAX_AGE_SECONDS`를 사용한다.
- 게스트 쿠키가 만료되었거나 서명이 틀렸거나 `gid`가 없거나, 연결된 인증 로그가 없거나 필수 인증 정보가 불완전하거나 30일이 지났으면 재인증을 요청한다.
- 가입 폼 작성 중 인증이 만료되면 입력값과 약관 동의를 유지하지 않고 인증 단계로 돌아간다.
- 저장된 비회원 인증 정보가 기존 회원과 일치하면 “이미 가입된 계정이 있어요. 로그인해 주세요.”를 보여주고 로그인 화면으로 전환한다. 본인인증만으로 자동 로그인하지 않는다.
- 본인인증을 마친 비회원은 여전히 비회원이다. 아이디·비밀번호 등 가입 정보를 제출해 계정과 프로필 생성이 끝나야 회원이 된다.
- 현재 비회원에게 허용된 `/seeker` 목록과 공개 수다방 접근·게스트 쓰기 정책은 그대로 유지한다. 회원 전용 경로만 기존 `resolveGate` 정책대로 회원가입 화면으로 보낸다.
- 가입 완료 뒤에는 기존 역할별 온보딩 이동을 유지한다.
- 역할별 온보딩의 `시작하기`로 코치마크가 실행되는 동안 메인 팝업을 표시하지 않고, 코치마크가 끝나거나 닫히면 현재 페이지의 메인 팝업을 표시한다.
- 코치마크 설명 카드는 공용 Dialog 콘텐츠 스타일을 재사용해 화면 중앙에 정상적인 크기와 간격으로 표시한다.
- 코치마크 암막은 기존 ink 디자인 토큰에 투명도를 적용해 강조 대상 밖의 화면 구조와 안내 맥락도 식별할 수 있게 한다.
- 코치마크 spotlight는 강조 대상 안의 실제 버튼·링크가 가진 반경을 읽어 같은 둥근 테두리로 표시한다. 원형 아이콘 버튼과 둥근 텍스트 버튼을 고정 반경으로 가정하지 않는다.
- `/seeker` 메인의 추천·스페셜·급구·일반 공고 카드는 지역·세부지역·업종 뱃지를 사용하지 않고 기존 위치 아이콘과 `지역 · 업종` 한 줄 표기로 되돌린다. 공고 상세 화면의 메타데이터 뱃지는 유지한다.
- 기존 회원가입 인증, 비회원 둘러보기, 로그인, 계정 찾기 흐름은 유지한다.

## 설계

### 1. 인증 기록 유효기간을 게스트 토큰과 통일

`packages/api/src/services/bambi-secret-identity.ts`가 별도 `30일` 상수를 갖지 않도록 `GUEST_TOKEN_MAX_AGE_SECONDS`를 재사용한다. 현재 시각과 로그의 `updatedAt` 차이를 판정하는 순수 함수를 두어 경계값을 테스트한다.

서명된 게스트 토큰은 API context에서 검증한다. 클라이언트가 보내는 `gid` 문자열이나 쿠키 페이로드를 직접 신뢰하지 않는다. API는 `context.guest.gid`로만 로그를 찾는다.

재사용할 인증 행은 다음 조건을 모두 만족해야 한다.

- 서명과 만료 검증을 통과한 게스트 context가 있다.
- 같은 `guestId`의 로그가 있다.
- `name`, `birthDate`, `phoneNumber`, `gender`가 모두 있다.
- `updatedAt`이 `GUEST_TOKEN_MAX_AGE_SECONDS` 범위 안이다.

DB 로그에는 CI·DI 해시가 저장되지 않으므로 새 값을 추측하거나 전화번호로 가짜 해시를 만들지 않는다. 저장된 비회원 인증으로 가입할 때는 로그에 실제로 존재하는 값만 프로필로 옮긴다. 중복 가입 방지는 기존 CI·DI 검사에 더해 인증 로그와 프로필에 함께 존재하는 `birthDate + phoneNumber`로 확인한다. 이 보조 판정은 과거 비회원 인증 기록에도 적용 가능하고, 이후 동일 인물이 새 인증 건으로 다시 가입하려는 경우도 막는다.

### 2. 게스트 회원가입 상태 조회

`packages/api/src/routers/bambi/onboarding.ts`에 개인정보를 반환하지 않는 public 조회 프로시저를 추가한다. 이름과 전화번호 같은 원문은 브라우저에 내려보내지 않는다.

응답 상태는 다음 세 값으로 제한한다.

- `reauthenticate`: 유효한 게스트 context 또는 완전하고 최신인 인증 로그가 없음
- `available`: 기존 인증으로 가입 정보 입력 가능
- `account_exists`: 같은 인증 정보로 생성된 프로필이 있음

비회원 인증이 없는 일반 방문자도 이 프로시저를 호출할 수 있으며 `reauthenticate`를 받는다. 조회만으로 쿠키, DB, 권한 상태를 변경하지 않는다.

### 3. 저장된 인증으로 프로필 생성

프로필 생성 입력에 “유효한 게스트 인증을 재사용한다”는 선택 필드를 추가한다. 클라이언트가 이 값을 보내더라도 서버는 다음을 다시 검증한다.

- 로그인 세션이 존재한다.
- 같은 요청에 서명 검증을 통과한 게스트 context가 존재한다.
- 게스트 인증 로그가 제출 시점에도 완전하고 30일 이내다.
- 기존 계정과 충돌하지 않는다.

`protectedProcedure`가 세션과 함께 검증된 guest context를 다음 handler로 전달하도록 좁힘 context를 보완한다. 프로필 생성 함수는 기존 `identityVerificationId`가 있으면 현재 포트원 검증·소진 경로를 그대로 사용하고, 재사용 플래그가 있으면 저장된 인증 정본을 사용한다. 둘 다 없으면 운영 환경의 기존 “본인인증을 먼저 완료해 주세요.” 거부를 유지한다.

저장된 비회원 인증으로 만든 프로필에는 전화번호·생년월일·성별을 옮기고 `isPhoneVerified`를 기존 실인증 가입과 동일하게 설정한다. 이름은 Better Auth 회원가입의 닉네임을 덮지 않는다. 가입 역할을 인증 로그의 `kind`에 기록하고, 사용된 `guestId` 연결은 회원 전환 후 비회원 주체로 다시 쓰이지 않도록 정리한다.

### 4. AuthPanel 상태 복원과 만료 처리

`apps/web/src/components/bambi/auth/auth-panel.tsx`는 회원가입 모드에서 상태 조회가 끝날 때까지 인증 단계나 가입 폼을 성급히 표시하지 않는다.

- `available`: `step="form"`, 게스트 재사용 플래그 활성화
- `account_exists`: 로그인 모드로 전환하고 기존 계정 안내
- `reauthenticate`: `step="verify"`

로그인에서 회원가입으로 전환하는 경우와 `?auth=signup` 직접 진입, 게스트가 회원 전용 경로에서 리다이렉트된 경우 모두 같은 조회를 사용한다. 이미 화면 안에서 새 본인인증에 성공한 경우에는 현재 `identityVerificationId` 경로가 우선한다.

가입 제출 직전에 게스트 재사용 상태를 서버에서 다시 확인한다. 만료·로그 누락·기존 계정 충돌이면 Better Auth 계정을 만들기 전에 제출을 중단한다. 만료나 로그 누락은 폼 값과 약관 동의를 초기화하고 인증 단계로 돌리며, 기존 계정 충돌은 로그인 화면과 안내로 전환한다.

현재 `handleAuthSuccess`는 세션 생성 직후 게스트 쿠키를 먼저 지운다. 재사용 가입에서는 프로필 생성 API가 검증된 게스트 context를 받아야 하므로, 회원가입 성공 경로는 프로필과 동의 기록이 완료된 뒤 쿠키를 지운다. 로그인 성공 경로는 기존처럼 이동 전에 쿠키를 지운다. 프로필 생성 실패 시에는 쿠키를 남겨 유효한 인증을 잃지 않게 한다.

### 5. 권한 범위 유지

`apps/web/src/lib/bambi/resolve-gate.ts`, `apps/web/src/proxy.ts`, 공개 수다방 권한 서비스는 변경하지 않는다. 이번 수정은 회원가입 패널의 단계 선택과 프로필 생성 증명 방식만 다룬다. 따라서 비회원 허용 행동에 회원가입 게이트가 새로 붙지 않는다.

### 6. 온보딩 코치마크와 메인 팝업 조정

기존 `COACHMARK_INTENT_KEY`를 코치마크 실행 생명주기의 정본으로 유지한다. 코치마크가 시작될 때 의도를 먼저 지우지 않고, 사용자가 완료하거나 닫을 때 제거한다. 의도 저장·제거 시 같은 탭에서도 들을 수 있는 이벤트를 보내 `MainPopupLayer`가 즉시 표시 여부를 다시 계산한다.

`MainPopupLayer`는 유효한 코치마크 의도가 남아 있는 동안 공개 팝업 목록을 렌더하지 않는다. 코치마크 종료 이벤트를 받으면 기존 쿼리 결과로 팝업을 다시 표시한다. 코치마크 설명창은 공용 Dialog 콘텐츠 클래스 값을 재사용하되, spotlight SVG를 유지하기 위해 공용 backdrop을 추가하지 않는다.

## 예상 변경 파일

- `docs/superpowers/plans/2026-09-08-guest-verification-signup-reuse.md`
- `packages/api/src/index.ts`
- `packages/api/src/routers/bambi/onboarding.ts`
- `packages/api/src/services/bambi-secret-identity.ts`
- `packages/api/src/services/bambi-guest-token.ts`
- `packages/api/test/services/bambi-guest-token.test.ts`
- `apps/web/src/components/bambi/auth/auth-panel.tsx`
- `apps/web/src/components/bambi/auth/use-guest-signup-verification.ts`
- `apps/web/src/lib/bambi/guest-signup.ts`
- `apps/web/src/lib/bambi/onboarding.ts`
- `apps/web/src/components/bambi/onboarding/role-coachmark-runner.tsx`
- `apps/web/src/components/bambi/onboarding/coachmark.tsx`
- `apps/web/src/components/bambi/main-popup/main-popup-layer.tsx`
- `apps/web/test/components/bambi/auth/guest-signup-reuse.test.ts`
- `apps/web/test/components/bambi/main-popup/main-popup-layer.test.ts`
- `packages/ui/src/components/dialog.tsx`

구현 중 새 파일이 필요하거나 위 파일이 불필요해지면 이 목록과 구현 결과를 함께 갱신한다.

## 검증

- 게스트 인증 시각이 30일 범위 안/경계/초과일 때 판정이 각각 맞는지 단위 테스트한다.
- 게스트 context 없음, 구형 `gid` 없는 토큰, 로그 없음, 필수 정보 누락은 `reauthenticate`가 되는지 확인한다.
- 최신 완전한 로그는 `available`, 기존 프로필과 일치하면 `account_exists`가 되는지 확인한다.
- 저장된 인증 재사용으로 구직자·구인자 프로필에 전화번호·생년월일·성별과 인증 상태가 반영되는지 확인한다.
- 회원가입 직접 진입과 게스트 차단 리다이렉트가 모두 가입 폼을 복원하는지 확인한다.
- 제출 시 만료되면 계정을 만들기 전에 입력값을 비우고 인증 단계로 돌아가는지 확인한다.
- 일반 익명 방문자는 기존 본인인증 단계, 새 본인인증 직후 가입은 기존 `identityVerificationId` 경로를 유지하는지 확인한다.
- `resolve-gate` 기존 테스트를 실행해 비회원 허용·차단 경로가 달라지지 않았는지 확인한다.
- 코치마크 의도가 남아 있는 동안 메인 팝업이 숨겨지고, 의도 제거 이벤트 뒤 다시 표시되는지 확인한다.
- 코치마크가 공용 Dialog 콘텐츠 스타일을 사용하고 메인 팝업보다 위의 레이어에서 정상 표시되는지 확인한다.
- 관련 API/web 테스트, 두 패키지 TypeScript 검사, 변경 경로 Ultracite 검사, `git diff --check`를 실행한다.
- 빌드·dev 서버는 실행하지 않는다. 사용자 실측에서는 비회원 인증 → `/seeker` → 공고 클릭 → 재인증 없이 가입 폼 → 가입 → 기존 온보딩 이동을 확인한다.

## 구현 결과

- [x] `getGuestSignupStatus`가 검증된 guest context와 최신 인증 로그를 확인해 `available`, `account_exists`, `reauthenticate`만 반환하도록 구현했다.
- [x] 회원가입 패널이 모든 가입 진입 시 기존 인증 상태를 조회하고, 유효하면 정보 입력 단계로 복원하도록 구현했다.
- [x] 저장된 비회원 인증으로 프로필을 생성할 때 서버가 제출 시점에 다시 유효성·중복을 확인하고, 트랜잭션 안에서 `guestId`를 한 번만 소비하도록 구현했다.
- [x] 가입 제출 전에 상태를 다시 검사하며 만료 시 폼과 약관 동의를 비우고 재인증 단계로 돌아가도록 구현했다.
- [x] 가입 성공은 프로필 생성 뒤 게스트 쿠키를 지우고 기존 온보딩으로 이동하며, 일반 로그인 성공의 쿠키 제거 흐름은 유지했다.
- [x] `resolveGate`와 공개 수다방 권한 코드는 변경하지 않았다.

### 검증 결과

- [x] `pnpm --filter @bambi-app/api check-types` — 오류 0
- [x] `pnpm --filter web check-types` — 오류 0
- [x] API 관련 테스트 2파일 29건 통과
- [x] web 가입 복원·게스트·게이트·가입 폼 관련 테스트 4파일 37건 통과
- [x] 변경 파일 `pnpm exec ultracite check ...` — 오류 0
- [x] `git diff --check` — 오류 0
- [ ] 사용자 브라우저 실측: 비회원 인증 → `/seeker` → 공고 클릭 → 가입 폼 복원 → 가입 → 기존 온보딩 이동

### 온보딩 종료 후 검은 화면 회귀 수정

- [x] 코치마크 의도를 실행 종료까지 유지하고, 실행 중에는 메인 팝업을 숨기도록 수정
- [x] 코치마크 설명창이 공용 Dialog 콘텐츠 배치와 최상위 레이어를 사용하도록 수정
- [x] 완전 불투명하던 코치마크 암막을 반투명 처리해 배경 화면이 보이도록 수정
- [x] 각진 spotlight를 실제 강조 버튼의 계산된 테두리 반경과 일치하도록 수정
- [x] 메인 공고 카드만 메타데이터 뱃지를 제거하고 기존 `지역 · 업종` 텍스트 표기로 복원
- [x] 관련 web 테스트 3파일 12건 통과
- [x] web 및 공용 UI TypeScript 검사 통과
- [x] 변경 파일 Ultracite 검사와 `git diff --check` 통과
- [ ] 사용자 브라우저 실측: 온보딩 `시작하기` → `/seeker` 코치마크 정상 표시 → 코치마크 종료 후 메인 팝업 표시
