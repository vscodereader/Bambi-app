# 공고 노출 옵션·결제·게시 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 공고 등록에 노출 옵션·결제 방법 선택을 더하고, 게시를 검수+운영자 결제완료로 게이트하며, 운영자 결제 관리와 구인자 내 공고 DataTable(노출·결제·기간 컬럼)을 구현한다.

**Architecture:** jobPost에 노출/결제 컬럼 추가(독립 결제 축). 공개 노출 = status published AND paymentStatus paid. 운영자가 결제 상태 수동 관리. 내 공고는 shadcn DataTable로 전환. 실 /seeker 노출 엔진·PG는 범위 밖(선택·흐름·표시까지).

**Tech Stack:** Next.js RSC, Drizzle+Postgres, oRPC+zod, TanStack Query/Table, shadcn(base-ui)+Tailwind v4.

## Global Constraints
- **빌드·dev서버·스크린샷 금지.** 검증 = 타입체크(`check-types`) + string-snapshot/실DB 없는 vitest + Biome. 시각 확인은 사용자.
- **`db:*` 실행 금지·`db:push` 금지.** 스키마 변경 후 마이그레이션은 사용자(`db:generate`→검토→커밋→`db:migrate`). 구현자는 스키마 코드만.
- **UI 규칙(apps/web/CLAUDE.md):** shadcn 우선, 인라인 style 금지, raw hex/oklch 금지·시맨틱/브랜드 토큰, `rounded-none` 금지, `space-x/y-*` 금지(`gap-*`), `size-*`, `cn()`, base-ui는 `render` prop. 2~7 선택지는 `ToggleGroup`.
- **폭/px:** 임의 raw px 금지, 기존 토큰/`APP_CONTENT_WIDTH` 재사용.
- **커밋:** 한국어 `type:` + 촘촘한 `- ` 블릿(빈 줄 없음), 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. 커밋 전 pnpm install 완료됨. 병렬 커밋 시 `.git/index.lock` 나면 잠깐 후 최대 3회 재시도.
- **enum 값 단일 소스:** 스키마 pgEnum이 원천, 웹/‌API는 동일 리터럴·순서 재사용.
- **모바일 반응형 필수.**

## 공유 값
- exposureType: `premium-banner | left-banner | right-banner | special | urgent | recommended | standard`(기본 standard)
- paymentMethod: `card | bank_transfer` / paymentStatus: `unpaid | paid`
- 표시명: premium-banner=프리미엄 배너·left-banner=좌측 배너·right-banner=우측 배너·special=스페셜 채용·urgent=급구 채용·recommended=추천 채용·standard=일반 구인 / card=신용카드·bank_transfer=무통장입금 / unpaid=미결제·paid=결제완료

---

### Task 1: 스키마 + 생성 API + listMine 필드

**Files:** `packages/db/src/schema/bambi.ts`, `packages/api/src/routers/bambi/jobs.ts`, `packages/api/src/routers/bambi/jobs.test.ts`(있으면; 없으면 생성 스킵하고 타입만)

**Interfaces (Produces):** 3 enum + jobPost 5컬럼; `jobPostInput`에 exposure/payment 필드; create가 이를 저장; `listMine` 반환에 신규 필드.

- [ ] **Step 1: enum 3개 추가** — `bambi.ts`의 기존 enum 근처:
```ts
export const jobExposureType = pgEnum("job_exposure_type", ["premium-banner","left-banner","right-banner","special","urgent","recommended","standard"]);
export const jobPaymentMethod = pgEnum("job_payment_method", ["card","bank_transfer"]);
export const jobPaymentStatus = pgEnum("job_payment_status", ["unpaid","paid"]);
```
- [ ] **Step 2: jobPost 컬럼 추가** — jobPost 테이블에:
```ts
exposureType: jobExposureType("exposure_type").default("standard").notNull(),
exposureDurationDays: integer("exposure_duration_days"),
paymentMethod: jobPaymentMethod("payment_method"),
paymentStatus: jobPaymentStatus("payment_status").default("unpaid").notNull(),
exposureEndsAt: timestamp("exposure_ends_at"),
```
(index 불필요. 배럴 index.ts는 기존 enum 취급 방식 확인 후 필요 시 enum export.)
- [ ] **Step 3: 입력 스키마** — jobs.ts `jobPostInput`(~88)에 추가:
```ts
exposureType: z.enum([...7값]).default("standard"),
exposureDurationDays: z.number().int().min(1).max(365).nullish(),
paymentMethod: z.enum(["card","bank_transfer"]).nullish(),
```
- [ ] **Step 4: create 저장** — create 핸들러의 jobPost insert values에 `exposureType`, `exposureDurationDays: input.exposureDurationDays ?? null`, `paymentMethod: input.paymentMethod ?? null` 포함. `paymentStatus`는 미지정(기본 unpaid). `exposureEndsAt`는 미설정(결제완료 시). update 핸들러도 동일 필드 patch 허용(선택).
- [ ] **Step 5: listMine 반환** — `listMine`(~579) select에 `exposureType`, `paymentStatus`, `exposureDurationDays`, `exposureEndsAt` 추가.
- [ ] **Step 6: 타입체크** — `pnpm --filter @bambi-app/db check-types` + `pnpm --filter @bambi-app/api check-types` PASS. 실DB vitest는 실행 금지(테스트 코드만 타입 맞춤).
- [ ] **Step 7: Commit** — `feat: 공고 노출 옵션·결제 필드 스키마·생성 API 추가`

---

### Task 2: 공개 노출 결제 게이트

**Files:** `packages/api/src/routers/bambi/jobs.ts`, 관련 테스트

**Consumes:** Task 1 `jobPost.paymentStatus`.

- [ ] **Step 1: 공개 목록 필터** — `jobs.list`(~331) 및 관련 공개 목록(marketplace/list) 쿼리의 status 필터에 `eq(jobPost.paymentStatus, "paid")` 추가(published 조건과 AND). premium/recommended 섹션 파생 쿼리도 동일 기준 적용.
- [ ] **Step 2: 상세 공개 접근** — `jobs.get`(공개 열람)에서 `status==="published"`만으로 공개하던 지점에 `paymentStatus==="paid"` 병행. 비공개면 소유자/운영자만 열람(기존 소유자 접근 로직 유지).
- [ ] **Step 3: 테스트** — 미결제 published 공고가 공개 목록/상세에 안 나오고, paid면 나오는 케이스(실DB 테스트 패턴이면 작성만; 실행은 사용자).
- [ ] **Step 4: 타입체크** — api check-types PASS.
- [ ] **Step 5: Commit** — `feat: 공개 노출을 결제완료(paid) 조건으로 게이트`

---

### Task 3: 운영자 결제 관리 API

**Files:** `packages/api/src/routers/bambi/moderation.ts`, 테스트

**Consumes:** Task 1 필드. **Produces:** `moderation.setJobPostPayment`, `listJobPosts` 확장.

- [ ] **Step 1: setJobPostPayment** — admin 프로시저:
```ts
input: z.object({ jobPostId: z.string().uuid(), paymentStatus: z.enum(["unpaid","paid"]) })
```
핸들러: `requireAdmin`. 대상 조회로 `exposureDurationDays` 확인. `paid`면 `exposureEndsAt = now + durationDays일`(durationDays null이면 null), `paymentStatus="paid"`; `unpaid`면 `exposureEndsAt=null`, `paymentStatus="unpaid"`. update+returning, 없으면 NOT_FOUND. (기간 계산은 서버에서 Date 연산.)
- [ ] **Step 2: listJobPosts 확장** — `listJobPosts`(~339) 반환 select에 `exposureType`, `paymentStatus`, `exposureDurationDays`, `exposureEndsAt` 추가.
- [ ] **Step 3: 테스트** — 비admin FORBIDDEN, paid 전환 시 exposureEndsAt 설정, unpaid 되돌리기 null(작성만).
- [ ] **Step 4: 타입체크** — api check-types PASS.
- [ ] **Step 5: Commit** — `feat: 운영자 공고 결제 상태 관리 API(setJobPostPayment) 추가`

---

### Task 4: 공고 등록 폼 노출·결제 섹션

**Files:** `apps/web/src/lib/bambi-job-form.ts`, `apps/web/src/app/employer/new/page.tsx`, 신규 `apps/web/src/components/bambi/job-exposure-fields.tsx`(옵션 섹션 컴포넌트), 관련 string-snapshot 테스트

**Consumes:** Task 1 `jobPostInput` 필드.

- [ ] **Step 1: 폼 상태** — `bambi-job-form.ts` `JobForm`에 `exposureType`(기본 "standard")·`exposureDurationDays`(number|null, 기본 null)·`paymentMethod`(union|null, 기본 null) 추가. `createEmptyJobForm`·`validateJobForm`(비-standard면 paymentMethod 필수 등 규칙)·jobInput 매퍼 반영.
- [ ] **Step 2: 옵션 섹션 컴포넌트** — `job-exposure-fields.tsx`(`"use client"`): 노출 상품(`ToggleGroup` 7종, 라벨+설명), 이용 기간(비-standard일 때 `Select`, 30/60/90일), 결제 방법(`ToggleGroup` 신용카드/무통장입금). 표시명 상수 로컬 정의(공유 값과 동일). props로 값·onChange. 안내문 "운영자 결제 확인 후 게시".
- [ ] **Step 3: 폼 삽입** — `new/page.tsx`에서 `JobPostMediaUploader` 아래에 `<JobExposureFields .../>` 삽입, 제출 payload에 `exposureType`·`exposureDurationDays`·`paymentMethod` 포함. "검수 후 공개" 안내에 결제 문구 보강.
- [ ] **Step 4: 테스트** — string-snapshot: new 페이지가 `JobExposureFields`를 렌더하고 exposureType/paymentMethod를 제출 payload에 포함하는지.
- [ ] **Step 5: 타입체크 + 스냅샷** — web check-types + vitest 대상 PASS.
- [ ] **Step 6: Commit** — `feat: 공고 등록 폼에 노출 상품·결제 방법 선택 섹션 추가`

---

### Task 5: 운영자 결제 관리 UI

**Files:** `apps/web/src/app/moderator/queue/[id]/page.tsx`(및/또는 운영자 공고 목록), 관련 테스트

**Consumes:** Task 3 `setJobPostPayment`, `listJobPosts` 필드.

- [ ] **Step 1: 결제 상태 표시** — 운영자 공고 상세/큐에 결제 상태 배지(미결제/결제완료) + 노출 상품·이용 기간·만료일 표기.
- [ ] **Step 2: 결제 전환 버튼** — "결제완료 처리"/"미결제로 되돌리기" 버튼 → `orpc.bambi.moderation.setJobPostPayment.mutate`, 성공 시 invalidate(해당 쿼리) + 토스트. 검수 승인/반려 UI는 유지. shadcn `Button`/`StatusBadge` 사용.
- [ ] **Step 3: 테스트** — string-snapshot: 소스가 `setJobPostPayment`·결제 배지를 포함.
- [ ] **Step 4: 타입체크 + 스냅샷** — PASS.
- [ ] **Step 5: Commit** — `feat: 운영자 공고 결제 상태 관리 UI 추가`

---

### Task 6: shadcn DataTable 인프라

**Files:** `packages/ui`(shadcn `table` 추가), `apps/web/package.json`(`@tanstack/react-table`), 신규 `apps/web/src/components/bambi/data-table.tsx`(재사용 래퍼)

- [ ] **Step 1: table 컴포넌트** — `pnpm dlx shadcn@latest add table`로 `packages/ui`에 `table` 추가(레포 shadcn 워크플로우 준수, 파일 위치·재테마 확인). base-ui 룩 유지.
- [ ] **Step 2: 의존성** — `@tanstack/react-table`를 `apps/web`에 추가(`pnpm --filter web add @tanstack/react-table`). lockfile 갱신.
- [ ] **Step 3: 재사용 래퍼** — `data-table.tsx`(`"use client"`): `columns`+`data`를 받아 `useReactTable`(정렬·기본 렌더)로 `Table` 마크업 출력. 제네릭. 인라인 style 금지.
- [ ] **Step 4: 타입체크** — web check-types PASS.
- [ ] **Step 5: Commit** — `chore: shadcn DataTable 인프라(table 컴포넌트·react-table·래퍼) 추가`

---

### Task 7: 구인자 내 공고 DataTable

**Files:** `apps/web/src/app/employer/page.tsx`, 신규 `apps/web/src/components/bambi/employer-jobs-columns.tsx`(컬럼 정의), 관련 테스트

**Consumes:** Task 1 `listMine` 필드, Task 6 `DataTable`.

- [ ] **Step 1: 컬럼 정의** — `employer-jobs-columns.tsx`: 제목(수정 링크) · 직종·지역 · 급여(`formatPay`) · 노출 상품(라벨/배지) · 공고 상태(배지) · 결제 상태(배지) · 남은 기간(`exposureEndsAt`까지 일수, null "-") · 만료 상태(진행중/만료/해당없음) · 사업자 인증(배지) · 수정일(`formatDateTime`) · 관리(수정 Link + 삭제 버튼; 기존 삭제 mutation/확인 로직 재사용). 배지·라벨은 기존 상수(jobStatusLabels 등) 재사용.
- [ ] **Step 2: 섹션 교체** — `employer/page.tsx`의 "내 공고" 카드 렌더를 `<DataTable columns={...} data={jobs} />`로 교체. 로딩 Skeleton/EmptyState/삭제 확인 흐름 유지(삭제는 컬럼 액션에서). 모바일은 `overflow-x-auto` 컨테이너로 가로 스크롤.
- [ ] **Step 3: 남은 기간·만료 계산 유틸** — 로컬 헬퍼(예: `apps/web/src/lib/bambi/exposure.ts`)에 `remainingDays(endsAt)`·`expiryLabel(endsAt)` 정의(순수 함수, 테스트 용이).
- [ ] **Step 4: 테스트** — string-snapshot: employer/page가 `DataTable`·컬럼(노출 상품/결제 상태/남은 기간/만료 상태)을 사용하는지. `exposure.ts` 순수함수 단위 테스트(만료/진행중/해당없음).
- [ ] **Step 5: 타입체크 + 스냅샷** — web check-types + vitest PASS.
- [ ] **Step 6: Commit** — `feat: 구인자 내 공고를 DataTable로 전환(노출·결제·기간 컬럼)`

---

## 실행 후(사용자)
- 스키마 반영: `pnpm --filter @bambi-app/db db:generate`(신규 마이그레이션 — enum 3개 + jobPost 5컬럼) → 검토 → 커밋 → `db:migrate`. `db:push` 금지.
- 시각 확인(등록 폼 옵션·운영자 결제 관리·DataTable) 사용자.

## Self-Review 메모
- 결제 게이트는 jobPostStatus를 바꾸지 않고 공개 쿼리에 paid 조건만 더함(회귀 최소). 소유자/운영자 열람은 유지.
- exposureEndsAt는 결제완료 시점 서버 계산(폼에서 받지 않음). durationDays null(standard)이면 만료 개념 없음("해당 없음").
- enum 값 순서·문자열은 스키마 원천과 100% 일치(웹/‌API 재사용).
