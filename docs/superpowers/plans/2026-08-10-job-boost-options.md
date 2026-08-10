# 공고 끌어올리기 추가 옵션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수동 기간제·수동 횟수권·자동 기간제 끌어올리기 옵션을 전역 단일 상품으로 판매하고, 무료 공고를 포함한 모든 리스팅형 공고가 구매·사용할 수 있게 한다.

**Architecture:** 전역 옵션 정의(`job_boost_option` 3행)와 구매 단위(`job_boost_purchase`, 스펙 스냅샷·독립 결제 상태)를 신설한다. 수동 끌올 자격 판정은 `resolveBoostEligibility`를 v2로 확장(번들+기간제 합산 한도 → 소진 시 횟수권 차감)하고, 횟수권 사용 이벤트는 `job_boost_event.purchase_id`로 구분해 하루 한도를 잠식하지 않게 한다. 자동 틱은 유효 횟수(번들+활성 auto_period)를 합산해 기존 슬롯 분배 로직을 그대로 태운다.

**Tech Stack:** drizzle(pg)·oRPC·zod·react-query·shadcn(base-ui). 새 라이브러리 금지.

**스펙:** `docs/superpowers/specs/2026-08-10-job-boost-options-design.md` (승인됨 — 확정 결정·데이터 모델·화면 범위는 스펙이 정본)

## Global Constraints

- `git push`·PR 생성 금지. 커밋은 컨트롤러가 태스크 단위로 수행한다(서브에이전트는 커밋·stash 금지).
- `db:push` 절대 금지. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate`로 생성만 하고 적용(migrate)은 사용자 지시 시 별도로.
- **`packages/api`의 `src/routers/bambi`·`test/routers` 테스트 스위트 실행 절대 금지**(실 dev DB 파괴). pure 로직은 `packages/api/test/services`에서만 검증(`cd packages/api && pnpm vitest run test/services`).
- web 테스트는 워크트리 루트에서 `pnpm vitest run --config apps/web/vitest.config.ts`.
- 린트: `pnpm dlx ultracite fix <수정 파일 경로들>` — 경로 인자 필수(안 주면 0파일).
- check-types: `pnpm --filter @bambi-app/api check-types` / `pnpm --filter web check-types` / `pnpm --filter @bambi-app/db check-types` (web·server는 scope 없음, db·api만 `@bambi-app/*`).
- npm 의존성 추가 금지. UI는 shadcn(base-ui: `asChild` 아님, `render` prop) 재사용, 임의 px 금지(Tailwind 토큰), enum 원값 화면 노출 금지(`*_LABELS` 맵 경유), 모바일 반응형, 내비 버튼 primary 금지.
- 주석·문구는 한국어, 파일은 LF. 빌드·dev 서버 실행 금지(HMR 상시).
- 계획의 줄번호는 드리프트할 수 있다 — 의미 앵커(함수·주석·식별자)를 우선하라.

---

### Task 1: DB 스키마·마이그레이션 (enum 1·테이블 2·컬럼 1)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` — `jobBoostEvent` 테이블(주석 "광고 상품 축 끌어올리기 이력" 근처), `jobDetailDesignStatus` enum 부근에 새 enum, `jobBoostEvent` 아래에 새 테이블 2개, relations 절
- Create: `packages/db/src/migrations/0080_*.sql` (db:generate 산출물 — 직접 작성 금지)

**Interfaces (Produces):**
- `jobBoostOptionType` pgEnum("job_boost_option_type"): `"manual_period" | "manual_count" | "auto_period"`
- `jobBoostOption` 테이블: `id`(uuid pk), `optionType`(unique, notNull), `price`(int, null=미판매), `boostsPerDay`(int null, 기간제 전용), `durationDays`(int null, 기간제 전용), `boostCount`(int null, 횟수권 전용), `updatedAt`
- `jobBoostPurchase` 테이블: `id`(uuid pk), `jobPostId`(uuid notNull, jobPost FK cascade), `organizationId`(organization FK cascade — `jobBoostEvent`와 동일 패턴), `buyerUserId`(user FK), `optionType`(notNull), `amount`(int notNull), `boostsPerDay`·`durationDays`·`boostCount`(int null — 구매 시점 스냅샷), `paymentMethod`(jobPost.paymentMethod와 **같은 enum** 재사용 — 스키마에서 enum 이름 확인), `paymentStatus`(jobPost.paymentStatus와 같은 enum, default "unpaid" notNull), `activatedAt`(timestamp null), `expiresAt`(timestamp null), `remainingCount`(int null), `createdAt`(defaultNow notNull). 인덱스: `(job_post_id)`, `(payment_status)`
- `jobBoostEvent.purchaseId`: uuid null, `jobBoostPurchase` FK(on delete set null — 구매 행 정리에도 이력 보존)

- [ ] **Step 1: 스키마 작성** — 위 정의대로 추가. 각 컬럼에 스펙의 이유를 한국어 주석으로(예: purchase 스냅샷 컬럼에 "운영자가 옵션을 바꿔도 기존 구매 비소급"). relations(`jobBoostPurchaseRelations`: jobPost·구매 이벤트 many, `jobBoostEventRelations`에 purchase one 추가)도 기존 관례대로.
- [ ] **Step 2: 마이그레이션 생성** — `pnpm --filter @bambi-app/db db:generate` 실행. 산출 SQL이 CREATE TYPE 1 + CREATE TABLE 2 + ALTER TABLE ADD COLUMN 1 + 인덱스/FK인지 눈으로 검증. **migrate는 실행하지 않는다.**
- [ ] **Step 3: 검증** — `pnpm --filter @bambi-app/db check-types`, `pnpm --filter @bambi-app/api check-types`(기존 코드 영향 없음 확인).
- [ ] **Step 4: 컨트롤러에 보고** (커밋은 컨트롤러)

---

### Task 2: pure 서비스 — 자격 판정 v2·활성 합산·횟수권 선택

**Files:**
- Modify: `packages/api/src/services/bambi-job-boost.ts`
- Test: `packages/api/test/services/bambi-job-boost.test.ts` (기존 파일 확장 — 없으면 test/ 미러 구조·`@/` alias 컨벤션으로 생성)

**Interfaces (Produces):**
```ts
export interface BoostPurchaseLike {
	boostsPerDay: null | number;
	createdAt: Date;
	expiresAt: Date | null;
	id: string;
	optionType: "auto_period" | "manual_count" | "manual_period";
	paymentStatus: string;
	remainingCount: null | number;
}
// paid ∧ (기간제: expiresAt > now) / (횟수권: remainingCount > 0)
export const isBoostPurchaseActive: (p: BoostPurchaseLike, now: Date) => boolean;
// 활성 기간제 구매의 하루 횟수 합(manual_period 또는 auto_period)
export const sumActivePeriodBoostsPerDay: (
	purchases: BoostPurchaseLike[],
	optionType: "auto_period" | "manual_period",
	now: Date
) => number;
// 활성 횟수권 잔여 합
export const sumRemainingBoostCount: (purchases: BoostPurchaseLike[], now: Date) => number;
// 차감할 횟수권: 활성 중 createdAt 오래된 것. 없으면 null
export const pickCountPurchaseToConsume: (
	purchases: BoostPurchaseLike[],
	now: Date
) => BoostPurchaseLike | null;
```
- `resolveBoostEligibility` v2 — 인자 확장: `optionManualPerDay: number`(활성 manual_period 합), `countRemaining: number`. 반환 `{ eligible: true; consume: "count" | "daily" } | { eligible: false; reason }`.
- `BoostIneligibleReason` 변경: `not_ad_job`·`product_without_boost` 제거 → `no_boost_available` 추가. `BOOST_INELIGIBLE_MESSAGES.no_boost_available = "이 공고에 사용할 수 있는 끌어올리기가 없습니다. 광고 상품 또는 끌어올리기 옵션을 구매해 주세요."`

**판정 순서 (v2):**
1. `status !== "published" || paymentStatus !== "paid"` → `not_publicly_visible` (무료 공고는 paid 저장이므로 그대로 성립)
2. `adProductId !== null`이고 `exposureEndsAt`이 과거 → `exposure_expired` (무료 공고는 null이라 통과 — **`adProductId` null을 더 이상 거부하지 않는다**)
3. 배너형(`AD_BANNER_EXPOSURE_TYPES`) → `banner_product` (유지)
4. `dailyLimit = manualBoostsPerDay + optionManualPerDay`
5. `dailyLimit <= 0 && countRemaining <= 0` → `no_boost_available`
6. `usedToday < dailyLimit` → `{ eligible: true, consume: "daily" }`
7. `countRemaining > 0` → `{ eligible: true, consume: "count" }`
8. → `daily_limit_reached`

- [ ] **Step 1: 실패 테스트 작성** — 최소 케이스: ① 무료 공고(adProductId null)+활성 기간제 → daily ② 무료 공고+옵션 없음 → no_boost_available ③ 번들 3+기간제 2, usedToday 4 → daily ④ usedToday 5+잔여 2 → count ⑤ usedToday 5+잔여 0 → daily_limit_reached ⑥ 배너형+옵션 있어도 banner_product ⑦ isBoostPurchaseActive: unpaid/만료/잔여0 → false ⑧ pickCountPurchaseToConsume: 오래된 활성 우선, 잔여0 건너뜀 ⑨ sumActivePeriodBoostsPerDay: 만료 건 제외·타입 필터.
- [ ] **Step 2: 실패 확인** — `cd packages/api && pnpm vitest run test/services/bambi-job-boost.test.ts`
- [ ] **Step 3: 구현** — 위 판정 순서·시그니처대로. 기존 사유 메시지 객체에서 제거된 키도 정리(컴파일이 호출부 누락을 잡는다 — 호출부 갱신은 Task 3이므로 이 태스크에서는 **api check-types 실패가 promotions.ts 한 곳뿐인지 확인만** 하고 보고에 남긴다).
- [ ] **Step 4: 테스트 통과 확인** — 같은 명령. 기존 `bambi-auto-boost`·`bambi-job-boost` 기존 케이스 회귀 없는지 test/services 전체도 1회.
- [ ] **Step 5: 컨트롤러에 보고**

> 주의: Task 2와 Task 3은 같은 판정 함수의 정의/호출이라 **연속 실행**한다(중간 상태에서 api check-types가 빨간 것이 정상).

---

### Task 3: promotions 라우터 — 수동 끌올 배선·listMyAds 확장

**Files:**
- Modify: `packages/api/src/routers/bambi/promotions.ts`

**Interfaces:**
- Consumes: Task 1 테이블, Task 2 전체(`isBoostPurchaseActive`·`sumActivePeriodBoostsPerDay`·`sumRemainingBoostCount`·`pickCountPurchaseToConsume`·v2 판정)
- Produces: `listMyAds` 반환 항목에 `boostOptionManualPerDay: number`, `boostOptionAutoPerDay: number`, `boostCountRemaining: number`, `hasUnpaidBoostOption: boolean` 추가. `boost` 뮤테이션 반환 불변.

- [ ] **Step 1: `boost` 뮤테이션 v2 배선** — 트랜잭션 내에서:
  - 기존 공고 select에 `adProductId`·`exposureType`·`exposureEndsAt`·`status`·`paymentStatus`가 이미 있는지 확인하고 없으면 추가(판정 인자).
  - 같은 tx에서 해당 공고의 `jobBoostPurchase` 전체 select(판정·차감 대상).
  - `usedToday` 카운트 조건에 `isNull(jobBoostEvent.purchaseId)` 추가(주석: "횟수권 사용분은 하루 한도를 잠식하지 않는다").
  - v2 인자(`optionManualPerDay`·`countRemaining`)를 Task 2 헬퍼로 계산해 판정. 불가 사유는 기존처럼 `BOOST_INELIGIBLE_MESSAGES`로 번역.
  - `consume === "count"`면 `pickCountPurchaseToConsume`로 고른 구매를 `update ... set remainingCount = remainingCount - 1 where id = ? and remainingCount > 0`로 차감(0행이면 CONFLICT — 동시 클릭 방어), 이벤트 insert에 `purchaseId` 세팅. `consume === "daily"`면 기존 그대로(purchaseId 없음). `boostedAt` 갱신은 두 경로 공통.
- [ ] **Step 2: `listMyAds` 확장** —
  - 광고 공고만 거르는 조건이 select/where에 있으면 제거해 **무료 공고 포함**(접근 필터·정렬은 유지). 반환 필드 추가분은 Produces 참조 — `jobPostIds`로 `jobBoostPurchase` 일괄 조회 후 JS에서 Task 2 헬퍼로 집계.
  - 수동 사용량 집계(`boostType='manual'` 카운트)에도 `isNull(jobBoostEvent.purchaseId)` 추가.
- [ ] **Step 3: 검증** — `pnpm --filter @bambi-app/api check-types` 그린(Task 2에서 빨갛던 호출부 해소 확인), `cd packages/api && pnpm vitest run test/services`. **라우터 테스트 실행 금지.**
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 4: 자동 끌올 틱 확장

**Files:**
- Modify: `packages/api/src/services/bambi-auto-boost.ts`
- Test: `packages/api/test/services/bambi-auto-boost.test.ts` (pure 부분이 있으면 확장 — DB 의존 로직은 테스트 비대상)

**Interfaces:**
- Consumes: Task 1 `jobBoostPurchase`, Task 2 `isBoostPurchaseActive`·`sumActivePeriodBoostsPerDay`
- Produces: `runAutoBoostTick` 시그니처 불변(호출부 무변경)

- [ ] **Step 1: 후보 확장** — `runAutoBoostTick`의 후보 쿼리를 두 갈래 union으로:
  - (a) 기존: `autoBoostsPerDay > 0` ∧ 리스팅형 ∧ published+paid ∧ 노출 유효
  - (b) 활성 auto_period 구매 보유 공고: `jobBoostPurchase`에서 `optionType='auto_period'` ∧ `paymentStatus='paid'` ∧ `expiresAt > now`인 `jobPostId` 집합 → 해당 공고 중 published+paid ∧ **배너형 제외**(standard 포함 — `notInArray(jobPost.exposureType, AD_BANNER_EXPOSURE_TYPES)`) ∧ 노출 유효(무료는 exposureEndsAt null이라 통과)
  - 합집합(Map으로 dedupe)에 공고별 `effectiveAutoPerDay = 번들 + Σ활성 auto_period boostsPerDay`를 붙인다.
- [ ] **Step 2: 슬롯 판정 교체** — `getAutoBoostSlotOffsetMs`·`countDueAutoBoostSlots` 인자를 `effectiveAutoPerDay`로. **잠금 내 재확인도 tx 안에서 구매를 재조회해 같은 유효 횟수로 판정**(주석 "사전 필터와 재확인 판정이 일치해야 재확인이 의미 있다" 관례 유지). 자동 이벤트 insert는 기존 그대로(purchaseId 없음 — 자동 기간제는 차감 개념이 없다).
- [ ] **Step 3: 검증** — api check-types, `cd packages/api && pnpm vitest run test/services`.
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 5: 옵션 관리·구매 API (신규 라우터)

**Files:**
- Create: `packages/api/src/routers/bambi/boost-options.ts`
- Modify: bambi 라우터 index(다른 라우터가 등록되는 곳 — `promotionsRouter` 등록 위치와 같은 파일)에 `boostOptionsRouter` 등록

**Interfaces:**
- Consumes: Task 1 테이블, Task 2 헬퍼
- Produces (프로시저 — 웹 Task 7·8·10·11이 소비):
  - `listOptions`: publicProcedure → 판매 중(가격 not null) 옵션 배열 `{ optionType, price, boostsPerDay, durationDays, boostCount }`
  - `listOptionsByAdmin`: 운영자 전용 → 3유형 전체(미설정 유형은 기본값 null 행으로 합성해 항상 3개 반환)
  - `upsertOption`: 운영자 전용. input `{ optionType, price: int min0 nullable, boostsPerDay?, durationDays?, boostCount? }` — 판매(price not null) 시 유형별 필수 스펙 검증: 기간제는 `boostsPerDay ≥ 1 ∧ durationDays ≥ 1`, 횟수권은 `boostCount ≥ 1`(어긋나면 BAD_REQUEST 한국어 메시지). optionType unique upsert
  - `purchaseOption`: protectedProcedure. input `{ jobPostId: uuid, optionType, paymentMethod: "bank_transfer" | "card" }` → `{ id, amount }`
  - `cancelPurchase`: protectedProcedure. input `{ purchaseId: uuid }` — unpaid만 delete
  - `listPurchasesForPayment`: 운영자 전용. input `{ onlyUnpaid: boolean=false, limit: int 1..100=50 }` → 구매 행 + 공고 제목·업체 표시명 join, 최신순
  - `confirmPurchasePayment`: 운영자 전용. input `{ purchaseId: uuid, paymentStatus: "paid" | "unpaid" }`

- [ ] **Step 1: 라우터 작성** — 운영자 판별·감사 로그·알림은 `moderation.ts`의 `setJobPostDesignStatus`가 쓰는 관례(`requireAdminProfile`·`adminModerationAction` tx 내·커밋 후 알림)를 그대로 가져온다. 핵심 규칙:
  - `purchaseOption`: 공고 접근 권한은 `promotions.ts`의 boost 뮤테이션이 쓰는 공고 접근 판정과 동일 방식 재사용(조직/팀 관리 권한). 검증: 옵션 판매 중(가격 not null) / 공고 존재·deleted 아님 / **배너형 공고 거부**(BAD_REQUEST "배너 광고 공고에는 끌어올리기 옵션을 제공하지 않습니다.") / 같은 유형 unpaid 존재 → BAD_REQUEST "입금 확인 대기 중인 같은 옵션이 있습니다." / 기간제는 활성(paid·미만료) 동일 유형 존재 → BAD_REQUEST "이미 적용 중인 옵션입니다. 만료 후 다시 구매해 주세요."(횟수권은 잔여 있어도 허용). insert 시 옵션 스펙 4필드를 스냅샷.
  - `cancelPurchase`: 구매자 본인·공고 접근 권한 보유자·운영자만. `paymentStatus !== "unpaid"`면 BAD_REQUEST "입금 확인된 구매는 취소할 수 없습니다."
  - `confirmPurchasePayment`: tx에서 행 잠금 조회 → `paid` 전환 시 `activatedAt = now`, 기간제 `expiresAt = now + durationDays일`(`MS_PER_DAY` 관례), 횟수권 `remainingCount = boostCount`. `unpaid` 되돌림 시 세 필드 null 리셋(오확인 정정 — 이미 차감된 횟수권을 paid로 재전환하면 remainingCount가 초기화되므로, **remainingCount가 boostCount보다 작은(사용 흔적) 행의 unpaid 되돌림은 BAD_REQUEST**로 막는다). 감사 로그 action `set_boost_purchase_payment:{status}` tx 내, 커밋 후 구매자에게 알림(targetType `job_post`, metadata에 optionType).
- [ ] **Step 2: 라우터 등록** — index에 `boostOptions: boostOptionsRouter`.
- [ ] **Step 3: 검증** — api check-types, ultracite. **라우터 테스트 작성·실행 금지**(dev DB 보호 — 검증 불가 로직은 이미 Task 2 pure에 있다).
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 6: jobs.ts 등록·수정 배선

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` — create·update 핸들러, 구인자 편집 조회 프로시저(수정 폼이 기존 공고를 로드하는 곳)

**Interfaces:**
- Consumes: Task 1 테이블, Task 5의 검증 규칙(동일 규칙을 core 헬퍼로 공유해도 좋고 중복이 8줄 이내면 인라인 허용)
- Produces:
  - `create`·`update` input에 `boostOptionTypes: z.array(z.enum(["manual_period","manual_count","auto_period"])).max(3).default([])`(중복 값 거부), `boostOptionPaymentMethod: z.enum(["bank_transfer","card"]).optional()`
  - 구인자 편집 조회 반환에 `boostPurchases: { id, optionType, paymentStatus, expiresAt, remainingCount, amount }[]` 추가

- [ ] **Step 1: create 배선** — 공고 insert와 **같은 트랜잭션**에서, `boostOptionTypes` 각각에 대해 Task 5와 동일 검증(판매 중·배너형 거부 — 선택 상품의 노출 유형으로 판정) 후 `jobBoostPurchase` insert. `paymentMethod`: 유료 공고면 공고 결제수단, 무료 공고면 `boostOptionPaymentMethod`(옵션 있는데 없으면 BAD_REQUEST "결제수단을 선택해 주세요."). 무료 공고의 즉시 게시(paymentStatus "paid")는 그대로 — 옵션 unpaid가 공고 게시를 막지 않는다(주석 명시).
- [ ] **Step 2: update 배선** — `moderatorEdit` 경로는 **완전 동결**(디자인 제작과 동일: input을 무시). 구인자 경로: tx에서 기존 구매 로드 → `boostOptionTypes`에 없는 유형의 **unpaid 구매 delete**(체크 해제=취소), 새로 나타난 유형은 Step 1과 동일 검증 후 insert. paid·활성 구매는 input과 무관하게 불변(체크 고정은 폼 몫).
- [ ] **Step 3: 편집 조회 확장** — 수정 폼 로드 프로시저에 `boostPurchases` 배열 추가(해당 공고 전체, createdAt 순).
- [ ] **Step 4: drizzle 함정 확인** — create/update의 `...jobInput` 스프레드에 `boostOptionTypes`·`boostOptionPaymentMethod`가 새어들지 않도록 **destructure로 분리**(디자인 제작 `detailDesignRequested` 분리와 같은 자리·같은 패턴 — 비컬럼 필드가 스프레드에 섞이면 런타임 오류).
- [ ] **Step 5: 검증** — api check-types, ultracite. 라우터 테스트 픽스처(`test/routers/bambi/*.test.ts`)가 create input 확장으로 깨질 타입이면 파일만 갱신하고 **실행 금지**.
- [ ] **Step 6: 컨트롤러에 보고**

---

### Task 7: 웹 라벨·포매터 (선행 공유 모듈)

**Files:**
- Create: `apps/web/src/lib/bambi/boost-options.ts`
- Modify: `apps/web/src/lib/bambi/notification-labels.ts`

**Interfaces (Produces — Task 8·9·10·11이 소비):**
```ts
export type JobBoostOptionTypeKey = "auto_period" | "manual_count" | "manual_period";
export const JOB_BOOST_OPTION_TYPE_LABELS: Record<JobBoostOptionTypeKey, string> = {
	auto_period: "자동 끌어올리기",
	manual_count: "끌어올리기 횟수권",
	manual_period: "끌어올리기",
};
// "하루 2회 · 30일" / "10회 충전" 형태 요약(null 스펙은 항목 생략)
export const formatBoostOptionSpec: (option: {
	boostCount: null | number;
	boostsPerDay: null | number;
	durationDays: null | number;
	optionType: JobBoostOptionTypeKey;
}) => string;
```

- [ ] **Step 1: 라벨·포매터 작성** — enum 원값 노출 금지 규칙의 라벨 맵. 가격 표기는 기존 `formatAdPrice`(`@/lib/bambi/ad-catalog`)를 소비처에서 쓰므로 여기선 스펙 요약만.
- [ ] **Step 2: 알림 라벨** — `notification-labels.ts`에 Task 5 알림 action(`set_boost_purchase_payment:paid`·`:unpaid`) 라벨 추가(기존 `set_detail_design_status` 라벨 항목과 같은 형식): "끌어올리기 옵션 결제가 확인되었습니다." / "끌어올리기 옵션 결제가 미결제로 변경되었습니다."
- [ ] **Step 3: 검증** — web check-types, ultracite.
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 8: 운영자 옵션 관리 UI

**Files:**
- Modify: `apps/web/src/app/moderator/ad-products/page.tsx` (목록 페이지에 섹션 추가 — 페이지 구조상 더 알맞은 하위 컴포넌트가 있으면 거기)
- Create: `apps/web/src/components/bambi/boost-option-settings.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.boostOptions.listOptionsByAdmin` / `upsertOption`(Task 5), Task 7 라벨·포매터

- [ ] **Step 1: 섹션 컴포넌트** — Card("끌어올리기 옵션") 안에 3유형 각 1행: 라벨 + 가격 Input + 유형별 스펙 Input(기간제: 하루 횟수·적용 일수 / 횟수권: 충전 횟수) + 저장 버튼. 빈 가격 입력 = null = 미판매(디자인 제작 가격 입력의 `toPriceInput`/`fromPriceInput` 헬퍼 관례 재사용 또는 동일 패턴). 저장 성공 sonner toast, 실패는 서버 한국어 메시지 노출. 반응형: 모바일에서 필드 세로 스택.
- [ ] **Step 2: 페이지 배선** — ad-products 페이지 상단(상품 목록 위 또는 아래 일관된 위치)에 섹션 삽입.
- [ ] **Step 3: 검증** — web check-types, ultracite. 스크린샷·dev 서버 금지(시각 확인은 사용자).
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 9: 공고 등록·수정 폼 UI

**Files:**
- Modify: `apps/web/src/lib/bambi-job-form.ts` — `JobForm`·`JobPostInput`·`validateJobForm`
- Modify: `apps/web/src/components/bambi/job-exposure-fields.tsx` — 옵션 피커·총액 합산
- Modify: `apps/web/src/app/employer/new/page.tsx`, `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` — 배선·무통장 안내 합산

**Interfaces:**
- Consumes: `orpc.bambi.boostOptions.listOptions`, Task 6 input 확장(`boostOptionTypes`·`boostOptionPaymentMethod`)·편집 조회 `boostPurchases`, Task 7 라벨, `sumJobPaymentAmount`(`@bambi-app/api/services/bambi-job-detail-design` — 웹 직접 import 선례)

- [ ] **Step 1: 폼 모델** — `JobForm`에 `boostOptionTypes: JobBoostOptionTypeKey[]`, `boostOptionPaymentMethod: "bank_transfer" | "card" | null`. `validateJobForm`: 무료 공고(광고 상품 미선택)에서 옵션이 있으면 결제수단 필수(에러 문구 "끌어올리기 옵션 결제수단을 선택해 주세요."), 옵션 없으면 null 강제. `JobPostInput`으로 그대로 흘린다.
- [ ] **Step 2: 옵션 피커** — `job-exposure-fields.tsx`의 디자인 제작 체크박스(`DetailDesignOption`) 아래에 `BoostOptionsPicker`: `listOptions` 조회, 판매 중 옵션별 체크박스 + "라벨 · 스펙요약 · +N원". **배너형 상품 선택 시 전체 미노출.** 수정 폼: `boostPurchases` prop으로 paid·활성 유형은 체크 고정+disabled(+"이미 적용 중인 옵션이에요"), unpaid 유형은 해제 가능(+"해제하면 입금 대기 건이 취소돼요" 캡션). 무료 공고+옵션 선택 시 결제수단 선택(기존 폼의 card/bank_transfer 선택 UI와 같은 컴포넌트 관례) 노출.
- [ ] **Step 3: 총액 합산** — `PayableTotal`·무통장 안내(`BankTransferGuide amount`)에 선택 옵션 금액 합산: `sumJobPaymentAmount(기존 총액, 옵션 합)` 또는 단순 합(옵션 합은 `listOptions` 가격에서 계산). `new/page.tsx`의 `pendingBankNoticeRef` 금액에도 옵션 합 포함(무료 공고에서 옵션만 무통장이면 등록 완료 다이얼로그가 떠야 한다 — 유료 조건(`jobInput.adProductId && bank_transfer`)을 "유료 공고 무통장 ∨ (옵션 있음 ∧ 옵션 결제수단 무통장)"으로 확장).
- [ ] **Step 4: 검증** — web check-types, `pnpm vitest run --config apps/web/vitest.config.ts`(bambi-job-form 기존 테스트 확장: 무료+옵션 결제수단 필수·옵션 없으면 null 강제 2케이스 추가), ultracite.
- [ ] **Step 5: 컨트롤러에 보고**

---

### Task 10: 광고 관리(promotions) UI — 상태 표시·추가 구매

**Files:**
- Modify: `apps/web/src/app/employer/promotions/page.tsx`
- Create: `apps/web/src/components/bambi/boost-option-purchase-dialog.tsx`

**Interfaces:**
- Consumes: Task 3 `listMyAds` 확장 필드(`boostOptionManualPerDay`·`boostOptionAutoPerDay`·`boostCountRemaining`·`hasUnpaidBoostOption`), Task 5 `listOptions`·`purchaseOption`·`cancelPurchase`, Task 7 라벨, `BankTransferGuide`

- [ ] **Step 1: 행 표시** — `AdListItem`에 확장 필드 추가. 상태 셀 또는 끌올 셀에 뱃지: "수동 +N/일", "자동 +N/일", "횟수권 N회", unpaid 있으면 "옵션 입금 대기". 무료 공고 행도 이제 목록에 온다(Task 3) — 광고 전용 표기(상품명 등)는 null 허용 렌더 확인.
- [ ] **Step 2: 구매 다이얼로그** — 행 버튼 "끌올 옵션 구매"(배너형 행 미노출) → Dialog: `listOptions` 목록에서 라디오 선택(라벨·스펙·가격), 구매 불가 사유는 서버 BAD_REQUEST 메시지를 toast로(사전 비활성화까지는 하지 않는다 — 정본은 서버). 결제수단 선택(card/bank_transfer) + bank_transfer면 `BankTransferGuide amount={선택 옵션 가격}`. 구매 성공 시 toast "옵션 구매가 접수됐어요. 입금 확인 후 적용됩니다." + `listMyAds` invalidate. 다이얼로그에 내 unpaid 구매 목록과 "취소" 버튼(`cancelPurchase`)도 함께.
- [ ] **Step 3: 검증** — web check-types, ultracite.
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 11: 운영자 결제 관리 — 옵션 구매 섹션

**Files:**
- Modify: `apps/web/src/app/moderator/payments/page.tsx`

**Interfaces:**
- Consumes: Task 5 `listPurchasesForPayment`·`confirmPurchasePayment`·`cancelPurchase`, Task 7 라벨·포매터

- [ ] **Step 1: 섹션 추가** — 기존 공고 결제 목록 아래 "끌어올리기 옵션 결제" 섹션: raw shadcn Table(라이브러리 금지)로 공고 제목·업체·옵션 라벨·스펙 요약·금액(`formatAdPrice`)·결제수단·상태·구매일. `onlyUnpaid` 스위치(기존 필터 스위치 패턴 재사용).
- [ ] **Step 2: 액션** — 행별: unpaid → "입금 확인"(`confirmPurchasePayment paid`)·"취소"(`cancelPurchase`), paid → "미결제로"(`confirmPurchasePayment unpaid` — 서버가 사용 흔적 있으면 거부, 메시지 toast). 성공 시 목록 invalidate.
- [ ] **Step 3: 검증** — web check-types, ultracite.
- [ ] **Step 4: 컨트롤러에 보고**

---

### Task 12: 광고 안내·매뉴얼

**Files:**
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx`
- Modify: `docs/manual/employer-manual.md`, `docs/manual/moderator-manual.md`

**Interfaces:**
- Consumes: Task 5 `listOptions`, Task 7 라벨·포매터

- [ ] **Step 1: ad-guide 섹션** — 상품 카드 목록 아래(디자인 제작 안내 라인 관례 참고) "끌어올리기 옵션" 안내 블록: 판매 중 옵션별 "라벨 · 스펙 요약 · N원", "일반 구인 공고도 구매할 수 있어요" 한 줄. 판매 중 옵션이 없으면 블록 미노출.
- [ ] **Step 2: 매뉴얼** — employer: 옵션 3종 소개·구매 위치(공고 등록 폼·광고 관리)·입금 후 적용·횟수권 차감 규칙(하루 제공량 소진 후 차감) — 실제 UI 문구와 대조해 작성. moderator: 옵션 가격 관리 위치(광고 상품 관리)·결제 관리의 옵션 섹션·입금 확인/취소 절차.
- [ ] **Step 3: 검증** — web check-types, ultracite(ad-guide만).
- [ ] **Step 4: 컨트롤러에 보고**

---

## 실행 순서·병렬성 (파일 소유권 서로소)

1. **T1** (스키마) → **T2+T3 연속**(같은 함수의 정의·호출 — 중간 상태 빨간 것 정상)
2. T3 후: **T4·T5·T7 병렬**(bambi-auto-boost.ts / boost-options.ts+index / web lib — 서로소)
3. T5 후: **T6**(jobs.ts) · **T8**(ad-products UI) · **T11**(payments UI) 병렬
4. T6 후: **T9**(공고 폼) / T3·T5·T7 후: **T10**(promotions UI) — T9와 T10은 서로소라 병렬 가능
5. 마지막: **T12**
- 커밋은 컨트롤러가 태스크별 파일만 순차로. 리뷰는 커밋 범위 diff 기준(병렬 워킹트리 오염 배제).

## 마이그레이션·배포 메모

- 0080 적용 전에는 옵션 관리·구매 insert가 실패한다(디자인 제작 0078·0079와 동일한 배포 선행). migrate는 사용자 지시 시에만, 적용 후 information_schema 검증.
- develop 병합 시 `_journal.json` 번호 충돌 확인(기존 함정 기록 참조).
