# 지역·업종 taxonomy 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채용자 폼·seeker 필터·mock·seed가 하나의 지역/업종 taxonomy를 공유하게 하여, 필터가 실제 공고를 잡지 못하고 샘플만 노출하는 버그를 해결한다.

**Architecture:** 지역을 `region`(시/도) + 새 `district`(세부지역) 2단계로 분리하고, 단일 소스(`bambi-options.ts`)를 폼·필터·mock이 import한다. 필터 매칭은 문자열 `includes`가 아니라 `Job.region`/`Job.district` 필드 정확 비교로 한다. seeker 필터의 세부지역은 시/도에 연동된다(업종-세부업종 패턴과 대칭).

**Tech Stack:** Drizzle(Postgres) · oRPC+zod · Next.js RSC · shadcn/ui(base-ui) · Vitest · Biome(ultracite)

## Global Constraints

- **단일 taxonomy 소스 = `apps/web/src/lib/bambi-options.ts`**. 폼·필터·mock은 지역/업종 목록을 여기서 import한다. 로컬 재정의 금지.
- **확정 taxonomy 값(정확히 준수):**
  ```ts
  regionOptions   = ["서울", "경기", "인천", "부산", "기타"]
  REGION_DISTRICTS = {
    서울: ["강남", "서초", "송파", "마포", "용산", "강북"],
    경기: ["부천", "수원", "성남", "안양"],
    인천: ["남동", "부평", "미추홀"],
    부산: ["해운대", "서면", "연제"],
    기타: [],
  }
  industryOptions = ["라운지", "바", "클럽", "호스트바", "카페", "노래방", "기타"]
  ```
- 지역 = `region`(시/도) + `district`(세부지역, `text` nullable).
- 필터 UI 목록에는 앞에 `전체`(`ALL_OPTION`)를 붙인다. 폼 select에는 붙이지 않는다.
- 필터 매칭은 **필드 정확 비교**(`job.region === region`). 문자열 `includes` 부활 금지.
- **빌드/dev 서버 금지.** 검증은 `vitest run`과 `tsc --noEmit`만 사용한다.
- **마이그레이션 `migrate`는 사용자 명시 지시 후 실행.** 이 계획은 `generate`(SQL 파일 생성)까지만 수행한다.
- UI는 shadcn 컴포넌트 + Tailwind 토큰만(인라인 `style` 금지, `rounded-none` 금지, base-ui는 `render` prop).
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). push·PR 금지(로컬 커밋만).

---

### Task 1: taxonomy 소스 확장 (`bambi-options.ts`)

**Files:**
- Modify: `apps/web/src/lib/bambi-options.ts`
- Test: `apps/web/src/lib/bambi-options.test.ts` (create)

**Interfaces:**
- Produces: `regionOptions: readonly string[]`(시/도), `REGION_DISTRICTS: Record<string, readonly string[]>`, `districtsForRegion(region: string): readonly string[]`, `industryOptions: readonly string[]`(통일 7종). 기존 `payUnitOptions`·`*Labels`는 유지.

- [ ] **Step 1: 실패 테스트 작성** — `apps/web/src/lib/bambi-options.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { districtsForRegion, industryOptions, regionOptions } from "./bambi-options";

describe("bambi-options taxonomy", () => {
  it("시/도 목록은 서울·경기·인천·부산·기타", () => {
    expect([...regionOptions]).toEqual(["서울", "경기", "인천", "부산", "기타"]);
  });
  it("districtsForRegion은 시/도별 세부지역을 반환", () => {
    expect([...districtsForRegion("서울")]).toEqual([
      "강남", "서초", "송파", "마포", "용산", "강북",
    ]);
    expect([...districtsForRegion("부산")]).toEqual(["해운대", "서면", "연제"]);
  });
  it("세부지역 없는 시/도·미정의 값은 빈 배열", () => {
    expect(districtsForRegion("기타")).toHaveLength(0);
    expect(districtsForRegion("없는값")).toHaveLength(0);
  });
  it("업종은 통일 7종", () => {
    expect([...industryOptions]).toEqual([
      "라운지", "바", "클럽", "호스트바", "카페", "노래방", "기타",
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi-options.test.ts`
Expected: FAIL (`districtsForRegion` is not exported)

- [ ] **Step 3: 구현** — `bambi-options.ts` 상단의 `industryOptions`/`regionOptions`를 교체하고 매핑·헬퍼 추가

```ts
export const industryOptions = [
	"라운지",
	"바",
	"클럽",
	"호스트바",
	"카페",
	"노래방",
	"기타",
] as const;

export const regionOptions = ["서울", "경기", "인천", "부산", "기타"] as const;

// 시/도 → 세부지역. 폼·seeker 필터·mock이 공유하는 단일 소스.
export const REGION_DISTRICTS: Record<string, readonly string[]> = {
	서울: ["강남", "서초", "송파", "마포", "용산", "강북"],
	경기: ["부천", "수원", "성남", "안양"],
	인천: ["남동", "부평", "미추홀"],
	부산: ["해운대", "서면", "연제"],
	기타: [],
};

// 선택한 시/도의 세부지역 목록(정의 없으면 빈 배열).
export function districtsForRegion(region: string): readonly string[] {
	return REGION_DISTRICTS[region] ?? [];
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi-options.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi-options.ts apps/web/src/lib/bambi-options.test.ts
git commit -F <msg-file>   # feat(web): 지역 시/도·세부지역 taxonomy 소스 통일
```

---

### Task 2: DB `district` 컬럼 + 마이그레이션 (`schema/bambi.ts`)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (jobPost, `region` `:299` 뒤)
- Create: `packages/db/src/migrations/0021_*.sql` (drizzle-kit generate)

**Interfaces:**
- Produces: `jobPost.district`(nullable text) — Task 3/9가 사용.

- [ ] **Step 1: 컬럼 추가** — `region: text("region").notNull(),`(`:299`) 바로 아래

```ts
district: text("district"),
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm --filter @bambi-app/db exec drizzle-kit generate`
Expected: `packages/db/src/migrations/0021_*.sql` 생성

- [ ] **Step 3: SQL 확인** — 생성된 파일이 아래 한 줄만 포함하는지 확인(다른 테이블 변경이 섞이면 스키마를 잘못 건드린 것)

```sql
ALTER TABLE "job_post" ADD COLUMN "district" text;
```

- [ ] **Step 4: 커밋** (migrate는 실행하지 않음 — 사용자 지시 대기)

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations
git commit -F <msg-file>   # feat(db): job_post.district 컬럼 추가(마이그레이션 0021)
```

---

### Task 3: API 노출·필터 (`jobs.ts`)

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts`

**Interfaces:**
- Consumes: `jobPost.district`(Task 2).
- Produces: 응답 job 객체에 `district`, `list` 입력에 `district` 필터.

- [ ] **Step 1: 입력 스키마** — `jobPostInput`(`:105-`)과 `listInput`의 `region`(`:110`, `:150`) 옆에 각각 추가

```ts
district: z.string().max(80).optional(),
```
(create/update는 `...jobInput` 스프레드라 자동 반영된다.)

- [ ] **Step 2: list 서버 필터** — `region` 필터(`:500-502`) 아래

```ts
if (input.district) {
	filters.push(eq(jobPost.district, input.district));
}
```

- [ ] **Step 3: selection 노출** — `list`의 `exposureSelection`(`:519` `industryCategory` 옆), `getById` selection(`:753` 옆), 그리고 다른 select 대상(`:663`, `:867`)에 각각

```ts
district: jobPost.district,
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter @bambi-app/api exec tsc --noEmit`
Expected: PASS (변경 파일 기준 신규 에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/jobs.ts
git commit -F <msg-file>   # feat(api): 공고 district 입력·조회·필터 노출
```

---

### Task 4: 필터 코어 (`marketplace.ts` + `types.ts`)

**Files:**
- Modify: `apps/web/src/lib/bambi/marketplace.ts`
- Modify: `apps/web/src/lib/bambi/types.ts` (`Job` `:52-79`)
- Test: `apps/web/src/lib/bambi/marketplace.test.ts`

**Interfaces:**
- Consumes: `regionOptions`, `districtsForRegion`, `industryOptions`(Task 1).
- Produces: `MarketplaceFilters`(+`district`), `Job`(+`region`,`district`), `MARKETPLACE_REGIONS`, `MARKETPLACE_CATEGORIES`, `districtOptionsForRegion(region)`, `filterMarketplaceJobs`(필드 비교), `DEFAULT_MARKETPLACE_FILTERS`, `applyDiscoveryAxis`.

- [ ] **Step 1: `Job` 타입에 필드 추가** — `types.ts` `Job`(`:52`)에

```ts
	region: string;
	district: string;
```

- [ ] **Step 2: 실패 테스트 갱신** — `marketplace.test.ts`에 지역/세부지역/업종 필드 필터 케이스 추가(기존 텍스트 매칭 케이스는 필드 기반으로 교체)

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_MARKETPLACE_FILTERS, filterMarketplaceJobs } from "./marketplace";
import type { Job } from "./types";

const baseJob: Job = {
	beginnerFriendly: false, instantInterview: false, company: "테스트", desc: "",
	featured: false, hours: "", id: "t1", location: "서울 · 강남", pay: "시급 20,000원",
	pref: "", rating: 0, reviews: 0, status: "published", tags: [], title: "공고",
	type: "클럽", verified: false, region: "서울", district: "강남",
};

describe("filterMarketplaceJobs 지역·업종", () => {
	it("시/도 필터는 job.region 필드로 정확 비교", () => {
		const jobs = [baseJob, { ...baseJob, id: "t2", region: "부산", district: "해운대" }];
		const out = filterMarketplaceJobs(jobs, { ...DEFAULT_MARKETPLACE_FILTERS, region: "서울" });
		expect(out.map((j) => j.id)).toEqual(["t1"]);
	});
	it("세부지역 필터는 job.district 필드로 정확 비교", () => {
		const jobs = [baseJob, { ...baseJob, id: "t2", district: "서초" }];
		const out = filterMarketplaceJobs(jobs, {
			...DEFAULT_MARKETPLACE_FILTERS, region: "서울", district: "강남",
		});
		expect(out.map((j) => j.id)).toEqual(["t1"]);
	});
	it("업종 필터는 job.type으로 비교", () => {
		const jobs = [baseJob, { ...baseJob, id: "t2", type: "라운지" }];
		const out = filterMarketplaceJobs(jobs, { ...DEFAULT_MARKETPLACE_FILTERS, category: "클럽" });
		expect(out.map((j) => j.id)).toEqual(["t1"]);
	});
});
```
(기존 `onlyBeginnerFriendly`/`onlyToday` 케이스는 유지.)

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/marketplace.test.ts`
Expected: FAIL (`district` 미정의, 타입 에러)

- [ ] **Step 4: 구현** — `marketplace.ts`

상단 상수를 taxonomy 소스 기반으로 교체하고 필터를 필드 비교로 바꾼다:

```ts
import { districtsForRegion, industryOptions, regionOptions } from "../bambi-options";
import type { Job } from "./types";

// 축 미적용(전체) — 필터에서 "필터 없음"을 뜻한다.
export const ALL_OPTION = "전체";

export const MARKETPLACE_REGIONS = [ALL_OPTION, ...regionOptions] as const;
export const MARKETPLACE_CATEGORIES = [ALL_OPTION, ...industryOptions] as const;

// 선택한 시/도의 세부지역 필터 목록(맨 앞 전체 + 시/도 하위 세부지역).
export function districtOptionsForRegion(region: string): readonly string[] {
	return [ALL_OPTION, ...districtsForRegion(region)];
}
```
- 기존 `MARKETPLACE_SUBCATEGORIES`·`subcategoriesForCategory`는 그대로 둔다(세부업종은 이번 범위 밖).
- `MarketplaceFilters`에 `district: string;` 추가, `DEFAULT_MARKETPLACE_FILTERS`에 `district: ALL_OPTION,` 추가.
- 지역/업종 매칭을 필드 비교로 교체:

```ts
function jobMatchesRegion(job: Job, region: string): boolean {
	return region === ALL_OPTION || job.region === region;
}

function jobMatchesDistrict(job: Job, district: string): boolean {
	return district === ALL_OPTION || job.district === district;
}

function jobMatchesCategory(job: Job, category: string): boolean {
	return category === ALL_OPTION || job.type === category;
}
```
- `filterMarketplaceJobs`의 지역 체크 뒤에 세부지역 체크를 넣는다:

```ts
if (!jobMatchesRegion(job, filters.region)) return false;
if (!jobMatchesDistrict(job, filters.district)) return false;
if (!jobMatchesCategory(job, filters.category)) return false;
```
- `applyDiscoveryAxis`에서 region 축 선택 시 `district`도 `ALL_OPTION`으로 리셋:

```ts
if (axis === "region") {
	return { ...filters, category: ALL_OPTION, subcategory: ALL_OPTION };
}
if (axis === "category") {
	return { ...filters, region: ALL_OPTION, district: ALL_OPTION };
}
return { ...filters, category: ALL_OPTION, region: ALL_OPTION, district: ALL_OPTION, subcategory: ALL_OPTION };
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/marketplace.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/bambi/marketplace.ts apps/web/src/lib/bambi/types.ts apps/web/src/lib/bambi/marketplace.test.ts
git commit -F <msg-file>   # feat(web): seeker 필터를 시/도·세부지역·업종 필드 비교로 전환
```

---

### Task 5: 매퍼·리스트 훅 (`api-job-mapper.ts` + `api-jobs.ts`)

**Files:**
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts`
- Modify: `apps/web/src/lib/bambi/api-jobs.ts` (`toApiListInput` `:40-51`)
- Test: `apps/web/src/lib/bambi/api-jobs.test.ts` (해당 케이스 있으면 갱신)

**Interfaces:**
- Consumes: `Job`(+region,district; Task 4), `MarketplaceFilters`(+district; Task 4).
- Produces: API job → `Job` 매핑에 region/district/location, 서버 입력에 district.

- [ ] **Step 1: `ApiMarketplaceJob`에 필드 추가** — `region: string;`(`:53`) 옆

```ts
district?: string | null;
```

- [ ] **Step 2: `toMarketplaceJob` 매핑** — 반환 객체에서 `location`을 조합하고 필드를 싣는다

```ts
const location = [job.region, job.district].filter(Boolean).join(" · ");
```
반환에서 `location: job.region,` → `location: location || job.region,`, 그리고 필드 추가:
```ts
region: job.region,
district: job.district ?? "",
```
`tags` 배열의 `job.region` 항목 뒤에 세부지역도 포함(있을 때):
```ts
const tags = [
	job.promotionLabel ?? "",
	job.industryCategory,
	job.region,
	job.district ?? "",
	job.employerVerificationStatus === "verified" ? "검증 완료" : "검수 완료",
].filter((tag) => tag.length > 0);
```

- [ ] **Step 3: `toApiListInput`에 district** — `api-jobs.ts` `region`(`:47-50`) 옆

```ts
district:
	filters.district === DEFAULT_MARKETPLACE_FILTERS.district
		? undefined
		: filters.district,
```

- [ ] **Step 4: 검증**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/api-jobs.test.ts`
Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS / 신규 타입 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi/api-job-mapper.ts apps/web/src/lib/bambi/api-jobs.ts apps/web/src/lib/bambi/api-jobs.test.ts
git commit -F <msg-file>   # feat(web): API 매퍼·리스트 입력에 district 반영
```

---

### Task 6: seeker 필터 UI 세부지역 select (`marketplace.tsx`)

**Files:**
- Modify: `apps/web/src/components/bambi/marketplace.tsx` (`MarketplaceFilterControls` `:57-186`)

**Interfaces:**
- Consumes: `districtOptionsForRegion`(Task 4), `MarketplaceFilters`(+district).

- [ ] **Step 1: import 추가** — 상단 marketplace import 블록(`:18-27`)에 `districtOptionsForRegion` 추가.

- [ ] **Step 2: 세부지역 select 추가** — 지역 Select 블록(`:66-88`)과 업종 블록 사이에, 세부업종 select(`:111-135`)와 동일 구조로 삽입. 지역 변경 시 세부지역을 리셋한다.

지역 Select의 `onValueChange`(`:70-74`)를 `update({ region: value, district: ALL_OPTION })`로 바꾸고, 아래 블록 추가:

```tsx
<div className="flex flex-col gap-2">
	<span className="font-bold text-muted-foreground text-xs">세부지역</span>
	<Select
		disabled={districtOptions.length <= 1}
		onValueChange={(value) => {
			if (value) {
				update({ district: value });
			}
		}}
		value={filters.district}
	>
		<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
			<SelectValue>{(value) => value}</SelectValue>
		</SelectTrigger>
		<SelectContent>
			{districtOptions.map((district) => (
				<SelectItem key={district} value={district}>
					{district}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
</div>
```
컴포넌트 상단(`:63` `subcategoryOptions` 옆)에 `const districtOptions = districtOptionsForRegion(filters.region);` 추가.

- [ ] **Step 3: 검증**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/marketplace.tsx`
Expected: 타입 통과, 린트 정리

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/marketplace.tsx
git commit -F <msg-file>   # feat(web): 빠른탐색에 시/도 연동 세부지역 필터 추가
```

---

### Task 7: 채용자 폼 (`bambi-job-form.ts` + 등록·수정 페이지)

**Files:**
- Modify: `apps/web/src/lib/bambi-job-form.ts` (`JobForm` `:138`, `JobPostInput` `:158`, `emptyJobForm` `:205`, `getConditionErrors` `~:634`, `validateJobForm` `:751`)
- Modify: `apps/web/src/app/employer/new/page.tsx` (지역 Select `:634-668`)
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` (지역 Select + 프리필 `:229-247`)

**Interfaces:**
- Consumes: `districtsForRegion`, `regionOptions`(Task 1).
- Produces: 폼이 `district`를 포함해 저장/검증.

- [ ] **Step 1: 폼 타입·기본값** — `bambi-job-form.ts`
  - `JobForm`(`:152`)·`JobPostInput`(`:179`)의 `region: string;` 옆에 `district: string;` 추가.
  - `emptyJobForm`(`:219`)에 `district: districtsForRegion(regionOptions[0] ?? "")[0] ?? "",` 추가. 파일 상단 `bambi-options` import에 `districtsForRegion` 추가.

- [ ] **Step 2: 검증 로직** — `getConditionErrors`에 `district` 파라미터를 받아, 선택한 시/도에 세부지역 목록이 있는데 비어 있으면 에러:

```ts
if (districtsForRegion(region).length > 0 && district.length === 0) {
	errors.district = "세부지역을 선택해 주세요.";
}
```
`validateJobForm`(`:764` 옆)에서 `const district = trim(form.district);`를 만들고 `getConditionErrors({ ... , district, region, ... })`에 전달, 반환 `input`(`:856` 옆)에 `district,` 추가.

- [ ] **Step 3: 실패 테스트** — `bambi-job-form.test.ts`(있으면 케이스 추가, 없으면 생성)

```ts
import { describe, expect, it } from "vitest";
import { emptyJobForm, validateJobForm } from "./bambi-job-form";

it("세부지역 있는 시/도에서 district 비면 검증 실패", () => {
	const form = { ...emptyJobForm, organizationId: "o1", teamId: "", title: "공고",
		region: "서울", district: "", industryCategory: "클럽", payAmount: "20000",
		payUnit: "시급", workSchedule: "협의", description: "상세 설명 열 글자 이상." };
	const result = validateJobForm(form, { teamScopes: [{ organizationId: "o1", teamId: "" }] });
	expect(result.ok).toBe(false);
});
```
Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi-job-form.test.ts` → 구현 후 PASS.

- [ ] **Step 4: 등록/수정 페이지 select** — 두 페이지 모두 지역 Select 블록 아래에 세부지역 Select를 추가하고, 지역 select `onValueChange`를 연동으로 교체:

```tsx
onValueChange={(value) => {
	const next = value ?? "";
	setForm((f) => ({ ...f, region: next, district: districtsForRegion(next)[0] ?? "" }));
	setFormError(null);
}}
```
세부지역 Select(업종 Select `:599-633`과 동일 구조, `id="district"`):
```tsx
<div className="flex flex-col gap-2">
	<FieldLabel htmlFor="district">세부지역</FieldLabel>
	<Select
		disabled={districtsForRegion(form.region).length === 0}
		name="district"
		onValueChange={(value) => updateFormValue("district", value ?? "")}
		value={form.district}
	>
		<SelectTrigger aria-invalid={Boolean(fieldErrors.district)}
			className={selectTriggerClassName} id="district">
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			{districtsForRegion(form.region).map((option) => (
				<SelectItem key={option} value={option}>{option}</SelectItem>
			))}
		</SelectContent>
	</Select>
	<FieldError id={getFieldErrorId("district")} message={fieldErrors.district} />
</div>
```
두 페이지 상단 `bambi-options` import(`new:59-61`, `edit:58-60`)에 `districtsForRegion` 추가.
edit 프리필(`:243` `region: job.region,` 옆)에 `district: job.district ?? "",` 추가.

- [ ] **Step 5: 검증**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi-job-form.test.ts`
Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS / 타입 통과

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/bambi-job-form.ts apps/web/src/app/employer
git commit -F <msg-file>   # feat(web): 공고 등록·수정 폼에 시/도 연동 세부지역 입력 추가
```

---

### Task 8: mock 데이터 정합 (`data.ts`)

**Files:**
- Modify: `apps/web/src/lib/bambi/data.ts` (`JOBS_SEED` 각 항목)

**Interfaces:**
- Consumes: `Job`(+region,district; Task 4).

- [ ] **Step 1: 각 job 정합** — 모든 `JOBS_SEED` 항목에 `region`(시/도)·`district`(세부지역)를 taxonomy 값으로 부여하고, `location`을 `"<시/도> · <세부지역>"`으로, `type`을 통일 업종 목록 내 값으로 맞춘다.
  - 변환 규칙 예: 기존 `location: "강남 · 논현"` → `region: "서울", district: "강남", location: "서울 · 강남"`. 기존 세부동(논현/역삼/청담…)은 taxonomy 세부지역(구)으로 승격(강남 계열 → `강남`, 홍대 → `마포`, 교대 → `서초`, 잠실 → `송파`, 구월 → `인천/남동`, 상동 → `경기/부천`).
  - `type`이 통일 목록 밖이면 가까운 값으로(예: 없으면 `기타`).
  - 최소 각 시/도·주요 세부지역이 하나씩 덮이도록 분포(필터 데모용).

- [ ] **Step 2: 검증**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/marketplace.test.ts`
Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS / 타입 통과(모든 Job에 region·district 존재)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/bambi/data.ts
git commit -F <msg-file>   # feat(web): mock 공고를 시/도·세부지역 taxonomy로 정합
```

---

### Task 9: dev seed 정합 (`bambi-dev.ts`)

**Files:**
- Modify: `apps/server/src/seeds/bambi-dev.ts` (job 정의 `region:` 필드, `buildRichJobRow`, base `seedJobs`)

**Interfaces:**
- Consumes: `jobPost.district`(Task 2). taxonomy 값과 수동 정합(주석으로 참조).

- [ ] **Step 1: 지역 값 재작성** — 모든 job 정의의 `region: "서울 강남구"` 류를 시/도(`region: "서울"`) + 새 `district: "강남"`으로 분리. `"서울 강남구"→강남`, `"서울 마포구"→마포`, `"서울 송파구"→송파`, `"인천 부평구"→인천/부평`, `"경기 부천시"→경기/부천`, `"부산 해운대구"→부산/해운대`. taxonomy 밖(`대구 중구`·`대전 서구`·`광주 동구`)은 taxonomy 내 시/도로 재배치(예: 경기 수원/성남/안양, 부산 서면/연제). 정의 타입(`region: string`)에 `district?: string` 추가.

- [ ] **Step 2: row 빌더 연결** — `buildRichJobRow` 반환과 base `seedJobs` 항목에 `district: def.district ?? null`(또는 리터럴) 추가. 파일 상단에 `// taxonomy: apps/web/src/lib/bambi-options.ts REGION_DISTRICTS와 값 정합 유지` 주석.

- [ ] **Step 3: 검증**

Run: `pnpm --filter @bambi-app/server exec tsc --noEmit`
Expected: 신규 타입 에러 없음

- [ ] **Step 4: 커밋** (재시딩 `db:seed:bambi`는 실행하지 않음 — 사용자 지시 대기)

```bash
git add apps/server/src/seeds/bambi-dev.ts
git commit -F <msg-file>   # feat(server): dev seed 공고 지역을 시/도·세부지역으로 정합
```

---

## 실행 순서·의존성

- **Task 1 먼저**(taxonomy 소스). **Task 2 독립**(DB).
- Task 1 후: **Task 4** → (Task 5, Task 6, Task 8은 Task 4의 `Job`/필터 타입 의존). **Task 7은 Task 1만 의존**.
- Task 2 후: **Task 3**, **Task 9**.
- 병렬 가능 묶음: (1,2) → (3,4,7) → (5,6,8) / (9는 2 이후 아무 때나).

## 후속(비목표, 별도 지시 시)
- `migrate` 적용, `db:seed:bambi` 재시딩.
- 운영 DB 기존 공고 지역 텍스트 → 필드 백필.
