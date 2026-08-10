# 공고 상세이미지 디자인 제작 애드온 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유료 광고 상품 구매 흐름에 "상세이미지 디자인 제작 +N원" 애드온을 붙여, 구인자가 공고 등록·수정 시 체크 한 번으로 신청하고 운영자가 결제 관리 화면에서 완성본을 등록·완료 처리할 수 있게 한다.

**Architecture:** 별도 주문 테이블 없이 기존 노출 스냅샷 철학을 그대로 확장한다 — `ad_product.detail_design_price`(상품별 가격, null=미제공)를 단일 소스로 두고, 구매 시점 가격을 `job_post.detail_design_amount`에 스냅샷하며 진행 상태는 `job_post.detail_design_status`(enum `job_detail_design_status`) 하나로 표현한다(null=미신청). 금액 합산·스냅샷 판정은 import 없는 pure 모듈(`packages/api/src/services/bambi-job-detail-design.ts`)로 분리해 서버·웹이 같은 함수를 쓰고, 라우터는 그 결과 코드를 ORPCError로만 번역한다. 완성본 등록은 운영자가 대상 공고의 조직 prefix로 서명 URL을 받아 올리고 `job_post_media`(usage=detail)를 전량 교체하는 방식이다.

**Tech Stack:** pnpm 모노레포 / drizzle-orm + PostgreSQL(`packages/db`) / oRPC + zod(`packages/api`) / Next.js App Router + TanStack Query + shadcn(base-ui) + Tailwind v4(`apps/web`) / vitest.

## Global Constraints

- **선행 조건(실행 전 반드시 처리)**: 이 워크트리는 develop(a1f03f85) 기반이라 테스트 분리 브랜치(`chore/separate-test-files`, 미머지)가 없다. 착수 전에 그 브랜치를 develop에 머지하고, 이 브랜치에 develop을 머지해 `apps/web/test/`·`packages/api/test/` 미러 구조와 vitest config(include `test/**`, `@/` alias, `root` 고정)를 확보해야 한다. 이 계획의 테스트 경로·실행 명령은 전부 그 구조를 전제로 한다.
- 소스를 텍스트로 읽는 웹 테스트는 각 패키지 `test/src-path.ts`의 `srcPath(...)` 헬퍼를 쓴다(상대 깊이 직접 계산 금지). 이 계획은 `srcPath("components/bambi/foo.tsx")`처럼 **src 루트 기준 상대 경로 1개**를 받는 형태로 작성했다 — 머지 후 `test/src-path.ts`의 실제 export 시그니처가 다르면 그 파일을 단일 기준으로 삼아 호출부를 맞춘다.
- **마이그레이션**: `db:push` 절대 금지. `pnpm --filter @bambi-app/db db:generate`로 생성만 하고, 적용(`db:migrate`)은 사용자 지시가 있을 때만 한다. 현재 최신 마이그레이션은 `0077_grey_hellfire_club.sql`이므로 생성 결과는 `packages/db/src/migrations/0078_*.sql`이다(접미사는 drizzle이 임의로 붙인다).
- **`packages/api/test/routers/**`(routers/bambi) 스위트는 어떤 이유로도 실행 금지** — 실 dev DB를 지운다. api 테스트 실행은 반드시 `cwd=packages/api`에서 `pnpm vitest run test/services`만. web은 리포 루트에서 `pnpm vitest run --config apps/web/vitest.config.ts`.
- 라우터 코드에는 새 테스트를 만들지 않는다(위 금지 때문). 라우터 변경의 검증은 `pnpm --filter @bambi-app/api check-types` + 린트이며, 검증 가능한 로직은 전부 pure 서비스 모듈로 빼서 `packages/api/test/services/`에서 테스트한다.
- **신규 npm 의존성 추가 금지.** shadcn 기존 컴포넌트만 재사용하고(`@bambi-app/ui/components/*`), 없는 컴포넌트를 raw div로 재발명하지 않는다.
- 임의 px(`className="[16px]"` 류) 금지 — Tailwind 스케일 토큰만 쓴다. 인라인 `style` 금지. 세로 스택은 `flex flex-col gap-*`(`space-y-*` 금지).
- **DB enum 원값을 화면에 렌더하지 않는다** — 반드시 `apps/web/src/lib/bambi`의 라벨 맵을 경유한다.
- 내비게이션 성격 버튼에 `variant="default"`(primary) 금지. primary는 화면당 주요 액션 한 곳만.
- 모바일 반응형 필수(그리드는 모바일 1열 → `sm:`/`lg:` 확장).
- base-ui `render` prop이 `<Button>`이면 `nativeButton` 생략, `Link`/`Input` 등 비-button 렌더에만 `nativeButton={false}`.
- **빌드·dev 서버 실행 금지**(HMR 상시 가동 중). 시각 확인은 사용자가 한다.
- 린트는 `pnpm ultracite fix <경로>` (경로 인자 필수 — 생략하면 0파일 처리), 타입은 각 패키지 `pnpm --filter <pkg> check-types`. pnpm 필터명: `@bambi-app/db`, `@bambi-app/api`, `web`(scope 없음).
- 커밋 메시지는 한국어 `type: 제목` 한 줄(`-m` 한 줄로 충분). 커밋은 각 태스크의 마지막 스텝에서만.
- 스코프 밖: 시안 교환·제작 요청서 워크플로우, 재주문·주문 이력, PG 연동·환불, 크롤링 공고(`crawled_job_post`), 단독 상품 판매.

---

### Task 1: DB 스키마 확장과 마이그레이션 생성

**Files:**
- Modify: `packages/db/src/schema/bambi.ts:108`(enum 추가 지점 — `jobPaymentMethod` 바로 앞), `packages/db/src/schema/bambi.ts:862`(jobPost 컬럼), `packages/db/src/schema/bambi.ts:1090`(adProduct 컬럼)
- Create: `packages/db/src/migrations/0078_*.sql` (drizzle generate 산출물)

**Interfaces:**
- Consumes: 없음(이 계획의 첫 태스크)
- Produces:
  - `jobDetailDesignStatus` = `pgEnum("job_detail_design_status", ["requested", "completed"])`
  - `adProduct.detailDesignPrice`: `integer("detail_design_price")` (nullable)
  - `jobPost.detailDesignAmount`: `integer("detail_design_amount")` (nullable)
  - `jobPost.detailDesignStatus`: `jobDetailDesignStatus("detail_design_status")` (nullable)

- [ ] **Step 1: `job_detail_design_status` enum을 추가한다**

`packages/db/src/schema/bambi.ts`에서 `jobPaymentMethod`(현재 :108) 정의 **바로 위**에 추가한다.

```ts
// 상세이미지 디자인 제작 애드온의 진행 상태. 컬럼이 nullable이라 null = 미신청이고,
// 신청 순간 requested로 시작해 운영자가 완성본을 등록하면 completed로 넘어간다.
// 별도 주문 테이블 없이 공고 스냅샷으로만 표현하므로 1공고 1회 주문이며 재주문 이력은 없다.
export const jobDetailDesignStatus = pgEnum("job_detail_design_status", [
	"requested",
	"completed",
]);

export const jobPaymentMethod = pgEnum("job_payment_method", [
	"card",
	"bank_transfer",
]);
```

- [ ] **Step 2: `ad_product.detail_design_price` 컬럼을 추가한다**

`packages/db/src/schema/bambi.ts`의 `adProduct` 정의에서 `autoBoostsPerDay`(현재 :1090) 다음 줄에 넣는다.

```ts
		autoBoostsPerDay: integer("auto_boosts_per_day").default(0).notNull(),
		// 이 상품을 살 때 함께 신청할 수 있는 "상세이미지 디자인 제작" 애드온 가격.
		// null = 이 상품엔 옵션 미제공(구인자 화면에서 체크박스 자체가 안 보인다).
		detailDesignPrice: integer("detail_design_price"),
		sortOrder: integer("sort_order").default(0).notNull(),
```

- [ ] **Step 3: `job_post`에 스냅샷 컬럼 2개를 추가한다**

`packages/db/src/schema/bambi.ts`의 `jobPost` 정의에서 `exposureAmount`(현재 :862) 다음 줄에 넣는다.

```ts
		exposureAmount: integer("exposure_amount"),
		// 디자인 제작 애드온의 구매 시점 가격 스냅샷(exposure_amount와 동일 철학).
		// 상품 가격이 나중에 바뀌어도 이미 신청한 공고의 결제 금액은 이 값으로 고정된다.
		// null = 미신청.
		detailDesignAmount: integer("detail_design_amount"),
		// 신청 시 requested로 시작하고 운영자가 완성본을 올리면 completed가 된다.
		// completed인 공고는 옵션 해제가 막힌다(이미 제작된 작업의 흔적 보존).
		detailDesignStatus: jobDetailDesignStatus("detail_design_status"),
		paymentMethod: jobPaymentMethod("payment_method"),
```

- [ ] **Step 4: 타입 체크로 스키마가 컴파일되는지 확인한다**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: PASS (에러 0건)

- [ ] **Step 5: 마이그레이션을 생성한다**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: `packages/db/src/migrations/0078_<임의이름>.sql` 파일이 새로 생기고 `meta/_journal.json`에 항목이 추가된다. **`db:push`·`db:migrate`는 실행하지 않는다.**

- [ ] **Step 6: 생성된 SQL이 의도한 DDL만 담고 있는지 확인한다**

Run: `cat packages/db/src/migrations/0078_*.sql`
Expected: 아래 3종이 모두 보이고, 다른 테이블을 건드리는 문장(DROP/ALTER … TYPE 변경 등)은 없다.

```sql
CREATE TYPE "public"."job_detail_design_status" AS ENUM('requested', 'completed');
ALTER TABLE "ad_product" ADD COLUMN "detail_design_price" integer;
ALTER TABLE "job_post" ADD COLUMN "detail_design_amount" integer;
ALTER TABLE "job_post" ADD COLUMN "detail_design_status" "public"."job_detail_design_status";
```

- [ ] **Step 7: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations
git commit -m "feat: 상세이미지 디자인 제작 애드온 스키마·마이그레이션 추가"
```

---

### Task 2: 금액 합산·스냅샷 판정 pure 헬퍼

**Files:**
- Create: `packages/api/src/services/bambi-job-detail-design.ts`
- Test: `packages/api/test/services/bambi-job-detail-design.test.ts`

**Interfaces:**
- Consumes: Task 1의 enum 값 문자열(`"requested"` | `"completed"`)
- Produces (뒤 태스크가 이 이름 그대로 import한다):
  - `jobDetailDesignStatuses: readonly ["requested", "completed"]`
  - `type JobDetailDesignStatus = "completed" | "requested"`
  - `interface JobDetailDesignSnapshot { detailDesignAmount: null | number; detailDesignStatus: JobDetailDesignStatus | null }`
  - `type JobDetailDesignResolution = { ok: true; snapshot: JobDetailDesignSnapshot } | { code: "amount_changed"; expectedAmount: number; ok: false; price: number } | { code: "completed_locked"; ok: false } | { code: "not_offered"; ok: false }`
  - `resolveJobDetailDesign(input: { currentStatus: JobDetailDesignStatus | null; expectedAmount?: null | number; productDetailDesignPrice: null | number; requested: boolean }): JobDetailDesignResolution`
  - `sumJobPaymentAmount(exposureAmount: null | number, detailDesignAmount: null | number): null | number`

> 이 모듈은 **import를 하나도 갖지 않는다**. `apps/web`이 `@bambi-app/api/services/bambi-job-detail-design`로 직접 import하기 때문이다(기존 `bambi-ad-pricing`과 같은 규칙).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`packages/api/test/services/bambi-job-detail-design.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	resolveJobDetailDesign,
	sumJobPaymentAmount,
} from "@/services/bambi-job-detail-design";

describe("sumJobPaymentAmount", () => {
	it("둘 다 null이면 null이다(무료 공고)", () => {
		expect(sumJobPaymentAmount(null, null)).toBeNull();
	});

	it("노출 금액만 있으면 그대로 반환한다", () => {
		expect(sumJobPaymentAmount(50_000, null)).toBe(50_000);
	});

	it("노출 금액과 옵션 금액을 더한다", () => {
		expect(sumJobPaymentAmount(50_000, 30_000)).toBe(80_000);
	});

	it("옵션 금액만 있으면 그 값만 반환한다", () => {
		expect(sumJobPaymentAmount(null, 30_000)).toBe(30_000);
	});
});

describe("resolveJobDetailDesign", () => {
	it("신청하면 상품 가격을 스냅샷하고 requested로 시작한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 30_000, detailDesignStatus: "requested" },
		});
	});

	it("옵션이 없는 상품(가격 null)에 신청하면 not_offered로 거절한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				productDetailDesignPrice: null,
				requested: true,
			})
		).toEqual({ code: "not_offered", ok: false });
	});

	it("클라이언트가 본 가격과 서버 가격이 다르면 amount_changed로 거절한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				expectedAmount: 20_000,
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			code: "amount_changed",
			expectedAmount: 20_000,
			ok: false,
			price: 30_000,
		});
	});

	it("이미 completed면 상태를 requested로 되돌리지 않는다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 30_000, detailDesignStatus: "completed" },
		});
	});

	it("해제하면 금액·상태를 모두 null로 되돌린다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "requested",
				productDetailDesignPrice: 30_000,
				requested: false,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: null, detailDesignStatus: null },
		});
	});

	it("completed인 공고는 해제할 수 없다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: 30_000,
				requested: false,
			})
		).toEqual({ code: "completed_locked", ok: false });
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd packages/api && pnpm vitest run test/services/bambi-job-detail-design.test.ts`
Expected: FAIL — `Failed to resolve import "@/services/bambi-job-detail-design"`

- [ ] **Step 3: 최소 구현을 작성한다**

`packages/api/src/services/bambi-job-detail-design.ts`:

```ts
// 상세이미지 디자인 제작 애드온의 금액 합산·스냅샷 판정. 순수·무 import 모듈이라
// apps/web도 그대로 import한다(bambi-ad-pricing과 같은 규칙) — 폼에 보이는 결제 예정
// 금액과 서버가 저장하는 금액이 같은 함수에서 나온다.
// 에러를 던지지 않고 코드만 돌려주는 이유: ORPCError를 import하는 순간 웹 번들에
// 서버 의존성이 끌려온다. 문구·상태코드 번역은 라우터가 한다.

export const jobDetailDesignStatuses = ["requested", "completed"] as const;

export type JobDetailDesignStatus = (typeof jobDetailDesignStatuses)[number];

export interface JobDetailDesignSnapshot {
	detailDesignAmount: null | number;
	detailDesignStatus: JobDetailDesignStatus | null;
}

export type JobDetailDesignResolution =
	| { code: "amount_changed"; expectedAmount: number; ok: false; price: number }
	| { code: "completed_locked"; ok: false }
	| { code: "not_offered"; ok: false }
	| { ok: true; snapshot: JobDetailDesignSnapshot };

export const resolveJobDetailDesign = ({
	currentStatus,
	expectedAmount,
	productDetailDesignPrice,
	requested,
}: {
	currentStatus: JobDetailDesignStatus | null;
	// 클라이언트가 화면에서 본 옵션 가격. 서버 가격과 다르면 재확인을 요구한다.
	expectedAmount?: null | number;
	productDetailDesignPrice: null | number;
	requested: boolean;
}): JobDetailDesignResolution => {
	if (!requested) {
		// 이미 제작이 끝난 건은 흔적을 지우지 않는다.
		if (currentStatus === "completed") {
			return { code: "completed_locked", ok: false };
		}

		return {
			ok: true,
			snapshot: { detailDesignAmount: null, detailDesignStatus: null },
		};
	}

	if (productDetailDesignPrice === null) {
		return { code: "not_offered", ok: false };
	}

	if (expectedAmount != null && expectedAmount !== productDetailDesignPrice) {
		return {
			code: "amount_changed",
			expectedAmount,
			ok: false,
			price: productDetailDesignPrice,
		};
	}

	return {
		ok: true,
		snapshot: {
			detailDesignAmount: productDetailDesignPrice,
			// 재신청이 아니라 completed 유지 — 상태를 requested로 되돌리면 완료된 작업이
			// 운영자 큐에 다시 뜬다.
			detailDesignStatus: currentStatus ?? "requested",
		},
	};
};

// 결제 예정 총액 = 노출 금액 + 옵션 금액. 둘 다 없으면 무료 공고라 null이다.
export const sumJobPaymentAmount = (
	exposureAmount: null | number,
	detailDesignAmount: null | number
): null | number =>
	exposureAmount === null && detailDesignAmount === null
		? null
		: (exposureAmount ?? 0) + (detailDesignAmount ?? 0);
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `cd packages/api && pnpm vitest run test/services/bambi-job-detail-design.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 린트·타입 확인 후 커밋**

Run: `pnpm ultracite fix packages/api/src/services/bambi-job-detail-design.ts packages/api/test/services/bambi-job-detail-design.test.ts && pnpm --filter @bambi-app/api check-types`
Expected: 둘 다 PASS

```bash
git add packages/api/src/services/bambi-job-detail-design.ts packages/api/test/services/bambi-job-detail-design.test.ts
git commit -m "feat: 디자인 제작 애드온 금액 합산·스냅샷 헬퍼 추가"
```

---

### Task 3: 광고 상품 카탈로그에 옵션 가격 입력 추가

**Files:**
- Modify: `packages/api/src/routers/bambi/ad-products.ts:130-157` (createProductInput / updateProductInput)

**Interfaces:**
- Consumes: Task 1의 `adProduct.detailDesignPrice` 컬럼
- Produces:
  - `adProducts.createProduct` 입력에 `detailDesignPrice?: number | null`
  - `adProducts.updateProduct` 입력에 `detailDesignPrice?: number | null`
  - `adProducts.getCatalog` / `listCatalogAdmin` 응답의 각 product에 `detailDesignPrice: number | null` (두 핸들러 모두 `...product`를 스프레드하므로 컬럼 추가만으로 자동 노출된다 — 별도 select 수정 불필요)

- [ ] **Step 1: createProductInput에 옵션 가격을 추가한다**

`packages/api/src/routers/bambi/ad-products.ts`의 `createProductInput`(현재 :130) 안, `autoBoostsPerDay` 다음 줄:

```ts
	manualBoostsPerDay: z.number().int().min(0).default(0),
	autoBoostsPerDay: z.number().int().min(0).default(0),
	// 상세이미지 디자인 제작 애드온 가격. 비우면(null) 이 상품에는 옵션을 팔지 않는다.
	detailDesignPrice: z.number().int().min(0).nullish(),
	sortOrder: z.number().int().min(0).default(0),
```

- [ ] **Step 2: updateProductInput에 같은 필드를 추가한다**

같은 파일 `updateProductInput`(현재 :144) 안, `autoBoostsPerDay` 다음 줄:

```ts
	manualBoostsPerDay: z.number().int().min(0).optional(),
	autoBoostsPerDay: z.number().int().min(0).optional(),
	// nullish라 명시적 null이 오면 옵션 미제공으로 되돌린다(키 생략은 기존 값 유지).
	detailDesignPrice: z.number().int().min(0).nullish(),
	sortOrder: z.number().int().min(0).optional(),
```

> 두 핸들러 모두 입력을 `...patch` / `...productInput`으로 통째로 drizzle에 넘기므로 handler 본문은 손대지 않는다. `detailDesignPrice`가 컬럼명과 1:1이라 그대로 저장된다.

- [ ] **Step 3: 타입 체크로 확인한다**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS

- [ ] **Step 4: 린트 후 커밋**

Run: `pnpm ultracite fix packages/api/src/routers/bambi/ad-products.ts`
Expected: PASS

```bash
git add packages/api/src/routers/bambi/ad-products.ts
git commit -m "feat: 광고 상품에 상세이미지 디자인 제작 가격 입력 추가"
```

---

### Task 4: 공고 등록·수정에 애드온 신청 배선

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts:109-113`(import), `:147-186`(jobPostInputShape), `:577-688`(ResolvedJobExposure·resolveJobPostExposure 아래에 헬퍼 추가), `:693-877`(applyJobPostUpdate), `:1637-1770`(create)

**Interfaces:**
- Consumes: Task 2의 `resolveJobDetailDesign`, `JobDetailDesignSnapshot`, `JobDetailDesignStatus` / Task 1의 `jobPost.detailDesign*` 컬럼
- Produces:
  - `jobs.create` / `jobs.update` 입력에 `detailDesignRequested?: boolean`, `detailDesignAmount?: number | null`(클라이언트가 본 가격)
  - `packages/api/src/routers/bambi/jobs.ts`에 모듈 내부 헬퍼 `resolveJobDetailDesignSnapshot({ adProductId, currentStatus, expectedAmount, requested }): Promise<JobDetailDesignSnapshot>` — 실패 코드를 ORPCError로 번역한다

- [ ] **Step 1: pure 헬퍼를 import한다**

`packages/api/src/routers/bambi/jobs.ts`의 import 블록에서 `bambi-job-description-blocks` import(현재 :72) **바로 앞**에 알파벳 순으로 넣는다.

```ts
import {
	type JobDetailDesignSnapshot,
	type JobDetailDesignStatus,
	resolveJobDetailDesign,
} from "../../services/bambi-job-detail-design";
```

- [ ] **Step 2: 입력 스키마에 두 필드를 추가한다**

`jobPostInputShape`(현재 :147) 안, `exposureAmount` 다음 줄:

```ts
	exposureAmount: z.number().int().min(0).nullish(),
	// 상세이미지 디자인 제작 애드온 신청 여부. 키를 생략하면(undefined) 기존 상태를
	// 그대로 둔다 — 운영자 편집(moderation.adminUpdateJobPost)이 이 값을 안 보내도
	// 구인자가 신청해 둔 옵션이 조용히 해제되지 않게 하기 위해서다.
	detailDesignRequested: z.boolean().optional(),
	// 클라이언트가 화면에서 본 옵션 가격. exposureAmount와 같은 재확인용 값이다.
	detailDesignAmount: z.number().int().min(0).nullish(),
	paymentMethod: z.enum(["card", "bank_transfer"]).nullish(),
```

- [ ] **Step 3: 라우터용 스냅샷 헬퍼를 추가한다**

`resolveJobPostExposure` 함수가 끝나는 자리(현재 :688 `};` 바로 다음)에 추가한다.

```ts
// 애드온 스냅샷 확정. 판정 자체는 pure 헬퍼가 하고 여기서는 상품 가격 조회와
// 실패 코드 → ORPCError 번역만 한다(가격 변동 문구는 노출 금액 재확인과 같은 패턴).
const resolveJobDetailDesignSnapshot = async ({
	adProductId,
	currentStatus,
	expectedAmount,
	requested,
}: {
	adProductId: null | string;
	currentStatus: JobDetailDesignStatus | null;
	expectedAmount?: null | number;
	requested: boolean;
}): Promise<JobDetailDesignSnapshot> => {
	// 무료 공고(상품 미선택)는 옵션 자체가 없다. 가격을 null로 넘겨 not_offered로 떨어뜨린다.
	const product = adProductId
		? await db.query.adProduct.findFirst({ where: eq(adProduct.id, adProductId) })
		: null;
	const resolution = resolveJobDetailDesign({
		currentStatus,
		expectedAmount,
		productDetailDesignPrice: product?.detailDesignPrice ?? null,
		requested,
	});

	if (resolution.ok) {
		return resolution.snapshot;
	}

	if (resolution.code === "amount_changed") {
		throw new ORPCError("CONFLICT", {
			message: `상세이미지 디자인 제작 가격이 ${resolution.expectedAmount.toLocaleString("ko-KR")}원에서 ${resolution.price.toLocaleString("ko-KR")}원으로 변경되었습니다. 변경된 가격을 확인한 뒤 다시 결제해 주세요.`,
		});
	}

	if (resolution.code === "completed_locked") {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"이미 제작이 완료된 상세이미지 디자인은 신청을 해제할 수 없습니다. 운영자에게 문의해 주세요.",
		});
	}

	throw new ORPCError("BAD_REQUEST", {
		message:
			"선택한 광고 상품에는 상세이미지 디자인 제작 옵션이 없습니다. 옵션이 제공되는 상품을 선택해 주세요.",
	});
};
```

- [ ] **Step 4: create 핸들러를 배선한다**

`create`(현재 :1637)에서 **destructure에 `detailDesignRequested`를 반드시 빼내야 한다** — 컬럼이 아니라서 `...jobInput` 스프레드로 insert에 들어가면 drizzle이 터진다.

```ts
			const {
				adBannerLayout: _adBannerLayout,
				descriptionBlocks: _descriptionBlocks,
				detailDesignRequested: _detailDesignRequested,
				media,
				...jobInput
			} = input;
```

`exposure` 확정 직후(현재 :1686 `});` 다음)에 스냅샷을 확정한다.

```ts
			const detailDesign = await resolveJobDetailDesignSnapshot({
				adProductId: exposure.adProductId,
				currentStatus: null,
				expectedAmount: input.detailDesignAmount,
				requested: input.detailDesignRequested ?? false,
			});
```

insert values에서 `exposureAmount` 다음 줄에 두 값을 덮어쓴다(스프레드된 `detailDesignAmount`는 클라이언트 값이므로 반드시 덮어써야 한다).

```ts
						exposureAmount: exposure.exposureAmount,
						detailDesignAmount: detailDesign.detailDesignAmount,
						detailDesignStatus: detailDesign.detailDesignStatus,
						manualBoostsPerDay: exposure.manualBoostsPerDay,
```

- [ ] **Step 5: applyJobPostUpdate를 배선한다**

`applyJobPostUpdate`(현재 :693)의 destructure에도 같은 필드를 빼낸다.

```ts
	const {
		adBannerLayout: _adBannerLayout,
		descriptionBlocks: _descriptionBlocks,
		detailDesignRequested: _detailDesignRequested,
		media,
		...jobInput
	} = data;
```

`exposure` 확정 직후(현재 :750 `});` 다음)에 스냅샷과 변경 여부를 계산한다.

```ts
	// 키를 안 보내면(운영자 편집 등) 기존 신청 상태를 그대로 유지한다.
	const detailDesign =
		data.detailDesignRequested === undefined
			? {
					detailDesignAmount: existing.detailDesignAmount,
					detailDesignStatus: existing.detailDesignStatus,
				}
			: await resolveJobDetailDesignSnapshot({
					adProductId: exposure.adProductId,
					currentStatus: existing.detailDesignStatus,
					expectedAmount: data.detailDesignAmount,
					requested: data.detailDesignRequested,
				});
```

`exposureChanged` 계산부(현재 :759) 아래에 결제 리셋 조건을 더한다.

```ts
	const exposureChanged =
		!moderatorEdit &&
		(exposure.adProductId !== existing.adProductId ||
			exposure.exposureDurationDays !== existing.exposureDurationDays);
	// 옵션을 켜거나 끄면(또는 가격이 달라지면) 결제 총액이 바뀌므로 노출 변경과 동일하게
	// 미결제로 되돌린다. 운영자 편집은 결제 상태를 건드리지 않는다(노출 변경과 같은 예외).
	const detailDesignChanged =
		!moderatorEdit &&
		detailDesign.detailDesignAmount !== existing.detailDesignAmount;
	const changedPaymentStatus = exposure.adProductId
		? ("unpaid" as const)
		: ("paid" as const);
	const nextPaymentStatus =
		exposureChanged || detailDesignChanged
			? changedPaymentStatus
			: existing.paymentStatus;
```

update set에서 `exposureAmount` 다음 줄에 덮어쓴다.

```ts
					exposureAmount: exposure.exposureAmount,
					detailDesignAmount: detailDesign.detailDesignAmount,
					detailDesignStatus: detailDesign.detailDesignStatus,
					manualBoostsPerDay: exposure.manualBoostsPerDay,
```

- [ ] **Step 6: 타입 체크와 린트로 확인한다**

Run: `pnpm --filter @bambi-app/api check-types && pnpm ultracite fix packages/api/src/routers/bambi/jobs.ts`
Expected: 둘 다 PASS

- [ ] **Step 7: pure 헬퍼 테스트가 여전히 통과하는지 확인한다**

Run: `cd packages/api && pnpm vitest run test/services`
Expected: PASS (routers 스위트는 절대 돌리지 않는다)

- [ ] **Step 8: 커밋**

```bash
git add packages/api/src/routers/bambi/jobs.ts
git commit -m "feat: 공고 등록·수정에 상세이미지 디자인 제작 신청 배선"
```

---

### Task 5: 운영자 제작 상태 토글과 결제 목록 확장

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts:74-80`(import), `:160-168`(입력 스키마), `:2022-2059`(listJobsForPayment), `:1943` 뒤(setJobPostDesignStatus 추가)

**Interfaces:**
- Consumes: Task 1의 `jobPost.detailDesignStatus` / Task 2의 `jobDetailDesignStatuses`
- Produces:
  - `moderation.setJobPostDesignStatus({ jobPostId: string; status: "completed" | "requested" })` → 갱신된 job_post 행
  - `moderation.listJobsForPayment` 입력에 `onlyDetailDesign?: boolean`(기본 false), 응답 행에 `detailDesignAmount: number | null`, `detailDesignStatus: "completed" | "requested" | null`

- [ ] **Step 1: import를 추가한다**

`packages/api/src/routers/bambi/moderation.ts`의 `import { escapeLikePattern } ...`(현재 :60) 다음 줄:

```ts
import { jobDetailDesignStatuses } from "../../services/bambi-job-detail-design";
```

- [ ] **Step 2: 입력 스키마를 추가·확장한다**

`setJobPostPaymentInput`(현재 :160) 다음에 새 스키마를 넣고, `listJobsForPaymentInput`에 필터를 더한다.

```ts
const setJobPostPaymentInput = z.object({
	jobPostId: z.string().uuid(),
	paymentStatus: z.enum(["unpaid", "paid"]),
});

const setJobPostDesignStatusInput = z.object({
	jobPostId: z.string().uuid(),
	status: z.enum(jobDetailDesignStatuses),
});

const listJobsForPaymentInput = z.object({
	onlyUnpaid: z.boolean().default(false),
	// 상세이미지 디자인 제작을 신청한 건만 추린다(별도 큐 화면 대신 이 필터로 처리한다).
	onlyDetailDesign: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(50),
});
```

- [ ] **Step 3: setJobPostDesignStatus 프로시저를 추가한다**

`setJobPostPayment` 프로시저가 끝나는 자리(현재 :1943 `}),` 다음)에 넣는다.

```ts
	// 디자인 제작 진행 상태 토글. 신청하지 않은 공고에는 상태를 세울 수 없다 —
	// 금액 스냅샷 없이 상태만 서면 결제 관리에서 "받은 돈 없는 제작 건"이 생긴다.
	setJobPostDesignStatus: adminProcedure
		.input(setJobPostDesignStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const updated = await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ detailDesignStatus: jobPost.detailDesignStatus })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND");
				}

				if (existing.detailDesignStatus === null) {
					throw new ORPCError("BAD_REQUEST", {
						message: "상세이미지 디자인 제작을 신청하지 않은 공고입니다.",
					});
				}

				const [row] = await tx
					.update(jobPost)
					.set({ detailDesignStatus: input.status })
					.where(eq(jobPost.id, input.jobPostId))
					.returning();

				if (!row) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					action: `set_detail_design_status:${input.status}`,
					adminUserId: admin.userId,
					metadata: { previousStatus: existing.detailDesignStatus },
					targetId: input.jobPostId,
					targetType: "job_post",
				});

				return row;
			});

			// 완료 처리는 구인자에게 "상세이미지가 올라갔다"는 유일한 신호다.
			await notifyModerationAction({
				action: `set_detail_design_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: { jobPostTitle: updated.title },
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return updated;
		}),
```

- [ ] **Step 4: listJobsForPayment에 컬럼과 필터를 추가한다**

`listJobsForPayment`(현재 :2022) 핸들러의 conditions와 select를 고친다.

```ts
			if (input.onlyUnpaid) {
				conditions.push(eq(jobPost.paymentStatus, "unpaid"));
			}

			if (input.onlyDetailDesign) {
				conditions.push(isNotNull(jobPost.detailDesignStatus));
			}

			return await db
				.select({
					id: jobPost.id,
					title: jobPost.title,
					status: jobPost.status,
					exposureType: jobPost.exposureType,
					exposureAmount: jobPost.exposureAmount,
					detailDesignAmount: jobPost.detailDesignAmount,
					detailDesignStatus: jobPost.detailDesignStatus,
					paymentStatus: jobPost.paymentStatus,
					exposureDurationDays: jobPost.exposureDurationDays,
					exposureEndsAt: jobPost.exposureEndsAt,
					organizationDisplayName: employerOrganizationProfile.displayName,
					createdAt: jobPost.createdAt,
				})
```

- [ ] **Step 5: 타입 체크·린트로 확인한다**

Run: `pnpm --filter @bambi-app/api check-types && pnpm ultracite fix packages/api/src/routers/bambi/moderation.ts`
Expected: 둘 다 PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/routers/bambi/moderation.ts
git commit -m "feat: 운영자 디자인 제작 상태 토글·결제 목록 필터 추가"
```

---

### Task 6: 운영자 완성본 업로드·등록 프로시저

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (import 블록, 입력 스키마 구역, Task 5에서 추가한 `setJobPostDesignStatus` 뒤)

**Interfaces:**
- Consumes: Task 5의 `setJobPostDesignStatus` 배치 위치 / 기존 `createJobPostMediaUploadIntent`·`isOwnedJobPostMediaKey`(bambi-storage.ts) / `validateJobPostMediaSet`·`JOB_POST_DETAIL_IMAGE_LIMIT`(bambi-job-media-policy.ts) / `deletePublicObjects`(gcs.ts, 이미 import됨)
- Produces:
  - `moderation.createJobPostDesignMediaUpload({ byteSize: number; fileName: string; jobPostId: string; mimeType: string })` → `{ byteSize, fileName, mimeType, storageKey, uploadUrl }`
  - `moderation.setJobPostDesignMedia({ jobPostId: string; detail: { altText?: string; byteSize: number; fileName: string; height?: number; mimeType: string; storageKey: string; width?: number }[] })` → `{ detail: (typeof jobPostMedia.$inferSelect)[] }`

> 등록/삭제를 각각의 프로시저로 나누지 않고 **detail 전량 교체 1개**로 둔다. 기존 `applyJobPostUpdate`의 미디어 교체와 같은 패턴이고(삭제분은 커밋 뒤 `deletePublicObjects`), 5장이 꽉 찼을 때 "지우고 올리기"가 한 번의 저장으로 끝난다.

- [ ] **Step 1: import를 추가한다**

`packages/api/src/routers/bambi/moderation.ts`의 import 블록에 아래 두 줄을 알파벳 순 자리에 넣는다(`bambi-job-detail-design` import 다음, `bambi-moderation-bulk` 앞).

```ts
import {
	JOB_POST_DETAIL_IMAGE_LIMIT,
	validateJobPostImageUpload,
	validateJobPostMediaSet,
} from "../../services/bambi-job-media-policy";
```

그리고 기존 `import { getBusinessDocumentObjectUrl } from "../../services/bambi-storage";`를 확장한다.

```ts
import {
	createJobPostMediaUploadIntent,
	getBusinessDocumentObjectUrl,
	isOwnedJobPostMediaKey,
} from "../../services/bambi-storage";
```

- [ ] **Step 2: 입력 스키마를 추가한다**

Task 5에서 추가한 `setJobPostDesignStatusInput` 다음에 넣는다.

```ts
const createJobPostDesignMediaUploadInput = z.object({
	byteSize: z.number().int().min(1),
	fileName: z.string().max(180),
	jobPostId: z.string().uuid(),
	mimeType: z.string().min(1).max(120),
});

const setJobPostDesignMediaInput = z.object({
	// 저장될 상세 이미지 전량. 빠진 기존 이미지는 행과 GCS 객체가 함께 지워진다.
	detail: z
		.array(
			z.object({
				altText: z.string().max(120).default(""),
				byteSize: z.number().int().min(1),
				fileName: z.string().max(180),
				height: z.number().int().min(1).max(20_000).optional(),
				mimeType: z.string().min(1).max(120),
				storageKey: z.string().min(1).max(512),
				width: z.number().int().min(1).max(20_000).optional(),
			})
		)
		.max(JOB_POST_DETAIL_IMAGE_LIMIT),
	jobPostId: z.string().uuid(),
});
```

- [ ] **Step 3: 업로드 인텐트 프로시저를 추가한다**

Task 5의 `setJobPostDesignStatus` 프로시저 뒤에 넣는다.

```ts
	// 운영자가 완성본을 직접 올린다. 서명 URL의 조직 prefix는 반드시 **대상 공고의 조직**이어야
	// 한다 — 운영자 자신의 조직으로 발급하면 저장 단계의 isOwnedJobPostMediaKey에 걸린다.
	createJobPostDesignMediaUpload: adminProcedure
		.input(createJobPostDesignMediaUploadInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const [target] = await db
				.select({ organizationId: jobPost.organizationId })
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!target) {
				throw new ORPCError("NOT_FOUND");
			}

			const policy = validateJobPostImageUpload({
				byteSize: input.byteSize,
				fileName: input.fileName,
				mimeType: input.mimeType,
				usage: "detail",
			});

			if (!policy.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"상세 이미지는 JPG·PNG·WebP 형식의 10MB 이하 파일만 등록할 수 있습니다.",
				});
			}

			return await createJobPostMediaUploadIntent({
				actorUserId: admin.userId,
				byteSize: input.byteSize,
				fileName: input.fileName,
				mimeType: input.mimeType,
				organizationId: target.organizationId,
			});
		}),
```

- [ ] **Step 4: 상세 이미지 교체 프로시저를 추가한다**

Step 3 프로시저 바로 뒤에 넣는다.

```ts
	// 상세 이미지(usage=detail) 전량 교체. 5장 제한은 기존 정책을 그대로 태우고, 교체에서
	// 빠진 키는 트랜잭션 커밋 뒤에만 GCS에서 지운다(롤백된 변경으로 원본을 잃지 않게).
	setJobPostDesignMedia: adminProcedure
		.input(setJobPostDesignMediaInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const [target] = await db
				.select({ organizationId: jobPost.organizationId })
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!target) {
				throw new ORPCError("NOT_FOUND");
			}

			const rows = input.detail.map((item, index) => ({
				...item,
				position: index,
				usage: "detail" as const,
			}));
			const policy = validateJobPostMediaSet(rows);

			if (!policy.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message: `상세 이미지는 최대 ${JOB_POST_DETAIL_IMAGE_LIMIT}장까지, JPG·PNG·WebP 10MB 이하만 등록할 수 있습니다.`,
				});
			}

			for (const row of rows) {
				if (
					!isOwnedJobPostMediaKey({
						organizationId: target.organizationId,
						storageKey: row.storageKey,
					})
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "이 공고의 조직에 속하지 않은 이미지 키입니다.",
					});
				}
			}

			const previousKeys = await db
				.select({ storageKey: jobPostMedia.storageKey })
				.from(jobPostMedia)
				.where(
					and(
						eq(jobPostMedia.jobPostId, input.jobPostId),
						eq(jobPostMedia.usage, "detail")
					)
				);

			const detail = await db.transaction(async (tx) => {
				await tx
					.delete(jobPostMedia)
					.where(
						and(
							eq(jobPostMedia.jobPostId, input.jobPostId),
							eq(jobPostMedia.usage, "detail")
						)
					);

				if (rows.length === 0) {
					return [];
				}

				return await tx
					.insert(jobPostMedia)
					.values(
						rows.map((row) => ({
							altText: row.altText.trim(),
							byteSize: row.byteSize,
							fileName: row.fileName.trim(),
							height: row.height ?? null,
							jobPostId: input.jobPostId,
							mimeType: row.mimeType,
							organizationId: target.organizationId,
							position: row.position,
							storageKey: row.storageKey,
							uploadedByUserId: admin.userId,
							usage: row.usage,
							width: row.width ?? null,
						}))
					)
					.returning();
			});

			const retained = new Set(rows.map((row) => row.storageKey));

			await deletePublicObjects(
				previousKeys
					.map((row) => row.storageKey)
					.filter((key) => !retained.has(key))
			);

			return { detail };
		}),
```

- [ ] **Step 5: 타입 체크·린트로 확인한다**

Run: `pnpm --filter @bambi-app/api check-types && pnpm ultracite fix packages/api/src/routers/bambi/moderation.ts`
Expected: 둘 다 PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/routers/bambi/moderation.ts
git commit -m "feat: 운영자 상세이미지 완성본 업로드·교체 프로시저 추가"
```

---

### Task 7: 웹 공용 라벨 맵과 공고 폼 상태 확장

**Files:**
- Modify: `apps/web/src/lib/bambi/exposure.ts:13-19`(라벨 맵), `apps/web/src/lib/bambi-job-form.ts:145-244`(JobForm·JobPostInput·emptyJobForm), `:900-970`(validateJobForm 출력)
- Test: `apps/web/test/lib/bambi/exposure.test.ts`(신규 또는 기존 파일에 describe 추가), `apps/web/test/lib/bambi-job-form.test.ts`(기존 파일에 describe 추가)

**Interfaces:**
- Consumes: Task 2의 `JobDetailDesignStatus`
- Produces:
  - `JOB_DETAIL_DESIGN_STATUS_LABELS = { requested: "제작 대기", completed: "제작 완료" }` (from `@/lib/bambi/exposure`)
  - `type JobDetailDesignStatusKey = keyof typeof JOB_DETAIL_DESIGN_STATUS_LABELS`
  - `JobForm.detailDesignRequested: boolean`, `JobForm.detailDesignAmount: number | null`
  - `JobPostInput.detailDesignRequested: boolean`, `JobPostInput.detailDesignAmount: number | null`

- [ ] **Step 1: 실패하는 라벨 테스트를 작성한다**

`apps/web/test/lib/bambi/exposure.test.ts`에 아래 describe를 추가한다(파일이 없으면 import 포함해 새로 만든다).

```ts
import { describe, expect, it } from "vitest";

import { JOB_DETAIL_DESIGN_STATUS_LABELS } from "@/lib/bambi/exposure";

describe("JOB_DETAIL_DESIGN_STATUS_LABELS", () => {
	it("enum 원값 대신 한국어 라벨을 제공한다", () => {
		expect(JOB_DETAIL_DESIGN_STATUS_LABELS.requested).toBe("제작 대기");
		expect(JOB_DETAIL_DESIGN_STATUS_LABELS.completed).toBe("제작 완료");
	});

	it("DB enum 값 2종만 담는다", () => {
		expect(Object.keys(JOB_DETAIL_DESIGN_STATUS_LABELS).sort()).toEqual([
			"completed",
			"requested",
		]);
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/lib/bambi/exposure.test.ts`
Expected: FAIL — `JOB_DETAIL_DESIGN_STATUS_LABELS is not exported`

- [ ] **Step 3: 라벨 맵을 추가한다**

`apps/web/src/lib/bambi/exposure.ts`의 `PAYMENT_STATUS_LABELS`(현재 :13) 다음에 넣는다.

```ts
export const PAYMENT_STATUS_LABELS = {
	unpaid: "미결제",
	paid: "결제완료",
} as const;

// 상세이미지 디자인 제작 애드온 진행 상태. DB enum(job_detail_design_status) 원값을
// 화면에 그대로 내보내지 않기 위한 라벨 맵이다. null(미신청)은 여기 없다 — 표시하지 않거나
// 호출부에서 "-"로 처리한다.
export const JOB_DETAIL_DESIGN_STATUS_LABELS = {
	requested: "제작 대기",
	completed: "제작 완료",
} as const;

export type ExposureType = keyof typeof EXPOSURE_TYPE_LABELS;
export type JobDetailDesignStatusKey =
	keyof typeof JOB_DETAIL_DESIGN_STATUS_LABELS;
export type PaymentStatus = keyof typeof PAYMENT_STATUS_LABELS;
```

- [ ] **Step 4: 라벨 테스트 통과를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/lib/bambi/exposure.test.ts`
Expected: PASS

- [ ] **Step 5: 실패하는 폼 검증 테스트를 작성한다**

`apps/web/test/lib/bambi-job-form.test.ts`에 아래 describe를 추가한다(기존 파일의 import 구문은 그대로 두고 필요한 심볼만 보강한다).

```ts
import { describe, expect, it } from "vitest";

import { emptyJobForm, validateJobForm } from "@/lib/bambi-job-form";

describe("validateJobForm — 상세이미지 디자인 제작 애드온", () => {
	const paidForm = {
		...emptyJobForm,
		adProductId: "11111111-1111-4111-8111-111111111111",
		description: "상세 설명을 충분히 적은 공고 본문입니다.",
		exposureAmount: 50_000,
		exposureDurationDays: 30,
		industryCategory: emptyJobForm.industryCategory,
		organizationId: "org-1",
		payAmount: "3000000",
		paymentMethod: "bank_transfer" as const,
		regionCode: "1100000000",
		title: "홀 서빙 구인",
		workSchedule: "20:00~02:00",
	};

	it("유료 상품에 옵션을 신청하면 신청 여부와 금액을 그대로 넘긴다", () => {
		const result = validateJobForm({
			...paidForm,
			detailDesignAmount: 30_000,
			detailDesignRequested: true,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.input.detailDesignRequested).toBe(true);
			expect(result.input.detailDesignAmount).toBe(30_000);
		}
	});

	it("무료 공고(상품 미선택)면 옵션 값을 모두 비운다", () => {
		const result = validateJobForm({
			...paidForm,
			adProductId: null,
			detailDesignAmount: 30_000,
			detailDesignRequested: true,
			exposureAmount: null,
			exposureDurationDays: null,
			paymentMethod: null,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.input.detailDesignRequested).toBe(false);
			expect(result.input.detailDesignAmount).toBeNull();
		}
	});
});
```

- [ ] **Step 6: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/lib/bambi-job-form.test.ts`
Expected: FAIL — `detailDesignRequested` 속성이 `JobForm`/`JobPostInput`에 없어 타입/런타임 모두 어긋난다

- [ ] **Step 7: 폼 타입과 기본값을 확장한다**

`apps/web/src/lib/bambi-job-form.ts`의 `JobForm`(현재 :145)에 두 필드를 알파벳 순으로 넣는다.

```ts
export interface JobForm {
	adBannerLayout: AdBannerLayout | null;
	adProductId: string | null;
	beginnerFriendly: boolean;
	description: string;
	// 선택한 상품의 상세이미지 디자인 제작 가격 스냅샷(화면에서 본 값). 서버가 재확인한다.
	detailDesignAmount: number | null;
	detailDesignRequested: boolean;
	districtCode: string;
	exposureAmount: number | null;
```

`JobPostInput`(현재 :170)에도 같은 자리에 넣는다.

```ts
	beginnerFriendly: boolean;
	description: string;
	descriptionBlocks: JobDescriptionBlockFormValue[];
	detailDesignAmount: number | null;
	detailDesignRequested: boolean;
	districtCode?: string;
```

`emptyJobForm`(현재 :224)에도 기본값을 넣는다.

```ts
	beginnerFriendly: false,
	description: "",
	detailDesignAmount: null,
	detailDesignRequested: false,
	districtCode: "",
```

- [ ] **Step 8: validateJobForm 출력에 값을 싣는다**

`isFreeExposure` 파생값 구역(현재 :906 `const exposureAmount = ...` 다음)에 추가한다.

```ts
	const exposureAmount = isFreeExposure ? null : form.exposureAmount;
	// 애드온은 유료 상품 전용이다. 무료 공고면 신청 여부·금액을 모두 비워 서버 BAD_REQUEST를
	// 폼 단계에서 미리 없앤다.
	const detailDesignRequested = isFreeExposure
		? false
		: form.detailDesignRequested;
	const detailDesignAmount = detailDesignRequested
		? form.detailDesignAmount
		: null;
	const paymentMethod = isFreeExposure ? null : form.paymentMethod;
```

성공 반환 객체(현재 :947 `input: {`)의 `descriptionBlocks` 다음에 넣는다.

```ts
				descriptionBlocks: normalizedBlocks,
				detailDesignAmount,
				detailDesignRequested,
				districtCode: districtCode || undefined,
```

- [ ] **Step 9: 테스트 통과를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/lib/bambi-job-form.test.ts test/lib/bambi/exposure.test.ts`
Expected: PASS

- [ ] **Step 10: 린트 후 커밋**

Run: `pnpm ultracite fix apps/web/src/lib/bambi/exposure.ts apps/web/src/lib/bambi-job-form.ts apps/web/test/lib`
Expected: PASS

```bash
git add apps/web/src/lib/bambi/exposure.ts apps/web/src/lib/bambi-job-form.ts apps/web/test/lib
git commit -m "feat: 디자인 제작 상태 라벨 맵과 공고 폼 애드온 상태 추가"
```

---

### Task 8: 운영자 광고 상품 폼에 옵션 가격 필드

**Files:**
- Modify: `apps/web/src/components/bambi/ad-product-form.tsx:55-65`(AdProductDraft), `:137-142`(state), `:227-241`(submit), `:528-543`(끌어올리기 필드 뒤 UI), `apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx:31-45`, `apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx:53-89`
- Test: `apps/web/test/components/bambi/ad-product-form.test.ts`

**Interfaces:**
- Consumes: Task 3의 `createProduct`/`updateProduct` 입력 필드 `detailDesignPrice`
- Produces: `AdProductDraft.detailDesignPrice: number | null` (두 페이지가 mutate 인자로 그대로 넘긴다)

- [ ] **Step 1: 실패하는 배선 테스트를 작성한다**

`apps/web/test/components/bambi/ad-product-form.test.ts`:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const read = (file: string) => fs.readFileSync(srcPath(file), "utf8");

describe("광고 상품 폼 — 상세이미지 디자인 제작 가격", () => {
	it("폼이 가격 입력 필드와 draft 필드를 갖는다", () => {
		const source = read("components/bambi/ad-product-form.tsx");

		expect(source).toContain("detailDesignPrice");
		expect(source).toContain("p-detail-design-price");
		expect(source).toContain("상세이미지 디자인 제작 가격");
	});

	it("등록·수정 페이지가 가격을 서버로 넘긴다", () => {
		for (const file of [
			"app/moderator/ad-products/[placementId]/new/page.tsx",
			"app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx",
		]) {
			expect(read(file)).toContain("detailDesignPrice: draft.detailDesignPrice");
		}
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/ad-product-form.test.ts`
Expected: FAIL — `expected '…' to contain 'detailDesignPrice'`

- [ ] **Step 3: draft 타입과 state를 추가한다**

`apps/web/src/components/bambi/ad-product-form.tsx`의 `AdProductDraft`(현재 :55):

```ts
export interface AdProductDraft {
	autoBoostsPerDay: number;
	benefits: string[];
	// 상세이미지 디자인 제작 애드온 가격. null이면 이 상품에는 옵션을 팔지 않는다.
	detailDesignPrice: number | null;
	discountCampaigns: DiscountCampaignDraft[];
	manualBoostsPerDay: number;
	name: string;
	previewImageUrl: string | null;
	previewTemplate: AdPreviewTemplateValue;
	priceOptions: PriceOption[];
	tagline: string;
}
```

`autoBoostsPerDay` state 선언(현재 :140) 다음에 추가한다.

```ts
	const [autoBoostsPerDay, setAutoBoostsPerDay] = useState(
		initialValue?.autoBoostsPerDay ?? 0
	);
	// 빈 문자열 = 미제공(null). 숫자로만 들고 있으면 "0원 제공"과 "미제공"을 구분할 수 없다.
	const [detailDesignPrice, setDetailDesignPrice] = useState(
		initialValue?.detailDesignPrice == null
			? ""
			: String(initialValue.detailDesignPrice)
	);
```

- [ ] **Step 4: submit 페이로드에 값을 싣는다**

`submit` 함수의 `onSubmit({ ... })`(현재 :227) 안, `benefits` 다음 줄에 추가한다.

```ts
		onSubmit({
			name: name.trim(),
			tagline: tagline.trim(),
			benefits: benefits
				.map((item) => item.value.trim())
				.filter((value) => value.length > 0),
			detailDesignPrice:
				detailDesignPrice.trim() === "" ? null : Number(detailDesignPrice),
			discountCampaigns,
```

- [ ] **Step 5: 입력 UI를 추가한다**

끌어올리기 필드 블록이 끝나는 자리(현재 :543 `)}` 다음, "게시 위치 미리보기" 블록 앞)에 넣는다.

```tsx
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-detail-design-price">
					상세이미지 디자인 제작 가격
				</Label>
				<div className="flex items-center gap-2">
					<Input
						className="w-40"
						id="p-detail-design-price"
						min={0}
						onChange={(e) => setDetailDesignPrice(e.target.value)}
						type="number"
						value={detailDesignPrice}
					/>
					<span className="text-muted-foreground text-sm">원</span>
				</div>
				<p className="m-0 text-muted-foreground text-xs">
					이 상품을 구매하는 구인자가 함께 신청할 수 있는 디자이너 상세이미지
					제작 옵션의 가격입니다. 비워두면 이 상품에는 옵션이 노출되지 않습니다.
				</p>
			</div>
```

- [ ] **Step 6: 등록 페이지를 배선한다**

`apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx`의 `create.mutate({...})`(현재 :33)에서 `benefits` 다음 줄:

```tsx
						benefits: draft.benefits,
						detailDesignPrice: draft.detailDesignPrice,
						discountCampaigns: draft.discountCampaigns,
```

- [ ] **Step 7: 수정 페이지를 배선한다**

`apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx`의 `initialValue`(현재 :55)와 `onSubmit`(현재 :72) 양쪽을 고친다.

```tsx
					initialValue={{
						name: product.name,
						tagline: product.tagline ?? "",
						benefits: product.benefits,
						detailDesignPrice: product.detailDesignPrice ?? null,
						discountCampaigns: product.discountCampaigns.map((campaign) => ({
```

```tsx
					onSubmit={(draft) =>
						updateProduct.mutate({
							id: productId,
							name: draft.name,
							tagline: draft.tagline.trim() || null,
							benefits: draft.benefits,
							detailDesignPrice: draft.detailDesignPrice,
							discountCampaigns: draft.discountCampaigns,
```

- [ ] **Step 8: 테스트 통과와 타입 체크를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/ad-product-form.test.ts && pnpm --filter web check-types`
Expected: 둘 다 PASS

- [ ] **Step 9: 린트 후 커밋**

Run: `pnpm ultracite fix apps/web/src/components/bambi/ad-product-form.tsx "apps/web/src/app/moderator/ad-products" apps/web/test/components/bambi/ad-product-form.test.ts`
Expected: PASS

```bash
git add apps/web/src/components/bambi/ad-product-form.tsx apps/web/src/app/moderator/ad-products apps/web/test/components/bambi/ad-product-form.test.ts
git commit -m "feat: 운영자 광고 상품 폼에 디자인 제작 가격 필드 추가"
```

---

### Task 9: 광고 안내 화면에 옵션 안내 라인

**Files:**
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx:172-204`(서비스 내용 블록)
- Test: `apps/web/test/components/bambi/screens/employer-ad-guide.test.ts`

**Interfaces:**
- Consumes: Task 3의 `getCatalog` 응답 `product.detailDesignPrice` / 기존 `formatAdPrice`(`@/lib/bambi/ad-catalog`)
- Produces: 없음(화면 전용)

- [ ] **Step 1: 실패하는 배선 테스트를 작성한다**

`apps/web/test/components/bambi/screens/employer-ad-guide.test.ts`(기존 파일이 있으면 describe만 추가):

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../../src-path";

describe("광고 안내 — 상세이미지 디자인 제작 안내", () => {
	it("가격이 설정된 상품 카드에만 안내 라인을 그린다", () => {
		const source = fs.readFileSync(
			srcPath("components/bambi/screens/employer-ad-guide.tsx"),
			"utf8"
		);

		expect(source).toContain("product.detailDesignPrice");
		expect(source).toContain("상세이미지 디자인 제작 +");
		expect(source).toContain("formatAdPrice");
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/screens/employer-ad-guide.test.ts`
Expected: FAIL — `expected '…' to contain 'product.detailDesignPrice'`

- [ ] **Step 3: import에 formatAdPrice를 더한다**

`apps/web/src/components/bambi/screens/employer-ad-guide.tsx`의 ad-catalog import(현재 :22):

```ts
import {
	type AdCatalogPlacement,
	formatAdCampaignPeriod,
	formatAdDuration,
	formatAdPrice,
} from "@/lib/bambi/ad-catalog";
```

- [ ] **Step 4: 서비스 내용 블록에 안내 라인을 추가한다**

`autoBoostsPerDay` 안내 라인(현재 :184-188) 바로 다음에 넣는다.

```tsx
							{product.autoBoostsPerDay > 0 ? (
								<span className="font-medium text-coral-500 text-sm">
									일일 자동 끌어올리기 {product.autoBoostsPerDay}회 포함
								</span>
							) : null}
							{product.detailDesignPrice === null ? null : (
								<span className="font-medium text-coral-500 text-sm">
									상세이미지 디자인 제작 +
									{formatAdPrice(product.detailDesignPrice)} (선택)
								</span>
							)}
```

- [ ] **Step 5: 테스트 통과와 타입 체크를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/screens/employer-ad-guide.test.ts && pnpm --filter web check-types`
Expected: 둘 다 PASS

- [ ] **Step 6: 린트 후 커밋**

Run: `pnpm ultracite fix apps/web/src/components/bambi/screens/employer-ad-guide.tsx apps/web/test/components/bambi/screens/employer-ad-guide.test.ts`
Expected: PASS

```bash
git add apps/web/src/components/bambi/screens/employer-ad-guide.tsx apps/web/test/components/bambi/screens/employer-ad-guide.test.ts
git commit -m "feat: 광고 안내 상품 카드에 디자인 제작 옵션 안내 추가"
```

---

### Task 10: 공고 폼 애드온 체크박스와 총액 합산

**Files:**
- Modify: `apps/web/src/components/bambi/job-exposure-fields.tsx:77-89`(props), `:106-139`(PayableTotal), `:179-238`(파생값·동기화 effect), `:382-386`(렌더), `apps/web/src/app/employer/new/page.tsx:444-498`, `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`(같은 구역), `apps/web/src/app/moderator/jobs/[id]/edit/page.tsx`(프리필)
- Test: `apps/web/test/components/bambi/job-exposure-fields.test.ts`(기존 파일에 describe 추가)

**Interfaces:**
- Consumes: Task 2의 `sumJobPaymentAmount` / Task 3의 `product.detailDesignPrice` / Task 7의 `JobForm.detailDesignRequested`·`detailDesignAmount`
- Produces: `JobExposureFields`의 새 props
  - `detailDesignAmount: number | null`
  - `detailDesignRequested: boolean`
  - `onDetailDesignChange: (requested: boolean, amount: number | null) => void`

- [ ] **Step 1: 실패하는 배선 테스트를 작성한다**

`apps/web/test/components/bambi/job-exposure-fields.test.ts`에 describe를 추가한다.

```ts
describe("상세이미지 디자인 제작 애드온", () => {
	it("옵션이 있는 상품에서만 체크박스를 그리고 총액에 합산한다", () => {
		const source = fs.readFileSync(
			srcPath("components/bambi/job-exposure-fields.tsx"),
			"utf8"
		);

		expect(source).toContain("selectedProduct?.detailDesignPrice");
		expect(source).toContain("sumJobPaymentAmount");
		expect(source).toContain("detail-design-requested");
	});

	it("등록·수정 폼이 애드온 상태를 JobExposureFields에 잇는다", () => {
		for (const file of [
			"app/employer/new/page.tsx",
			"app/employer/jobs/[id]/edit/page.tsx",
		]) {
			const source = fs.readFileSync(srcPath(file), "utf8");

			expect(source).toContain(
				"detailDesignRequested={form.detailDesignRequested}"
			);
			expect(source).toContain("onDetailDesignChange={handleDetailDesignChange}");
		}
	});
});
```

> 기존 파일 상단에 `srcPath` import가 없다면 `import { srcPath } from "../../src-path";`를 추가한다.

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/job-exposure-fields.test.ts`
Expected: FAIL — `expected '…' to contain 'selectedProduct?.detailDesignPrice'`

- [ ] **Step 3: props와 import를 확장한다**

`apps/web/src/components/bambi/job-exposure-fields.tsx` 상단 import에 두 줄을 더한다.

```ts
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";
```

> `@bambi-app/api/services/...` 직접 import는 `@/lib/bambi/ad-catalog`가 `bambi-ad-pricing`을 쓰는 것과 같은 기존 패턴이다(해당 모듈은 import 없는 pure 모듈).

`JobExposureFieldsProps`(현재 :77)에 알파벳 순으로 넣는다.

```ts
interface JobExposureFieldsProps {
	adProductId: string | null;
	detailDesignAmount: number | null;
	detailDesignRequested: boolean;
	errors?: Pick<
		JobFormErrors,
		"exposureDurationDays" | "exposureType" | "paymentMethod"
	>;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	onDetailDesignChange: (requested: boolean, amount: number | null) => void;
	onDurationChange: (days: number | null, amount: number | null) => void;
	onPaymentMethodChange: (value: JobPaymentMethod) => void;
	onProductChange: (productId: string | null) => void;
	paymentMethod: JobPaymentMethod | null;
}
```

- [ ] **Step 4: PayableTotal이 합산 금액을 그리게 고친다**

기존 `PayableTotal`(현재 :107-139)을 통째로 아래로 교체한다.

```tsx
// 결제 예정 금액 = 노출 금액 + 디자인 제작 옵션 금액. 애드온이 없을 때는 기존처럼
// 원가 취소선(AdPriceTag)을 보여 주고, 애드온이 붙으면 총액 + 내역 한 줄로 바꾼다
// (취소선 뱃지 옆에 다른 금액을 더하면 어느 값이 결제액인지 읽히지 않는다).
function PayableTotal({
	amount,
	detailDesignAmount,
	option,
	show,
}: {
	amount: number | null;
	detailDesignAmount: number | null;
	option: AdPriceOption | undefined;
	show: boolean;
}) {
	if (!show) {
		return null;
	}

	const total = sumJobPaymentAmount(amount, detailDesignAmount);

	return (
		<div className="flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-muted-foreground text-sm">
					결제 예정 금액
				</span>
				{option && detailDesignAmount === null ? (
					<AdPriceTag
						amount={option.amount}
						className="justify-end"
						discountPercent={option.discountPercent ?? 0}
						priceClassName="min-w-0 break-words font-semibold text-lg text-primary"
					/>
				) : (
					<span className="min-w-0 break-words font-semibold text-lg text-primary">
						{total === null ? "" : formatAdPrice(total)}
					</span>
				)}
			</div>
			{detailDesignAmount === null ? null : (
				<span className="text-muted-foreground text-xs">
					광고 {formatAdPrice(amount ?? 0)} + 상세이미지 디자인 제작{" "}
					{formatAdPrice(detailDesignAmount)}
				</span>
			)}
		</div>
	);
}
```

- [ ] **Step 5: 컴포넌트 본문에 파생값·동기화·체크박스를 추가한다**

`JobExposureFields` 시그니처(현재 :158)를 새 props로 바꾼다.

```tsx
export function JobExposureFields({
	adProductId,
	detailDesignAmount,
	detailDesignRequested,
	errors,
	exposureAmount,
	exposureDurationDays,
	onDetailDesignChange,
	onDurationChange,
	onPaymentMethodChange,
	onProductChange,
	paymentMethod,
}: JobExposureFieldsProps) {
```

`showTotal` 계산(현재 :191) 다음에 파생값을 추가한다.

```tsx
	// 상품에 옵션 가격이 설정된 경우에만 체크박스를 연다(null = 미제공).
	const detailDesignPrice = selectedProduct?.detailDesignPrice ?? null;
	const canRequestDetailDesign = detailDesignPrice !== null;
	const appliedDetailDesignAmount =
		canRequestDetailDesign && detailDesignRequested ? detailDesignAmount : null;
```

`selectedDurationOption` 동기화 effect(현재 :221-238) 다음에 옵션 가격 동기화 effect를 추가한다.

```tsx
	// 운영자가 상품 가격을 바꾸면 폼이 들고 있던 스냅샷이 낡는다. 노출 금액과 같은 방식으로
	// 최신 가격을 되돌려 서버 CONFLICT(가격 변경 재확인)를 미리 없앤다.
	useEffect(() => {
		if (!(detailDesignRequested && detailDesignPrice !== null)) {
			return;
		}

		if (detailDesignPrice !== detailDesignAmount) {
			onDetailDesignChange(true, detailDesignPrice);
		}
	}, [
		detailDesignAmount,
		detailDesignPrice,
		detailDesignRequested,
		onDetailDesignChange,
	]);

	// 옵션이 없는 상품으로 바꾸면 신청 상태를 즉시 내려놓는다(서버가 BAD_REQUEST로 막는 조합).
	useEffect(() => {
		if (detailDesignPrice === null && detailDesignRequested) {
			onDetailDesignChange(false, null);
		}
	}, [detailDesignPrice, detailDesignRequested, onDetailDesignChange]);
```

`PayableTotal` 렌더(현재 :382)를 체크박스 블록과 함께 교체한다.

```tsx
					{showPaidOptions && canRequestDetailDesign ? (
						<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
							<div className="flex items-start gap-2">
								<Checkbox
									checked={detailDesignRequested}
									id="detail-design-requested"
									onCheckedChange={(checked) =>
										onDetailDesignChange(
											checked === true,
											checked === true ? detailDesignPrice : null
										)
									}
								/>
								<div className="flex min-w-0 flex-col gap-1">
									<FieldLabel htmlFor="detail-design-requested">
										상세이미지 디자인 제작 +{formatAdPrice(detailDesignPrice)}
									</FieldLabel>
									<span className="text-muted-foreground text-xs">
										디자이너가 공고 상세페이지 이미지를 제작해 드립니다. 제작
										요청 내용은 결제 확인 후 운영자가 채팅으로 안내합니다.
									</span>
								</div>
							</div>
						</div>
					) : null}

					<PayableTotal
						amount={exposureAmount}
						detailDesignAmount={appliedDetailDesignAmount}
						option={selectedDurationOption}
						show={showTotal}
					/>
```

- [ ] **Step 6: 등록 폼(new)을 배선한다**

`apps/web/src/app/employer/new/page.tsx`의 `updateExposureFields` 타입(현재 :444)에 필드를 더하고 핸들러를 추가한다.

```tsx
	const updateExposureFields = (
		patch: Partial<
			Pick<
				JobForm,
				| "adProductId"
				| "detailDesignAmount"
				| "detailDesignRequested"
				| "exposureAmount"
				| "exposureDurationDays"
				| "exposureType"
				| "paymentMethod"
			>
		>
	) => {
```

`handleProductChange`(현재 :471)에서 상품을 바꿀 때 애드온 상태를 초기화한다(가격이 상품마다 다르므로 유지하면 낡은 스냅샷이 남는다).

```tsx
	const handleProductChange = (productId: string | null) => {
		updateExposureFields(
			productId
				? {
						adProductId: productId,
						detailDesignAmount: null,
						detailDesignRequested: false,
						exposureAmount: null,
						exposureDurationDays: null,
					}
				: {
						adProductId: null,
						detailDesignAmount: null,
						detailDesignRequested: false,
						exposureAmount: null,
						exposureDurationDays: null,
						exposureType: "standard",
						paymentMethod: null,
					}
		);
	};

	const handleDetailDesignChange = (
		requested: boolean,
		amount: number | null
	) => {
		updateExposureFields({
			detailDesignAmount: amount,
			detailDesignRequested: requested,
		});
	};
```

그리고 `<JobExposureFields ... />` 렌더에 세 props를 잇는다.

```tsx
							detailDesignAmount={form.detailDesignAmount}
							detailDesignRequested={form.detailDesignRequested}
							onDetailDesignChange={handleDetailDesignChange}
```

- [ ] **Step 7: 구인자 수정 폼(edit)에 같은 배선을 넣는다**

`apps/web/src/app/employer/jobs/[id]/edit/page.tsx`에 Step 6과 **동일한** 3개 변경을 적용한다.

```tsx
	const updateExposureFields = (
		patch: Partial<
			Pick<
				JobForm,
				| "adProductId"
				| "detailDesignAmount"
				| "detailDesignRequested"
				| "exposureAmount"
				| "exposureDurationDays"
				| "exposureType"
				| "paymentMethod"
			>
		>
	) => {
```

```tsx
	const handleDetailDesignChange = (
		requested: boolean,
		amount: number | null
	) => {
		updateExposureFields({
			detailDesignAmount: amount,
			detailDesignRequested: requested,
		});
	};
```

```tsx
							detailDesignAmount={form.detailDesignAmount}
							detailDesignRequested={form.detailDesignRequested}
							onDetailDesignChange={handleDetailDesignChange}
```

추가로 프리필(서버 공고 → 폼)에서 애드온 상태를 복원한다. 이 파일의 `setForm({ ... })` 프리필 블록에서 `exposureAmount` 옆에 넣는다.

```tsx
			detailDesignAmount: job.detailDesignAmount,
			detailDesignRequested: job.detailDesignStatus !== null,
```

- [ ] **Step 8: 운영자 공고 수정 폼의 프리필을 보강한다**

`apps/web/src/app/moderator/jobs/[id]/edit/page.tsx`의 프리필 `setForm({ ... })`에도 같은 두 줄을 넣는다. 넣지 않으면 `emptyJobForm` 기본값(false)이 서버로 가서 구인자가 신청한 옵션이 조용히 해제된다.

```tsx
			detailDesignAmount: job.detailDesignAmount,
			detailDesignRequested: job.detailDesignStatus !== null,
```

- [ ] **Step 9: 테스트·타입 체크를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts && pnpm --filter web check-types`
Expected: 둘 다 PASS

- [ ] **Step 10: 린트 후 커밋**

Run: `pnpm ultracite fix apps/web/src/components/bambi/job-exposure-fields.tsx apps/web/src/app/employer apps/web/src/app/moderator/jobs apps/web/test/components/bambi/job-exposure-fields.test.ts`
Expected: PASS

```bash
git add apps/web/src/components/bambi/job-exposure-fields.tsx apps/web/src/app/employer apps/web/src/app/moderator/jobs apps/web/test/components/bambi/job-exposure-fields.test.ts
git commit -m "feat: 공고 폼에 디자인 제작 체크박스와 총액 합산 추가"
```

---

### Task 11: 운영자 결제 화면 뱃지·필터·디자인 제작 관리 다이얼로그

**Files:**
- Create: `apps/web/src/components/bambi/job-detail-design-dialog.tsx`
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx:433-473`(상세 슬롯 추출), `apps/web/src/app/moderator/payments/page.tsx:45-120`(컬럼), `:122-270`(필터·상태)
- Test: `apps/web/test/components/bambi/job-detail-design-dialog.test.ts`

**Interfaces:**
- Consumes: Task 5의 `setJobPostDesignStatus`·`listJobsForPayment` 확장 / Task 6의 `createJobPostDesignMediaUpload`·`setJobPostDesignMedia` / Task 7의 `JOB_DETAIL_DESIGN_STATUS_LABELS` / Task 2의 `sumJobPaymentAmount` / 기존 `uploadFileToSignedUrl`(`@/lib/bambi-job-form`)·`jobMediaPublicUrl`(`@/lib/bambi/api-job-mapper`)·`getJobPostForAdmin`
- Produces:
  - `export function JobDetailImageSlots({ allowUpload?: boolean; media: JobFormMedia; onChange: (media: JobFormMedia) => void })` (from `@/components/bambi/job-post-media-uploader`)
  - `export function JobDetailDesignDialog({ jobPostId, onOpenChange, open, status }: { jobPostId: string; onOpenChange: (open: boolean) => void; open: boolean; status: JobDetailDesignStatusKey })`

- [ ] **Step 1: 실패하는 배선 테스트를 작성한다**

`apps/web/test/components/bambi/job-detail-design-dialog.test.ts`:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const read = (file: string) => fs.readFileSync(srcPath(file), "utf8");

describe("디자인 제작 관리 다이얼로그", () => {
	it("상세 이미지 슬롯 컴포넌트를 재사용한다", () => {
		expect(read("components/bambi/job-post-media-uploader.tsx")).toContain(
			"export function JobDetailImageSlots"
		);
		expect(read("components/bambi/job-detail-design-dialog.tsx")).toContain(
			"JobDetailImageSlots"
		);
	});

	it("업로드 인텐트·교체·완료 토글 프로시저를 모두 호출한다", () => {
		const source = read("components/bambi/job-detail-design-dialog.tsx");

		expect(source).toContain("createJobPostDesignMediaUpload");
		expect(source).toContain("setJobPostDesignMedia");
		expect(source).toContain("setJobPostDesignStatus");
		expect(source).toContain("uploadFileToSignedUrl");
	});

	it("결제 관리 화면이 총액 합산·필터·다이얼로그를 갖는다", () => {
		const source = read("app/moderator/payments/page.tsx");

		expect(source).toContain("sumJobPaymentAmount");
		expect(source).toContain("onlyDetailDesign");
		expect(source).toContain("JOB_DETAIL_DESIGN_STATUS_LABELS");
		expect(source).toContain("JobDetailDesignDialog");
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/job-detail-design-dialog.test.ts`
Expected: FAIL — `ENOENT: components/bambi/job-detail-design-dialog.tsx`

- [ ] **Step 3: 상세 이미지 슬롯 그리드를 재사용 가능한 컴포넌트로 뽑는다**

`apps/web/src/components/bambi/job-post-media-uploader.tsx`에서 상세 슬롯 그리드(현재 :433-473)를 아래 컴포넌트로 옮기고, 원래 자리에는 호출만 남긴다.

```tsx
// 상세 이미지 5칸 그리드. 공고 폼과 운영자 "디자인 제작 관리" 다이얼로그가 같은 UI·같은
// 파일 검증(pickMediaItem)을 쓰도록 컴포넌트로 뽑았다.
export function JobDetailImageSlots({
	allowUpload = true,
	media,
	onChange,
}: {
	allowUpload?: boolean;
	media: JobFormMedia;
	onChange: (media: JobFormMedia) => void;
}) {
	return (
		<div className="grid gap-3 lg:grid-cols-2">
			{detailSlots.map(({ index, key }) => {
				const item = media.detail[index] ?? null;

				// 업로드 불가 + 빈 슬롯이면 아무것도 못 하는 빈 칸이라 숨긴다.
				if (!(allowUpload || item)) {
					return null;
				}

				return (
					<MediaSlot
						accept={staticImageAccept}
						allowUpload={allowUpload}
						id={`job-detail-image-${index}`}
						item={item}
						key={key}
						label={`상세 이미지 ${index + 1}`}
						onAltTextChange={(altText) =>
							onChange(
								updateDetailAt(media, index, item ? { ...item, altText } : null)
							)
						}
						onFileChange={async (file) => {
							const created = await pickMediaItem(file, item);

							if (created) {
								onChange(updateDetailAt(media, index, created));
							}
						}}
						onRemove={() => {
							revokeMediaItemPreview(item);
							onChange(updateDetailAt(media, index, null));
						}}
					/>
				);
			})}
		</div>
	);
}
```

`JobPostMediaUploader` 본문의 해당 자리는 호출 한 줄로 바꾼다.

```tsx
			<JobDetailImageSlots
				allowUpload={allowUpload}
				media={media}
				onChange={onChange}
			/>
```

- [ ] **Step 4: 다이얼로그 컴포넌트를 만든다**

`apps/web/src/components/bambi/job-detail-design-dialog.tsx`:

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { JobDetailImageSlots } from "@/components/bambi/job-post-media-uploader";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import type { JobDetailDesignStatusKey } from "@/lib/bambi/exposure";
import {
	emptyJobFormMedia,
	type JobFormMedia,
	uploadFileToSignedUrl,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

// 운영자가 완성본 상세이미지를 올리고 제작 완료로 넘기는 창. 시안 교환은 스코프 밖이라
// 여기서는 "최종 결과물 등록 + 상태 토글"만 한다.
export function JobDetailDesignDialog({
	jobPostId,
	onOpenChange,
	open,
	status,
}: {
	jobPostId: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	status: JobDetailDesignStatusKey;
}) {
	const queryClient = useQueryClient();
	const [media, setMedia] = useState<JobFormMedia>({
		...emptyJobFormMedia,
		detail: [],
	});
	const [isSaving, setIsSaving] = useState(false);
	const jobQuery = useQuery({
		...orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId },
		}),
		enabled: open,
	});
	const createUpload = useMutation(
		orpc.bambi.moderation.createJobPostDesignMediaUpload.mutationOptions()
	);
	const setDesignMedia = useMutation(
		orpc.bambi.moderation.setJobPostDesignMedia.mutationOptions()
	);
	const setDesignStatus = useMutation(
		orpc.bambi.moderation.setJobPostDesignStatus.mutationOptions()
	);

	// 저장된 이미지는 공개 버킷 URL로 미리보기를 만든다(운영자 공고 수정 화면과 동일 경로).
	useEffect(() => {
		if (!jobQuery.data) {
			return;
		}

		setMedia({
			...emptyJobFormMedia,
			detail: jobQuery.data.media.detail.map((item) => ({
				altText: item.altText,
				byteSize: item.byteSize,
				fileName: item.fileName,
				height: item.height ?? undefined,
				mimeType: item.mimeType,
				previewUrl: jobMediaPublicUrl(item.storageKey),
				storageKey: item.storageKey,
				width: item.width ?? undefined,
			})),
		});
	}, [jobQuery.data]);

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.listJobsForPayment.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.getJobPostForAdmin.queryKey({
					input: { jobPostId },
				}),
			}),
		]);
	};

	const handleSave = async () => {
		setIsSaving(true);

		try {
			const detail = [];

			for (const item of media.detail) {
				// 이미 저장된 이미지는 키를 그대로 재사용한다(다시 올리면 고아 객체가 쌓인다).
				if (item.storageKey) {
					detail.push({
						altText: item.altText,
						byteSize: item.byteSize,
						fileName: item.fileName,
						height: item.height,
						mimeType: item.mimeType,
						storageKey: item.storageKey,
						width: item.width,
					});
					continue;
				}

				if (!item.file) {
					throw new Error("이미지 파일을 다시 선택해 주세요.");
				}

				const uploadIntent = await createUpload.mutateAsync({
					byteSize: item.file.size,
					fileName: item.file.name,
					jobPostId,
					mimeType: item.file.type,
				});

				await uploadFileToSignedUrl({ file: item.file, uploadIntent });

				detail.push({
					altText: item.altText,
					byteSize: uploadIntent.byteSize,
					fileName: uploadIntent.fileName,
					height: item.height,
					mimeType: uploadIntent.mimeType,
					storageKey: uploadIntent.storageKey,
					width: item.width,
				});
			}

			await setDesignMedia.mutateAsync({ detail, jobPostId });
			await invalidate();
			toast.success("상세 이미지를 저장했어요.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "상세 이미지를 저장하지 못했어요."
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleToggleStatus = () => {
		setDesignStatus.mutate(
			{
				jobPostId,
				status: status === "completed" ? "requested" : "completed",
			},
			{
				onError: (error) => toast.error(error.message),
				onSuccess: async () => {
					await invalidate();
					toast.success("제작 상태를 변경했어요.");
				},
			}
		);
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="w-auto max-w-[92vw] md:max-w-2xl">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<DialogTitle className="text-base">디자인 제작 관리</DialogTitle>
						<DialogDescription>
							제작한 상세이미지를 최대 5장까지 등록하고, 완료되면 상태를 제작
							완료로 바꿔 주세요.
						</DialogDescription>
					</div>

					<JobDetailImageSlots media={media} onChange={setMedia} />

					<div className="flex flex-wrap items-center justify-end gap-2">
						<DialogClose render={<Button variant="ghost" />}>닫기</DialogClose>
						<Button
							disabled={setDesignStatus.isPending || isSaving}
							onClick={handleToggleStatus}
							variant="outline"
						>
							{status === "completed" ? "제작 대기로 되돌리기" : "제작 완료 처리"}
						</Button>
						<Button disabled={isSaving} onClick={handleSave}>
							상세 이미지 저장
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 5: 결제 관리 화면의 컬럼을 확장한다**

`apps/web/src/app/moderator/payments/page.tsx` import에 아래를 추가한다.

```ts
import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";
import { JobDetailDesignDialog } from "@/components/bambi/job-detail-design-dialog";
import { StatusBadge } from "@/components/bambi/status-badge";
import { JOB_DETAIL_DESIGN_STATUS_LABELS } from "@/lib/bambi/exposure";
```

`PaymentColumnsOptions`에 다이얼로그 오픈 콜백을 더한다.

```ts
interface PaymentColumnsOptions {
	allSelected: boolean;
	onOpenDesign: (jobId: string) => void;
	onToggleAll: (checked: boolean) => void;
	onToggleRow: (id: string) => void;
	selectedIds: Set<string>;
	someSelected: boolean;
}
```

`getPaymentColumns` 시그니처에 `onOpenDesign`을 추가하고, `exposureAmount` 컬럼(현재 :77-89)을 총액 표기로 바꾼 뒤 그 아래에 디자인 제작 컬럼을 넣는다.

```tsx
		{
			id: "exposureAmount",
			header: "결제 금액",
			sortValue: (job) =>
				sumJobPaymentAmount(job.exposureAmount, job.detailDesignAmount) ?? 0,
			cell: (job) => {
				const total = sumJobPaymentAmount(
					job.exposureAmount,
					job.detailDesignAmount
				);

				if (total === null) {
					return <span className="text-muted-foreground">무료</span>;
				}

				return (
					<div className="flex flex-col items-start gap-0.5">
						<span className="whitespace-nowrap font-medium text-foreground">
							{formatAdPrice(total)}
						</span>
						{job.detailDesignAmount === null ? null : (
							<span className="whitespace-nowrap text-muted-foreground text-xs">
								디자인 +{formatAdPrice(job.detailDesignAmount)}
							</span>
						)}
					</div>
				);
			},
		},
		{
			id: "detailDesign",
			header: "디자인 제작",
			sortValue: (job) => job.detailDesignStatus ?? "",
			cell: (job) =>
				job.detailDesignStatus === null ? (
					<span className="text-muted-foreground">-</span>
				) : (
					<div className="flex flex-col items-start gap-1">
						<StatusBadge
							tone={job.detailDesignStatus === "completed" ? "good" : "warning"}
						>
							{JOB_DETAIL_DESIGN_STATUS_LABELS[job.detailDesignStatus]}
						</StatusBadge>
						<Button
							onClick={() => onOpenDesign(job.id)}
							size="sm"
							type="button"
							variant="outline"
						>
							디자인 제작 관리
						</Button>
					</div>
				),
		},
```

- [ ] **Step 6: 필터·다이얼로그 상태를 페이지에 붙인다**

`ModeratorPaymentsPage` 상태와 쿼리 입력을 고친다.

```tsx
	const [onlyUnpaid, setOnlyUnpaid] = useState(false);
	const [onlyDetailDesign, setOnlyDetailDesign] = useState(false);
	const [designJobId, setDesignJobId] = useState<null | string>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const queryInput = { onlyDetailDesign, onlyUnpaid } as const;
```

`invalidateQueries`의 `input: { onlyUnpaid }`도 `input: queryInput`으로 바꾼다(필터가 두 개가 되면서 키가 어긋나면 목록이 갱신되지 않는다).

`columns` useMemo에 콜백을 잇는다.

```tsx
	const columns = useMemo(
		() =>
			getPaymentColumns({
				allSelected,
				onOpenDesign: setDesignJobId,
				onToggleAll: toggleAll,
				onToggleRow: toggleRow,
				selectedIds,
				someSelected,
			}),
		[allSelected, someSelected, selectedIds, toggleAll, toggleRow]
	);
```

"미결제만 보기" 스위치 옆(현재 :258-268)에 필터 스위치를 하나 더 둔다.

```tsx
					<div className="flex items-center gap-2">
						<Switch
							checked={onlyDetailDesign}
							id="only-detail-design"
							onCheckedChange={(checked) => {
								setOnlyDetailDesign(checked);
								clearSelection();
							}}
						/>
						<Label htmlFor="only-detail-design">디자인 제작 신청건만</Label>
					</div>
```

표 아래(현재 :342 `) : null}` 다음, 컨테이너 닫기 전)에 다이얼로그를 건다.

```tsx
			{designJobId ? (
				<JobDetailDesignDialog
					jobPostId={designJobId}
					onOpenChange={(open) => {
						if (!open) {
							setDesignJobId(null);
						}
					}}
					open
					status={
						jobs.find((job) => job.id === designJobId)?.detailDesignStatus ??
						"requested"
					}
				/>
			) : null}
```

- [ ] **Step 7: 테스트·타입 체크를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts && pnpm --filter web check-types`
Expected: 둘 다 PASS

- [ ] **Step 8: 린트 후 커밋**

Run: `pnpm ultracite fix apps/web/src/components/bambi/job-detail-design-dialog.tsx apps/web/src/components/bambi/job-post-media-uploader.tsx apps/web/src/app/moderator/payments apps/web/test/components/bambi/job-detail-design-dialog.test.ts`
Expected: PASS

```bash
git add apps/web/src/components/bambi/job-detail-design-dialog.tsx apps/web/src/components/bambi/job-post-media-uploader.tsx apps/web/src/app/moderator/payments apps/web/test/components/bambi/job-detail-design-dialog.test.ts
git commit -m "feat: 운영자 결제 화면에 디자인 제작 뱃지·필터·관리 다이얼로그 추가"
```

---

### Task 12: 구인자 공고 목록에 제작 상태 뱃지

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts:1548-1574`(listMine select), `apps/web/src/components/bambi/employer-jobs-columns.tsx:109-135`(상태 컬럼)
- Test: `apps/web/test/components/bambi/employer-jobs-columns.test.ts`(기존 파일에 describe 추가)

**Interfaces:**
- Consumes: Task 1의 `jobPost.detailDesignStatus` / Task 7의 `JOB_DETAIL_DESIGN_STATUS_LABELS`
- Produces: `jobs.listMine` 응답 행에 `detailDesignStatus: "completed" | "requested" | null`

> 구인자 화면은 카드가 아니라 `DataTable` 컬럼 구성이다(스펙의 "공고 카드"에 대응하는 실제 UI). 별도 열을 늘리지 않고 기존 "공고 상태" 셀에 두 번째 뱃지로 붙인다 — 표가 가로로 더 넓어지면 모바일에서 가로 스크롤이 길어진다.

- [ ] **Step 1: 실패하는 배선 테스트를 작성한다**

`apps/web/test/components/bambi/employer-jobs-columns.test.ts`에 describe를 추가한다.

```ts
describe("상세이미지 디자인 제작 상태 뱃지", () => {
	it("라벨 맵을 경유해 제작 상태를 표시한다", () => {
		const source = fs.readFileSync(
			srcPath("components/bambi/employer-jobs-columns.tsx"),
			"utf8"
		);

		expect(source).toContain("JOB_DETAIL_DESIGN_STATUS_LABELS");
		expect(source).toContain("job.detailDesignStatus");
	});
});
```

> 기존 파일 상단에 `srcPath` import가 없다면 `import { srcPath } from "../../src-path";`를 추가한다.

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/employer-jobs-columns.test.ts`
Expected: FAIL — `expected '…' to contain 'JOB_DETAIL_DESIGN_STATUS_LABELS'`

- [ ] **Step 3: listMine 응답에 상태 컬럼을 더한다**

`packages/api/src/routers/bambi/jobs.ts`의 `listMine` select(현재 :1566)에서 `exposureType` 다음 줄:

```ts
				exposureType: jobPost.exposureType,
				detailDesignStatus: jobPost.detailDesignStatus,
				paymentStatus: jobPost.paymentStatus,
```

- [ ] **Step 4: 상태 컬럼에 뱃지를 추가한다**

`apps/web/src/components/bambi/employer-jobs-columns.tsx` import에 라벨 맵을 더한다.

```ts
import {
	getJobDisplayStatus,
	JOB_DETAIL_DESIGN_STATUS_LABELS,
} from "@/lib/bambi/exposure";
```

`status` 컬럼 cell(현재 :119-134)에 두 번째 뱃지를 붙인다.

```tsx
				return (
					<div className="flex flex-col items-start gap-1">
						<div className="flex flex-wrap items-center gap-1">
							<StatusBadge tone={display.tone}>{display.label}</StatusBadge>
							{job.detailDesignStatus === null ? null : (
								<StatusBadge
									tone={
										job.detailDesignStatus === "completed" ? "good" : "warning"
									}
								>
									상세이미지{" "}
									{JOB_DETAIL_DESIGN_STATUS_LABELS[job.detailDesignStatus]}
								</StatusBadge>
							)}
						</div>
						{note ? (
							// 반려 사유는 길 수 있다. 셀 폭을 붙들어 두고 줄바꿈시킨다.
							<span className="max-w-56 text-pretty break-words text-muted-foreground text-xs">
								{note}
							</span>
						) : null}
					</div>
				);
```

- [ ] **Step 5: 테스트·타입 체크를 확인한다**

Run: `pnpm vitest run --config apps/web/vitest.config.ts test/components/bambi/employer-jobs-columns.test.ts && pnpm --filter web check-types && pnpm --filter @bambi-app/api check-types`
Expected: 모두 PASS

- [ ] **Step 6: 린트 후 커밋**

Run: `pnpm ultracite fix packages/api/src/routers/bambi/jobs.ts apps/web/src/components/bambi/employer-jobs-columns.tsx apps/web/test/components/bambi/employer-jobs-columns.test.ts`
Expected: PASS

```bash
git add packages/api/src/routers/bambi/jobs.ts apps/web/src/components/bambi/employer-jobs-columns.tsx apps/web/test/components/bambi/employer-jobs-columns.test.ts
git commit -m "feat: 구인자 공고 목록에 상세이미지 제작 상태 뱃지 추가"
```

---

### Task 13: 매뉴얼 갱신

**Files:**
- Modify: `docs/manual/employer-manual.md:288-323`(### 광고 상품 안내), `docs/manual/employer-manual.md:326-347`(### 광고 관리), `docs/manual/moderator-manual.md:641-649`(**상품 등록·수정과 가격 옵션별 할인율**), `docs/manual/moderator-manual.md:660-689`(### 3.10 결제 관리)

**Interfaces:**
- Consumes: Task 8~12에서 확정된 화면 문구(체크박스 라벨 "상세이미지 디자인 제작 +N원", 뱃지 "제작 대기"/"제작 완료", 스위치 "디자인 제작 신청건만", 버튼 "디자인 제작 관리")
- Produces: 없음(문서)

- [ ] **Step 1: 구인자 매뉴얼 — 광고 상품 안내 절에 옵션 설명을 넣는다**

`docs/manual/employer-manual.md`의 "**서비스 내용** — 상품 이름과 소개, 일일 끌어올리기·자동 끌어올리기 횟수, 제공 혜택" 줄(현재 :304)을 아래로 바꾼다.

```markdown
- **서비스 내용** — 상품 이름과 소개, 일일 끌어올리기·자동 끌어올리기 횟수, 제공 혜택, 그리고 **상세이미지 디자인 제작** 옵션 가격(제공되는 상품에만 "상세이미지 디자인 제작 +N원 (선택)"으로 표시됩니다)
```

같은 절의 "**사용법**" 목록(현재 :318-322) 끝에 항목을 추가한다.

```markdown
4. 상품에 **상세이미지 디자인 제작** 가격이 표시돼 있으면, 공고 등록 화면에서 그 상품을 고를 때 체크박스로 함께 신청할 수 있습니다. 디자이너가 공고 상세페이지 이미지를 제작해 드리는 유료 옵션이며, **무료(일반 구인) 공고에는 제공되지 않습니다.**
```

- [ ] **Step 2: 구인자 매뉴얼 — 광고 관리 절에 제작 상태 안내를 넣는다**

`docs/manual/employer-manual.md`의 "공고의 **상태**는 검수·공개 여부에 따라 …" 문단(현재 :346) 다음에 문단을 추가한다.

```markdown
**상세이미지 디자인 제작을 신청한 공고**는 **내 공고** 표의 공고 상태 옆에 제작 진행 상태가 함께 표시됩니다. 신청 직후에는 **상세이미지 제작 대기**로 시작하고, 운영자가 완성본을 공고 상세 이미지로 등록하면 **상세이미지 제작 완료**로 바뀝니다. 제작에 필요한 요청 사항(원하는 분위기·문구·참고 이미지 등)은 입금이 확인된 뒤 운영자가 채팅으로 안내드립니다.

> 옵션을 켜거나 끄면 결제 예정 금액이 바뀌므로 **결제 상태가 입금 대기로 되돌아갑니다.** 또한 이미 **제작 완료**된 공고는 옵션을 해제할 수 없습니다(해제가 필요하면 고객센터로 문의해 주세요).
```

- [ ] **Step 3: 운영자 매뉴얼 — 상품 등록 절에 가격 필드를 추가한다**

`docs/manual/moderator-manual.md`의 "**상품 등록·수정과 가격 옵션별 할인율**" 번호 목록(현재 :645-648) 끝에 항목을 추가한다.

```markdown
5. **상세이미지 디자인 제작 가격**을 입력하면 이 상품을 사는 구인자가 디자인 제작 옵션을 함께 신청할 수 있습니다. **비워 두면 이 상품에는 옵션이 노출되지 않습니다.** 가격을 나중에 바꿔도 이미 신청된 공고의 금액에는 소급되지 않습니다(가격·기간 옵션과 동일한 스냅샷 규칙).
```

- [ ] **Step 4: 운영자 매뉴얼 — 결제 관리 절에 디자인 제작 운영 절차를 넣는다**

`docs/manual/moderator-manual.md`의 "### 3.10 결제 관리" **화면 구성** 목록(현재 :668-670)을 아래로 바꾼다.

```markdown
- 목록에는 **유료 광고 상품이 붙은 공고**(검수 대기 또는 공개 상태)만 나타납니다. 무료 공고와 임시 저장 공고는 나오지 않습니다.
- 표에는 제목·업체·상태·노출 종류·결제 금액·**디자인 제작**·결제 상태·남은 기간·만료·등록일이 표시됩니다. **결제 금액은 광고 금액과 디자인 제작 옵션 금액을 합한 총액**이며, 옵션이 있으면 아래에 "디자인 +N원"이 함께 표시됩니다.
- 오른쪽 위 **미결제만 보기** 스위치를 켜면 입금 대기 중인 건만, **디자인 제작 신청건만** 스위치를 켜면 디자인 제작을 신청한 건만 추립니다. 스위치를 바꾸면 선택이 해제됩니다.
```

같은 절의 "**프리미엄 배너 정원(10자리)**" 문단 **앞**에 새 문단을 넣는다.

```markdown
**상세이미지 디자인 제작 처리**

디자인 제작을 신청한 공고는 **디자인 제작** 칸에 **제작 대기** 또는 **제작 완료** 배지가 뜨고, 배지 아래 **디자인 제작 관리** 버튼으로 작업 창을 엽니다.

1. **디자인 제작 신청건만** 스위치로 신청 건을 추립니다.
2. 입금이 확인되면 결제완료 처리를 먼저 진행하고, 구인자와 채팅으로 제작 요청 사항을 주고받습니다(앱에는 시안 교환 기능이 없습니다).
3. 완성본이 나오면 **디자인 제작 관리**를 열어 상세 이미지를 등록합니다. 상세 이미지는 **최대 5장**이며, 창에 보이는 이미지 목록이 저장 시 그대로 공고의 상세 이미지가 됩니다 — **목록에서 지운 기존 이미지는 저장과 함께 실제로 삭제됩니다.**
4. **상세 이미지 저장**을 누른 뒤 **제작 완료 처리**를 누르면 배지가 제작 완료로 바뀝니다. 잘못 눌렀다면 같은 창에서 **제작 대기로 되돌리기**를 누릅니다.

> **제작 완료** 상태가 되면 구인자는 그 공고의 디자인 제작 옵션을 해제할 수 없습니다. 취소·환불이 필요하면 결제 상태를 되돌리는 것과 별개로 운영 재량으로 처리하세요(앱에 환불 흐름은 없습니다).
```

- [ ] **Step 5: 커밋**

```bash
git add docs/manual/employer-manual.md docs/manual/moderator-manual.md
git commit -m "docs: 상세이미지 디자인 제작 애드온 매뉴얼 반영"
```

---

## 스펙 ↔ 태스크 커버리지

| 스펙 절 | 요구 | 태스크 |
| --- | --- | --- |
| DB | `ad_product.detail_design_price` | Task 1 |
| DB | enum `job_detail_design_status` | Task 1 |
| DB | `job_post.detail_design_amount` / `detail_design_status` | Task 1 |
| DB | drizzle generate만(push 금지) | Task 1 Step 5 + Global Constraints |
| API/admin | createProduct·updateProduct 입력에 `detailDesignPrice` | Task 3 |
| API/admin | listCatalogAdmin·getCatalog 응답에 포함 | Task 3(두 핸들러가 `...product` 스프레드 — 컬럼 추가로 자동) |
| API/구매 | create·update 입력 `detailDesignRequested` | Task 4 |
| API/구매 | 옵션 없는 상품·무료 공고 신청 시 BAD_REQUEST | Task 2(`not_offered`) + Task 4(번역) |
| API/구매 | 가격 스냅샷 + `requested` 시작 | Task 2 + Task 4 |
| API/구매 | 가격 불일치 시 재확인 CONFLICT | Task 2(`amount_changed`) + Task 4(문구) |
| API/구매 | 켜기/끄기 시 paymentStatus unpaid 리셋 | Task 4 Step 5 |
| API/구매 | 해제 시 금액·상태 null 복귀 | Task 2 + Task 4 |
| API/구매 | completed는 해제 불가 | Task 2(`completed_locked`) + Task 4 |
| API/구매 | 금액 합산 pure 헬퍼 + 단위 테스트 | Task 2 |
| API/운영자 | `setJobPostDesignStatus` 토글 | Task 5 |
| API/운영자 | 대상 공고 조직 prefix 서명 URL 발급 | Task 6 Step 3 |
| API/운영자 | 등록 procedure(usage=detail) + 5장 제한 + 삭제(GCS 실삭제) | Task 6 Step 4(전량 교체 1개로 등록·삭제 동시 충족) |
| API/운영자 | `listJobsForPayment` 확장 | Task 5 Step 4 |
| Web | admin 상품 폼 가격 필드 | Task 8 |
| Web | 광고 안내 카드 안내 라인 | Task 9 |
| Web | 공고 폼 체크박스 + 총액 합산 | Task 10 |
| Web | 결제 화면 총액·뱃지·필터·관리 다이얼로그(별도 큐 없음) | Task 11 |
| Web | employer 공고 상태 뱃지 + `JOB_DETAIL_DESIGN_STATUS_LABELS` | Task 7(라벨) + Task 12(표시) |
| Web | shadcn 재사용·모바일·px 금지·primary 위계 | Global Constraints + 각 UI 태스크 |
| 에러/경계 | 5장 초과 거부 | Task 6(`validateJobPostMediaSet`) |
| 에러/경계 | 크롤링 공고 스코프 밖 | 어떤 태스크도 `crawled_job_post`를 건드리지 않음 |
| 테스트 | api pure 헬퍼 `test/services` | Task 2 |
| 테스트 | web `apps/web/test/` 컨벤션 | Task 7~12 |
| 문서 | employer·moderator 매뉴얼 | Task 13 |
