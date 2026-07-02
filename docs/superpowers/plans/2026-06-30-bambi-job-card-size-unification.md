# Bambi Job Card Size Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 홈의 4개 채용 섹션(스페셜/급구/추천/전체 공고) 카드 크기를 통일하고, 고정 `max-w-[1180px]`를 Tailwind 표준 `max-w-7xl`로 바꾼다.

**Architecture:** `VisualJobCard`에 중립 `organic` 톤과 optional `active` 상태를 추가해 4섹션이 동일 카드 컴포넌트를 쓰게 하고, 섹션 그리드를 단일 상수로 통일한다. `전체 공고`를 카드로 전환하면서 미사용이 되는 `DenseJobRow`를 삭제한다. `max-w`는 public 홈 경로(본문 + public 변형 헤더)만 `max-w-7xl`로 바꾼다.

**Tech Stack:** Next.js(App Router) + React, Tailwind CSS v4, shadcn(base-ui), vitest(source-level regression test), ultracite/biome.

## Global Constraints

- 인라인 `style={{...}}` 금지 — 모든 스타일은 Tailwind `className`. (apps/web/CLAUDE.md)
- 새 `.css`/전역 클래스 금지. 반경은 `rounded-md/lg/xl` 토큰 유틸, `rounded-none` 금지.
- 시맨틱/브랜드 토큰 사용(`bg-card` `border-border` `text-muted-foreground` `border-coral-400` 등). raw hex/oklch 금지.
- 세로 스택은 `flex flex-col gap-*`, `space-y-*` 금지. 가로·세로 동일 크기는 `size-*`.
- 조건부 클래스는 `cn()`(`@bambi-app/ui/lib/utils`), 템플릿 리터럴 삼항 금지.
- 커밋 전 `pnpm dlx ultracite fix`(또는 `pnpm run fix`)로 정렬·린트.
- 테스트는 worktree 루트에서 `pnpm exec vitest run <path>`로 실행한다(web에는 별도 test 스크립트가 없고 vitest는 루트 devDependency).
- 커밋 메시지는 한국어 `feat:`/`refactor:`/`test:` prefix. 멀티라인은 임시 파일 + `git commit -F`.

---

### Task 1: VisualJobCard에 organic 톤과 active 상태 추가

**Files:**
- Modify: `apps/web/src/components/bambi/visual-job-card.tsx`
- Test: `apps/web/src/components/bambi/visual-job-components.test.ts:12-20` (tone 유니온 검사 문자열 갱신)

**Interfaces:**
- Produces: `VisualJobCard` props에 `tone: "organic" | "recommended" | "special" | "urgent"`와 optional `active?: boolean` 추가. active=true이면 `border-coral-400 ring-2 ring-coral-100` 적용. Task 2가 organic 섹션에서 `tone="organic"`, `active={...}`로 사용한다.

- [ ] **Step 1: 테스트 기대값을 새 tone 유니온으로 갱신**

`apps/web/src/components/bambi/visual-job-components.test.ts`의 첫 번째 `it` 블록(라인 16)을 수정:

```ts
		expect(source).toContain(
			'tone: "organic" | "recommended" | "special" | "urgent"'
		);
```

(기존 `expect(source).toContain('tone: "recommended" | "special" | "urgent"');` 한 줄을 위 형태로 교체.)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm exec vitest run apps/web/src/components/bambi/visual-job-components.test.ts`
Expected: FAIL — 첫 번째 테스트에서 새 유니온 문자열이 source에 없어 실패.

- [ ] **Step 3: VisualJobCard 구현 수정**

`apps/web/src/components/bambi/visual-job-card.tsx`에서 props 인터페이스, tone 맵, article className을 수정한다.

Props 인터페이스(기존 `VisualJobCardProps`)를 다음으로 교체:

```tsx
interface VisualJobCardProps {
	active?: boolean;
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	tone: "organic" | "recommended" | "special" | "urgent";
}
```

`toneClassName` 맵에 organic(중립) 추가:

```tsx
const toneClassName = {
	organic: "border-border bg-card",
	recommended: "border-sky-200 bg-sky-50/50",
	special: "border-coral-200 bg-coral-50/70",
	urgent: "border-amber-200 bg-amber-50/70",
} as const;
```

`toneLabel` 맵에 organic 추가:

```tsx
const toneLabel = {
	organic: "최신",
	recommended: "추천",
	special: "스페셜",
	urgent: "급구",
} as const;
```

함수 시그니처에 `active` 구조분해 추가(기본값 false):

```tsx
export function VisualJobCard({
	active = false,
	job,
	onChat,
	onOpen,
	tone,
}: VisualJobCardProps) {
```

article의 className `cn(...)`에 active ring을 마지막 인자로 추가:

```tsx
		<article
			className={cn(
				"grid min-h-[148px] rounded-lg border bg-card p-2.5 transition-colors",
				toneClassName[tone],
				active && "border-coral-400 ring-2 ring-coral-100"
			)}
		>
```

(나머지 본문 — 커버 이미지, 배지 라인 `job.promotionLabel ?? toneLabel[tone]`, 급여/위치/채팅 버튼 — 은 그대로 둔다.)

- [ ] **Step 4: 린트·정렬**

Run: `pnpm run fix`
Expected: 변경 파일 정렬, 에러 없음. (union/object key가 알파벳 정렬되어 있어야 함: organic→recommended→special→urgent.)

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `pnpm exec vitest run apps/web/src/components/bambi/visual-job-components.test.ts`
Expected: PASS — 모든 테스트 통과(이 시점엔 section 테스트가 아직 `<DenseJobRow`를 기대하므로 organic 섹션은 아직 안 건드렸고 그대로 통과).

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/visual-job-card.tsx apps/web/src/components/bambi/visual-job-components.test.ts
git commit -m "feat: VisualJobCard에 organic 톤과 선택 상태 추가"
```

---

### Task 2: 4섹션 카드 그리드 통일 + 전체 공고 카드 전환 + DenseJobRow 제거

**Files:**
- Modify: `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`
- Delete: `apps/web/src/components/bambi/dense-job-row.tsx`
- Test: `apps/web/src/components/bambi/visual-job-components.test.ts` (DenseJobRow 블록·assertion 제거)

**Interfaces:**
- Consumes: Task 1의 `VisualJobCard`(`tone="organic"`, `active?` 지원).
- Produces: 없음(화면 컴포넌트 최종 소비처).

- [ ] **Step 1: 테스트를 새 구조에 맞게 갱신**

`apps/web/src/components/bambi/visual-job-components.test.ts`에서:

(a) DenseJobRow 컴포넌트 테스트 `it` 블록 전체(아래)를 삭제:

```ts
	it("defines a dense job row with selected state, verification, and chat affordances", () => {
		const source = readComponent("dense-job-row.tsx");

		expect(source).toContain("export function DenseJobRow");
		expect(source).toContain("active = false");
		expect(source).toContain("job.verified");
		expect(source).toContain("검수");
		expect(source).toContain("rightIcon={<Message />}");
	});
```

(b) 섹션 테스트(`defines visual exposure sections ...`)에서 `<DenseJobRow` 기대 줄을 삭제:

```ts
		expect(source).toContain("<DenseJobRow");
```

→ 같은 블록의 `expect(source).toContain("<VisualJobCard");`와 `전체 공고`는 그대로 둔다.

- [ ] **Step 2: 테스트 실행 — 현재 상태 확인**

Run: `pnpm exec vitest run apps/web/src/components/bambi/visual-job-components.test.ts`
Expected: PASS — 아직 구현 변경 전이지만, 삭제한 기대는 더 이상 검사하지 않고 남은 기대(`<VisualJobCard`, `<DenseJobRow`는 아직 소스에 존재)는 만족하므로 통과. (이 단계는 테스트가 새 형태로도 green임을 확인하는 안전망.)

- [ ] **Step 3: 섹션 컴포넌트 구현 수정**

`apps/web/src/components/bambi/visual-job-exposure-sections.tsx`를 수정한다.

(a) import에서 DenseJobRow 제거:

```tsx
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { getVisualJobExposureSections } from "@/lib/bambi/visual-job-exposure";
import { Card } from "./ds";
import { VisualJobCard } from "./visual-job-card";
```

(b) 컴포넌트 함수 위에 통일 그리드 상수 추가:

```tsx
const CARD_GRID_CLASS = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4";
```

(c) special/urgent/recommended 세 섹션의 grid div className을 모두 `CARD_GRID_CLASS`로 교체.
예: special 섹션의

```tsx
					<div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4">
```

를

```tsx
					<div className={CARD_GRID_CLASS}>
```

로 바꾸고, urgent/recommended의 `<div className="grid grid-cols-2 gap-2 md:grid-cols-3">`도 동일하게 `<div className={CARD_GRID_CLASS}>`로 교체.

(d) `전체 공고`(organic) 섹션의 grid div와 매핑을 카드로 교체:

```tsx
			<section className="grid gap-2">
				<div className="flex items-center justify-between">
					<h2 className="m-0 font-extrabold text-base">전체 공고</h2>
					<span className="font-semibold text-muted-foreground text-xs">
						{visualSections.organic.length}개 · 최신순
					</span>
				</div>
				<div className={CARD_GRID_CLASS}>
					{visualSections.organic.map((job) => (
						<VisualJobCard
							active={job.id === selectedJobId}
							job={job}
							key={`organic-${job.id}`}
							onChat={onChat}
							onOpen={onOpen}
							tone="organic"
						/>
					))}
				</div>
			</section>
```

- [ ] **Step 4: DenseJobRow 파일 삭제**

```bash
git rm apps/web/src/components/bambi/dense-job-row.tsx
```

- [ ] **Step 5: 린트·정렬**

Run: `pnpm run fix`
Expected: 에러 없음. 미사용 import(DenseJobRow)가 남아 있으면 여기서 걸리므로 제거 확인.

- [ ] **Step 6: 테스트 실행 — 통과 확인**

Run: `pnpm exec vitest run apps/web/src/components/bambi/visual-job-components.test.ts`
Expected: PASS — DenseJobRow 블록 제거됨, 섹션 소스에 `<VisualJobCard` 존재, `dense-job-row.tsx` 더 이상 읽지 않음.

- [ ] **Step 7: 타입 체크**

Run: `pnpm --filter web check-types`
Expected: 통과 — organic tone/active prop 타입 일치, DenseJobRow 참조 없음.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/components/bambi/visual-job-exposure-sections.tsx apps/web/src/components/bambi/visual-job-components.test.ts
git commit -m "refactor: 4개 채용 섹션 카드 그리드 통일 및 전체 공고 카드 전환"
```

---

### Task 3: 고정 max-w를 max-w-7xl로 유연화

**Files:**
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx:35`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx:42`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음(스타일 변경).

- [ ] **Step 1: public-marketplace 본문 컨테이너 폭 변경**

`apps/web/src/components/bambi/screens/public-marketplace.tsx`의 본문 wrapper div(라인 35):

```tsx
			<div className="mx-auto flex w-full max-w-7xl gap-5 px-4 py-6 pb-16 md:px-6 md:py-10">
```

(기존 `max-w-[1180px]` → `max-w-7xl`. 나머지 클래스 동일.)

- [ ] **Step 2: responsive-shell 헤더 폭을 public 변형만 변경**

`apps/web/src/components/bambi/responsive-shell.tsx`의 데스크톱 헤더 내부 컨테이너(라인 42)를 variant 기반으로 분기. `cn`은 이미 import되어 있음(파일 상단 `import { cn } from "@bambi-app/ui/lib/utils";`). 해당 div를 다음으로 교체:

```tsx
					<div
						className={cn(
							"mx-auto flex h-16 items-center gap-7 px-6",
							isPublic ? "max-w-7xl" : "max-w-[1180px]"
						)}
					>
```

(`isPublic`은 같은 컴포넌트에 이미 선언되어 있음: `const isPublic = variant === "public";`)

- [ ] **Step 3: 린트·정렬**

Run: `pnpm run fix`
Expected: 에러 없음.

- [ ] **Step 4: 타입 체크 + 빌드 검증**

Run: `pnpm --filter web check-types`
Expected: 통과.

Run: `pnpm --filter web build`
Expected: 빌드 성공.

- [ ] **Step 5: 전체 테스트 재확인**

Run: `pnpm exec vitest run apps/web/src/components/bambi/visual-job-components.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/screens/public-marketplace.tsx apps/web/src/components/bambi/responsive-shell.tsx
git commit -m "refactor: 공개 홈 max-w를 고정값에서 max-w-7xl로 유연화"
```

---

## 검증 요약 (전 태스크 완료 후)

- `pnpm exec vitest run apps/web/src/components/bambi/visual-job-components.test.ts` — 통과.
- `pnpm --filter web check-types` — 통과.
- `pnpm run check` — 통과.
- `pnpm --filter web build` — 성공.
- (선택) 브라우저 `/`: 4섹션 카드 폭·높이 동일, xl 이상에서 스페셜이 다른 섹션과 동일 열 수, 헤더·본문 1280px 정렬, 선택 카드 코럴 ring 유지, cover 없는 fallback 정상.
