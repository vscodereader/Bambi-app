# user 이름/로그인 모델 재설계 — 설계

작성일: 2026-07-24. 브랜치: `worktree-user-name-model` (base `fix/welcome-page`).

## 목표

현재 회원가입은 "이름" 성격 값을 컬럼 4개에 중복 저장한다:
- 닉네임 → `user.name`(better-auth core) + `bambi_profile.display_name`
- 아이디 → `user.username`(소문자) + `user.display_username`(원형, 앱 미사용)

이를 정리해 **표시명 1개 · 로그인 아이디 1개(+플러그인 강제 미러)**로 만든다. 로그인은 아이디로만 받는다.

## 확정 결정 (사용자 승인)

1. **표시명 정본 = `user.name`** 한 곳. **컬럼명은 `name` 그대로 유지(rename 없음).** `bambi_profile.display_name`은 **제거**해 모든 참조를 `user.name`으로 이전한다. (초기 안의 display_name rename은 취소 — better-auth 코어 필드라 컬럼명 유지가 단순·안전.)
2. **로그인 아이디 = `user.login_id`** (better-auth username 플러그인의 `username` 필드를 `login_id` 컬럼으로 매핑). 소문자 정규화·unique.
3. **`user.login_id_display`** (플러그인 `displayUsername` 필드 매핑). 플러그인이 강제해 제거 불가 → `displayUsernameNormalization`을 소문자로 걸어 **항상 login_id와 동일한 소문자 미러**로 채운다.
4. **로그인 = login_id + 비밀번호만** (`signIn.username`). 이메일 로그인 UI 없음(단 서버 `emailAndPassword`는 유지 — seed의 signInEmail 검증·복구용).
5. **기존 계정 = 개발 DB 전부 초기화 후 seed 재기입.** 데이터 보존 불필요.
6. **seed에 수다방(커뮤니티) 글 추가** — 구직자·구인자 양쪽 dev 유저가 작성한 글을 여러 개 시딩.

## 최종 `user` 테이블 컬럼 (다른 테이블 제외, 11개)

`id`(PK) · `name`(닉네임, **유지**) · `email` · `email_verified` · `image`(코어 아바타 URL, 미사용·유지) · `login_id` · `login_id_display` · `created_at` · `updated_at` · `deleted_at` · `purged_at`

## better-auth 설정 (packages/auth/src/index.ts)

- **최상위 `user.fields` 매핑 없음** (name은 그대로).
- `username()` 플러그인 옵션만 변경:
  ```ts
  username({
    schema: { user: { fields: { username: "login_id", displayUsername: "login_id_display" } } },
    displayUsernameNormalization: (v) => v.toLowerCase(),
  })
  ```
  (검증: `mergeSchema`는 `fieldName`만 교체·삭제 불가 — 소스 확인. `get-schema.mjs`는 컬럼명을 `fieldName || key`로 잡음.)

## DB 스키마 (packages/db)

### `user` 테이블 (schema/auth.ts)
- `name` — **변경 없음** (SQL 컬럼 `name`, notNull 유지). 닉네임 저장.
- `username` 필드 → SQL 컬럼 **`login_id`** (unique, nullable).
- `displayUsername` 필드 → SQL 컬럼 **`login_id_display`** (nullable).

> drizzle property 이름을 바꿀지(예: `loginId`) better-auth 논리 필드명(`username`/`displayUsername`)에 맞춰 유지할지는 better-auth drizzle adapter의 컬럼 해석 방식에 맞춰 Phase A 담당자가 결정한다. 우선순위: (1) 회원가입·로그인 실제 동작, (2) SQL 컬럼명이 login_id/login_id_display일 것. 애매하면 drizzle property는 논리 필드명과 정렬하고 `text("login_id")`처럼 SQL 컬럼명만 교체.

### `bambi_profile` 테이블 (schema/bambi.ts)
- `display_name` 컬럼 **제거**.

### 마이그레이션
- 스키마 수정 후 `db:generate`로 다음 번호(0035~) 생성 — `username`→`login_id`·`display_username`→`login_id_display` 컬럼 rename + `bambi_profile.display_name` drop. (`name` 컬럼은 불변.)
- **DB 작업은 컨트롤러(메인 세션)가 수행** — 서브에이전트는 db:generate/migrate/reset/seed를 실행하지 않는다(코드만 수정).

## 회원가입/로그인 (apps/web)

### auth-screen.tsx
- 회원가입 필드: 닉네임 · **아이디(login_id)** · 비밀번호 · 비밀번호 확인 · 이메일 · 가입유형 · 약관 (기존 유지).
- 회원가입 호출: `authClient.signUp.email({ email, name: nickname, password, username: loginId })` — 논리 필드명(`name`·`username`) 그대로, 서버가 login_id 컬럼 매핑. (닉네임은 `user.name`에 저장되므로 `finishSignup`의 프로필 displayName 저장은 제거.)
- 로그인: **login_id + 비밀번호만** → `authClient.signIn.username({ username: loginId, password })`. 이메일 입력 없음. validation은 login_id 비어있지 않음 + 비번 8자.

## API (packages/api) — 표시명 참조 이전

`bambiProfile.displayName` 읽기·쓰기를 모두 **`user.name`**으로 이전(필요 시 user 조인). `employer_organization_profile.display_name`·`employer_team_profile.display_name`·커뮤니티 `author_display_name`은 **별개이므로 건드리지 않는다**.

- `onboarding.ts`: `profileInput`·`profileUpdateInput`에서 `displayName` 제거; `createBambiProfile`에서 displayName 제거; `updateMyProfile`은 `bambiProfile.displayName` 대신 `user.name` 갱신; `withdrawMyAccount`는 `user.name`만 "탈퇴한 회원"으로(이미 세팅 중); `getMine` 반환 shape에서 프로필 displayName 제거(표시명은 user에서).
- `blocks.ts`(69)·`chats.ts`(299)·`community.ts`(682)·`reviews.ts`(135)·`moderation.ts`(382·470·575·1041·1080·1975·2075·2135): `bambiProfile.displayName` → user 조인 후 `user.name`. 탈퇴 익명화 문자열 유지.

## Web (apps/web) — 표시명 소스 이전

프로필 표시명을 보여주거나 수정하는 화면에서 소스를 **`user.name`**(세션/응답)으로 이전. 후보(전수 확인): `account-settings-screen.tsx`(프로필 수정), `seeker.tsx`, `moderator*.tsx`, `moderator-users-table.tsx`, `community-board.tsx`, `seeker/jobs/[id]/chat/page.tsx`, `lib/bambi/{types,data}.ts` 등. 업소/팀 displayName은 제외.

## Seed (apps/server/src/seeds/bambi-dev.ts) — DB 초기화 후 재시드

- `devUsers`의 `name`은 이미 표시명으로 `user.name`에 저장됨(유지). `displayName` 필드는 정리(bambi_profile 컬럼 삭제로 불필요).
- **각 dev 유저에 `login_id` 부여** — `signUpEmail` 호출에 `username`(login_id) 추가(또는 생성 후 user 갱신). 예: `seeker`→`seeker`, `ownerMars`→`ownermars` 등 소문자·영숫자·유니크. login_id로 로그인 가능해야 함.
- `ensureBambiProfile`에서 `displayName` 제거(컬럼 삭제됨).
- **수다방(커뮤니티) 글 추가**: `community_post`(schema/bambi.ts) 구조를 확인하고, **구직자 dev 유저(seeker*, 여성/남성 혼합)와 구인자 dev 유저(owner*) 양쪽이 작성한 글을 여러 개** 시딩. 작성자 표시명은 커뮤니티 글의 `author_display_name`(글별 익명 표시명) 규칙, userId는 각 dev 유저. 기존 커뮤니티 시딩 있으면 확장, 없으면 신규 추가·메인 흐름에 연결.
- DB 초기화 절차는 컨트롤러가 수행하고, seed 스크립트는 멱등(onConflict) 유지.

## 검증 (컨트롤러)

1. `db:generate` 후 생성 SQL 육안 확인(login_id/login_id_display rename·bambi_profile.display_name drop·unique 유지, `name` 불변).
2. 개발 DB 초기화 → migrate → `bambi-dev` seed 실행 성공(= signUpEmail 경로가 새 스키마에서 동작, login_id 채워짐).
3. **로그인 스모크**: 새 login_id로 `signIn.username` 성공(최소 seed의 signInEmail + 가능하면 login_id 로그인 확인).
4. `pnpm --filter web/@bambi-app/api/@bambi-app/auth/@bambi-app/db/server check-types` 통과.
5. `pnpm dlx ultracite check` 변경 파일 클린.
6. 관련 vitest(onboarding·moderation·blocks·chats·community·reviews 등) 갱신·통과.

## 리스크 (우선 검증)

- **login_id 런타임**: username 플러그인 `schema` 매핑으로 signup·signIn.username이 실제 동작하는지(스키마 생성만으로 부족). — `name` 코어 매핑 리스크는 이번 결정으로 제거됨.
- 표시명 참조 누락 시 check-types 실패 → 전수 확인.
- seed 유저 login_id 누락 시 앱 로그인 불가 → seed 검증 포함.
