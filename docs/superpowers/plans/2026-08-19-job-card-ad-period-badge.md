# 공고 카드 광고기간·누적 광고일수 배지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구직자 마켓플레이스의 유료 광고 카드에 해당 업소(조직)의 누적 광고 결제 "N회 N일"과 누적 일수 등급 아이콘을 배지로 표시한다.

**Architecture:** 결제 확정(unpaid→paid) 시점에 `job_ad_purchase` 원장 1행을 append-only로 쌓고(운영자 개별·벌크 결제 두 분기 + 기존 paid 공고 백필), `jobs.list`가 노출된 유료 섹션의 조직들을 1회 group by 집계해 각 카드 아이템에 `adPeriod: { count, totalDays } | null`을 부착한다. 웹은 순수 lib(`ad-period.ts`)의 5구간 티어 정의를 카드 배지와 구인자 광고 안내 등급표가 함께 재사용한다.

**Tech Stack:** Drizzle ORM(pg) · oRPC · Next.js(React 19, RSC) · shadcn/base-ui + Tailwind v4 · Vitest · lucide-react

**Spec:** docs/superpowers/specs/2026-08-19-job-card-ad-period-badge-design.md

## Global Constraints

- 빌드·dev 서버 실행 금지(HMR 자동 반영). 검증은 ultracite 린트 + 각 패키지 check-types만. 시각 확인은 사용자.
- `db:push` 절대 금지. 마이그레이션은 `db:generate`로 생성하고 백필 SQL만 수동 추가. `db:migrate`는 사용자 명시 지시 시에만.
- **라우터 테스트 스위트(`packages/api/test/routers/**`)는 절대 실행 금지** — dev DB를 지운다. api 테스트는 `test/services`만 파일 경로를 지정해 실행.
- shadcn 컴포넌트 최대 재사용(배지=`Badge`/`ds.tsx` 패턴), 인라인 `style` 금지, raw hex/oklch 금지, 조건부 클래스는 `cn()`.
- 임의 px(`[Npx]`) 지양·Tailwind 스케일 토큰 우선. 단 폰트 크기는 `visual-job-card.tsx`가 이미 `text-[15px]`·`text-[10px]`를 쓰는 파일 로컬 관행이 있어 배지 텍스트는 `text-[11px]`로 그 관행을 따른다.
- enum 원값 화면 노출 금지(`*_LABELS`/라벨 맵 경유). 새 등급 라벨은 `ad-period.ts` 티어 정의에 동봉.
- 새 npm 의존성 추가 금지(lucide-react는 이미 설치됨). 줄바꿈 LF.
- DB 테이블·id 생성 방식은 `packages/db/src/schema/bambi.ts`의 `jobBoostPurchase`를 그대로 복사(`uuid("id").defaultRandom().primaryKey()`, `organization_id`는 `text`).
- 모바일 반응형: 카드 1열에서도 급여 행 오른쪽 끝 배지 배치 유지. **새 행 추가 금지**(카드 높이 118px 결합 3곳 보호).
- 커밋은 컨트롤러가 순차 수행. 각 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음).

---

## Task 1 — DB: `job_ad_purchase` 테이블 + 백필 마이그레이션

조직 단위 누적 광고 결제 이력을 담는 append-only 원장을 신설한다.

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` — `jobBoostPurchase` 테이블 정의 바로 뒤(현재 ~L1190, `adPlacement` 정의 앞)에 `jobAdPurchase` 추가.
- Create: `packages/db/src/migrations/0097_*.sql` — `db:generate`가 생성(다음 번호는 0097, 저널 마지막 idx 96 확인됨). 생성 후 백필 SQL을 수동 추가.
- Auto-modified: `packages/db/src/migrations/meta/_journal.json`, `packages/db/src/migrations/meta/0097_snapshot.json` — generate가 갱신.

**Interfaces:**
- Produces: `jobAdPurchase` (pgTable) — 컬럼 `id: uuid PK`, `organizationId: text NOT NULL FK→organization(cascade)`, `jobPostId: uuid NOT NULL FK→jobPost(cascade)`, `adProductId: uuid FK→adProduct(set null)`, `durationDays: integer NOT NULL`, `amount: integer NOT NULL`, `source: text`, `createdAt: timestamp NOT NULL default now`. 인덱스 2개(organizationId, jobPostId).

**Steps:**

- [ ] **스키마에 테이블 추가.** `packages/db/src/schema/bambi.ts`의 `jobBoostPurchase` 테이블 정의(닫는 `);`, 현재 L1190) 바로 뒤에 삽입:

```ts
// 유료 광고(노출 상품) 결제 확정 1건의 이력. job_post의 exposure_* 컬럼은 재결제·기간 변경
// 시 덮어써져 누적 이력이 남지 않으므로, 조직 단위 누적 광고 횟수·일수 집계를 위해 결제
// 확정 시점 스냅샷을 여기에 append-only로 쌓는다(job_boost_purchase와 같은 철학, 별도 축).
export const jobAdPurchase = pgTable(
	"job_ad_purchase",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		// 결제 시점의 노출 상품. 상품이 지워져도 이력은 남아야 하므로 set null.
		adProductId: uuid("ad_product_id").references(() => adProduct.id, {
			onDelete: "set null",
		}),
		// 구매한 광고 기간(일) 스냅샷 — 재결제로 job_post가 덮여도 이 값은 고정.
		durationDays: integer("duration_days").notNull(),
		// 결제 금액 스냅샷.
		amount: integer("amount").notNull(),
		// 적재 출처: moderation_single / moderation_bulk / backfill.
		source: text("source"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_ad_purchase_organization_id_idx").on(table.organizationId),
		index("job_ad_purchase_job_post_id_idx").on(table.jobPostId),
	]
);
```

- [ ] **마이그레이션 생성 실행(생성만, 적용 금지).**

```bash
pnpm --filter @bambi-app/db db:generate
```

- [ ] **생성된 `0097_*.sql` 끝에 백필 SQL을 수동 추가.** 생성된 `CREATE TABLE`·`ADD CONSTRAINT`·`CREATE INDEX` 뒤에 `--> statement-breakpoint`로 구분해 붙인다(기존 paid + 유료 광고 공고를 1행씩 적재):

```sql
--> statement-breakpoint
INSERT INTO "job_ad_purchase" ("organization_id", "job_post_id", "ad_product_id", "duration_days", "amount", "source", "created_at")
SELECT
	"organization_id",
	"id",
	"ad_product_id",
	COALESCE("exposure_duration_days", 0),
	COALESCE("exposure_amount", 0),
	'backfill',
	COALESCE("listing_paid_at", "published_at", "created_at")
FROM "job_post"
WHERE "payment_status" = 'paid' AND "ad_product_id" IS NOT NULL;
```

- [ ] **저널·스냅샷 정합 확인(적용 아님, 파일 검사).** `packages/db/src/migrations/meta/_journal.json`의 마지막 항목 `idx`가 97·`tag`가 `0097_*`인지, `meta/0097_snapshot.json`이 생성됐는지, `0097_*.sql`에 `CREATE TABLE "job_ad_purchase"`와 위 백필 INSERT가 모두 들어갔는지 확인한다.

- [ ] **타입체크.**

```bash
pnpm --filter @bambi-app/db check-types
```

- [ ] **커밋.**

```
feat: 조직 단위 누적 광고 이력 테이블 신설
- job_ad_purchase 테이블 추가(organization_id·job_post_id·ad_product_id·duration_days·amount·source·created_at)
- 조직·공고 인덱스 2종 추가로 집계 키 조회 최적화
- 0097 마이그레이션 생성 후 기존 paid+유료 광고 공고 백필 SQL 수동 추가
- 백필은 duration_days=coalesce(exposure_duration_days,0)·created_at=coalesce(listing_paid_at,published_at,created_at)·source='backfill'
- db:push/db:migrate는 하지 않음(운영 migrate는 배포 체크리스트로 이관)
```

---

## Task 2 — 원장 적재 서비스 함수(순수) + 단위 테스트

DB를 직접 건드리지 않는 순수 매핑 함수로 분리해, 호출부는 반환값이 있을 때만 insert 한다(테스트 용이·router suite 회피).

**Files:**
- Create: `packages/api/src/services/bambi-ad-ledger.ts`
- Create: `packages/api/test/services/bambi-ad-ledger.test.ts`

**Interfaces:**
- Produces: `buildAdLedgerInsert(jobPostId: string, job: AdLedgerJobPost, source: AdLedgerSource): AdLedgerInsert | null`
  - `AdLedgerJobPost = { organizationId: string; adProductId: string | null; exposureDurationDays: number | null; exposureAmount: number | null }`
  - `AdLedgerSource = "moderation_single" | "moderation_bulk"`
  - `AdLedgerInsert = { organizationId: string; jobPostId: string; adProductId: string; durationDays: number; amount: number; source: AdLedgerSource }`
  - `adProductId`가 null(무료 공고)이면 `null` 반환(적재 제외).

**Steps:**

- [ ] **실패 테스트 작성.** `packages/api/test/services/bambi-ad-ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildAdLedgerInsert } from "@/services/bambi-ad-ledger";

const paidAdJob = {
	organizationId: "org-1",
	adProductId: "prod-1",
	exposureDurationDays: 30,
	exposureAmount: 50_000,
};

describe("buildAdLedgerInsert", () => {
	it("무료 공고(adProductId null)는 적재하지 않는다", () => {
		expect(
			buildAdLedgerInsert(
				"job-1",
				{ ...paidAdJob, adProductId: null },
				"moderation_single"
			)
		).toBeNull();
	});

	it("유료 광고 공고는 결제 스냅샷 1행을 만든다", () => {
		expect(
			buildAdLedgerInsert("job-1", paidAdJob, "moderation_single")
		).toEqual({
			organizationId: "org-1",
			jobPostId: "job-1",
			adProductId: "prod-1",
			durationDays: 30,
			amount: 50_000,
			source: "moderation_single",
		});
	});

	it("기간·금액이 null이면 0으로 채운다(count는 유지)", () => {
		const row = buildAdLedgerInsert(
			"job-2",
			{
				organizationId: "org-2",
				adProductId: "prod-2",
				exposureDurationDays: null,
				exposureAmount: null,
			},
			"moderation_bulk"
		);
		expect(row).toMatchObject({ durationDays: 0, amount: 0, source: "moderation_bulk" });
	});
});
```

- [ ] **실패 확인 실행.**

```bash
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-ad-ledger.test.ts
```

- [ ] **최소 구현.** `packages/api/src/services/bambi-ad-ledger.ts`:

```ts
// 유료 광고(노출 상품) 결제 확정 시 조직 단위 누적 집계용 원장(job_ad_purchase) 1행을 만든다.
// unpaid→paid 전환 분기에서 호출한다. DB를 건드리지 않는 순수 매핑이라, 호출부가 반환값이
// 있을 때만 tx.insert 한다(무료 공고는 adProductId가 null이라 적재 대상이 아니므로 null).

export type AdLedgerSource = "moderation_bulk" | "moderation_single";

export interface AdLedgerJobPost {
	adProductId: null | string;
	exposureAmount: null | number;
	exposureDurationDays: null | number;
	organizationId: string;
}

export interface AdLedgerInsert {
	adProductId: string;
	amount: number;
	durationDays: number;
	jobPostId: string;
	organizationId: string;
	source: AdLedgerSource;
}

export const buildAdLedgerInsert = (
	jobPostId: string,
	job: AdLedgerJobPost,
	source: AdLedgerSource
): AdLedgerInsert | null => {
	if (!job.adProductId) {
		return null;
	}

	return {
		adProductId: job.adProductId,
		amount: job.exposureAmount ?? 0,
		durationDays: job.exposureDurationDays ?? 0,
		jobPostId,
		organizationId: job.organizationId,
		source,
	};
};
```

- [ ] **통과 확인 실행.**

```bash
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-ad-ledger.test.ts
```

- [ ] **커밋.**

```
feat: 광고 결제 원장 적재 매핑 서비스 추가
- buildAdLedgerInsert 순수 함수로 job_ad_purchase insert 값 생성
- adProductId 없는 무료 공고는 null 반환(적재 제외)
- 기간·금액 null은 0으로 채워 count는 유지(백필 정직성과 동일)
- test/services 단위 테스트 추가(라우터 스위트 미실행)
```

---

## Task 3 — 운영자 결제 확정 두 분기에 원장 적재 배선

`setJobPostPayment`(개별)·`bulkSetJobPostPayment`(벌크)의 unpaid→paid 전환 트랜잭션 안에서 원장을 insert한다. same-status 멱등 가드가 이미 있어 같은 전환은 두 번 적재되지 않는다.

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`
  - import: 스키마 import 블록(~L24-32)에 `jobAdPurchase` 추가, 상단 서비스 import에 `buildAdLedgerInsert` 추가.
  - 개별: `setJobPostPayment` 트랜잭션 내 `jobPost` update 직후(~L2455 `returning()` + `if (!row)` 뒤, `return { changed: true, ... }` 앞).
  - 벌크: `bulkSetJobPostPayment`의 `processTarget` select(~L3086)에 `adProductId`·`exposureAmount` 컬럼 추가, `jobPost` update 직후(~L3152 `.where(...)` 뒤, `affectedOrganizationIds.add(...)` 앞).

**Interfaces:**
- Consumes: `buildAdLedgerInsert` (Task 2), `jobAdPurchase` (Task 1). 개별 분기의 `existing`은 `tx.select().from(jobPost)` 전체 행(adProductId·exposureDurationDays·exposureAmount·organizationId 포함). 벌크의 `existing`은 좁힌 select라 두 컬럼을 추가해야 `AdLedgerJobPost` 형태를 만족.
- Produces: 같은 트랜잭션 내 `tx.insert(jobAdPurchase)`.

**Steps:**

- [ ] **import 추가.** `moderation.ts` 스키마 import 블록에 `jobAdPurchase,` 추가(알파벳 정렬 위치: `jobBoostPurchase` 앞). 서비스 import에 다음 줄 추가:

```ts
import { buildAdLedgerInsert } from "../../services/bambi-ad-ledger";
```

- [ ] **개별 분기 적재.** `setJobPostPayment`에서 `const [row] = await tx.update(jobPost)...returning();`과 `if (!row) { throw new ORPCError("NOT_FOUND"); }` 뒤, `return { changed: true, organizationId: existing.organizationId, updated: row };` 앞에 삽입:

```ts
// unpaid→paid 전환일 때만 조직 누적 원장에 append. 무료(adProductId null) 공고는 제외한다.
// same-status는 위에서 이미 단락돼(changed=false) 여기 도달하지 않으므로 자연 멱등.
if (input.paymentStatus === "paid") {
	const ledgerRow = buildAdLedgerInsert(
		input.jobPostId,
		existing,
		"moderation_single"
	);
	if (ledgerRow) {
		await tx.insert(jobAdPurchase).values(ledgerRow);
	}
}
```

- [ ] **벌크 select 컬럼 보강.** `bulkSetJobPostPayment`의 `processTarget` 내 `tx.select({ ... })`(현재 exposureDurationDays·exposureType·organizationId·paymentStatus·pointsRefundLockedAt·pointsUsed)에 두 줄 추가:

```ts
						adProductId: jobPost.adProductId,
						exposureAmount: jobPost.exposureAmount,
```

- [ ] **벌크 분기 적재.** 같은 `processTarget`의 `await tx.update(jobPost).set({...}).where(eq(jobPost.id, jobPostId));` 뒤, `affectedOrganizationIds.add(existing.organizationId);` 앞에 삽입:

```ts
				if (input.paymentStatus === "paid") {
					const ledgerRow = buildAdLedgerInsert(
						jobPostId,
						existing,
						"moderation_bulk"
					);
					if (ledgerRow) {
						await tx.insert(jobAdPurchase).values(ledgerRow);
					}
				}
```

- [ ] **타입체크(라우터 테스트는 실행하지 않는다).**

```bash
pnpm --filter @bambi-app/api check-types
```

- [ ] **커밋.**

```
feat: 운영자 결제 확정 시 광고 원장 적재
- setJobPostPayment(개별)·bulkSetJobPostPayment(벌크) paid 전환 트랜잭션에서 job_ad_purchase insert
- 벌크 select에 adProductId·exposureAmount 추가해 원장 스냅샷 구성
- same-status 멱등 가드로 같은 전환 이중 적재 방지, 무료 공고는 적재 제외
- 라우터 테스트 스위트는 dev DB 삭제 위험으로 미실행(타입체크만)
```

---

## Task 4 — API: `jobs.list` 응답에 `adPeriod` 부착

노출된 유료 섹션(스페셜·급구·추천)의 조직들을 1회 group by 집계해 각 카드 아이템에 `adPeriod`를 부착한다. organic·수집·search·legacyList·네이티브는 제외.

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts`
  - import: 스키마 import 블록(L3-16)에 `jobAdPurchase` 추가.
  - `list` 핸들러: `const performanceByJobId = ...`(~L1578-1581) 뒤, `toListItem` 정의(L1582) 앞에 집계 삽입. `toListItem` 반환 객체에 `adPeriod` 추가.

**Interfaces:**
- Consumes: `jobAdPurchase` (Task 1), 이미 import된 `sql`·`inArray`. `result.sections.special/urgent/recommended`(ExposureJobRow, `organizationId: string`).
- Produces: `toListItem` 결과에 `adPeriod: { count: number; totalDays: number } | null`. `inPaidSection`이고 아이템에 문자열 `organizationId`가 있으며 원장 집계가 존재할 때만 값, 그 외 null.

**Steps:**

- [ ] **import 추가.** `jobs.ts` 스키마 import 블록에 `jobAdPurchase,` 추가(`jobIndustryCategory` 앞).

- [ ] **집계 삽입.** `const performanceByJobId = await getRecentJobPerformanceMetrics(performanceJobIds, now);` 뒤에 삽입:

```ts
		// 유료 광고 섹션(스페셜·급구·추천) 카드에 붙일 조직 단위 누적 광고 집계(횟수·일수).
		// 노출된 유료 밤비 공고의 조직만 모아 job_ad_purchase를 1회 group by 한다 —
		// organic·수집 행은 유료 자리가 아니라 대상이 아니다(빈 org 집합이면 쿼리 생략).
		const paidSectionOrgIds = [
			...new Set(
				[
					...result.sections.special,
					...result.sections.urgent,
					...result.sections.recommended,
				].map((item) => item.organizationId)
			),
		];
		const adPeriodRows =
			paidSectionOrgIds.length > 0
				? await db
						.select({
							organizationId: jobAdPurchase.organizationId,
							count: sql<number>`count(*)::int`,
							totalDays: sql<number>`coalesce(sum(${jobAdPurchase.durationDays}), 0)::int`,
						})
						.from(jobAdPurchase)
						.where(inArray(jobAdPurchase.organizationId, paidSectionOrgIds))
						.groupBy(jobAdPurchase.organizationId)
				: [];
		const adPeriodByOrg = new Map(
			adPeriodRows.map((row) => [
				row.organizationId,
				{ count: row.count, totalDays: row.totalDays },
			])
		);
```

- [ ] **`toListItem`에 adPeriod 추가.** `toListItem` 반환 객체(`performance:` 뒤)에 필드 추가:

```ts
			// 유료 카드만·문자열 organizationId가 있을 때만 집계를 붙인다(수집 행은 organizationId
			// 가 null이라 자연히 제외, organic은 inPaidSection=false라 제외).
			adPeriod:
				inPaidSection &&
				"organizationId" in item &&
				typeof item.organizationId === "string"
					? (adPeriodByOrg.get(item.organizationId) ?? null)
					: null,
```

- [ ] **타입체크(라우터 테스트 미실행).**

```bash
pnpm --filter @bambi-app/api check-types
```

- [ ] **커밋.**

```
feat: jobs.list 응답에 조직 누적 광고 집계 부착
- 노출된 유료 섹션 조직들을 모아 job_ad_purchase 1회 group by(count·sum days)
- toListItem에 adPeriod: { count, totalDays } | null 부착
- 유료 카드·문자열 organizationId일 때만 값, 수집·organic·search는 제외
- 빈 조직 집합이면 집계 쿼리 자체를 생략
```

---

## Task 5 — 웹: 누적 광고일수 등급 lib(순수) + 단위 테스트

카드 배지와 구인자 안내 등급표가 공유하는 5구간 티어 정의·포맷을 순수 lib으로 둔다(`job-hit.ts` 선례).

**Files:**
- Create: `apps/web/src/lib/bambi/ad-period.ts`
- Create: `apps/web/test/lib/bambi/ad-period.test.ts`

**Interfaces:**
- Produces:
  - `AD_PERIOD_TIERS: readonly AdPeriodTier[]` — 5구간(≤90 / 91–180 / 181–360 / 361–720 / ≥721), 각 `{ icon: "crown" | "medal"; colorClass; label; minDays; maxDays: number | null }`.
  - `adPeriodTier(totalDays: number): AdPeriodTier`
  - `formatAdPeriod({ count, totalDays }: { count: number; totalDays: number }): string` → `"22회 900일"`
  - `formatAdPeriodTierRange(tier: AdPeriodTier): string` → `"누적 91~180일"` / `"누적 721일 이상"`

**Steps:**

- [ ] **실패 테스트 작성.** `apps/web/test/lib/bambi/ad-period.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	AD_PERIOD_TIERS,
	adPeriodTier,
	formatAdPeriod,
	formatAdPeriodTierRange,
} from "@/lib/bambi/ad-period";

describe("adPeriodTier", () => {
	it("0일·경계값을 올바른 티어로 매핑한다", () => {
		expect(adPeriodTier(0).label).toBe(AD_PERIOD_TIERS[0].label);
		expect(adPeriodTier(90).label).toBe(AD_PERIOD_TIERS[0].label);
		expect(adPeriodTier(91).label).toBe(AD_PERIOD_TIERS[1].label);
		expect(adPeriodTier(360).label).toBe(AD_PERIOD_TIERS[2].label);
		expect(adPeriodTier(361).label).toBe(AD_PERIOD_TIERS[3].label);
		expect(adPeriodTier(9999).label).toBe(AD_PERIOD_TIERS[4].label);
	});

	it("최상위 티어만 상한이 없다(crown·gold)", () => {
		expect(AD_PERIOD_TIERS.at(-1)?.maxDays).toBeNull();
		expect(adPeriodTier(721)).toMatchObject({ icon: "crown", colorClass: "text-amber-500" });
	});

	it("색 토큰은 raw hex가 아니라 Tailwind 유틸이다", () => {
		for (const tier of AD_PERIOD_TIERS) {
			expect(tier.colorClass).toMatch(/^text-/);
		}
	});
});

describe("formatAdPeriod", () => {
	it("N회 N일 포맷", () => {
		expect(formatAdPeriod({ count: 22, totalDays: 900 })).toBe("22회 900일");
	});

	it("totalDays 0이어도 포맷을 그대로 노출한다", () => {
		expect(formatAdPeriod({ count: 1, totalDays: 0 })).toBe("1회 0일");
	});
});

describe("formatAdPeriodTierRange", () => {
	it("범위·상한 없는 최상위를 문구로 만든다", () => {
		expect(formatAdPeriodTierRange(AD_PERIOD_TIERS[1])).toBe("누적 91~180일");
		expect(formatAdPeriodTierRange(AD_PERIOD_TIERS[4])).toBe("누적 721일 이상");
	});
});
```

- [ ] **실패 확인 실행.**

```bash
pnpm --filter web exec vitest run test/lib/bambi/ad-period.test.ts
```

- [ ] **최소 구현.** `apps/web/src/lib/bambi/ad-period.ts`:

```ts
// 조직 단위 누적 광고일수 등급 정의(카드 배지·구인자 안내 등급표 공유 소스). 순수 모듈이라
// 아이콘 컴포넌트를 import하지 않고 종류만 "medal"|"crown"으로 노출한다 — 렌더 레이어가
// 이 판별자로 lucide 아이콘을 고른다. 색은 Tailwind 토큰 유틸(raw hex/oklch 금지).

export interface AdPeriodTier {
	// 카드·안내가 이 값으로 lucide 아이콘을 고른다.
	icon: "crown" | "medal";
	// 티어 색(Tailwind 유틸).
	colorClass: string;
	// 등급 이름(등급표·툴팁).
	label: string;
	// 티어 최소 누적 일수(범위 라벨용).
	minDays: number;
	// 티어 최대 누적 일수. 최상위는 상한 없음(null).
	maxDays: null | number;
}

// 5구간: ≤90 / 91–180 / 181–360 / 361–720 / ≥721. 고정 하드코딩(운영자 설정화는 YAGNI).
export const AD_PERIOD_TIERS: readonly AdPeriodTier[] = [
	{ icon: "medal", colorClass: "text-amber-700", label: "브론즈", minDays: 0, maxDays: 90 },
	{ icon: "medal", colorClass: "text-slate-400", label: "실버", minDays: 91, maxDays: 180 },
	{ icon: "medal", colorClass: "text-amber-500", label: "골드", minDays: 181, maxDays: 360 },
	{ icon: "crown", colorClass: "text-slate-500", label: "플래티넘", minDays: 361, maxDays: 720 },
	{ icon: "crown", colorClass: "text-amber-500", label: "다이아", minDays: 721, maxDays: null },
];

// 누적 일수 → 티어. 배열이 상한 없는 최상위로 끝나 항상 매칭되지만, 타입 좁힘용 최저 폴백.
export const adPeriodTier = (totalDays: number): AdPeriodTier =>
	AD_PERIOD_TIERS.find(
		(tier) => tier.maxDays === null || totalDays <= tier.maxDays
	) ?? AD_PERIOD_TIERS[0];

// "22회 900일". totalDays가 0이어도(백필 기간 null 행) 정직하게 그대로 노출한다.
export const formatAdPeriod = ({
	count,
	totalDays,
}: {
	count: number;
	totalDays: number;
}): string =>
	`${count.toLocaleString("ko-KR")}회 ${totalDays.toLocaleString("ko-KR")}일`;

// 등급표 구간 문구. 최상위는 상한이 없어 "이상"으로 끝낸다.
export const formatAdPeriodTierRange = (tier: AdPeriodTier): string =>
	tier.maxDays === null
		? `누적 ${tier.minDays.toLocaleString("ko-KR")}일 이상`
		: `누적 ${tier.minDays.toLocaleString("ko-KR")}~${tier.maxDays.toLocaleString("ko-KR")}일`;
```

- [ ] **통과 확인 실행.**

```bash
pnpm --filter web exec vitest run test/lib/bambi/ad-period.test.ts
```

- [ ] **커밋.**

```
feat: 누적 광고일수 등급 lib 추가
- AD_PERIOD_TIERS 5구간(브론즈~다이아) 아이콘 종류·Tailwind 색 토큰·범위 정의
- adPeriodTier·formatAdPeriod·formatAdPeriodTierRange 순수 함수 추가
- 카드 배지와 구인자 광고 안내 등급표가 같은 티어 정의를 재사용하는 단일 소스
- test/lib 단위 테스트 추가(경계값·색 토큰·포맷)
```

---

## Task 6 — 웹 타입/매퍼/아이콘 배선

`adPeriod`를 API 응답 → `Job`까지 흘리고, 카드가 쓸 Medal/Crown 아이콘을 추가한다.

**Files:**
- Modify: `apps/web/src/components/bambi/icons.tsx` — lucide `Medal`·`Crown` import + `MedalIcon`·`CrownIcon` export.
- Modify: `apps/web/src/lib/bambi/types.ts` — `Job`(L52~)에 `adPeriod?` 필드.
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts` — `ApiMarketplaceJob`(L35~)에 `adPeriod?`, `toMarketplaceJob`(L190~) 반환에 `adPeriod` 매핑.
- Modify: `apps/web/test/lib/bambi/api-job-mapper.test.ts` — passthrough 테스트 추가.

**Interfaces:**
- Produces: `MedalIcon`·`CrownIcon` (LucideProps 컴포넌트), `Job.adPeriod?: { count: number; totalDays: number } | null`, `ApiMarketplaceJob.adPeriod?: { count: number; totalDays: number } | null`.

**Steps:**

- [ ] **아이콘 추가.** `icons.tsx`의 lucide import에 `Crown,`·`Medal,`를 알파벳 위치(각각 `Copy` 뒤·`LucideIcon` 앞)로 추가하고, export 목록에 추가:

```ts
export const CrownIcon = fill(Crown);
export const MedalIcon = fill(Medal);
```

- [ ] **Job 타입 필드 추가.** `types.ts`의 `interface Job` 안(알파벳 위치, `beginnerFriendly` 뒤)에:

```ts
	// 조직 단위 누적 광고 결제(횟수·누적 일수). 유료 광고 카드에만 값, 그 외 null/미정의.
	adPeriod?: { count: number; totalDays: number } | null;
```

- [ ] **ApiMarketplaceJob 필드 추가.** `api-job-mapper.ts`의 `interface ApiMarketplaceJob` 안(`beginnerFriendly` 앞, 알파벳 최상단)에:

```ts
	// jobs.list가 유료 카드에만 부착하는 조직 단위 누적 광고 집계. 그 외 경로(search·수집)엔 없음.
	adPeriod?: { count: number; totalDays: number } | null;
```

- [ ] **매퍼 passthrough.** `toMarketplaceJob` 반환 객체(`beginnerFriendly:` 앞)에:

```ts
		adPeriod: job.adPeriod ?? null,
```

- [ ] **매퍼 테스트 추가.** `api-job-mapper.test.ts`에 `describe("toMarketplaceJob adPeriod", ...)` 블록 추가:

```ts
describe("toMarketplaceJob adPeriod", () => {
	const base = {
		id: "22222222-2222-4222-8222-222222222222",
		industryCategory: "cafe",
		payAmount: 12_000,
		payUnit: "시급",
		region: "서울",
		status: "published",
		title: "카페 알바",
	} as Parameters<typeof toMarketplaceJob>[0];

	it("adPeriod가 있으면 그대로 흘린다", () => {
		expect(
			toMarketplaceJob({ ...base, adPeriod: { count: 22, totalDays: 900 } })
				.adPeriod
		).toEqual({ count: 22, totalDays: 900 });
	});

	it("adPeriod가 없으면 null로 채운다", () => {
		expect(toMarketplaceJob(base).adPeriod).toBeNull();
	});
});
```

- [ ] **매퍼 테스트 실행.**

```bash
pnpm --filter web exec vitest run test/lib/bambi/api-job-mapper.test.ts
```

- [ ] **커밋.**

```
feat: adPeriod 타입·매퍼 배선과 등급 아이콘 추가
- icons.tsx에 MedalIcon·CrownIcon(fill 래퍼) 추가
- Job·ApiMarketplaceJob에 adPeriod 필드 추가
- toMarketplaceJob이 adPeriod를 그대로 흘리고 없으면 null 폴백
- api-job-mapper 테스트에 passthrough 케이스 추가
```

---

## Task 7 — 웹 카드: 급여 행에 광고기간 배지

`VisualJobCard` 급여 행(`mt-auto flex`) 오른쪽 끝에 아이콘 + "N회 N일"을 배치한다. 새 행을 추가하지 않아 카드 높이 118px 결합 3곳을 건드리지 않는다.

**Files:**
- Modify: `apps/web/src/components/bambi/visual-job-card.tsx` — import 추가, 급여 행(L259-270) 수정, 소형 배지 컴포넌트 추가.
- Modify: `apps/web/test/components/bambi/visual-job-components.test.ts` — 카드 배지 렌더 케이스 추가(grep 방식).

**Interfaces:**
- Consumes: `adPeriodTier`·`formatAdPeriod` (`@/lib/bambi/ad-period`), `CrownIcon`·`MedalIcon` (`./icons`), `Job.adPeriod`.
- Produces: `job.adPeriod`가 null이면 렌더 안 함, 있으면 급여 행 오른쪽 끝에 아이콘+텍스트+`title` 툴팁.

**Steps:**

- [ ] **실패 테스트 작성(소스 grep).** `visual-job-components.test.ts`의 `describe("visual job marketplace components", ...)` 안에 케이스 추가:

```ts
	it("renders the ad-period badge in the salary row without adding a new row", () => {
		const source = readComponent("visual-job-card.tsx");

		// 배지는 lib 티어·포맷과 등급 아이콘을 쓴다
		expect(source).toContain("adPeriodTier");
		expect(source).toContain("formatAdPeriod");
		expect(source).toContain("MedalIcon");
		expect(source).toContain("CrownIcon");
		// null이면 렌더하지 않는다(조건부 렌더)
		expect(source).toContain("job.adPeriod");
		// 급여 행(mt-auto)에 얹는다 — 새 행 추가 없이 오른쪽 끝(ml-auto) 배치
		expect(source).toContain("mt-auto flex items-center");
		expect(source).toContain("ml-auto");
		// 접근성 툴팁
		expect(source).toContain("누적");
	});
```

- [ ] **실패 확인 실행.**

```bash
pnpm --filter web exec vitest run test/components/bambi/visual-job-components.test.ts
```

- [ ] **최소 구현 — import 추가.** `visual-job-card.tsx` 상단 import에:

```ts
import { adPeriodTier, formatAdPeriod } from "@/lib/bambi/ad-period";
```

기존 `import { MapPinIcon } from "./icons";`를 다음으로 교체:

```ts
import { CrownIcon, MapPinIcon, MedalIcon } from "./icons";
```

- [ ] **최소 구현 — 배지 컴포넌트 추가.** `VisualJobCard` 정의 위(예: `splitPay` 뒤)에 소형 컴포넌트 추가:

```tsx
// 급여 행 오른쪽 끝의 누적 광고 배지(아이콘 + "N회 N일"). adPeriod가 없으면 카드가 렌더하지
// 않으므로 여기서는 값이 있다고 가정한다. 새 행을 만들지 않도록 급여 행 안에 ml-auto로 얹는다.
function JobAdPeriodBadge({
	adPeriod,
}: {
	adPeriod: NonNullable<Job["adPeriod"]>;
}) {
	const tier = adPeriodTier(adPeriod.totalDays);
	return (
		<span
			className={cn(
				"ml-auto flex shrink-0 items-center gap-1 font-semibold text-[11px] leading-none",
				tier.colorClass
			)}
			title={`광고 ${adPeriod.count}회 · 누적 ${adPeriod.totalDays}일`}
		>
			<span className="inline-flex size-3.5 shrink-0">
				{tier.icon === "crown" ? <CrownIcon /> : <MedalIcon />}
			</span>
			{formatAdPeriod(adPeriod)}
		</span>
	);
}
```

- [ ] **최소 구현 — 급여 행 수정.** 급여 행(L259-270)을 교체:

```tsx
			{/* mt-auto: 그리드 행이 늘어나(모집중 placeholder 등) 카드가 stretch 되어도
			    급여 행이 항상 카드 하단에 붙도록 고정한다. 광고 배지는 새 행을 만들지 않고
			    이 행 오른쪽 끝(ml-auto)에 얹어 카드 높이(118px) 결합을 건드리지 않는다. */}
			<div className="mt-auto flex items-center">
				<span className="flex h-9 min-w-0 items-center gap-1.5">
					{payUnit ? (
						<Badge className="shrink-0" tone={toneBadge[tone]}>
							{payUnit}
						</Badge>
					) : null}
					<span className="truncate font-extrabold text-base text-coral-600 leading-none">
						{payAmount}
					</span>
				</span>
				{job.adPeriod ? <JobAdPeriodBadge adPeriod={job.adPeriod} /> : null}
			</div>
```

- [ ] **통과 확인 실행.**

```bash
pnpm --filter web exec vitest run test/components/bambi/visual-job-components.test.ts
```

- [ ] **커밋.**

```
feat: 공고 카드 급여 행에 누적 광고 배지 추가
- adPeriod 있으면 급여 행 오른쪽 끝에 등급 아이콘+"N회 N일" 표시(없으면 미렌더)
- 새 행 추가 없이 ml-auto로 얹어 카드 높이 118px 결합 3곳 보호
- 등급 아이콘·색은 ad-period 티어 재사용, title 툴팁 제공
- visual-job-components 테스트에 배지 렌더 케이스 추가
```

---

## Task 8 — 구인자 광고 안내 등급표 섹션

광고 상품 안내 화면(`/employer/ad-guide`)에 "누적 광고일수 등급" 섹션을 추가한다. `ad-period.ts` 티어를 재사용해 카드와 어긋나지 않게 한다.

**Files:**
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` — import 추가, `EmployerAdGuideScreen`의 `<BoostOptionsGuide />` 뒤에 등급표 카드 추가, 등급표 컴포넌트 정의.
- Modify: `apps/web/test/components/bambi/visual-job-components.test.ts` — 등급표 렌더 케이스 추가(기존 grep 방식 테스트가 이 파일에 모여 있음).

**Interfaces:**
- Consumes: `AD_PERIOD_TIERS`·`formatAdPeriodTierRange` (`@/lib/bambi/ad-period`), `CrownIcon`·`MedalIcon` (`@/components/bambi/icons`).

**Steps:**

- [ ] **실패 테스트 작성(grep).** `visual-job-components.test.ts`에 케이스 추가:

```ts
	it("shows the ad-period grade table on the employer ad guide", () => {
		const source = readComponent("screens/employer-ad-guide.tsx");

		expect(source).toContain("AD_PERIOD_TIERS");
		expect(source).toContain("formatAdPeriodTierRange");
		expect(source).toContain("누적 광고일수 등급");
		// 카드와 같은 등급 아이콘을 쓴다
		expect(source).toContain("MedalIcon");
		expect(source).toContain("CrownIcon");
	});
```

- [ ] **실패 확인 실행.**

```bash
pnpm --filter web exec vitest run test/components/bambi/visual-job-components.test.ts
```

- [ ] **최소 구현 — import 추가.** `employer-ad-guide.tsx` 상단에:

```ts
import { CrownIcon, MedalIcon } from "@/components/bambi/icons";
import { AD_PERIOD_TIERS, formatAdPeriodTierRange } from "@/lib/bambi/ad-period";
```

- [ ] **최소 구현 — 등급표 컴포넌트.** `EmployerAdGuideScreen` 정의 앞에 추가:

```tsx
// 누적 광고일수 등급표. 공고 카드 배지와 같은 AD_PERIOD_TIERS를 재사용해 구간·아이콘이
// 어긋나지 않게 한다. 광고를 오래·자주 진행한 업소일수록 등급 아이콘이 올라간다.
function AdPeriodGradeGuide() {
	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<span className="inline-flex size-5 text-primary">
						<Megaphone size={20} />
					</span>
					<span className="font-bold">누적 광고일수 등급</span>
				</div>
				<p className="m-0 text-muted-foreground text-sm">
					공고 카드에는 업소가 지금까지 진행한 누적 광고 횟수·일수가 "N회 N일"
					배지로 표시되고, 누적 일수가 쌓일수록 아래 등급 아이콘이 올라갑니다.
				</p>
				<ul className="m-0 flex flex-col gap-2 p-0">
					{AD_PERIOD_TIERS.map((tier) => (
						<li className="flex items-center gap-2 text-sm" key={tier.label}>
							<span className={cn("inline-flex size-4 shrink-0", tier.colorClass)}>
								{tier.icon === "crown" ? <CrownIcon /> : <MedalIcon />}
							</span>
							<span className="font-medium">{tier.label}</span>
							<span className="text-muted-foreground text-xs">
								{formatAdPeriodTierRange(tier)}
							</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
```

- [ ] **최소 구현 — 화면에 배치.** `EmployerAdGuideScreen`의 `<BoostOptionsGuide />` 바로 뒤에 추가:

```tsx
				<AdPeriodGradeGuide />
```

- [ ] **통과 확인 실행.**

```bash
pnpm --filter web exec vitest run test/components/bambi/visual-job-components.test.ts
```

- [ ] **커밋.**

```
feat: 구인자 광고 안내에 누적 광고일수 등급표 추가
- /employer/ad-guide에 AD_PERIOD_TIERS 재사용 등급표 섹션 추가
- 카드 배지와 동일한 등급 아이콘·구간으로 어긋남 방지
- 배지 의미(누적 횟수·일수·등급)를 안내 문구로 설명
- visual-job-components 테스트에 등급표 렌더 케이스 추가
```

---

## Task 9 — 사용자 매뉴얼 동기화

구인자 매뉴얼의 광고 섹션에 배지·등급표 설명을 추가한다.

**Files:**
- Modify: `docs/manual/employer-manual.md` — "### 광고 상품 안내" 섹션(현재 ~L303-343) 안, 등급표 안내 문단 추가.

**Interfaces:** 없음(문서).

**Steps:**

- [ ] **매뉴얼 문단 추가.** `docs/manual/employer-manual.md`의 "### 광고 상품 안내" 섹션에서, `> 상품 구성과 요금은 운영팀이 등록한 내용에 따라 달라집니다...`(현재 L325) 뒤에 문단 추가:

```markdown
**누적 광고일수 등급**

구직자 목록의 유료 광고 카드에는 그 업소가 지금까지 진행한 **누적 광고 횟수와 누적 일수**가 "N회 N일" 배지로 표시됩니다(예: "22회 900일"). 누적 일수가 쌓일수록 배지 옆 **등급 아이콘이 올라갑니다** — 누적 90일까지는 브론즈 메달, 91~180일 실버 메달, 181~360일 골드 메달, 361~720일 플래티넘 왕관, 721일 이상 다이아 왕관입니다. 이 배지는 **유료 광고(스페셜·급구·추천) 공고 카드에만** 표시되며, 무료 공고와 외부 수집 공고에는 나타나지 않습니다. 누적 집계는 업소(조직) 단위라 같은 업소의 여러 공고가 같은 배지를 공유합니다. 등급 기준은 **광고 안내** 화면의 **누적 광고일수 등급** 표에서도 확인할 수 있습니다.
```

- [ ] **커밋.**

```
docs: 구인자 매뉴얼에 누적 광고일수 배지·등급 안내 추가
- 광고 상품 안내 섹션에 카드 "N회 N일" 배지 설명 추가
- 5구간 등급 아이콘 기준(브론즈~다이아) 명시
- 유료 광고 카드 한정·조직 단위 집계임을 안내
```

---

## Task 10 — 전체 검증(린트 + 타입체크)

빌드·dev 서버 실행 금지. ultracite 린트(경로 인자 필수) + 각 패키지 check-types만.

**Files:** 없음(검증).

**Steps:**

- [ ] **ultracite 린트(변경 파일 경로 명시).**

```bash
pnpm exec ultracite check packages/db/src/schema/bambi.ts packages/api/src/services/bambi-ad-ledger.ts packages/api/test/services/bambi-ad-ledger.test.ts packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/jobs.ts apps/web/src/lib/bambi/ad-period.ts apps/web/test/lib/bambi/ad-period.test.ts apps/web/src/lib/bambi/types.ts apps/web/src/lib/bambi/api-job-mapper.ts apps/web/test/lib/bambi/api-job-mapper.test.ts apps/web/src/components/bambi/icons.tsx apps/web/src/components/bambi/visual-job-card.tsx apps/web/test/components/bambi/visual-job-components.test.ts apps/web/src/components/bambi/screens/employer-ad-guide.tsx
```

  린트 지적이 있으면 `pnpm exec ultracite fix <경로>`로 정리 후 재확인.

- [ ] **db 타입체크.**

```bash
pnpm --filter @bambi-app/db check-types
```

- [ ] **api 타입체크(라우터 테스트 미실행).**

```bash
pnpm --filter @bambi-app/api check-types
```

- [ ] **web 타입체크.**

```bash
pnpm --filter web check-types
```

  주의: 메인 리포 web check-types는 낡은 `.next` 캐시 탓 오탐이 알려져 있다. 워크트리에서 무관한 기존 에러가 뜨면 이번 변경 파일과 무관한지 확인하고 사용자에게 보고한다.

- [ ] **테스트 재실행(신규만, 라우터 스위트 제외).**

```bash
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-ad-ledger.test.ts
pnpm --filter web exec vitest run test/lib/bambi/ad-period.test.ts test/lib/bambi/api-job-mapper.test.ts test/components/bambi/visual-job-components.test.ts
```

- [ ] **배포 체크리스트 보고(커밋 없음).** 신규 마이그레이션 0097(테이블 + 백필) 운영 migrate 필요, `db:push`/`db:migrate`는 사용자 지시 전까지 미실행임을 브랜치·커밋 위치와 함께 보고한다.

---

## 범위에서 뺀 것 (후속 후보)

- 운영자 기간 조정(+N일)의 누적 반영, 끌올 구매(`job_boost_purchase`)의 누적 합산.
- `jobs.search`/`legacyList`/네이티브 앱/공고 상세 페이지 배지.
- 등급 구간 운영자 설정화, organization 비정규화 카운터.
- paid→unpaid 되돌림 시 원장 삭제(운영자 실수 취소의 과대집계는 허용 오차).
