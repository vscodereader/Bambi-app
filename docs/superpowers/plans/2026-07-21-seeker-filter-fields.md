# seeker 필터 구조화 (초보 가능 / 당일면접 가능) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** seeker 마켓플레이스의 "초보 가능"·"당일면접 가능" 필터를 공고 텍스트 문자열 매칭에서 `jobPost`의 명시적 boolean 컬럼 기반으로 전환한다.

**Architecture:** `jobPost`에 boolean 컬럼 2개(`beginner_friendly`, `instant_interview`)를 추가하고 API 응답에 노출한다. 프론트는 서버 where 필터 없이 기존 클라이언트 `filterMarketplaceJobs`가 텍스트 대신 이 필드를 직접 참조한다. 채용자 등록/수정 폼에 체크박스로 입력받는다.

**Tech Stack:** Drizzle ORM (Postgres), oRPC + zod, Next.js(RSC) + shadcn/ui, Vitest, Biome/ultracite, pnpm + turbo.

## Global Constraints

- **빌드/dev 서버 금지** — `pnpm build`·dev 기동 금지. 검증은 타입체크 `pnpm check-types`, 린트 `pnpm dlx ultracite fix`, 그리고 순수 로직 한정 Vitest(빌드·dev가 아니므로 허용). UI 시각 확인은 사용자가 한다.
- **DB 마이그레이션** — `db:push` **절대 금지**. 스키마 변경은 `pnpm db:generate`로 SQL 생성까지만 하고, `pnpm db:migrate` 적용은 **사용자 명시 지시 후** 실행하며 적용 결과를 검증한다.
- **라벨 문구** — 사용자 노출 라벨 "오늘 면접 가능"은 모든 지점에서 **"당일면접 가능"**으로 쓴다. 내부 필터 키 `onlyToday`·`onlyBeginnerFriendly`는 유지한다(파급 최소화).
- **UI 규칙(apps/web)** — 체크박스는 `@bambi-app/ui/components`의 shadcn `Checkbox`(이미 설치됨). 인라인 `style` 금지, Tailwind 시맨틱/브랜드 토큰만. base-ui라 커스텀 트리거는 `render` prop.
- **커밋** — 워크트리에서 커밋 전 `pnpm install` 1회 필요(lefthook 훅). 줄바꿈 LF. 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 불릿(불릿 사이 빈 줄 없음). **push·PR은 사용자 명시 지시 전까지 금지.**
- **컬럼 네이밍** — Drizzle 필드는 camelCase `beginnerFriendly`/`instantInterview`, DB 컬럼은 snake_case `beginner_friendly`/`instant_interview`.

---

### Task 1: DB 스키마 컬럼 2개 추가

**Files:**
- Modify: `packages/db/src/schema/bambi.ts:309` (jobPost, `interviewNotes` 뒤)
- Generate: `packages/db/src/migrations/*` (drizzle-kit 산출물)

**Interfaces:**
- Produces: `jobPost.beginnerFriendly` (boolean, not null, default false), `jobPost.instantInterview` (boolean, not null, default false) — Task 2·5가 참조.

- [ ] **Step 1: 컬럼 추가**

`packages/db/src/schema/bambi.ts`의 `jobPost` 정의에서 `interviewNotes: text("interview_notes"),`(:309) 바로 뒤에 추가:

```ts
interviewNotes: text("interview_notes"),
// 채용자가 지정하는 seeker 필터 축. 텍스트 매칭이 아니라 명시 필드로 거른다.
beginnerFriendly: boolean("beginner_friendly").default(false).notNull(),
// "당일면접 가능" — 시간에 낡지 않는 상시 속성(오늘 날짜 개념 아님).
instantInterview: boolean("instant_interview").default(false).notNull(),
```

`boolean`은 파일 상단(:4)에서 이미 import되어 있어 추가 import 불필요.

- [ ] **Step 2: 타입체크로 스키마 정합 확인**

Run: `pnpm check-types --filter=@bambi-app/db`
Expected: PASS (에러 없음)

- [ ] **Step 3: 마이그레이션 SQL 생성**

Run: `pnpm db:generate`
Expected: `packages/db/src/migrations/`에 `ALTER TABLE "job_post" ADD COLUMN "beginner_friendly" boolean NOT NULL DEFAULT false` 및 `instant_interview` 동일 문을 포함한 새 `.sql` 파일 생성. 생성된 SQL을 열어 두 컬럼 ADD 문이 맞는지 눈으로 확인한다.

> **주의:** `pnpm db:migrate`(실제 DB 적용)는 이 계획에서 실행하지 않는다. 사용자 명시 지시가 있을 때만 적용하고 적용 결과를 검증한다.

- [ ] **Step 4: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations
git commit -m "feat(db): 공고 초보 가능·당일면접 boolean 컬럼 추가"
```

---

### Task 2: API 라우터 입력·응답에 두 필드 노출

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts:105-133` (jobPostInput)
- Modify: `packages/api/src/routers/bambi/jobs.ts:506-527` (list exposureSelection)
- Modify: `packages/api/src/routers/bambi/jobs.ts:742-769` (getById selection)

**Interfaces:**
- Consumes: `jobPost.beginnerFriendly`, `jobPost.instantInterview` (Task 1).
- Produces: 공고 create/update 입력이 `beginnerFriendly?`/`instantInterview?`(boolean) 수용. `list`·`getById` 응답 job 객체에 `beginnerFriendly`·`instantInterview` 포함 — Task 3(매퍼)이 소비.

- [ ] **Step 1: 입력 스키마에 optional boolean 2개 추가**

`jobPostInput`(:105-133)에서 `interviewNotes: z.string().max(500).optional(),` 뒤에 추가:

```ts
interviewNotes: z.string().max(500).optional(),
beginnerFriendly: z.boolean().optional(),
instantInterview: z.boolean().optional(),
```

create(:993 `...jobInput`)·update(:1141 `...jobInput`)는 스프레드 전달이라 자동 반영된다. **DB insert/update 코드는 수정하지 않는다.**

- [ ] **Step 2: list 응답 select에 필드 추가**

`list` 프로시저의 `exposureSelection`(:506-527)에 `region: jobPost.region,` 등 기존 필드 옆으로 추가:

```ts
beginnerFriendly: jobPost.beginnerFriendly,
instantInterview: jobPost.instantInterview,
```

- [ ] **Step 3: getById select에 동일 필드 추가**

`getById` selection(:742-769)에도 같은 두 줄을 추가한다(공고 상세·수정 폼 프리필이 참조).

- [ ] **Step 4: 타입체크**

Run: `pnpm check-types --filter=@bambi-app/api`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/jobs.ts
git commit -m "feat(api): 공고 입력·조회에 초보 가능·당일면접 필드 노출"
```

---

### Task 3: 프론트 필터를 DB 필드 기반으로 전환 (TDD)

**Files:**
- Modify: `apps/web/src/lib/bambi/types.ts:52-77` (Job 인터페이스)
- Modify: `apps/web/src/lib/bambi/data.ts` (JOBS mock)
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts:32-56, 138-165`
- Modify: `apps/web/src/lib/bambi/marketplace.ts:33-37, 123-131, 153-158`
- Modify: `apps/web/src/components/bambi/marketplace.tsx:160-170` (라벨)
- Test: `apps/web/src/lib/bambi/marketplace.test.ts:27-63`

**Interfaces:**
- Consumes: 없음(프론트 순수 로직 + Task 2 응답 형태).
- Produces: `Job.beginnerFriendly`(boolean), `Job.instantInterview`(boolean).

- [ ] **Step 1: Job 타입에 필드 추가**

`apps/web/src/lib/bambi/types.ts`의 `Job` 인터페이스(:52-77)에 알파벳 순 위치로 추가(`company` 뒤, `verified` 앞 적절한 곳):

```ts
beginnerFriendly: boolean;
instantInterview: boolean;
```

- [ ] **Step 2: 실패하는 테스트로 갱신**

`apps/web/src/lib/bambi/marketplace.test.ts`에서 텍스트 의존 테스트를 필드 기반으로 바꾸고 부정 표현 케이스를 추가한다.

(a) beginner 칩 테스트(:27-40)는 그대로 두되(값은 data.ts에서 필드로 보장), today 칩 테스트(:56-63)를 아래로 교체:

```ts
it("filters jobs to instant-interview listings when the chip is on", () => {
	const result = filterMarketplaceJobs(JOBS, {
		...DEFAULT_MARKETPLACE_FILTERS,
		onlyToday: true,
	});

	expect(result.map((job) => job.id)).toEqual(["j3", "j4"]);
	for (const job of result) {
		expect(job.instantInterview).toBe(true);
	}
});
```

(b) 부정 표현 오매칭이 사라졌음을 확인하는 케이스를 `describe("filterMarketplaceJobs", ...)` 안에 추가:

```ts
it("does not match negated text like 초보 사절 / 오늘 면접 불가", () => {
	const negated = JOBS.map((job) => ({
		...job,
		beginnerFriendly: false,
		instantInterview: false,
		desc: `${job.desc} 초보 사절, 오늘 면접 불가`,
	}));

	expect(
		filterMarketplaceJobs(negated, {
			...DEFAULT_MARKETPLACE_FILTERS,
			onlyBeginnerFriendly: true,
		})
	).toHaveLength(0);
	expect(
		filterMarketplaceJobs(negated, {
			...DEFAULT_MARKETPLACE_FILTERS,
			onlyToday: true,
		})
	).toHaveLength(0);
});
```

- [ ] **Step 3: JOBS mock에 필드 채우기**

`apps/web/src/lib/bambi/data.ts`의 `JOBS` 각 항목에 `beginnerFriendly`·`instantInterview`를 명시한다. 기존 테스트 기대치를 유지하도록:
- `j1` → `beginnerFriendly: true` (기존 beginner 칩 테스트가 j1을 기대)
- `j3`, `j4` → `instantInterview: true` (today 칩 테스트가 j3·j4를 기대)
- 그 외 모든 항목 → 두 필드 `false`

(j1이 초보 조건 외 테스트(:27-40)의 region 강남·라운지·검증·17000원도 만족해야 하므로 기존 j1 값은 그대로 두고 boolean만 추가한다.)

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/marketplace.test.ts`
Expected: FAIL — `marketplace.ts`가 아직 텍스트 매칭이라 새 부정표현 케이스가 깨지거나, Job 타입 필드 미사용으로 타입 에러.

- [ ] **Step 5: 필터 로직을 DB 필드 직접 참조로 교체**

`apps/web/src/lib/bambi/marketplace.ts`에서 `jobMatchesBeginner`(:123-126)·`jobMatchesToday`(:128-131) 두 함수를 **삭제**하고, `filterMarketplaceJobs`(:153-158)의 호출부를 교체:

```ts
if (filters.onlyBeginnerFriendly && !job.beginnerFriendly) {
	return false;
}
if (filters.onlyToday && !job.instantInterview) {
	return false;
}
```

같은 파일 `MARKETPLACE_QUICK_FILTERS`(:35)의 today 라벨 변경:

```ts
{ id: "today", label: "당일면접 가능" },
```

- [ ] **Step 6: 매퍼가 서버 필드를 Job으로 옮기도록 수정**

`apps/web/src/lib/bambi/api-job-mapper.ts`:

(a) `ApiMarketplaceJob`(:32-56)에 optional 필드 추가:

```ts
beginnerFriendly?: boolean | null;
instantInterview?: boolean | null;
```

(b) `toMarketplaceJob` 반환 객체(:138-165)에 추가(`company` 뒤 등):

```ts
beginnerFriendly: job.beginnerFriendly ?? false,
instantInterview: job.instantInterview ?? false,
```

- [ ] **Step 7: 체크박스 라벨 변경**

`apps/web/src/components/bambi/marketplace.tsx`의 today 체크박스 라벨(:160-170) "오늘 면접 가능만 보기" → "당일면접 가능만 보기"로 변경(배선 `onlyToday`는 유지).

- [ ] **Step 8: 테스트·타입·린트 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/marketplace.test.ts`
Expected: PASS (모든 케이스)

Run: `pnpm check-types --filter=web`
Expected: PASS

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi apps/web/src/components/bambi/marketplace.tsx`
Expected: 포맷/린트 정리 후 에러 없음

- [ ] **Step 9: 커밋**

```bash
git add apps/web/src/lib/bambi apps/web/src/components/bambi/marketplace.tsx
git commit -m "fix(web): seeker 초보·당일면접 필터를 텍스트 매칭에서 DB 필드로 전환"
```

---

### Task 4: 채용자 등록·수정 폼 체크박스

**Files:**
- Modify: `apps/web/src/lib/bambi-job-form.ts:138-154, 201-217, 827-852`
- Modify: `apps/web/src/app/employer/new/page.tsx:352-363, 553-748`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx:233-242, 533+`

**Interfaces:**
- Consumes: Task 2의 입력 스키마(`beginnerFriendly?`/`instantInterview?`), Task 2의 getById 응답(수정 폼 프리필).
- Produces: 폼 제출 시 두 boolean이 create/update input에 실린다.

- [ ] **Step 1: 폼 타입·기본값·검증에 필드 추가**

`apps/web/src/lib/bambi-job-form.ts`:
- `JobForm` 인터페이스(:138-154)에 `beginnerFriendly: boolean;`, `instantInterview: boolean;` 추가.
- `emptyJobForm`(:201-217)에 `beginnerFriendly: false,`, `instantInterview: false,` 추가.
- `validateJobForm`의 반환 `input` 객체(:827-852)에 `beginnerFriendly: form.beginnerFriendly,`, `instantInterview: form.instantInterview,` 추가(API로 전달).

- [ ] **Step 2: 등록 폼에 boolean setter + 체크박스 추가**

`apps/web/src/app/employer/new/page.tsx`:
- `updateFormValue`(:352-363)는 string 전용이므로 boolean용 헬퍼를 그 아래 추가:

```ts
const updateFormFlag = (key: "beginnerFriendly" | "instantInterview") => (checked: boolean) =>
	setForm((prev) => ({ ...prev, [key]: checked }));
```

- "공고 조건" 카드의 `workSchedule` 필드 뒤(:745)에 shadcn `Checkbox` 2개 추가. `Checkbox`·`Label` import 확인(`@bambi-app/ui/components`). 예:

```tsx
<div className="flex flex-col gap-3">
	<Label className="flex items-center gap-2">
		<Checkbox
			checked={form.beginnerFriendly}
			onCheckedChange={updateFormFlag("beginnerFriendly")}
		/>
		초보 가능
	</Label>
	<Label className="flex items-center gap-2">
		<Checkbox
			checked={form.instantInterview}
			onCheckedChange={updateFormFlag("instantInterview")}
		/>
		당일면접 가능
	</Label>
</div>
```

(base-ui Checkbox의 `onCheckedChange` 콜백 시그니처는 `pnpm dlx shadcn@latest docs checkbox`로 확인 후 맞춘다. boolean이 아니라 이벤트/문자열이면 setter를 그에 맞게 변환.)

- [ ] **Step 3: 수정 폼에 프리필 매핑 + 동일 체크박스 추가**

`apps/web/src/app/employer/jobs/[id]/edit/page.tsx`:
- 서버 job → 폼 초기값 매핑(:233-242)에 `beginnerFriendly: job.beginnerFriendly ?? false,`, `instantInterview: job.instantInterview ?? false,` 추가.
- "공고 조건" 섹션(:533~)에 Step 2와 동일한 체크박스 2개 + `updateFormFlag` 헬퍼 추가(두 페이지가 JSX를 복붙 공유하므로 양쪽 각각).

- [ ] **Step 4: 타입·린트 통과 확인**

Run: `pnpm check-types --filter=web`
Expected: PASS

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi-job-form.ts apps/web/src/app/employer`
Expected: 에러 없음

> UI 렌더링·체크박스 동작 시각 확인은 사용자가 IDE에서 한다(dev 서버 금지).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi-job-form.ts apps/web/src/app/employer
git commit -m "feat(web): 공고 등록·수정 폼에 초보 가능·당일면접 체크박스 추가"
```

---

### Task 5: seed 데이터에 필드 값 채우기

**Files:**
- Modify: `apps/server/src/seeds/bambi-dev.ts:381, 397-917, 1997-2037`

**Interfaces:**
- Consumes: Task 1 컬럼.
- Produces: dev seed 공고가 `beginnerFriendly`·`instantInterview` 실값을 가진다.

- [ ] **Step 1: RichJobDef에 instant 플래그 신설**

`apps/server/src/seeds/bambi-dev.ts`의 `RichJobDef` 인터페이스(:381 `beginner?: boolean` 옆)에 추가:

```ts
instant?: boolean;
```

- [ ] **Step 2: buildRichJobRow 반환에 두 컬럼 연결**

`buildRichJobRow`(:1997-2037) 반환 객체에 추가:

```ts
beginnerFriendly: def.beginner ?? false,
instantInterview: def.instant ?? false,
```

(`def.beginner`로 마킹된 rich job 11개가 자동으로 `beginnerFriendly: true`가 된다.)

- [ ] **Step 3: 일부 rich job에 instant 마킹**

`richJobs` 정의(:397-917)에서 대표 3~4개 항목에 `instant: true`를 추가한다(예: 당일 채용 성격 공고). 정확한 개수는 데모용이라 재량이되 최소 3개.

- [ ] **Step 4: 타입체크**

Run: `pnpm check-types --filter=server`
Expected: PASS

> `pnpm db:seed:bambi`(실제 시딩)는 실행하지 않는다 — DB 적용은 마이그레이션과 함께 사용자 지시 시.

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/seeds/bambi-dev.ts
git commit -m "chore(server): seed 공고에 초보 가능·당일면접 값 채우기"
```

---

## Self-Review (작성자 점검 완료)

- **Spec 커버리지**: 컬럼 2개(T1) · API 노출(T2) · 필터 전환+라벨(T3) · 폼 UI(T4) · seed(T5) — spec의 변경 지점 6곳을 모두 태스크에 매핑. spec에 없던 `data.ts` mock 갱신을 T3 Step 3으로 보강(테스트 통과에 필수).
- **비목표 준수**: 서버 where 필터 없음(응답 노출만), 운영 백필 없음(마이그레이션 default false + dev seed만).
- **타입 정합**: `Job.beginnerFriendly`/`instantInterview`(T3 S1)를 필수로 추가 → 같은 태스크에서 `data.ts`(S3)·`api-job-mapper.ts`(S6)를 동시 수정해 typecheck 깨짐 방지. API 필드명(`jobPost.beginnerFriendly`)이 폼·매퍼·필터 전 구간 동일.
- **플레이스홀더 없음**: 각 코드 스텝에 실제 코드 포함. `data.ts`/`richJobs`는 항목이 많아 전량 복붙 대신 "어느 id에 어떤 값"을 명시(테스트 기대치가 정답을 고정).
- **주의(실행자용)**: base-ui `Checkbox`의 `onCheckedChange` 시그니처는 문서로 확인 후 setter를 맞출 것(T4 S2). 마이그레이션/시딩의 실제 DB 적용은 사용자 지시 전까지 금지.
