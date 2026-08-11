# 리스팅 대기열 비공개·순번 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Dynamic Workflow(병렬 서브에이전트)로 태스크 단위 실행. 컨트롤러가 중앙 검증한다.

**Goal:** 대기열(결제됨·미활성) 스페셜/추천 공고를 모든 공개 화면에서 숨기고, 구인자에겐 "대기열 #N", 운영자에겐 "스페셜/추천 #N" 순번을 보여주며, 운영자가 섹션별 대기열 목록을 직접 볼 수 있게 한다.

**Architecture:** FIFO 유료 대기열(선행 커밋 e97317d7)의 후속. 대기 판정(`published+paid+special|recommended+exposureEndsAt IS NULL`)은 이미 `queuedListingWhere`가 단일 소스다. 이번 작업은 (1) 공개 조회 4곳에 "대기 제외" 공용 필터 주입, (2) 목록 API 3곳에 FIFO 순번(`listingQueuePosition`) 부착, (3) web 배지·대기열 카드 렌더.

**Tech Stack:** Drizzle ORM, oRPC, Next.js RSC + shadcn(base-ui), vitest.

## Global Constraints

- 대기 판정 조건을 새로 쓰지 말 것 — `queuedListingWhere` / 신규 `notQueuedListingFilter`만 사용.
- 순번(position) = 대기 행들을 `listing_paid_at asc, id asc`로 정렬한 1-based FIFO 순번(rank). 화면 표기는 `#N`.
- enum 원값 화면 노출 금지 — 라벨 맵 경유([[bambi-no-raw-enum-in-ui]]).
- UI는 shadcn 컴포넌트·시맨틱 토큰만, 인라인 style 금지(apps/web/CLAUDE.md).
- 서브에이전트는 git·pnpm install·빌드·dev 서버 실행 금지. 검증은 컨트롤러가 중앙 실행.
- biome/ultracite 함정: 중첩 삼항 금지, 인지 복잡도 초과 시 서브컴포넌트/헬퍼 추출, `useOptionalChain`.
- urgent·배너·standard의 기존 노출 동작은 절대 변경하지 않는다(대기열은 special/recommended 전용).

## 공유 계약 (모든 에이전트가 이 이름·시그니처를 그대로 사용)

```ts
// packages/api/src/services/bambi-premium-capacity.ts (Phase1 A1이 작성)
export const notQueuedListingFilter = (): SQL<unknown>;
// = or(notInArray(jobPost.exposureType, [...CAPACITY_LISTING_EXPOSURE_TYPES]), isNotNull(jobPost.exposureEndsAt))
// "리스팅 대기 행이 아니다" — published/paid 필터가 이미 걸린 공개 쿼리의 and(...)에 추가해서 쓴다.

export interface ListingQueuePositionEntry {
	exposureType: CapacityListingExposureType;
	position: number; // 1-based FIFO
}
export const getListingQueuePositions = (
	executor: QueryExecutor
): Promise<Map<string, ListingQueuePositionEntry>>; // key = jobPost.id, 대기 행 전체(양 섹션)

// API 응답 필드(Phase2 B1·B3이 부착): 목록 행에 listingQueuePosition: number | null
// (jobs.listMine · moderation.listJobPosts · moderation.listJobsForPayment)

// moderation 신규 프로시저(Phase2 B3):
// listListingQueues → { special: ListingQueueItem[]; recommended: ListingQueueItem[] }
// ListingQueueItem = { id: string; title: string; organizationDisplayName: string;
//                      listingPaidAt: Date | null; position: number }

// apps/web/src/lib/bambi/exposure.ts (Phase1 A2가 작성)
export const LISTING_QUEUE_SHORT_LABELS = { recommended: "추천", special: "스페셜" } as const;
export interface QueueableJobFields {
	exposureEndsAt: Date | string | null;
	exposureType: string;
	paymentStatus: string;
	status: string;
}
export const isQueuedListing = (job: QueueableJobFields): boolean;
export const listingQueueBadgeLabel = (
	exposureType: string,
	position: number | null
): string; // "스페셜 #3" / position null이면 "스페셜 대기"
```

---

### Phase 1 — A1: 공용 필터·순번 파생 (packages/api 서비스)

**Files:**
- Modify: `packages/api/src/services/bambi-premium-capacity.ts`
- Modify: `packages/api/src/services/bambi-auto-boost.ts`

**Steps:**
- [ ] `notQueuedListingFilter()`·`getListingQueuePositions()`를 계약대로 추가. 구현: 대기 행을 한 쿼리로(`status published + paid + exposureType in 2종 + exposureEndsAt is null`, `orderBy(asc(listingPaidAt), asc(id))`) 뽑고 섹션별 카운터로 position 부여.
- [ ] `bambi-auto-boost.ts`의 후보 WHERE에 인라인으로 박힌 `or(notInArray(...), isNotNull(...))` 대기 제외 식을 `notQueuedListingFilter()` 호출로 교체(사용 안 하게 된 import 정리).

### Phase 1 — A2: web 노출 헬퍼·단위테스트

**Files:**
- Modify: `apps/web/src/lib/bambi/exposure.ts`
- Modify: `apps/web/test/lib/bambi/exposure.test.ts`

**Steps:**
- [ ] `LISTING_QUEUE_SHORT_LABELS`·`isQueuedListing`·`listingQueueBadgeLabel`을 계약대로 추가. `isQueuedListing`은 `status==="published" && paymentStatus==="paid" && (special|recommended) && exposureEndsAt === null`.
- [ ] 테스트 추가: 대기 true / urgent+null false / unpaid false / 활성(미래 날짜) false / 라벨 "스페셜 #3"·"추천 대기".

### Phase 2 — B1: 공개·구인자 조회 (jobs.ts)

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts`

**Steps:**
- [ ] `list` 핸들러의 `filters` 배열에 `notQueuedListingFilter()` push → organic·전체 카운트에서 대기 제외(섹션 쿼리는 이미 제외됨·urgent에 무해).
- [ ] `legacyList`의 `filters`에도 동일 push.
- [ ] `getById`: select에 `exposureType`, `exposureEndsAt` 추가, 게이트를 "published+paid이면서 (special|recommended)+exposureEndsAt null이면 NOT_FOUND"로 확장.
- [ ] `listMine`: 조회 후 `getListingQueuePositions(db)`로 맵을 얻어 각 행에 `listingQueuePosition: map.get(row.id)?.position ?? null` 부착.

### Phase 2 — B2: 검색 피드 (bambi-job-feed.ts)

**Files:**
- Modify: `packages/api/src/services/bambi-job-feed.ts`

**Steps:**
- [ ] `published+paid` 공개 조건(~L211)을 쓰는 검색/피드 쿼리에 `notQueuedListingFilter()` 추가 — 이 파일의 자체(jobPost) 공개 조회 전부 점검, 수집(crawled) 쿼리는 무관.

### Phase 2 — B3: 운영자 라우터 (moderation.ts)

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`

**Steps:**
- [ ] `listJobPosts`·`listJobsForPayment` 응답 행에 `listingQueuePosition` 부착(B1과 같은 맵 방식, 요청당 1회 호출).
- [ ] `listListingQueues` 프로시저 신설(가드·프로시저 종류는 `removeFromListingQueue`와 동일하게): 섹션별 `queuedListingWhere(type)` + `employerOrganizationProfile` 조인, `orderBy(asc(listingPaidAt), asc(id))`, 계약의 `ListingQueueItem` 모양으로 반환.

### Phase 2 — B4: 구인자 내 공고 열 (employer-jobs-columns.tsx)

**Files:**
- Modify: `apps/web/src/components/bambi/employer-jobs-columns.tsx`

**Steps:**
- [ ] `isPubliclyViewable`에 `!isQueuedListing(job)` 추가(대기 공고 제목 링크 제거 — 상세가 404가 되므로).
- [ ] status 셀: `isQueuedListing(job)`이면 기존 상태 배지 대신 `대기열 #${job.listingQueuePosition}`(null이면 "대기열") warning 톤 배지. `getJobStatusNote`에 대기 분기 추가: "자리가 나면 순서대로 자동 노출됩니다."

### Phase 2 — B5: 운영자 공용 상태 열 (job-table-columns.tsx)

**Files:**
- Modify: `apps/web/src/components/bambi/job-table-columns.tsx`

**Steps:**
- [ ] `jobStatusColumn` 행 타입에 선택 필드 `exposureEndsAt?`, `exposureType?`, `listingQueuePosition?: number | null` 확장. 필드가 있고 `isQueuedListing` 판정이면 배지를 `listingQueueBadgeLabel(row.exposureType, row.listingQueuePosition)` warning 톤으로 대체(sortValue도 동일 라벨).

### Phase 2 — B6: 운영자 페이지·정원 카드

**Files:**
- Modify: `apps/web/src/app/moderator/jobs/page.tsx`
- Modify: `apps/web/src/app/moderator/payments/page.tsx`
- Modify: `apps/web/src/components/bambi/listing-capacity-overview.tsx`

**Steps:**
- [ ] jobs 페이지의 로컬 `isQueuedListing` 제거 → `@/lib/bambi/exposure`에서 import(행 타입은 라우터 타입으로 자동 전파).
- [ ] payments 페이지: `jobStatusColumn`이 새 선택 필드를 읽도록 행 데이터에 `exposureType`·`exposureEndsAt`·`listingQueuePosition`이 흐르는지 확인·필요 시 매핑 보강.
- [ ] `listing-capacity-overview.tsx`: `orpc.bambi.moderation.listListingQueues` 30초 refetch 쿼리 추가, 스페셜/추천 stat 아래에 대기 목록(`#N 제목 · 업소`, 비었으면 미표시)을 렌더. 낡은 설명 문구를 "만석이면 결제완료 시 대기열로 접수되고, 자리가 나면 순서대로 자동 노출됩니다."로 교체. (이 컴포넌트는 moderator jobs 페이지 전용임을 grep으로 확인 — admin 가드 프로시저 호출 안전.)

### Phase 2 — B7: 매뉴얼 동기화

**Files:**
- Modify: `docs/manual/employer-manual.md`
- Modify: `docs/manual/moderator-manual.md`

**Steps:**
- [ ] 구인자: 내 공고 상태에 "대기열 #N"(만석 결제 시 대기, 자리 나면 자동 노출·노출기간은 그때부터) 설명 추가/갱신.
- [ ] 운영자: 공고 관리 정원 카드의 대기열 목록·"스페셜/추천 #N" 상태 표기·"대기열에서 빼기"와의 관계 갱신.

### Phase 3 — 컨트롤러 중앙 검증

- [ ] `pnpm --filter @bambi-app/api check-types` · `pnpm --filter web check-types`(워크트리 안, 낡은 .next 오탐 주의) · server check-types
- [ ] `pnpm dlx ultracite fix <변경 파일들>` (경로 인자 필수)
- [ ] `pnpm --filter web test -- test/lib/bambi/exposure.test.ts` (워크트리 안에서)
- [ ] 커밋(한국어 type: 제목 + 촘촘한 블릿) → ExitWorktree(keep) → no-ff 병합
