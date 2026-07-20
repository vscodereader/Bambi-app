# seeker 광고 상품 위치별 실노출(placement exposure) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구인자가 공고 등록 시 선택·결제한 광고 상품(placement)에 맞춰, seeker 채용 페이지의 해당 위치(상단 프리미엄 배너·좌/우 사이드 배너·스페셜/급구/추천 리스팅)에 공고가 실제로 노출되게 한다.

**Architecture:** 광고 카탈로그(`ad_product.previewTemplate` → `jobPost.exposureType`)와 결제 게이트(`published AND paid`)는 이미 구현돼 있다. 본 작업은 (1) 운영자 상품 폼에 노출 영역 선택을 추가해 카탈로그→노출 매핑을 완성하고, (2) `jobs.list` 섹션 구동을 구(舊) `jobPromotionCampaign`에서 `jobPost.exposureType`으로 전환하며, (3) 배너 전용 공개 API(`jobs.listAdBanners`)를 신설해 seeker의 목업 배너(GIF+해시 링크)를 실데이터로 교체한다. 결제 정합성 버그(`jobs.update`)와 결제 큐 필터 버그도 함께 수정한다. **새 DB 마이그레이션 없음** (스키마 완비, impression section은 jsonb metadata).

**Tech Stack:** Next.js(App Router, RSC) + oRPC + drizzle(PostgreSQL) + shadcn/ui(base-ui) + vitest(통합 테스트는 실DB, `apps/server/.env` 로드).

**Base branch:** `worktree-seeker-ad-exposure` (base: `origin/feat/role-page-nav-cleanup`, PR #26 스택 최선단)

## Global Constraints

- 빌드(`next build` 등)·dev 서버 기동·스크린샷 금지. 검증은 vitest + `check-types` + `pnpm dlx ultracite fix`만. 시각 확인은 사용자가 한다.
- `db:push` 절대 금지. `db:*` 스크립트는 Claude가 직접 실행하지 않는다(이번 계획은 마이그레이션 자체가 없음).
- UI는 shadcn 컴포넌트 최우선(`@bambi-app/ui/components`), 인라인 `style`·raw hex·임의 px(`[Npx]`) 금지, Tailwind 토큰 사용. 이 레포 shadcn base는 **base-ui**라 커스텀 트리거는 `asChild`가 아니라 `render` prop.
- 카드 그리드는 데스크톱 3열 이상 유지(`lg:grid-cols-3 xl:grid-cols-4` 기존 값 변경 금지). 모바일 반응형 항상 고려.
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). Bash(Git Bash)에서는 메시지를 임시 파일에 쓰고 `git commit -F <file>`. 커밋 후 `git log -1 --format=%B`로 잔여 래퍼 문자 확인.
- **push·PR 생성 금지**(사용자 명시 지시 전). 로컬 커밋까지만.
- API 통합 테스트(`packages/api/src/routers/bambi/*.test.ts`)는 실DB 필요(`apps/server/.env`). organization/member 시드 시 `createdAt` 수동 지정 필수(default 없음). 실행: `pnpm --filter @bambi-app/api test -- <파일명>`.
- web 단위 테스트 실행: `pnpm -C apps/web exec vitest run <상대경로>`.
- 라이브러리 신규 추가 금지.

## 사전 확정 결정(합리적 기본값 — 실행 후 사용자 확인 플래그)

1. **섹션 구동 축 통합:** `jobs.list`의 유료 섹션 멤버십을 `jobPromotionCampaign` → `jobPost.exposureType`으로 전환한다. `bambi-promotions.ts`·캠페인 테이블·`legacyList`는 삭제하지 않고 그대로 둔다(후속 정리 대상).
2. **만료 처리:** `exposureEndsAt`이 지난 유료 공고는 유료 섹션·배너에서 빠지고 **전체 공고(organic)로 강등**된다(공고 자체는 `paid`라 계속 게시).
3. **빈 배너 슬롯:** 판매(결제완료)된 배너만 렌더하고, 그룹이 비면 해당 배너 영역을 숨긴다(샘플 GIF 목업 제거). "이 자리에 광고" 플레이스홀더는 사용자 확인 후 후속.
4. **배너 이미지:** 광고 배너는 해당 공고의 **커버 이미지**를 쓴다(현 브랜치는 `sampleThumbnailUrl(storageKey)` 결정적 샘플 — `feat/gcs-media-upload` 병합 시 매퍼만 실URL로 바뀌면 배너도 자동 실이미지화).
5. **섹션 한도/정렬:** special 5 · urgent 6 · recommended 10(기존 한도 계승), 배너 premium-top 4 · left 3 · right 3(현 슬롯 수). 정렬은 `publishedAt desc`.
6. **결제 큐 판별:** `exposureType != 'standard'` 대신 `adProductId IS NOT NULL`(유료 상품 선택 여부)로 판별 — `previewTemplate='none'` 상품 공고가 결제 큐에서 영구 누락되는 실버그 수정.

---

### Task 1: 운영자 광고 상품 폼에 노출 영역(previewTemplate) 선택 추가

API(`createProduct`/`updateProduct`)는 이미 `previewTemplate`을 받지만 **웹 폼에 UI가 없어** 운영자가 만든 상품은 전부 `none`(=`standard`)이 된다. 폼에 Select를 추가하고 생성/수정 페이지에 배선한다.

**Files:**
- Create: `apps/web/src/lib/bambi/ad-preview-templates.ts`
- Modify: `apps/web/src/components/bambi/ad-product-form.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx`

**Interfaces:**
- Produces: `AdProductDraft`에 `previewTemplate: AdPreviewTemplateValue` 필드 추가(기본 `"none"`). `AD_PREVIEW_TEMPLATE_OPTIONS`/`AdPreviewTemplateValue` export.
- Consumes: `orpc.bambi.adProducts.createProduct/updateProduct`의 기존 `previewTemplate` optional 입력(`packages/api/src/routers/bambi/ad-products.ts:61,72`), `listCatalogAdmin` 반환의 `product.previewTemplate`.

- [ ] **Step 1: 옵션 상수 파일 생성**

`apps/web/src/lib/bambi/ad-preview-templates.ts`:

```ts
// 광고 상품의 노출 영역(previewTemplate) 선택지 — 서버의
// packages/api/src/services/bambi-ad-exposure.ts AdPreviewTemplate과 값이 1:1로 일치해야 한다.
export const AD_PREVIEW_TEMPLATE_OPTIONS = [
	{ label: "상단 프리미엄 배너", value: "premium-top" },
	{ label: "좌측 사이드 배너(가로형)", value: "side-horizontal" },
	{ label: "우측 사이드 배너(세로형)", value: "side-vertical" },
	{ label: "스페셜 채용 리스팅", value: "special-list" },
	{ label: "급구 채용 리스팅", value: "urgent-list" },
	{ label: "추천 채용 리스팅", value: "recommended-list" },
	{ label: "노출 영역 없음(일반)", value: "none" },
] as const;

export type AdPreviewTemplateValue =
	(typeof AD_PREVIEW_TEMPLATE_OPTIONS)[number]["value"];

export const AD_PREVIEW_TEMPLATE_LABELS: Record<AdPreviewTemplateValue, string> =
	Object.fromEntries(
		AD_PREVIEW_TEMPLATE_OPTIONS.map((option) => [option.value, option.label])
	) as Record<AdPreviewTemplateValue, string>;
```

- [ ] **Step 2: 폼에 Select 추가**

`ad-product-form.tsx` 수정:

1. import 추가:
```ts
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import {
	AD_PREVIEW_TEMPLATE_OPTIONS,
	type AdPreviewTemplateValue,
} from "@/lib/bambi/ad-preview-templates";
```
2. `AdProductDraft`에 필드 추가:
```ts
export interface AdProductDraft {
	benefits: string[];
	name: string;
	previewImageUrl: string | null;
	previewTemplate: AdPreviewTemplateValue;
	priceOptions: PriceOption[];
	tagline: string;
}
```
3. state 추가(기존 `previewImageUrl` state 아래):
```ts
const [previewTemplate, setPreviewTemplate] = useState<AdPreviewTemplateValue>(
	initialValue?.previewTemplate ?? "none"
);
```
4. `submit`의 onSubmit 페이로드에 `previewTemplate,` 추가.
5. "한 줄 소개" 필드 블록 바로 아래에 필드 추가(Select 사용 패턴은 `job-exposure-fields.tsx`의 이용기간 Select와 동일):
```tsx
<div className="flex flex-col gap-1.5">
	<Label htmlFor="p-preview-template">노출 영역(게시 위치)</Label>
	<Select
		onValueChange={(value) =>
			setPreviewTemplate(value as AdPreviewTemplateValue)
		}
		value={previewTemplate}
	>
		<SelectTrigger className="w-full" id="p-preview-template">
			<SelectValue placeholder="노출 영역 선택" />
		</SelectTrigger>
		<SelectContent>
			{AD_PREVIEW_TEMPLATE_OPTIONS.map((option) => (
				<SelectItem key={option.value} value={option.value}>
					{option.label}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
	<p className="m-0 text-muted-foreground text-xs">
		이 상품을 구매한 공고가 노출되는 seeker 페이지 위치입니다. "없음"이면 일반
		구인과 동일하게 취급됩니다.
	</p>
</div>
```
(Select API가 다르면 `pnpm dlx shadcn@latest docs select`로 확인 후 `job-exposure-fields.tsx`의 실제 사용 형태를 그대로 따른다.)

- [ ] **Step 3: 생성/수정 페이지 배선**

`[placementId]/new/page.tsx`: `createProduct.mutate({...})` 페이로드에 `previewTemplate: draft.previewTemplate,` 추가.

`[placementId]/[productId]/edit/page.tsx`:
- `initialValue`에 `previewTemplate: product.previewTemplate,` 추가
- `updateProduct.mutate({...})` 페이로드에 `previewTemplate: draft.previewTemplate,` 추가

- [ ] **Step 4: 린트·타입체크**

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi/ad-preview-templates.ts apps/web/src/components/bambi/ad-product-form.tsx "apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx" "apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx"`
Run: `pnpm --filter web check-types`
Expected: 오류 0. (`listCatalogAdmin` 반환에 `previewTemplate`이 이미 포함돼 initialValue 타입이 맞아야 한다 — 안 맞으면 반환 타입 확인)

- [ ] **Step 5: Commit**

```
feat(moderator): 광고 상품 폼에 노출 영역(previewTemplate) 선택 추가
- AD_PREVIEW_TEMPLATE_OPTIONS 상수 신설(서버 AdPreviewTemplate과 1:1) — 상품이 구동하는 seeker 노출 위치 선택지
- AdProductForm에 노출 영역 Select 추가(기본 없음(none)), AdProductDraft.previewTemplate 필드 추가
- 상품 생성/수정 페이지 mutate 페이로드·initialValue에 previewTemplate 배선 — UI로 만든 상품이 전부 standard로 떨어져 placement 매핑이 끊기던 문제 해소
```

---

### Task 2: 결제 큐 판별을 adProductId 기준으로 교정

`listJobsForPayment`가 `ne(exposureType,'standard')`로 걸러서, `previewTemplate='none'` 상품을 단 공고(=`exposureType 'standard'` + `paymentStatus 'unpaid'`)가 **결제 큐에 안 떠 영구 미결제로 정체**된다. 유료 여부의 원천인 `adProductId IS NOT NULL`로 바꾼다.

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts:776-780` (listJobsForPayment conditions)
- Test: `packages/api/src/routers/bambi/job-payment-queue.test.ts` (신규)

**Interfaces:**
- Consumes: `jobPost.adProductId`(스키마 기존 컬럼), drizzle `isNotNull`.
- Produces: 변경 없음(반환 shape 동일).

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`job-payment-queue.test.ts` 신규 — 기존 `ad-products.test.ts`의 픽스처 패턴(파일 상단 dotenv 로드 + 동적 import + `createContextForUser` + afterEach 정리)을 그대로 따른다. organization 시드 시 `createdAt: new Date()` 수동 지정. 핵심 케이스:

```ts
it("previewTemplate이 none인 상품을 단 미결제 공고도 결제 큐에 노출된다", async () => {
	// fixture: admin 유저 + employer 조직 + placement + previewTemplate 'none' 상품
	// + 그 상품을 단 jobPost(adProductId 세팅, exposureType 'standard', paymentStatus 'unpaid', status 'pending_review')
	const rows = await listJobsForPayment(
		createContextForUser(adminUserId),
		{ limit: 50, onlyUnpaid: true }
	);
	expect(rows.map((row) => row.id)).toContain(jobPostId);
});

it("무료 공고(adProductId 없음)는 결제 큐에 나오지 않는다", async () => {
	const rows = await listJobsForPayment(
		createContextForUser(adminUserId),
		{ limit: 50, onlyUnpaid: false }
	);
	expect(rows.map((row) => row.id)).not.toContain(freeJobPostId);
});
```
(프로시저 호출은 기존 테스트처럼 `createProcedureClient(moderationRouter.listJobsForPayment, { context })` 형태로. jobPost 시드에 필요한 not-null 컬럼은 스키마 `packages/db/src/schema/bambi.ts`의 `jobPost` 정의를 보고 채운다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- job-payment-queue`
Expected: 첫 케이스 FAIL (`none` 상품 공고가 큐에 없음)

- [ ] **Step 3: 필터 교체**

`moderation.ts`:
- drizzle import에 `isNotNull` 추가: `import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";` (`ne`가 다른 곳에서 안 쓰이면 제거)
- conditions 변경:
```ts
const conditions = [
	inArray(jobPost.status, ["pending_review", "published"]),
	// 유료 여부의 단일 원천은 광고 상품 연결(adProductId)이다. exposureType은
	// previewTemplate 'none' 상품에서 standard가 되므로 결제 판별에 쓰면 누락된다.
	isNotNull(jobPost.adProductId),
];
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test -- job-payment-queue`
Expected: PASS. 기존 결제 테스트 회귀 확인: `pnpm --filter @bambi-app/api test -- moderation`

- [ ] **Step 5: Commit**

```
fix(api): 결제 큐 판별을 exposureType 대신 adProductId 기준으로 교정
- listJobsForPayment 필터 ne(exposureType,'standard') → isNotNull(adProductId) — previewTemplate 'none' 상품을 단 미결제 공고가 결제 큐에서 영구 누락되던 실버그 수정
- 무료 공고(상품 미선택)는 여전히 큐에서 제외
- job-payment-queue 통합 테스트 신규(none 상품 노출·무료 공고 제외)
```

---

### Task 3: jobs.update 결제 상태 정합성 수정

`jobs.update`(`packages/api/src/routers/bambi/jobs.ts:904-`)가 노출 필드는 갱신하면서 `paymentStatus`/`exposureEndsAt`을 안 건드려, **무료(paid) 공고를 수정해 유료 상품을 붙이면 결제 없이 계속 노출**되고, 유료→무료 전환 시에도 상태가 남는다.

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (update 핸들러, `tx.update(jobPost).set({...})` 부분 — 현 L977-994 부근)
- Test: `packages/api/src/routers/bambi/job-exposure-update.test.ts` (신규)

**Interfaces:**
- Consumes: `resolveJobPostExposure`(기존, jobs.ts L345), `existing`(수정 전 jobPost row).
- Produces: 규칙 — *(adProductId, exposureDurationDays)가 하나라도 바뀌면* 재결제 필요로 보고 `paymentStatus`를 재계산(유료면 `"unpaid"`, 무료 전환이면 `"paid"`), `exposureEndsAt=null`. 안 바뀌면 기존 값 유지.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`job-exposure-update.test.ts` — 픽스처는 employer 조직 + 활성 placement/상품(`previewTemplate: "special-list"`, `priceOptions: [{ amount: 50000, days: 30 }]`) + 무료 공고 1건. 케이스 3개:

```ts
it("무료 공고에 유료 상품을 붙이면 미결제로 전환되고 노출 만료일이 초기화된다", async () => {
	const updated = await updateJob({ ...baseInput, adProductId: productId, exposureDurationDays: 30, paymentMethod: "card" });
	expect(updated.paymentStatus).toBe("unpaid");
	expect(updated.exposureEndsAt).toBeNull();
});

it("유료 결제완료 공고를 무료로 바꾸면 즉시 게시 가능(paid)하고 만료일이 초기화된다", async () => {
	// 사전: paymentStatus 'paid' + exposureEndsAt 미래로 세팅해 둔 유료 공고
	const updated = await updateJob({ ...baseInput, adProductId: null, exposureDurationDays: null, paymentMethod: null });
	expect(updated.paymentStatus).toBe("paid");
	expect(updated.exposureEndsAt).toBeNull();
});

it("노출 상품·기간이 그대로면 결제 상태와 만료일을 유지한다", async () => {
	const updated = await updateJob({ ...baseInput, adProductId: productId, exposureDurationDays: 30, paymentMethod: "card" });
	expect(updated.paymentStatus).toBe("paid"); // 사전 세팅 값 유지
	expect(updated.exposureEndsAt).not.toBeNull();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- job-exposure-update`
Expected: 케이스 1·2 FAIL

- [ ] **Step 3: update 핸들러에 재계산 로직 추가**

`resolveJobPostExposure` 호출(현 L960-964) 직후에:

```ts
// 노출 상품·기간이 바뀌면 재결제가 필요하다. 유료 전환/변경은 미결제로 되돌리고,
// 무료 전환은 결제 게이트 없이 즉시 게시(paid)로 둔다(생성 시 무료 공고와 동일 규칙).
const exposureChanged =
	exposure.adProductId !== existing.adProductId ||
	exposure.exposureDurationDays !== existing.exposureDurationDays;
const nextPaymentStatus = exposureChanged
	? exposure.adProductId
		? ("unpaid" as const)
		: ("paid" as const)
	: existing.paymentStatus;
const nextExposureEndsAt = exposureChanged ? null : existing.exposureEndsAt;
```

`tx.update(jobPost).set({...})`에 두 필드 추가:
```ts
paymentStatus: nextPaymentStatus,
exposureEndsAt: nextExposureEndsAt,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test -- job-exposure-update`
Expected: 3건 PASS

- [ ] **Step 5: Commit**

```
fix(api): 공고 수정 시 노출 상품 변경에 따른 결제 상태 재계산
- jobs.update가 paymentStatus·exposureEndsAt을 안 건드려 무료(paid) 공고에 유료 상품을 붙여도 결제 없이 노출되던 버그 수정
- (adProductId, exposureDurationDays) 변경 시: 유료면 unpaid로 회귀·무료 전환이면 paid, exposureEndsAt은 null로 초기화(운영자 재확인 후 재계산)
- 상품·기간이 그대로면 기존 결제 상태·만료일 유지
- job-exposure-update 통합 테스트 3건 신규(무료→유료·유료→무료·불변)
```

---

### Task 4: 노출 판정 순수 로직 확장(bambi-ad-exposure) + 단위 테스트

`bambi-ad-exposure.ts`는 현재 previewTemplate→exposureType 매핑뿐이다. 섹션/배너 구성에 쓸 **DB 무관 순수 함수**를 추가한다(단위 테스트로 TDD — 실DB 불필요).

**Files:**
- Modify: `packages/api/src/services/bambi-ad-exposure.ts`
- Test: `packages/api/src/services/bambi-ad-exposure.test.ts` (신규)

**Interfaces:**
- Consumes: 기존 `JobExposureType`, `bambi-promotions.ts`의 `PublicJobListRow`(재사용 import).
- Produces (Task 5·6이 사용):
  - `LISTING_SECTION_EXPOSURE_TYPES = ["special", "urgent", "recommended"] as const`, `ListingSectionExposureType`
  - `AD_BANNER_EXPOSURE_TYPES = ["premium-banner", "left-banner", "right-banner"] as const`, `AdBannerExposureType`
  - `EXPOSURE_SECTION_LIMITS: Record<ListingSectionExposureType, number>` = `{ special: 5, urgent: 6, recommended: 10 }`
  - `AD_BANNER_SLOT_LIMITS: Record<AdBannerExposureType, number>` = `{ "premium-banner": 4, "left-banner": 3, "right-banner": 3 }`
  - `EXPOSURE_TYPE_LABELS: Record<JobExposureType, string>`(웹 `apps/web/src/lib/bambi/exposure.ts`와 동일 문구: 프리미엄 배너/좌측 배너/우측 배너/스페셜 채용/급구 채용/추천 채용/일반 구인)
  - `isExposureActive(exposureEndsAt: Date | null, now: Date): boolean` — `null`이면 true, 아니면 `endsAt > now`
  - `buildExposureJobSections<TRow extends ExposureSectionRow>(input): { sections: {...}; totalCount: number }`
  - `groupAdBannerJobs<TRow extends AdBannerRow>(rows: TRow[], now: Date): { leftBanner: TRow[]; premiumBanner: TRow[]; rightBanner: TRow[] }`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`bambi-ad-exposure.test.ts` — 실DB 불필요(순수 함수). 최소 케이스:

```ts
import { describe, expect, it } from "vitest";
import {
	buildExposureJobSections,
	groupAdBannerJobs,
	isExposureActive,
} from "./bambi-ad-exposure";

const NOW = new Date("2026-07-15T00:00:00Z");
const FUTURE = new Date("2026-08-01T00:00:00Z");
const PAST = new Date("2026-07-01T00:00:00Z");

const row = (id: string, exposureType: string, overrides = {}) => ({
	exposureEndsAt: FUTURE,
	exposureType,
	id,
	publishedAt: NOW,
	status: "published",
	...overrides,
});

describe("isExposureActive", () => {
	it("만료일 null은 활성으로 본다", () => {
		expect(isExposureActive(null, NOW)).toBe(true);
	});
	it("만료일이 지났으면 비활성이다", () => {
		expect(isExposureActive(PAST, NOW)).toBe(false);
	});
});

describe("buildExposureJobSections", () => {
	it("exposureType별 섹션에 배치하고 organic에서 중복 제거한다", () => {
		const special = row("s1", "special");
		const organicOnly = row("o1", "standard");
		const { sections, totalCount } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			organicRows: [special, organicOnly],
			recommendedRows: [],
			specialRows: [special],
			urgentRows: [],
		});
		expect(sections.special.map((r) => r.id)).toEqual(["s1"]);
		expect(sections.organic.map((r) => r.id)).toEqual(["o1"]);
		expect(totalCount).toBe(2);
	});
	it("만료된 유료 공고는 섹션에서 빠지고 organic으로 강등된다", () => {
		const expired = row("s1", "special", { exposureEndsAt: PAST });
		const { sections } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			organicRows: [expired],
			recommendedRows: [],
			specialRows: [expired],
			urgentRows: [],
		});
		expect(sections.special).toEqual([]);
		expect(sections.organic.map((r) => r.id)).toEqual(["s1"]);
	});
	it("섹션 한도(special 5·urgent 6·recommended 10)를 적용한다", () => {
		const specials = Array.from({ length: 7 }, (_, i) => row(`s${i}`, "special"));
		const { sections } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			organicRows: [],
			recommendedRows: [],
			specialRows: specials,
			urgentRows: [],
		});
		expect(sections.special).toHaveLength(5);
	});
});

describe("groupAdBannerJobs", () => {
	it("배너 타입별로 슬롯 한도(4·3·3)까지 그룹핑하고 만료를 제외한다", () => {
		const rows = [
			...Array.from({ length: 5 }, (_, i) => row(`p${i}`, "premium-banner")),
			row("l1", "left-banner"),
			row("r1", "right-banner", { exposureEndsAt: PAST }),
		];
		const groups = groupAdBannerJobs(rows, NOW);
		expect(groups.premiumBanner).toHaveLength(4);
		expect(groups.leftBanner.map((r) => r.id)).toEqual(["l1"]);
		expect(groups.rightBanner).toEqual([]);
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- bambi-ad-exposure`
Expected: FAIL (`buildExposureJobSections` 미정의)

- [ ] **Step 3: 구현**

`bambi-ad-exposure.ts`에 추가:

```ts
export const LISTING_SECTION_EXPOSURE_TYPES = [
	"special",
	"urgent",
	"recommended",
] as const;
export type ListingSectionExposureType =
	(typeof LISTING_SECTION_EXPOSURE_TYPES)[number];

export const AD_BANNER_EXPOSURE_TYPES = [
	"premium-banner",
	"left-banner",
	"right-banner",
] as const;
export type AdBannerExposureType = (typeof AD_BANNER_EXPOSURE_TYPES)[number];

export const EXPOSURE_SECTION_LIMITS: Record<
	ListingSectionExposureType,
	number
> = { recommended: 10, special: 5, urgent: 6 };

export const AD_BANNER_SLOT_LIMITS: Record<AdBannerExposureType, number> = {
	"left-banner": 3,
	"premium-banner": 4,
	"right-banner": 3,
};

export const EXPOSURE_TYPE_LABELS: Record<JobExposureType, string> = {
	"left-banner": "좌측 배너",
	"premium-banner": "프리미엄 배너",
	"right-banner": "우측 배너",
	recommended: "추천 채용",
	special: "스페셜 채용",
	standard: "일반 구인",
	urgent: "급구 채용",
};

// 유료 노출이 아직 유효한가 — 만료일이 없으면(운영자가 기간 없이 결제 처리 등) 유효로 본다.
export const isExposureActive = (
	exposureEndsAt: Date | null,
	now: Date
): boolean => exposureEndsAt === null || exposureEndsAt.getTime() > now.getTime();

export interface ExposureSectionRow {
	exposureEndsAt: Date | null;
	exposureType: string;
	id: string;
	publishedAt: Date | null;
	status: string;
}

export interface ExposureJobSections<TRow extends ExposureSectionRow> {
	organic: TRow[];
	recommended: TRow[];
	special: TRow[];
	urgent: TRow[];
}

// 유료 리스팅 섹션(스페셜/급구/추천)을 확정하고, 섹션에 든 공고는 organic에서 제외한다.
// 만료된 유료 공고는 섹션에서 빠져 organic으로 강등된다(공고 자체는 계속 게시).
export const buildExposureJobSections = <TRow extends ExposureSectionRow>({
	limit,
	now,
	organicRows,
	recommendedRows,
	specialRows,
	urgentRows,
}: {
	limit: number;
	now: Date;
	organicRows: TRow[];
	recommendedRows: TRow[];
	specialRows: TRow[];
	urgentRows: TRow[];
}): { sections: ExposureJobSections<TRow>; totalCount: number } => {
	const activeSection = (
		rows: TRow[],
		type: ListingSectionExposureType
	): TRow[] =>
		rows
			.filter(
				(item) =>
					item.exposureType === type &&
					item.status === "published" &&
					isExposureActive(item.exposureEndsAt, now)
			)
			.slice(0, EXPOSURE_SECTION_LIMITS[type]);

	const special = activeSection(specialRows, "special");
	const urgent = activeSection(urgentRows, "urgent");
	const recommended = activeSection(recommendedRows, "recommended");
	const sectionJobIds = new Set(
		[...special, ...urgent, ...recommended].map((item) => item.id)
	);
	const organicLimit = Math.max(0, limit - sectionJobIds.size);
	const organic = organicRows
		.filter(
			(item) => item.status === "published" && !sectionJobIds.has(item.id)
		)
		.slice(0, organicLimit);

	return {
		sections: { organic, recommended, special, urgent },
		totalCount:
			special.length + urgent.length + recommended.length + organic.length,
	};
};

export interface AdBannerRow {
	exposureEndsAt: Date | null;
	exposureType: string;
	id: string;
}

// 결제완료된 배너형 공고를 노출 위치별로 슬롯 한도까지 그룹핑한다.
export const groupAdBannerJobs = <TRow extends AdBannerRow>(
	rows: TRow[],
	now: Date
): { leftBanner: TRow[]; premiumBanner: TRow[]; rightBanner: TRow[] } => {
	const pick = (type: AdBannerExposureType): TRow[] =>
		rows
			.filter(
				(item) =>
					item.exposureType === type && isExposureActive(item.exposureEndsAt, now)
			)
			.slice(0, AD_BANNER_SLOT_LIMITS[type]);

	return {
		leftBanner: pick("left-banner"),
		premiumBanner: pick("premium-banner"),
		rightBanner: pick("right-banner"),
	};
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test -- bambi-ad-exposure`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```
feat(api): 광고 노출 판정 순수 로직 확장(섹션·배너 그룹핑)
- bambi-ad-exposure에 리스팅 섹션/배너 타입 상수·한도(special 5·urgent 6·recommended 10, 배너 4·3·3)·EXPOSURE_TYPE_LABELS 추가
- isExposureActive(만료일 null=유효)·buildExposureJobSections(섹션 확정+organic 중복 제거+만료 강등)·groupAdBannerJobs(타입별 슬롯 한도) 순수 함수 신설
- DB 무관 단위 테스트 신설(활성 판정·중복 제거·만료 강등·한도·배너 그룹핑)
```

---

### Task 5: jobs.list 섹션을 exposureType 기반으로 전환

`jobs.list`(`packages/api/src/routers/bambi/jobs.ts:390-545`)의 premium/recommended 섹션은 구 시스템 `jobPromotionCampaign` join으로 구성된다. 광고 상품 축(`jobPost.exposureType`)으로 전환하고 응답 섹션 키를 `special/urgent/recommended/organic`으로 바꾼다. impression 기록 타입도 함께 갱신한다(**jsonb metadata라 마이그레이션 불필요**).

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (list 핸들러 — `legacyList`·캠페인 관련 다른 프로시저는 불변)
- Modify: `packages/api/src/services/bambi-analytics.ts` (section 유니온·metadata)
- Test: `packages/api/src/routers/bambi/jobs-list-exposure.test.ts` (신규)

**Interfaces:**
- Consumes: Task 4의 `buildExposureJobSections`, `EXPOSURE_SECTION_LIMITS`, `EXPOSURE_TYPE_LABELS`, `LISTING_SECTION_EXPOSURE_TYPES`, `ListingSectionExposureType`.
- Produces: `jobs.list` 응답 `sections: { organic, recommended, special, urgent }`. 각 item = 기존 `PublicJobListRow` 필드 + `exposureType: string` + `exposureEndsAt: Date | null` + `isPromoted: boolean` + `promotionLabel: string | null`(섹션 item은 `EXPOSURE_TYPE_LABELS[exposureType]`, organic은 null). `promotionTier`/`lastBoostedAt`/`promotionCampaignId`는 응답에서 제거.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`jobs-list-exposure.test.ts` — employer 조직 + special/urgent/recommended 상품 + 각 상품을 단 공고(`status 'published'`, `paymentStatus 'paid'`, `exposureEndsAt` 미래) + 무료 공고 + 미결제 유료 공고 + 만료 유료 공고 시드. 케이스:

```ts
it("결제완료된 유료 공고가 상품의 노출 위치 섹션에 배치된다", async () => {
	const result = await listJobs({ limit: 30 });
	expect(result.sections.special.map((j) => j.id)).toContain(specialJobId);
	expect(result.sections.urgent.map((j) => j.id)).toContain(urgentJobId);
	expect(result.sections.recommended.map((j) => j.id)).toContain(recommendedJobId);
	expect(result.sections.organic.map((j) => j.id)).toContain(freeJobId);
});

it("미결제 유료 공고는 어느 섹션에도 노출되지 않는다", async () => {
	const result = await listJobs({ limit: 30 });
	const allIds = [
		...result.sections.special,
		...result.sections.urgent,
		...result.sections.recommended,
		...result.sections.organic,
	].map((j) => j.id);
	expect(allIds).not.toContain(unpaidJobId);
});

it("만료된 유료 공고는 섹션에서 빠지고 전체 공고로 강등된다", async () => {
	const result = await listJobs({ limit: 30 });
	expect(result.sections.special.map((j) => j.id)).not.toContain(expiredJobId);
	expect(result.sections.organic.map((j) => j.id)).toContain(expiredJobId);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- jobs-list-exposure`
Expected: FAIL (`sections.special` undefined)

- [ ] **Step 3: list 핸들러 재작성**

`jobs.ts` 변경:

1. drizzle import에 `isNull` 추가(기존: `and, asc, desc, eq, gt, inArray, lte, or, type SQL, sql`).
2. bambi-ad-exposure import 확장:
```ts
import {
	buildExposureJobSections,
	EXPOSURE_SECTION_LIMITS,
	EXPOSURE_TYPE_LABELS,
	type JobExposureType,
	type ListingSectionExposureType,
	previewTemplateToExposureType,
} from "../../services/bambi-ad-exposure";
```
(`LISTING_SECTION_EXPOSURE_TYPES` 상수 자체는 여기서 안 쓰므로 import하지 않는다 — 타입만 사용.)
3. list 핸들러에서 `getPromotedJobs`(현 L409-462)를 삭제하고 대체:
```ts
const exposureSelection = {
	description: jobPost.description,
	coverImage: coverImageSql,
	employerDisplayName: employerOrganizationProfile.displayName,
	employerVerificationStatus: employerOrganizationProfile.verificationStatus,
	exposureEndsAt: jobPost.exposureEndsAt,
	exposureType: jobPost.exposureType,
	id: jobPost.id,
	industryCategory: jobPost.industryCategory,
	organizationId: jobPost.organizationId,
	payAmount: jobPost.payAmount,
	payUnit: jobPost.payUnit,
	publishedAt: jobPost.publishedAt,
	ratingAverage: ratingAverageSql,
	ratingCount: ratingCountSql,
	region: jobPost.region,
	status: jobPost.status,
	teamDisplayName: employerTeamProfile.displayName,
	title: jobPost.title,
	workSchedule: jobPost.workSchedule,
};

const getExposedJobs = async (type: ListingSectionExposureType) =>
	await db
		.select(exposureSelection)
		.from(jobPost)
		.innerJoin(
			employerOrganizationProfile,
			eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
		)
		.leftJoin(
			employerTeamProfile,
			eq(jobPost.teamId, employerTeamProfile.teamId)
		)
		.where(
			and(
				...filters,
				eq(jobPost.exposureType, type),
				or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
			)
		)
		.orderBy(desc(jobPost.publishedAt))
		.limit(EXPOSURE_SECTION_LIMITS[type]);
```
4. 병렬 조회를 4개로 교체(organic 쿼리는 기존 그대로 두되 select를 `exposureSelection`으로 교체):
```ts
const [specialRows, urgentRows, recommendedRows, organicRows] =
	await Promise.all([
		getExposedJobs("special"),
		getExposedJobs("urgent"),
		getExposedJobs("recommended"),
		db
			.select(exposureSelection)
			.from(jobPost)
			/* 기존 organic join·where(and(...filters))·orderBy(검증업체 우선, publishedAt desc)·limit(input.limit + 15) 유지 */,
	]);
```
5. `buildPublicJobSections` 호출을 교체:
```ts
const result = buildExposureJobSections({
	limit: input.limit,
	now,
	organicRows,
	recommendedRows,
	specialRows,
	urgentRows,
});
```
6. 라벨 부여 — `withPerformance` 매퍼에 함께 얹는다(섹션 여부로 분기):
```ts
const toListItem = <TItem extends { exposureType: string; id: string }>(
	item: TItem,
	inPaidSection: boolean
) => ({
	...item,
	isPromoted: inPaidSection,
	promotionLabel: inPaidSection
		? EXPOSURE_TYPE_LABELS[item.exposureType as JobExposureType]
		: null,
	performance: performanceByJobId.get(item.id) ?? {
		detailViews: 0,
		impressions: 0,
	},
});
```
반환:
```ts
return {
	totalCount: result.totalCount,
	sections: {
		organic: result.sections.organic.map((item) => toListItem(item, false)),
		recommended: result.sections.recommended.map((item) => toListItem(item, true)),
		special: result.sections.special.map((item) => toListItem(item, true)),
		urgent: result.sections.urgent.map((item) => toListItem(item, true)),
	},
};
```
7. `performanceJobIds`·`recordJobListingImpressions` 호출부는 4개 섹션을 순회하도록 키만 교체.
8. `jobPromotionCampaign`·`PublicPromotedJobListRow`·`buildPublicJobSections` import가 list에서만 쓰였는지 확인 — 다른 프로시저(legacyList·프로모션 관련)에서 여전히 쓰면 유지, 안 쓰면 제거.

- [ ] **Step 4: bambi-analytics.ts section 타입 갱신**

- `toImpressionMetadata`의 `section` 유니온을 `"organic" | "recommended" | "special" | "urgent"`로 확장, `campaignId`/`promotionTier` 대신 `exposureType?: string` 필드 수용:
```ts
const toImpressionMetadata = ({
	exposureType,
	position,
	section,
}: {
	exposureType?: string;
	position: number;
	section: "organic" | "recommended" | "special" | "urgent";
}): Record<string, unknown> => ({
	...(exposureType ? { exposureType } : {}),
	position,
	section,
});
```
- `toPromotedImpressionValue`/`toOrganicImpressionValue`가 소비하는 item 타입을 `{ exposureType?: string; id: string; organizationId: string }` 최소 구조 타입으로 바꾸고(기존 `PublicPromotedJobListItem` import 제거), `RecordJobListingImpressionsInput.sections`를 4키 구조로 변경. `recordJobListingImpressions` 본문의 `sections.premium` 순회를 `sections.special`·`sections.urgent`·`sections.recommended`(section 라벨 각각 전달)로 교체.
- 기존에 이 함수들을 쓰는 곳이 jobs.ts list뿐인지 grep으로 확인(`recordJobListingImpressions` 사용처는 jobs.ts만 — 조사 완료).

- [ ] **Step 5: 테스트·회귀 확인**

Run: `pnpm --filter @bambi-app/api test -- jobs-list-exposure`
Expected: PASS
Run: `pnpm --filter @bambi-app/api test` (전체 — jobs-analytics.test.ts 등 회귀)
Expected: 전부 PASS (impression metadata 형태를 단언하는 기존 테스트가 있으면 새 구조로 갱신)
Run: `pnpm --filter @bambi-app/api check-types`

- [ ] **Step 6: Commit**

```
feat(api): 공개 공고 목록 섹션을 광고 상품(exposureType) 기반으로 전환
- jobs.list의 premium/recommended(jobPromotionCampaign 기반) 섹션을 special/urgent/recommended(jobPost.exposureType 기반)로 교체 — 결제완료+미만료 유료 공고가 상품의 노출 위치 섹션에 배치
- 섹션별 쿼리 신설(published+paid+타입 일치+만료 전, publishedAt desc, 한도 special 5·urgent 6·recommended 10), buildExposureJobSections로 organic 중복 제거·만료 강등
- 응답 item에 exposureType·exposureEndsAt·isPromoted·promotionLabel(EXPOSURE_TYPE_LABELS) 포함, 캠페인 필드(promotionTier·lastBoostedAt·campaignId) 제거
- impression 기록 section을 special/urgent/recommended/organic으로 확장, metadata에 exposureType 기록(jsonb라 마이그레이션 불필요)
- legacyList·프로모션 캠페인 시스템은 불변(후속 정리 대상), jobs-list-exposure 통합 테스트 신규(섹션 배치·미결제 제외·만료 강등)
```

---

### Task 6: 배너 노출 공개 API(jobs.listAdBanners) 신설

배너형(`premium-banner`/`left-banner`/`right-banner`) 유료 공고를 위치별로 내려주는 공개 프로시저를 만든다. 필터와 무관하므로 `list`와 분리(필터 변경 시 배너 재요청 방지).

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (프로시저 추가 — `getById` 위에 배치)
- Test: `packages/api/src/routers/bambi/jobs-ad-banners.test.ts` (신규)

**Interfaces:**
- Consumes: Task 4의 `AD_BANNER_EXPOSURE_TYPES`, `groupAdBannerJobs`; 기존 `coverImageSql`.
- Produces: `jobs.listAdBanners` (publicProcedure, 입력 없음) → `{ leftBanner: AdBannerJobRow[]; premiumBanner: AdBannerJobRow[]; rightBanner: AdBannerJobRow[] }`, `AdBannerJobRow = { coverImage, employerDisplayName, exposureEndsAt, exposureType, id, publishedAt, teamDisplayName, title }`.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`jobs-ad-banners.test.ts` — 배너 3종 상품 + 결제완료 공고 각 1건, 미결제 premium-banner 공고 1건, 만료 left-banner 공고 1건 시드:

```ts
it("결제완료·미만료 배너 공고를 노출 위치별로 그룹핑해 반환한다", async () => {
	const result = await listAdBanners();
	expect(result.premiumBanner.map((j) => j.id)).toContain(premiumJobId);
	expect(result.leftBanner.map((j) => j.id)).toContain(leftJobId);
	expect(result.rightBanner.map((j) => j.id)).toContain(rightJobId);
});

it("미결제·만료 배너 공고는 제외한다", async () => {
	const result = await listAdBanners();
	expect(result.premiumBanner.map((j) => j.id)).not.toContain(unpaidPremiumJobId);
	expect(result.leftBanner.map((j) => j.id)).not.toContain(expiredLeftJobId);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- jobs-ad-banners`
Expected: FAIL (프로시저 없음)

- [ ] **Step 3: 프로시저 구현**

`jobs.ts`의 `jobsRouter`에 추가(import에 `AD_BANNER_EXPOSURE_TYPES`, `groupAdBannerJobs` 추가):

```ts
// seeker 광고 배너 슬롯(상단 프리미엄·좌/우 사이드)에 노출할 결제완료 공고를
// 위치별로 내려준다. 목록 필터와 무관해 list와 분리된 공개 조회다.
listAdBanners: publicProcedure.handler(async () => {
	const now = new Date();
	const rows = await db
		.select({
			coverImage: coverImageSql,
			employerDisplayName: employerOrganizationProfile.displayName,
			exposureEndsAt: jobPost.exposureEndsAt,
			exposureType: jobPost.exposureType,
			id: jobPost.id,
			publishedAt: jobPost.publishedAt,
			teamDisplayName: employerTeamProfile.displayName,
			title: jobPost.title,
		})
		.from(jobPost)
		.innerJoin(
			employerOrganizationProfile,
			eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
		)
		.leftJoin(
			employerTeamProfile,
			eq(jobPost.teamId, employerTeamProfile.teamId)
		)
		.where(
			and(
				eq(jobPost.status, "published" as JobPostStatus),
				eq(jobPost.paymentStatus, "paid"),
				inArray(jobPost.exposureType, [...AD_BANNER_EXPOSURE_TYPES]),
				or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
			)
		)
		.orderBy(desc(jobPost.publishedAt));

	return groupAdBannerJobs(rows, now);
}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test -- jobs-ad-banners`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(api): 광고 배너 공개 조회 프로시저 listAdBanners 신설
- 결제완료(published+paid)·미만료 배너형 공고(premium/left/right-banner)를 위치별 슬롯 한도(4·3·3)로 그룹핑해 반환
- 커버 이미지·업체명 포함 최소 select, publishedAt desc — 목록 필터와 무관해 jobs.list와 분리(필터 변경 시 배너 재요청 방지)
- jobs-ad-banners 통합 테스트 신규(그룹핑·미결제/만료 제외)
```

---

### Task 7: 웹 마켓플레이스 섹션 개편(special/urgent/recommended/organic)

`jobs.list`의 새 응답 shape에 맞춰 웹 타입·훅·폴백·시각 섹션을 갱신한다. `getVisualJobExposureSections`(premium+boost에서 urgent를 파생하던 로직)는 서버 섹션 직소비로 대체·삭제한다.

**Files:**
- Modify: `apps/web/src/lib/bambi/types.ts:90-94` (`MarketplaceJobSections`), `Job`에 `exposureType?: null | string` 추가
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts` (`ApiMarketplaceJob`·`toMarketplaceJob`)
- Modify: `apps/web/src/lib/bambi/api-jobs.ts` (섹션 매핑·폴백)
- Modify: `apps/web/src/components/bambi/visual-job-exposure-sections.tsx:95` (직소비)
- Delete: `apps/web/src/lib/bambi/visual-job-exposure.ts`, `apps/web/src/lib/bambi/visual-job-exposure.test.ts`
- Test(갱신): `apps/web/src/lib/bambi/api-jobs.test.ts`, `apps/web/src/components/bambi/visual-job-components.test.ts`, `apps/web/src/lib/bambi/marketplace.test.ts`(섹션 shape 단언이 있으면)

**Interfaces:**
- Consumes: Task 5의 `jobs.list` 응답(`sections.{special,urgent,recommended,organic}`, item의 `exposureType`/`isPromoted`/`promotionLabel`).
- Produces: `MarketplaceJobSections = { organic: Job[]; recommended: Job[]; special: Job[]; urgent: Job[] }` — Task 8과 `VisualJobExposureSections` 소비자(seeker 검색 화면 등)가 사용.

- [ ] **Step 1: 타입 변경**

`types.ts`:
```ts
export interface MarketplaceJobSections {
	organic: Job[];
	recommended: Job[];
	special: Job[];
	urgent: Job[];
}
```
`Job` 인터페이스에 `exposureType?: null | string;` 추가(알파벳 순서 위치: `desc` 아래·`featured` 위).

- [ ] **Step 2: 매퍼 갱신**

`api-job-mapper.ts`:
- `ApiMarketplaceJob`에 `exposureType?: null | string;`·`isPromoted?: boolean;` 추가.
- `toMarketplaceJob` 반환에서:
```ts
exposureType: job.exposureType ?? null,
isPromoted: job.isPromoted ?? Boolean(job.promotionTier),
```
(`promotionTier` 필드는 mock 폴백 호환용으로 유지.)

- [ ] **Step 3: api-jobs.ts 섹션 매핑·폴백 갱신**

```ts
const EMPTY_SECTIONS: MarketplaceJobSections = {
	organic: [],
	recommended: [],
	special: [],
	urgent: [],
};

const flattenSections = (sections: MarketplaceJobSections): Job[] => [
	...sections.special,
	...sections.urgent,
	...sections.recommended,
	...sections.organic,
];

const filterSections = (
	sections: MarketplaceJobSections,
	filters: MarketplaceFilters
): MarketplaceJobSections => ({
	organic: filterMarketplaceJobs(sections.organic, filters),
	recommended: filterMarketplaceJobs(sections.recommended, filters),
	special: filterMarketplaceJobs(sections.special, filters),
	urgent: filterMarketplaceJobs(sections.urgent, filters),
});
```
API 매핑(`apiSections`)은 `jobsQuery.data.sections`의 4키를 각각 `toMarketplaceJob`으로. mock 폴백은 기존 시각 파생 로직을 이식:
```ts
const getBoostTime = (job: Job): number => {
	if (!job.lastBoostedAt) {
		return 0;
	}
	const value = new Date(job.lastBoostedAt).getTime();
	return Number.isFinite(value) ? value : 0;
};

const buildFallbackSections = (
	filters: MarketplaceFilters
): MarketplaceJobSections => {
	const special = JOBS.filter((job) => job.promotionTier === "premium");
	const recommended = JOBS.filter(
		(job) => job.promotionTier === "recommended"
	);
	const urgent = [...special, ...recommended]
		.filter((job) => getBoostTime(job) > 0)
		.toSorted((left, right) => getBoostTime(right) - getBoostTime(left))
		.slice(0, 6);
	const organic = JOBS.filter(
		(job) =>
			job.promotionTier !== "premium" && job.promotionTier !== "recommended"
	);
	return {
		organic: filterMarketplaceJobs(organic, filters),
		recommended: filterMarketplaceJobs(recommended, filters),
		special: filterMarketplaceJobs(special, filters),
		urgent: filterMarketplaceJobs(urgent, filters),
	};
};
```

- [ ] **Step 4: 시각 섹션 직소비 + 파생 유틸 삭제**

`visual-job-exposure-sections.tsx`: `import { getVisualJobExposureSections } ...`와 L95 `const visualSections = getVisualJobExposureSections(sections);`를 제거하고 `sections`를 그대로 사용(`visualSections.special` → `sections.special` 등 4곳 치환).

`visual-job-exposure.ts`·`visual-job-exposure.test.ts` 삭제. 삭제 전 `grep -rn "visual-job-exposure\"" apps/web/src`로 다른 소비자 확인 — `VisualJobExposureSections` **타입**을 다른 파일이 import하면 그 타입만 `types.ts`의 `MarketplaceJobSections`로 대체.

- [ ] **Step 5: 웹 테스트 갱신·실행**

`api-jobs.test.ts`(및 섹션 shape를 단언하는 다른 테스트)를 4키 구조로 갱신 — 기대값 키를 `special/urgent/recommended/organic`으로 바꾸고, 폴백 urgent 파생(부스트 최신순 6개) 케이스는 삭제된 visual-job-exposure.test.ts의 시나리오를 폴백 테스트로 흡수한다.

Run: `pnpm -C apps/web exec vitest run src/lib/bambi/api-jobs.test.ts src/components/bambi/visual-job-components.test.ts src/lib/bambi/marketplace.test.ts`
Expected: PASS
Run: `pnpm --filter web check-types`
Expected: 오류 0 — `VisualJobExposureSections` 컴포넌트를 쓰는 다른 화면(seeker 검색 등)도 sections prop 타입으로 함께 잡힌다.

- [ ] **Step 6: Commit**

```
feat(web): 마켓플레이스 섹션을 서버 노출 섹션(special/urgent/recommended) 직소비로 전환
- MarketplaceJobSections를 special/urgent/recommended/organic 4키로 개편, Job에 exposureType 추가
- api-jobs가 jobs.list의 새 섹션 응답을 그대로 매핑, mock 폴백은 기존 파생 규칙(premium→special·부스트→urgent 최신 6개) 이식
- getVisualJobExposureSections 파생 유틸 삭제 — VisualJobExposureSections가 서버 섹션을 직접 렌더
- 관련 웹 테스트 4키 구조로 갱신(폴백 urgent 파생 케이스 흡수)
```

---

### Task 8: seeker 배너 실데이터 렌더(목업 GIF·해시 링크 제거)

`SAMPLE_BANNERS`(정적 GIF)와 `adJobHref`(목 데이터 해시 링크)를 `listAdBanners` 실데이터로 교체한다. 배너 이미지는 해당 공고 커버(매퍼 경유 — GCS 병합 시 자동 실이미지화), 링크는 `/seeker/jobs/{id}`. **판매된 배너만 렌더, 빈 그룹은 영역 숨김.**

**Files:**
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts` (`toAdBannerItem` 추가)
- Modify: `apps/web/src/lib/bambi/api-jobs.ts` (`useAdBannerJobs` 훅 추가)
- Rewrite: `apps/web/src/components/bambi/ad-banner.tsx`
- Modify: `apps/web/src/components/bambi/premium-ad-banner-section.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx` (L73-75 좌측 레일·L81 프리미엄·L124-128 우측 aside)
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx` (L81·L274)
- Delete: `apps/web/src/lib/bambi/ad-links.ts`

**Interfaces:**
- Consumes: Task 6의 `orpc.bambi.jobs.listAdBanners`(→ `{ leftBanner, premiumBanner, rightBanner }`), 기존 `toJobMedia`/`sampleCoverMedia`.
- Produces:
  - `AdBannerItem = { company: string; coverUrl: string; id: string; title: string }`
  - `useAdBannerJobs(): { leftBanner: AdBannerItem[]; premiumBanner: AdBannerItem[]; rightBanner: AdBannerItem[] }`
  - `AdBanner({ className?, item })`, `AdBannerRail({ className?, items })`, `HorizontalAdBanner({ className?, item })`, `HorizontalAdBannerRail({ className?, items })`, `PremiumAdBannerSection({ className?, items })` — 전부 item(s) prop 기반, 내부 샘플 의존 없음.

- [ ] **Step 1: 배너 매퍼 추가**

`api-job-mapper.ts`에 추가(파일 하단):
```ts
export interface ApiAdBannerJob {
	coverImage?: ApiJobMedia | null;
	employerDisplayName?: string | null;
	id: string;
	teamDisplayName?: string | null;
	title: string;
}

export interface AdBannerItem {
	company: string;
	coverUrl: string;
	id: string;
	title: string;
}

// 광고 배너는 해당 공고의 커버 이미지를 쓴다 — 실스토리지 연동(toJobMediaUrl 교체) 시
// 배너도 자동으로 실이미지가 된다. 커버가 없으면 결정적 샘플 커버로 폴백.
export const toAdBannerItem = (job: ApiAdBannerJob): AdBannerItem => {
	const company = job.teamDisplayName ?? job.employerDisplayName ?? "검증 업체";
	const media =
		toJobMedia(job.coverImage ?? null) ??
		sampleCoverMedia(job.id, `${company} 대표 이미지`);
	return { company, coverUrl: media.url, id: job.id, title: job.title };
};
```

- [ ] **Step 2: 훅 추가**

`api-jobs.ts`에 추가:
```ts
export interface AdBannerJobGroups {
	leftBanner: AdBannerItem[];
	premiumBanner: AdBannerItem[];
	rightBanner: AdBannerItem[];
}

export function useAdBannerJobs(): AdBannerJobGroups {
	const bannersQuery = useQuery(
		orpc.bambi.jobs.listAdBanners.queryOptions()
	);
	return {
		leftBanner: (bannersQuery.data?.leftBanner ?? []).map(toAdBannerItem),
		premiumBanner: (bannersQuery.data?.premiumBanner ?? []).map(toAdBannerItem),
		rightBanner: (bannersQuery.data?.rightBanner ?? []).map(toAdBannerItem),
	};
}
```
(import에 `type AdBannerItem, toAdBannerItem` 추가.)

- [ ] **Step 3: ad-banner.tsx 재작성**

파일 전체를 교체:
```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";

const bannerHref = (item: AdBannerItem): Route =>
	`/seeker/jobs/${item.id}` as Route;

interface AdBannerProps {
	className?: string;
	item: AdBannerItem;
}

// 세로형 광고 배너(우측 사이드용) — 상단 프리미엄 배너와 같은 높이(h-52).
// 결제완료된 배너 공고의 커버 이미지를 세로 크롭해 노출하고, 클릭하면 공고 상세로 이동한다.
export function AdBanner({ className, item }: AdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="block w-fit rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={bannerHref(item)}
		>
			<Image
				alt={`${item.company} ${item.title} 광고 배너`}
				className={cn("h-52 w-20 rounded-lg object-cover", className)}
				height={180}
				sizes="120px"
				src={item.coverUrl}
				unoptimized
				width={80}
			/>
		</Link>
	);
}

interface AdBannerRailProps {
	className?: string;
	items: AdBannerItem[];
}

// 세로 배너 스택(우측). 판매된 배너만 렌더하고, 없으면 부모가 영역을 숨긴다.
export function AdBannerRail({ className, items }: AdBannerRailProps) {
	return (
		<div className={cn("flex flex-col items-start gap-3", className)}>
			{items.map((item) => (
				<AdBanner item={item} key={item.id} />
			))}
		</div>
	);
}

interface HorizontalAdBannerProps {
	className?: string;
	item: AdBannerItem;
}

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 공고 카드와 동일한 크기.
// 폭은 그리드/컬럼으로 정해지고 높이는 공고 카드 렌더 높이에 맞춘다.
export function HorizontalAdBanner({ className, item }: HorizontalAdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="block overflow-hidden rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={bannerHref(item)}
		>
			<Image
				alt={`${item.company} ${item.title} 광고 배너`}
				className={cn(
					"h-[118px] w-full rounded-lg border border-border object-cover",
					className
				)}
				height={89}
				sizes="272px"
				src={item.coverUrl}
				unoptimized
				width={200}
			/>
		</Link>
	);
}

interface HorizontalAdBannerRailProps {
	className?: string;
	items: AdBannerItem[];
}

// 가로형 배너 세로 스택(좌측 사이드).
export function HorizontalAdBannerRail({
	className,
	items,
}: HorizontalAdBannerRailProps) {
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{items.map((item) => (
				<HorizontalAdBanner item={item} key={item.id} />
			))}
		</div>
	);
}
```
(`h-[118px]`는 공고 카드 실측 높이에 맞춘 기존 값 유지 — 신규 도입이 아니므로 예외. `SAMPLE_BANNERS` export 제거로 인한 잔여 참조는 typecheck로 확인.)

- [ ] **Step 4: PremiumAdBannerSection props화**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import { HorizontalAdBanner } from "./ad-banner";
import { Badge } from "./ds";

// 목록 상단 프리미엄 광고 섹션. 결제완료된 프리미엄 배너 공고를 공고 카드와 동일한
// 반응형 그리드(xl 4열)로 배치한다. 판매분이 없으면 섹션 자체를 숨긴다.
export function PremiumAdBannerSection({
	className,
	items,
}: {
	className?: string;
	items: AdBannerItem[];
}) {
	if (items.length === 0) {
		return null;
	}
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((item) => (
					<HorizontalAdBanner item={item} key={item.id} />
				))}
			</div>
		</section>
	);
}
```

- [ ] **Step 5: 화면 배선**

`seeker-marketplace.tsx`:
- `const adBanners = useAdBannerJobs();` 추가(`useMarketplaceJobs` 아래), import 갱신.
- 좌측 aside(L73-75): `<HorizontalAdBannerRail keys={[...]} />` → `{adBanners.leftBanner.length > 0 ? (<HorizontalAdBannerRail items={adBanners.leftBanner} />) : null}` (필터 Card는 유지).
- 프리미엄(L81): `<PremiumAdBannerSection className="mb-6" items={adBanners.premiumBanner} />`.
- 우측 aside(L124-128): 내용물이 배너뿐이므로 aside 전체를 조건 렌더:
```tsx
{adBanners.rightBanner.length > 0 ? (
	<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
		<div className="sticky top-20">
			<AdBannerRail items={adBanners.rightBanner} />
		</div>
	</aside>
) : null}
```
단, 우측 aside가 사라지면 3컬럼 균형(가운데 콘텐츠 중앙 정렬)이 깨질 수 있다 — 기존 레이아웃이 `justify-center`+양쪽 `hidden min-[1720px]:block`이므로, aside를 제거하는 대신 **비었을 때 `<aside>`는 유지하고 내부 레일만 숨기는 쪽이 안전**하다. 구현은 aside 유지 + `{adBanners.rightBanner.length > 0 ? <AdBannerRail items={...} /> : null}`로 한다(좌측과 동일 패턴).

`seeker-job-detail-responsive.tsx`: 동일하게 `useAdBannerJobs()`를 호출해 L81 `HorizontalAdBannerRail`에 `items={adBanners.leftBanner}`, L274 `AdBannerRail`에 `items={adBanners.rightBanner}`를 전달(기존 `keys`/`count`/`offset` prop 제거), 빈 배열이면 해당 렌더를 null 처리.

`ad-links.ts` 삭제. Run: `grep -rn "ad-links\|adJobHref\|SAMPLE_BANNERS" apps/web/src` → 0건 확인.

- [ ] **Step 6: 린트·타입체크·웹 테스트**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/ad-banner.tsx apps/web/src/components/bambi/premium-ad-banner-section.tsx apps/web/src/components/bambi/screens/seeker-marketplace.tsx apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx apps/web/src/lib/bambi/api-jobs.ts apps/web/src/lib/bambi/api-job-mapper.ts`
Run: `pnpm --filter web check-types`
Run: `pnpm -C apps/web exec vitest run src/components/bambi/visual-job-components.test.ts src/lib/bambi/api-jobs.test.ts`
Expected: 전부 PASS

- [ ] **Step 7: Commit**

```
feat(web): seeker 광고 배너를 결제완료 공고 실데이터로 전환
- listAdBanners 소비 훅 useAdBannerJobs·toAdBannerItem 매퍼 신설 — 배너 이미지는 공고 커버(실스토리지 연동 시 자동 실이미지화), 링크는 공고 상세
- ad-banner 컴포넌트를 item(s) prop 기반으로 재작성, SAMPLE_BANNERS 정적 GIF·adJobHref 해시 링크(ad-links.ts) 제거
- PremiumAdBannerSection·좌/우 사이드 레일이 판매된 배너만 렌더, 빈 그룹은 영역 숨김(aside 컬럼은 유지해 중앙 정렬 보존)
- 마켓플레이스·공고 상세 화면 배선 교체
```

---

### Task 9: 최종 검증·마무리

- [ ] **Step 1: 전체 검증 실행**

Run: `pnpm dlx ultracite fix` (워크트리 루트 — 변경 파일 전체)
Run: `pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types && pnpm --filter @bambi-app/db check-types`
Run: `pnpm --filter @bambi-app/api test`
Run: `pnpm -C apps/web exec vitest run src`
Expected: 전부 PASS. (통합 테스트는 실DB 필요 — 접속 불가 환경이면 그 사실을 보고하고 사용자 실행을 요청한다. dev 서버·빌드는 금지.)

- [ ] **Step 2: 수정 잔여물 확인**

Run: `git status` → 미추적/미커밋 파일 없음 확인. `git log --oneline origin/feat/role-page-nav-cleanup..HEAD` → Task 1~8 커밋 확인.

- [ ] **Step 3: 사용자 확인 요청 사항 보고(플래그)**

구현 완료 보고에 다음 확인 요청을 포함한다(작업 중 질문으로 중단하지 않고 사후 플래그):
1. 빈 배너 슬롯 정책 — 현재 "판매분만 렌더, 빈 그룹 숨김". "이 자리에 광고" 플레이스홀더(→ /employer/ad-guide 링크) 선호 여부.
2. 우측 세로 배너가 공고 커버(가로형)를 세로 크롭해 쓰는 시각 품질 — 사용자 눈으로 확인 필요.
3. 섹션 한도(special 5·urgent 6·recommended 10)·배너 슬롯(4·3·3) 값 조정 여부.
4. 구 프로모션 시스템(jobPromotionCampaign·legacyList) 후속 제거 시점.
5. push·PR은 지시가 있을 때까지 하지 않음 — 브랜치 `worktree-seeker-ad-exposure` 로컬 커밋 상태로 대기.

---

## Self-Review 체크 결과

- **요구사항 커버리지:** 운영자 상품→위치 매핑 완성(Task 1) / 결제 흐름 정합성(Task 2·3) / "상품에 맞는 위치에 게시" = 리스팅 섹션(Task 5·7) + 배너 슬롯(Task 6·8) / 순수 로직·테스트(Task 4) — 요구사항 전 구간 매핑됨.
- **마이그레이션:** 불필요 확인(스키마 완비, impression은 jsonb). `#24(footer)`가 `0016`을 선점 중이므로 만약 실행 중 스키마 변경이 필요해지면 **중단하고 사용자와 번호 조율**.
- **타입 일관성:** `AdBannerItem`/`useAdBannerJobs`/`buildExposureJobSections`/`groupAdBannerJobs`/`EXPOSURE_TYPE_LABELS` 명칭이 Task 4→6→8에서 동일하게 사용됨. 섹션 4키 명칭(`special/urgent/recommended/organic`)이 API(Task 5)→웹(Task 7)에서 일치.
- **기존 코드 존중:** `legacyList`·`bambi-promotions.ts`·캠페인 테이블·샘플 GIF 파일은 삭제하지 않음(후속 정리로 명시).
