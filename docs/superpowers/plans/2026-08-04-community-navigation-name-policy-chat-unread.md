# 수다방 내비게이션·이름 정책·채팅 안 읽음 집계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 또는 superpowers:subagent-driven-development로 태스크를 순서대로 구현한다. 모든 체크박스는 구현·검증이 끝난 뒤에만 완료 처리한다.

**Goal:** 수다방 페이지 히스토리 오동작과 게시판 표기를 바로잡고, 일반 회원의 운영자 사칭 이름 및 자유수다 비밀글을 차단하며, 전역 채팅 배지를 실제 안 읽은 메시지 총합으로 표시한다.

**Architecture:** 작업을 검토·롤백 가능한 3개 설계 영역과 커밋 단위로 분리하되, 최신 `develop`에서 통합 브랜치 `fix/community-name-policy-chat-unread` 하나를 생성하고 통합 PR 하나로 올린다. 수다방 내비게이션은 URL 쿼리(`page`, 필터)를 진실원으로 유지하면서 페이지 클릭만 history push로 바꾼다. 이름 정책은 `@bambi-app/auth/reserved-display-name`의 순수 정규화 헬퍼를 가입·프로필 변경·커뮤니티 작성/수정의 서버 관문에서 공유한다. 기존 데이터 정리와 자유수다 잠금글 삭제는 custom Drizzle migration으로 수행한다. 채팅 전역 집계는 방 distinct count가 아니라 읽음 영수증이 없는 메시지 row count를 한 번의 쿼리로 계산한다.

**Tech Stack:** Next.js 16 App Router, React Query, better-auth, oRPC, Drizzle ORM/PostgreSQL, Vitest, Turbo/pnpm.

## 확정 요구사항

- 화면에 표시되는 `일 이야기`만 `밤문화 이야기`로 변경한다. DB enum `work_talk`, URL `/work-talk`, 수집 게시판 연결은 변경하지 않는다.
- 메인 → 게시판 1페이지 → 6페이지에서 뒤로가기를 누르면 1페이지, 다시 누르면 메인으로 이동한다. 페이지·필터는 URL로 복원하고 브라우저의 스크롤 복원을 깨지 않는다.
- 일반 회원은 계정 닉네임과 게시글 `작성인`에 `Admin` 또는 `관리자`가 포함된 값을 사용할 수 없다. 영문 대소문자를 무시하고 공백·구두점·기호를 제거한 뒤 부분문자열로 검사한다. 따라서 `myADMIN`, `A d-m_i.n`, `관 리-자`도 차단한다.
- `bambi_profile.role === "admin"`인 운영자는 위 예약어를 사용할 수 있다. 공개 회원가입으로는 admin을 만들 수 없으므로 가입 단계에서는 예약어를 모두 차단한다.
- 닉네임 중복은 허용한다. `user.name`에 unique 제약을 추가하지 않는다.
- 기존 비운영자 계정의 위반 닉네임은 `회원-{user.id 뒤 6자리}`로 변경한다. 기존 비운영자 커뮤니티 글의 위반 작성인은 `회원`으로 변경한다. 운영자 계정·운영자 작성글은 유지한다.
- 자유수다(`board === "free"`)에서 비밀글 UI를 제거하고 API가 `isLocked: true`를 거부한다. 기존 자유수다 비밀글은 소프트 삭제(`status = deleted`)한다. 다른 게시판의 비밀글은 유지한다.
- 전역 채팅 배지는 안 읽은 **방 수**가 아니라 모든 참여 방의 안 읽은 **메시지 총합**이다. 같은 방 3개면 3, 두 방 3개+2개면 5다. 방 목록의 방별 `unreadCount` 계약은 유지한다.
- PDF/TXT 채팅 첨부와 `서울 강남구` 더미 팀 프로필 백필 실패는 이번 범위에서 제외한다.

## 공통 작업 규칙

- 작업 직전에 `develop`을 최신화한 뒤 `git switch -c fix/community-name-policy-chat-unread`로 통합 브랜치 하나를 생성한다.
- 아래 3개 작업 영역별로 커밋을 분리한다. 추가 브랜치·PR 분리는 사용자 승인 없이 하지 않는다.
- 통합 PR 본문에 관련 이슈 번호를 각각 `Closes #<issue-number>`로 넣어 여러 이슈를 함께 종료한다.
- DB 스키마/데이터 변경은 migration으로 남긴다. `pnpm db:push`는 절대 사용하지 않는다.
- migration 번호는 구현 시점의 다음 번호를 사용한다. 현재 기준 다음 번호는 `0060`이지만, 그 전에 develop에 migration이 추가되면 번호를 다시 계산한다.
- 개발 서버·프로덕션 빌드는 프로젝트 규칙상 에이전트가 임의 실행하지 않는다. Vitest, 타입체크, 변경 파일 한정 Ultracite 검증만 수행하고 브라우저 반복 확인은 사용자에게 요청한다.
- 주석과 사용자 메시지는 한국어, 줄바꿈 LF, 기존 Biome/Ultracite 규칙을 따른다.

## 이슈·커밋 구성

### 작업 영역 1 / 수다방 내비게이션

**이슈 문구:**

> 수다방 목록 내비게이션·게시판명(버그/개선): 더보기로 목록 진입 후 페이지 이동 시 `router.replace`가 이전 목록 history를 덮어 뒤로가기가 메인 또는 과거 글 상세로 잘못 복귀함 — 페이지 이동을 history push로 교정하고 URL 기반 페이지·필터 복원을 유지, 화면의 `일 이야기` 명칭을 `밤문화 이야기`로 통일 (`work_talk`·`/work-talk` 불변)

### 작업 영역 2 / 이름·게시 정책

**이슈 문구:**

> 운영자 사칭 이름·자유수다 비밀글 정책(기능/데이터 정리): 일반 회원이 계정 닉네임·게시글 작성인에 Admin/관리자 및 공백·기호 우회 표현을 사용할 수 있음 — 가입·프로필 변경·글 작성·수정 서버 차단과 운영자 예외 적용, 기존 위반 데이터 치환; 자유수다 비밀글 UI/API 차단 및 기존 잠금글 소프트 삭제

### 작업 영역 3 / 채팅 안 읽음 집계

**이슈 문구:**

> 채팅 안 읽음 집계(버그): 헤더·하단 메뉴가 안 읽은 메시지가 아닌 안 읽은 채팅방 수를 집계해 같은 방 메시지 3개가 1로 표시됨 — 참여한 모든 방의 미확인 메시지 총합으로 API·실시간 캐시·배지 표시 수정

---

## Task 1: 수다방 페이지 history와 게시판 표시명

**Files:**

- Modify: `apps/web/src/lib/bambi/community.ts`
- Modify: `apps/web/src/components/bambi/screens/community-board.tsx`
- Modify as needed: `apps/web/src/components/bambi/community-board-preview.tsx`
- Modify as needed: `apps/web/src/components/bambi/home-community-section.tsx`
- Modify: `docs/manual/seeker-manual.md`
- Test: `apps/web/src/lib/bambi/community.test.ts`
- Create: `apps/web/src/components/bambi/screens/community-board-navigation.test.ts`

**Interfaces:**

- `CommunityBoardMeta.key`는 `work_talk`, `slug`는 `work-talk` 그대로 유지하고 `label`만 `밤문화 이야기`로 바꾼다.
- 필터 변경과 범위 밖 페이지 클램프는 현재처럼 `router.replace`를 유지한다. 사용자의 명시적 페이지 클릭만 push가 되어야 한다.
- 페이지 링크는 실제 `href`를 유지한다. 보조 클릭·새 탭·키보드 접근을 막지 않도록 가능하면 `preventDefault + router.replace`를 제거하고 Next `Link`의 기본 push를 사용한다.

- [x] **Step 1: 회귀 테스트 작성**
  - `COMMUNITY_BOARDS`에서 `work_talk`의 label만 `밤문화 이야기`이고 key/slug가 불변임을 단언한다.
  - `community-board.tsx`의 페이지 이동 경로가 `router.replace(pageHref(...))`를 사용하지 않고 push semantics를 사용하며, 필터·클램프의 replace는 남는지 단언한다.
  - `pnpm --filter web exec vitest run src/lib/bambi/community.test.ts src/components/bambi/screens/community-board-navigation.test.ts`가 구현 전 실패하는지 확인한다.

- [x] **Step 2: 표시명 변경**
  - `apps/web/src/lib/bambi/community.ts`의 `work_talk.label`만 `밤문화 이야기`로 변경한다.
  - 화면 문자열 전수 검색: `rg -n "일 이야기" apps/web/src docs/manual`.
  - 과거 설계 문서와 DB enum/라우트/크롤러 상수는 바꾸지 않는다. 현재 사용자 매뉴얼의 화면 명칭만 동기화한다.

- [x] **Step 3: 페이지 history 교정**
  - 페이지 번호·이전·다음 링크가 각각 브라우저 history entry를 추가하도록 변경한다.
  - 필터 토글은 page 1로 원자 리셋하므로 replace 유지, 존재하지 않는 page 클램프도 replace 유지한다.
  - URL 쿼리가 React Query input의 단일 진실원인 구조는 유지한다. 로컬 component state에 page를 중복 저장하지 않는다.

- [x] **Step 4: 자동 검증**
  - 위 Vitest 통과.
  - `pnpm --filter web check-types` 통과.
  - `pnpm dlx ultracite fix <변경 파일들>` 후 오류 0.

- [ ] **Step 5: 사용자 브라우저 확인 요청**
  - 메인 → 더보기 → 1페이지 → 6페이지 → 브라우저 뒤로가기 = 1페이지 → 뒤로가기 = 메인.
  - 페이지 6에서 글 상세 진입 → 뒤로가기 = 페이지 6 및 기존 필터·스크롤 위치.
  - 첫 진입 직후 뒤로가기를 20회 반복해 과거 작성글 상세가 끼어들지 않는지 확인.

- [x] **Step 6: 영역별 커밋**
  - 수다방 내비게이션과 표시명 변경만 하나의 독립 커밋으로 남긴다.
  - 커밋 후 관련 테스트가 통과하는지 다시 확인한다.

---

## Task 2: 예약 이름 차단·기존 데이터 정리·자유수다 잠금 제거

### 요구 변경 설계 (2026-08-04) — 운영자 관리형 닉네임 금칙어

초기 설계의 `RESERVED_DISPLAY_NAME_TERMS = ["admin", "관리자"]` 런타임 하드코딩은 폐기한다. 운영자 콘솔 `/moderator/banned-words`의 기존 **금칙어 관리** 아래에 동일한 관리 UI를 재사용한 **닉네임 금칙어** 영역을 추가하고, 운영자가 활성 단어를 변경하면 가입·프로필·게시글 작성인 정책에 반영되게 한다.

**데이터 모델과 migration**

- 기존 `banned_word` 테이블에 `scope`를 추가한다. 값은 `content`와 `display_name` 두 가지이며 기존 행은 `content`로 유지한다.
- 정규화형 유일성은 전역이 아니라 `(scope, normalized_term)` 조합으로 바꿔 같은 단어를 본문 금칙어와 닉네임 금칙어에 각각 등록할 수 있게 한다.
- `Admin`, `관리자`는 `display_name` 범위의 초기 활성 데이터로 migration에서 옮긴다. 최초 운영자 계정이 없는 환경에서는 기존 금칙어 seed 규칙처럼 건너뛴다.
- 기존 일반 회원·일반 작성인 정리와 자유수다 비밀글 소프트 삭제는 기존 `0060` migration에 유지한다. 범위 컬럼·초기 닉네임 금칙어는 후속 Drizzle migration으로 기록한다.

**API와 캐시**

- `bannedWords.list/create/createMany/removeAll`에 `scope`를 명시하고, 단건 활성화·삭제는 기존 UUID 계약을 재사용한다.
- 목록 전체 삭제는 선택한 범위만 삭제해야 하며 다른 범위의 단어를 건드리지 않는다.
- 금칙어 캐시는 범위별로 분리한다. 기존 제목·본문 검사는 `content`, 닉네임·작성인 검사는 `display_name` 활성 목록만 사용한다.
- 일반 회원의 가입, 프로필 변경, 커뮤니티 작성·수정은 서버에서 공백·구두점·기호 제거와 소문자 변환 후 부분 문자열로 검사한다. 운영자 역할 예외와 닉네임 중복 허용은 유지한다.
- 가입 전 화면을 포함한 클라이언트에 관리 목록을 노출하거나 하드코딩 사본을 남기지 않는다. 최종 판정은 서버가 수행하고 기존 오류 표시 경로로 한국어 사유를 전달한다.

**운영자 UI 재사용**

- 현재 페이지의 입력, CSV 추가, 검색, 다중 선택, 활성 스위치, 개별·전체 삭제, `DataTable`을 범위와 표시 문구를 받는 재사용 컴포넌트로 추출한다.
- 첫 영역은 기존 **금칙어 관리**와 설명을 유지하고, 바로 아래 두 번째 영역을 **닉네임 금칙어**로 표시한다.
- 두 영역은 입력·검색·선택·전체 삭제 확인 상태를 독립적으로 관리하고, 닉네임 영역의 안내에는 가입·프로필·게시글 작성인 적용과 공백·특수문자 우회 차단을 명시한다.

**추가·수정 파일**

- Modify: `packages/db/src/schema/bambi.ts`
- Create via Drizzle: `packages/db/src/migrations/0061_*.sql` 및 meta 파일
- Modify: `packages/api/src/routers/bambi/banned-words.ts`
- Modify: `packages/api/src/services/bambi-banned-words.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/src/reserved-display-name.ts`
- Modify: `packages/api/src/services/bambi-display-name-policy.ts`
- Modify: 가입·프로필·작성인 입력 화면의 하드코딩 사전 검사 사용처
- Refactor: `apps/web/src/app/moderator/banned-words/page.tsx`
- Test: 금칙어 router/service, auth 순수 정책, display-name policy, 운영자 페이지

**변경 검증**

- [ ] 범위별 생성·일괄 생성·목록·활성화·선택 삭제·전체 삭제가 서로 격리된다.
- [x] `Admin`, `A d-m_i.n`, `관리자`, `관 리-자`가 활성 닉네임 금칙어일 때 일반 회원 입력을 차단한다.
- [x] 운영자가 닉네임 금칙어를 비활성화·삭제하면 서버 정책에 캐시 무효화 후 반영된다.
- [x] 운영자는 닉네임 금칙어와 무관하게 기존 예외를 유지한다.
- [x] 기존 본문 금칙어 검사는 `display_name` 범위의 단어에 영향받지 않는다.
- [x] `/moderator/banned-words`에서 두 관리 영역이 동일 UI로 독립 동작한다.
- [ ] 관련 Vitest, 영향 워크스페이스 타입 검사, Ultracite, `git diff --check`를 통과한다.

**Files:**

- Create: `packages/auth/src/reserved-display-name.ts`
- Create: `packages/auth/src/reserved-display-name.test.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/api/src/routers/bambi/onboarding.ts`
- Modify: `packages/api/src/routers/bambi/community.ts`
- Modify: `packages/api/src/routers/bambi/community.test.ts`
- Modify: `packages/api/src/services/bambi-onboarding.test.ts`
- Modify: `apps/web/src/components/bambi/auth/auth-panel.tsx`
- Modify: `apps/web/src/components/bambi/screens/account-settings-screen.tsx`
- Modify: `apps/web/src/components/bambi/community-post-form.tsx`
- Modify: `apps/native/components/sign-up.tsx`
- Modify: `apps/native/app/onboarding.tsx`
- Modify: `apps/server/src/seeds/bambi-dev.ts`
- Create via Drizzle custom migration: `packages/db/src/migrations/<next>_*.sql` 및 `meta/_journal.json` 항목

**Interfaces:**

- 런타임 단어 목록은 `banned_word.scope = 'display_name' AND is_active = true`인 운영자 관리 데이터다.
- `normalizeReservedDisplayName(value)`는 lowercase 후 `/[\s\p{P}\p{S}]/gu` 제거.
- `findReservedDisplayNameTerm(value, entries): string | null`은 전달받은 활성 목록에서 정규화 문자열의 부분일치 결과를 반환한다.
- `assertDisplayNameAllowed(value, { isAdmin })`은 비동기로 `display_name` 활성 목록을 읽고, auth와 API 경계는 각각 `APIError`와 `ORPCError`를 만든다.
- 오류 문구: `닉네임 또는 작성인에 사용할 수 없는 단어가 포함되어 있습니다: '<term>'` 취지로 일관되게 노출한다.
- 닉네임 중복은 계속 허용하되 금칙어 데이터의 중복은 `(scope, normalized_term)` 유일 인덱스로 막는다.

- [x] **Step 1: 순수 예약어 테스트 작성**
  - 관리 목록으로 전달한 `Admin`, `관리자`에 대해 `Admin`, `ADMIN`, `myAdmin`, `A d-m_i.n`, `관리자`, `관 리-자`가 적중한다.
  - `ㅇㅇ`, `밤비`, 빈 문자열은 적중하지 않는다.
  - 중복 여부를 검사하는 API가 생기지 않는 것도 코드 리뷰에서 확인한다.

- [x] **Step 2: 서버 가입 관문**
  - better-auth `databaseHooks.user.create.before`에서 활성 닉네임 금칙어를 조회하고 `userData.name`을 검사해 적중하면 `APIError("BAD_REQUEST")`로 거부한다.
  - 공개 가입 시점에는 admin 역할이 아직 없으므로 예외를 허용하지 않는다. admin은 공개 가입으로 생성하지 않는다는 기존 권한 모델을 유지한다.
  - 관리 목록을 클라이언트에 복제하지 않으며, 직접 auth endpoint를 호출해도 서버 훅이 차단한다.

- [x] **Step 3: 프로필 변경과 커뮤니티 서버 관문**
  - `onboarding.updateMyProfile`: 이미 조회하는 `existingProfile.role`이 admin이 아닐 때 `input.displayName` 예약어를 차단한다. admin은 허용한다.
  - `community.createPost`·`updatePost`: 요청을 수행하는 `profile.role`이 admin이 아닐 때 `input.authorName`을 차단한다.
  - 제목·본문은 `content`, 닉네임·작성인은 `display_name` 범위만 검사해 서로 섞이지 않는다.
  - 자유수다 create/update에서 `isLocked: true`면 `BAD_REQUEST`로 거부한다. 다른 게시판의 기존 잠금·비밀번호 규칙은 그대로 유지한다.

- [x] **Step 4: 웹·native 입력 피드백**
  - 웹 회원가입, 계정 설정, 커뮤니티 작성/수정과 native 회원가입·온보딩은 하드코딩 사전 검사를 두지 않고 서버 오류를 기존 화면 경로로 표시한다.
  - admin 예외는 클라이언트가 아니라 서버 역할 판정으로 보장한다.
  - 자유수다 폼에서는 `PostLockField`를 렌더하지 않고 제출값을 항상 `isLocked: false`로 보낸다. 다른 게시판은 기존 UI 유지.

- [x] **Step 5: 개발 시드 admin 경로 보정**
  - 가입 훅이 모든 공개 user create를 검사하므로 `밤비 관리자` 시드가 가입 단계에서 막히지 않도록 admin 시드만 안전한 임시 이름으로 생성한 뒤 admin 프로필 생성 후 원하는 운영자 이름으로 서버 내부 갱신한다.
  - 일반 seed 계정은 예약어 정책을 우회하지 않는다.

- [x] **Step 6: custom data migration 생성·SQL 검토**
  - 최신 develop의 다음 migration 번호를 확인한다.
  - `drizzle-kit generate --custom --name=community-name-policy-cleanup` 방식으로 journal에 등록되는 custom migration을 만든다. 생성 명령이 현재 버전에서 지원되지 않으면 수동 journal 편집을 하지 말고 중단해 사용자·동기와 절차를 확인한다.
  - 같은 SQL 정규화는 `lower(regexp_replace(value, '[^[:alnum:]가-힣]', '', 'g'))`로 예약어 포함 여부를 계산한다.
  - `user` + `bambi_profile`을 조인하여 `role <> 'admin'` 위반 계정만 `회원-` + `right(user.id, 6)`으로 변경한다.
  - `community_post.author_role <> 'admin'` 위반 글의 `author_display_name`만 `회원`으로 변경한다.
  - `community_post.board = 'free' AND is_locked = true AND status <> 'deleted'`인 글을 `status = 'deleted'`, `updated_at = now()`로 소프트 삭제한다.
  - 운영자 계정/글, 다른 게시판 잠금글, 제목·본문, 댓글은 변경하지 않는 SQL 조건을 리뷰한다.

- [ ] **Step 7: 테스트**
  - 일반 회원 가입 예약어 거부, 일반 회원 프로필 변경 거부, admin 프로필 변경 허용.
  - 일반 회원 커뮤니티 create/update 작성인 거부, admin 허용.
  - `free + isLocked=true` create/update 거부, `work_talk` 등 다른 게시판 잠금 허용.
  - migration 전용 fixture 또는 트랜잭션 검증으로 일반 계정 치환, 운영자 유지, 일반 작성인 치환, 운영자 작성인 유지, 자유수다 잠금글 삭제, 타 게시판 잠금글 유지를 확인한다.

- [ ] **Step 8: 검증·DB 적용 승인**
  - 관련 Vitest와 `pnpm --filter @bambi-app/auth --filter @bambi-app/api --filter web --filter native --filter server check-types` 통과.
  - 변경 파일 한정 Ultracite 통과.
  - migration SQL을 사용자에게 먼저 보여주고 명시 승인을 받은 뒤에만 `pnpm db:migrate`를 실행한다. `db:push` 금지.

- [x] **Step 9: 영역별 커밋**
  - 예약 이름 정책·데이터 정리·자유수다 잠금 제거를 하나의 독립 커밋으로 남긴다.
  - 커밋 메시지와 통합 PR 본문에 데이터 변경 및 migration 내용을 명시한다.

---

## Task 3: 전역 채팅 안 읽은 메시지 총합

**Files:**

- Modify: `packages/api/src/services/bambi-chat-read-state.ts`
- Modify: `packages/api/src/services/bambi-chat-read-state.test.ts`
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Modify: `packages/api/src/routers/bambi/chats.test.ts`
- Rename/Modify: `apps/web/src/lib/bambi/use-unread-room-count.ts` → `use-unread-message-count.ts`
- Modify: `apps/web/src/components/bambi/mobile-tab-bar.tsx`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx`
- Modify as needed: web tests importing the old hook/response field

**Interfaces:**

- `getUnreadRoomCount`를 `getUnreadMessageCountForUser`처럼 의미가 분명한 이름으로 교체한다.
- SQL은 참여 방 조건 + 상대가 보낸 메시지 + 내 read receipt 없음 조건은 유지하고 `countDistinct(chatRoomId)`를 `count(chatMessage.id)`로 바꾼다.
- `unreadState` 응답을 `{ unreadMessageCount: number }`로 변경한다. 구 필드 `unreadRoomCount`를 동시에 남겨 이중 계약을 만들지 않는다.
- 방 목록 `listMine[].unreadCount`와 방 단위 `getUnreadMessageCount({ chatRoomId, userId })`는 이미 메시지 수를 세므로 변경하지 않는다.
- 실시간 이벤트는 현재 `chat:list:updated` 무효화 구조를 유지한다. optimistic 수동 증감으로 중복 계산하지 않는다.

- [x] **Step 1: 실패하는 집계 테스트 작성**
  - 같은 방에서 상대 메시지 3개 → 전역 3.
  - 두 방에서 3개+2개 → 전역 5.
  - 내가 보낸 메시지는 제외.
  - 5개 중 2개 read receipt 생성 → 전역 3, 모두 읽음 → 0.
  - 기존 방별 `unreadCount` 테스트도 유지한다.

- [x] **Step 2: 서비스·라우터 변경**
  - distinct room count를 message row count로 교체하고 함수·주석·라우터 응답 필드를 함께 rename한다.
  - 단일 SQL 집계를 유지해 방마다 N+1 조회하지 않는다.

- [x] **Step 3: 웹 훅·배지 변경**
  - 훅 파일·함수·변수명을 `UnreadMessageCount` 기준으로 변경한다.
  - 모바일 하단 탭은 실제 총합 숫자를 표시한다.
  - 데스크톱 헤더 채팅 버튼도 점만 표시하지 말고 안 읽은 메시지 총합을 사용자가 읽을 수 있게 표시하며 접근성 레이블에 숫자를 포함한다.
  - `chat:list:updated` 수신 시 동일 query key를 invalidate하여 새 메시지·읽음 처리 모두 서버 정본으로 재조회한다.

- [x] **Step 4: 검증**
  - `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-chat-read-state.test.ts src/routers/bambi/chats.test.ts` 통과.
  - `pnpm --filter @bambi-app/api --filter web check-types` 통과.
  - 변경 파일 한정 Ultracite 통과.

- [ ] **Step 5: 사용자 실시간 확인 요청**
  - 같은 방 메시지 3개 수신: 방 목록 3, 하단 탭 3, 헤더 3.
  - 다른 방 메시지 2개 추가: 전역 5, 각 방은 3/2.
  - 첫 방을 읽으면 전역 2, 두 번째 방도 읽으면 0.
  - 새로고침·재로그인 후에도 같은 값인지 확인.

- [x] **Step 6: 영역별 커밋**
  - 채팅 안 읽은 메시지 총합 변경만 하나의 독립 커밋으로 남긴다.
  - 커밋 후 API·웹 관련 테스트가 통과하는지 다시 확인한다.

## 최종 통합 확인

- [x] `fix/community-name-policy-chat-unread`가 최신 `develop`에서 생성됐는지 확인하고, push 전 develop 변경 사항과 충돌 여부를 확인한다.
- [x] 3개 작업 영역이 각각 구분 가능한 커밋으로 남았는지 확인한다.
- [x] 통합 테스트·타입체크·변경 파일 한정 Ultracite 검증을 완료한다.
- [ ] 통합 브랜치를 push하고 PR 하나를 생성한다.
- [ ] 통합 PR 본문에 관련 이슈들을 각각 `Closes #...`로 나열하고, 모든 대상 이슈가 병합 시 닫히는지 확인한다.
- [x] PDF/TXT 첨부, 닉네임 중복 금지, 더미 지역 프로필, 공지 실제 게시 운영은 범위에 들어오지 않았는지 최종 diff에서 확인한다.

## 구현·검증 기록 (2026-08-04)

- 통합 브랜치: `fix/community-name-policy-chat-unread` (`develop` 313176e 기준).
- custom migration: `0060_community-name-policy-cleanup.sql` 생성 및 journal/snapshot 등록. 실제 DB에는 아직 적용하지 않았다.
- API·DB 통합 테스트: 커뮤니티·채팅 라우터와 관련 서비스 테스트 85개 통과. 채팅 전역 집계는 같은 방 3개 및 두 방 3개+2개를 검증했다.
- 웹 테스트: 게시판 메타·페이지 history 회귀 테스트 13개 통과.
- 인증 예약어 순수 테스트: 10개 통과.
- 타입체크: `@bambi-app/auth`, `@bambi-app/api`, `web`, `server` 통과.
- native 전체 타입체크는 이번 변경 파일이 아닌 기존 `regionCode`, 운영자 사용자 `displayName`, 공고 `payUnit` 타입 오류로 실패한다. 이번에 수정한 native 파일에서는 신규 오류가 보고되지 않았다.
- 변경 코드 Ultracite 검사 오류·경고 0, `git diff --check` 통과.
- 남은 수동 작업: 브라우저 history 20회 반복 확인, 실시간 채팅 배지 확인, migration SQL 사용자 승인 후 `pnpm db:migrate`, 통합 PR 생성.
