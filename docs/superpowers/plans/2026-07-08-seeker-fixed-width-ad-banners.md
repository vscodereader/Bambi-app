# 채용 페이지 고정폭 전환 + 광고 배너 (목업) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채용 목록·상세·헤더를 유동폭(`max-w-[80%]`)에서 계산형 고정폭(`min(92%,1120px)`)으로 전환하고, 확보된 여백/상단에 광고 배너 목업(세로 rail·상단 프리미엄 가로)을 추가한다.

**Architecture:** 공통 폭 상수(`lib/bambi/layout.ts`)를 헤더·목록·상세가 공유해 폭을 일원화한다. 헤더는 전역 공용이므로 `contentWidthClassName` prop을 주입해 채용 경로에만 고정폭을 적용하고 나머지 페이지는 기존 80%를 유지한다. 공고 카드는 가로형을 유지하되 이미지 축소 + 설명 제거로 4열(~207px)에 맞춘다. 배너는 이미지 없는 정적 shadcn `Card` 플레이스홀더다.

**Tech Stack:** Next.js(App Router, RSC), Tailwind v4, shadcn(base-ui) via `@bambi-app/ui`, 프로토타입 DS 래퍼 `components/bambi/ds.tsx`, vitest(소스-문자열 테스트).

## Global Constraints

- 인라인 `style` 금지, 스타일은 Tailwind `className`만. (`apps/web/CLAUDE.md`)
- 임의 단독 px(`max-w-[1180px]` 등) 금지 — `min()` 계산형/토큰 사용. (메모리: 컨테이너 너비 컨벤션)
- 임의 px 토큰(`[16px]`) 지양, Tailwind 스케일 토큰 사용. 기존 파일의 기존 임의값은 유지 가능.
- 색은 시맨틱/브랜드 토큰(`bg-secondary`, `text-muted-foreground`, `bg-coral-50` 등). raw hex 금지.
- 반경: 카드/컨트롤 `rounded-lg`, 타일 `rounded-md`, 배지/칩 `full`. `rounded-none` 금지.
- 간격은 `flex`/`grid`+`gap-*`. `space-x/y-*` 금지. 정사각은 `size-*`.
- 카드 그리드 데스크톱 3열 이상 유지, 2열 금지. (메모리)
- 마켓플레이스 카드 데스크톱 기본 **4열**(사용자 요구).
- 빌드·dev 서버 실행 금지. 검증은 typecheck + lint + vitest만. 시각 확인은 사용자. (프로젝트 규칙/메모리)
- 워크트리 커밋 전 `pnpm install` 필요, 줄바꿈 LF. (메모리)
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). (메모리)
- push/PR 금지 — 로컬 커밋까지만. (사용자 지침)

## File Structure

- Create `apps/web/src/lib/bambi/layout.ts` — 채용 공통 폭 상수 (단일 책임: 폭 토큰)
- Create `apps/web/src/components/bambi/ad-banner.tsx` — 세로형 배너 목업 `AdBanner` + `AdBannerRail`
- Create `apps/web/src/components/bambi/premium-ad-banner-section.tsx` — 상단 가로 프리미엄 섹션 `PremiumAdBannerSection`
- Modify `apps/web/src/components/bambi/responsive-shell.tsx` — 헤더 폭 prop 주입
- Modify `apps/web/src/components/bambi/seeker-app-shell.tsx` — 채용 경로에서 폭 상수 전달
- Modify `apps/web/src/components/bambi/visual-job-card.tsx` — 카드 가로형 컴팩트화(이미지 축소·설명 제거)
- Modify `apps/web/src/components/bambi/screens/seeker-marketplace.tsx` — 컨테이너 폭·상단/좌/우 배너
- Modify `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx` — 컨테이너 폭·좌우 배너
- Modify `apps/web/src/components/bambi/visual-job-components.test.ts` — 폭 기대값 갱신

---

## Task 0: 워크트리 부트스트랩

**Files:** 없음 (환경 준비)

- [ ] **Step 1: 의존성 설치**

Run (레포 루트에서):
```bash
pnpm install
```
Expected: 설치 완료(워크트리 node_modules 생성). 커밋 훅(lefthook)·vitest 실행 전제.

- [ ] **Step 2: 검증 명령 동작 확인**

Run (`apps/web`에서):
```bash
pnpm exec vitest run src/components/bambi/visual-job-components.test.ts
```
Expected: 현재 소스 기준 PASS (기준선 확보). 만약 vitest config가 web에 없어 실패하면
`pnpm --filter web exec vitest run ...` 또는 루트 `pnpm test`로 대체 경로를 확정하고 이후 태스크에 반영.

---

## Task 1: 공통 폭 토큰

**Files:**
- Create: `apps/web/src/lib/bambi/layout.ts`

**Interfaces:**
- Produces: `SEEKER_CONTENT_WIDTH: string` (= `"md:max-w-[min(92%,1120px)]"`), `SEEKER_CONTENT_MAX_W: string` (= `"max-w-[min(92%,1120px)]"` — breakpoint 없는 헤더용)

- [ ] **Step 1: 폭 상수 파일 작성**

Create `apps/web/src/lib/bambi/layout.ts`:
```ts
// 채용(seeker) 페이지 공통 콘텐츠 폭. 헤더·목록·상세가 이 상수를 공유해 폭 기준을 정렬한다.
// 임의 단독 px 금지 컨벤션 준수 — min() 계산형.

// 목록·상세 컨테이너용(모바일 전체폭 → md 이상에서 고정폭).
export const SEEKER_CONTENT_WIDTH = "md:max-w-[min(92%,1120px)]";

// 헤더(ResponsiveAppShell) 데스크톱 바용 — 이미 md:block 헤더라 breakpoint 접두사 없이 사용.
export const SEEKER_CONTENT_MAX_W = "max-w-[min(92%,1120px)]";
```

- [ ] **Step 2: 타입체크**

Run (`apps/web`): `pnpm check-types`
Expected: PASS (새 상수만 추가, 사용처 없음 → 에러 없음).

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/bambi/layout.ts
git commit -m "feat: 채용 페이지 공통 폭 토큰 추가

- lib/bambi/layout.ts에 SEEKER_CONTENT_WIDTH·SEEKER_CONTENT_MAX_W 정의
- 헤더·목록·상세가 공유할 계산형 고정폭(min(92%,1120px))
- 임의 단독 px 금지 컨벤션 준수(min() 계산형)"
```

---

## Task 2: 헤더 폭 주입

**Files:**
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx`
- Modify: `apps/web/src/components/bambi/seeker-app-shell.tsx`

**Interfaces:**
- Consumes: `SEEKER_CONTENT_MAX_W` (Task 1)
- Produces: `ResponsiveAppShell` prop `contentWidthClassName?: string` (기본 `"max-w-[80%]"`)

- [ ] **Step 1: `ResponsiveAppShell`에 폭 prop 추가**

Modify `responsive-shell.tsx`:
- `ResponsiveAppShellProps`에 추가: `contentWidthClassName?: string;`
- 함수 시그니처 기본값: `contentWidthClassName = "max-w-[80%]",`
- 데스크톱 헤더 내부 컨테이너(현재 `line 89`):
  `<div className="mx-auto flex h-16 max-w-[80%] items-center gap-7 px-6">`
  → `max-w-[80%]`를 `contentWidthClassName`으로 교체:
```tsx
<div
  className={cn(
    "mx-auto flex h-16 items-center gap-7 px-6",
    contentWidthClassName
  )}
>
```
  (`cn`은 이미 import됨.)

- [ ] **Step 2: `SeekerAppShell`에서 채용 경로에 폭 전달**

Modify `seeker-app-shell.tsx`:
- import 추가: `import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";`
- `SeekerAppShell` 내부, `isMarketplace` 아래에 채용(목록+상세) 경로 판정 추가:
```tsx
// 채용 목록(/seeker)·상세(/seeker/jobs/*)만 고정폭 헤더로 정렬한다. 그 외 seeker 화면은 기존 80% 유지.
const isJobArea =
  pathname === "/seeker" || pathname.startsWith("/seeker/jobs/");
```
- `<ResponsiveAppShell>`에 prop 전달:
```tsx
<ResponsiveAppShell
  contentWidthClassName={isJobArea ? SEEKER_CONTENT_MAX_W : undefined}
  headerSlot={isMarketplace ? <SeekerHeaderSearch /> : undefined}
  variant="seeker"
>
```
  (`undefined`이면 `ResponsiveAppShell` 기본값 `max-w-[80%]` 사용.)

- [ ] **Step 3: 타입체크 + 린트**

Run (`apps/web`): `pnpm check-types`
Run (레포 루트): `pnpm check`
Expected: PASS. (lint 이슈 있으면 루트 `pnpm fix`로 정렬 후 재확인.)

- [ ] **Step 4: 기존 테스트 회귀 확인**

Run (`apps/web`): `pnpm exec vitest run src/components/bambi/visual-job-components.test.ts`
Expected: PASS (헤더 변경은 폭 테스트 대상 파일 아님).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/responsive-shell.tsx apps/web/src/components/bambi/seeker-app-shell.tsx
git commit -m "feat: 공용 헤더에 콘텐츠 폭 prop 주입

- ResponsiveAppShell에 contentWidthClassName prop 추가(기본 max-w-[80%])
- SeekerAppShell이 /seeker·/seeker/jobs/* 경로에서만 고정폭 전달
- public/employer/moderator 및 seeker 채팅·내정보는 기존 80% 유지"
```

---

## Task 3: 공고 카드 컴팩트화 (가로형 유지·이미지 축소·설명 제거)

**Files:**
- Modify: `apps/web/src/components/bambi/visual-job-card.tsx`

**Interfaces:**
- `VisualJobCard`의 props/시그니처 불변. 내부 레이아웃만 변경.

- [ ] **Step 1: 설명(shortDesc) 로직 제거**

Modify `visual-job-card.tsx`:
- 삭제: `DESC_MAX_LENGTH` 상수(line 63)와 `truncateDesc` 함수(line 66-71).
- 삭제: 본문 내 `const shortDesc = truncateDesc(job.desc);`(line 81).
- 삭제: 텍스트 블록의 설명 `<p>`(line 147-149):
```tsx
<p className="m-0 truncate text-muted-foreground text-xs leading-relaxed">
  {shortDesc}
</p>
```

- [ ] **Step 2: 커버 이미지 축소(가로형 유지)**

- 커버 이미지(line 116-123)의 `className`과 크기를 정사각 축소:
```tsx
<Image
  alt={job.coverImage.altText || job.coverImage.fileName}
  className="size-14 shrink-0 rounded-md border border-white object-cover"
  height={56}
  src={job.coverImage.url}
  unoptimized
  width={56}
/>
```
- 폴백 블록(line 125-127) `size-20` → `size-14`:
```tsx
<div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-white bg-secondary font-extrabold text-coral-700 text-sm">
  {job.company.slice(0, 2)}
</div>
```

- [ ] **Step 3: 타입체크**

Run (`apps/web`): `pnpm check-types`
Expected: PASS (미사용 심볼 제거로 에러 없음).

- [ ] **Step 4: 기존 카드 테스트 회귀 확인**

Run (`apps/web`): `pnpm exec vitest run src/components/bambi/visual-job-components.test.ts`
Expected: PASS. (테스트 line 12-25는 tone/promotionLabel/`rightIcon={<Message />}`/toneBadge를 assert하며 설명 문자열은 assert하지 않음 → 영향 없음. 실패 시 어떤 assert가 깨졌는지 확인해 카드 필수 요소를 보존.)

- [ ] **Step 5: 린트 + 커밋**

Run (루트): `pnpm fix` 후 `pnpm check`
```bash
git add apps/web/src/components/bambi/visual-job-card.tsx
git commit -m "refactor: 공고 카드 4열용 컴팩트화

- 커버 이미지 w-32 h-16 → size-14 정사각 축소, 폴백 블록도 size-14
- 설명(shortDesc) 줄과 truncateDesc·DESC_MAX_LENGTH 제거
- 1120px 콘텐츠 4열(~207px)에서 답답하지 않게 정보 밀도 축소"
```

> **시각 확인(사용자):** 4열 배치에서 카드 하단 급여 pill + 채팅 버튼이 겹치지 않는지 확인 요청. 겹치면 후속 조정(버튼 축소/급여 pill 폭).

---

## Task 4: 세로형 광고 배너 컴포넌트

**Files:**
- Create: `apps/web/src/components/bambi/ad-banner.tsx`

**Interfaces:**
- Produces:
  - `AdBanner({ className?: string; label?: string })` — 세로 단일 배너(`w-[236px]`)
  - `AdBannerRail({ className?: string; count?: number })` — 세로 배너 스택 + `sticky top-20`

- [ ] **Step 1: 컴포넌트 작성**

Create `apps/web/src/components/bambi/ad-banner.tsx`:
```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Badge, Card } from "./ds";

interface AdBannerProps {
  className?: string;
  label?: string;
}

// 세로형 광고 배너 목업 — 공고 카드와 유사한 폭(w-[236px]).
// 이미지 없이 색/텍스트 플레이스홀더로 광고 자리만 표시한다.
export function AdBanner({ className, label = "광고" }: AdBannerProps) {
  return (
    <Card
      className={cn("flex w-[236px] flex-col gap-3 rounded-lg", className)}
      pad="md"
      tone="outline"
    >
      <Badge className="self-start" tone="neutral">
        {label}
      </Badge>
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-secondary">
        <span className="font-bold text-muted-foreground text-xs">
          광고 배너
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-extrabold text-sm">스폰서 광고</span>
        <span className="text-muted-foreground text-xs">
          이곳에 광고가 노출됩니다.
        </span>
      </div>
    </Card>
  );
}

// 목업 배너 슬롯 id — 배열 인덱스 key 대신 안정 키로 사용.
const AD_RAIL_SLOTS = ["ad-1", "ad-2", "ad-3"] as const;

interface AdBannerRailProps {
  className?: string;
  count?: number;
}

// 세로 배너 여러 개를 스택으로 묶고 sticky로 스크롤을 따라오게 한다. 데스크톱 전용 노출은 사용처에서 제어.
export function AdBannerRail({ className, count = 2 }: AdBannerRailProps) {
  const slots = AD_RAIL_SLOTS.slice(0, count);
  return (
    <div className={cn("sticky top-20 flex flex-col gap-4", className)}>
      {slots.map((slot) => (
        <AdBanner key={slot} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run (`apps/web`): `pnpm check-types`
Run (루트): `pnpm fix` 후 `pnpm check`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/bambi/ad-banner.tsx
git commit -m "feat: 세로형 광고 배너 목업 컴포넌트 추가

- AdBanner: 공고 카드 유사 폭(w-[236px]) 세로 카드, 이미지 없는 정적 플레이스홀더
- AdBannerRail: 배너 2~3개 스택 + sticky top-20으로 스크롤 추종
- shadcn Card 기반, 시맨틱 토큰만 사용"
```

---

## Task 5: 상단 프리미엄 가로 배너 섹션

**Files:**
- Create: `apps/web/src/components/bambi/premium-ad-banner-section.tsx`

**Interfaces:**
- Produces: `PremiumAdBannerSection({ className?: string })` — 가로 3개 고정 나열, 데스크톱·모바일 반응형

- [ ] **Step 1: 컴포넌트 작성**

Create `apps/web/src/components/bambi/premium-ad-banner-section.tsx`:
```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Badge, Card } from "./ds";

// 상단 프리미엄 슬롯 id — 안정 key.
const PREMIUM_SLOTS = ["premium-1", "premium-2", "premium-3"] as const;

// 목록 상단 프리미엄 가로 광고 섹션 목업. 데스크톱·모바일 모두 노출(모바일 1열 → sm 2열 → lg 3열).
export function PremiumAdBannerSection({ className }: { className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <Badge tone="pending">프리미엄</Badge>
        <h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PREMIUM_SLOTS.map((slot) => (
          <Card
            className="flex items-center gap-3 rounded-lg"
            key={slot}
            pad="md"
            tone="outline"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-coral-50 font-extrabold text-coral-700 text-xs">
              AD
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-extrabold text-sm">
                프리미엄 스폰서
              </span>
              <span className="truncate text-muted-foreground text-xs">
                프리미엄 광고 노출 영역입니다.
              </span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

> **주의:** `Badge tone="pending"`가 `ds.tsx`의 `BadgeTone`에 존재하는지 확인(marketplace에서 사용 중이면 OK). 없으면 `tone="neutral"`로 대체.

- [ ] **Step 2: 타입체크 + 린트**

Run (`apps/web`): `pnpm check-types`
Run (루트): `pnpm fix` 후 `pnpm check`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/bambi/premium-ad-banner-section.tsx
git commit -m "feat: 상단 프리미엄 가로 광고 섹션 목업 추가

- PremiumAdBannerSection: 가로 카드 3개 고정 나열, 정적 플레이스홀더
- 반응형 1→2→3열, 데스크톱·모바일 모두 노출
- shadcn Card 기반 프리미엄 강조 톤(coral)"
```

---

## Task 6: 목록 화면 통합 + 폭 테스트 갱신

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- Modify: `apps/web/src/components/bambi/visual-job-components.test.ts`

**Interfaces:**
- Consumes: `SEEKER_CONTENT_WIDTH`(Task 1), `AdBannerRail`(Task 4), `PremiumAdBannerSection`(Task 5)

- [ ] **Step 1: 폭 테스트 기대값 먼저 갱신 (실패 유도)**

Modify `visual-job-components.test.ts` line 48 컨텍스트:
```ts
// 로그인 마켓플레이스는 채용 전용 고정폭을 쓴다(min(92%,1120px))
expect(source).toContain("SEEKER_CONTENT_WIDTH");
expect(source).not.toContain("max-w-[80%]");
```
(폭 상수를 직접 참조하므로 문자열 `"SEEKER_CONTENT_WIDTH"` 존재로 검증. line 49의 히어로 카피 부재 assert는 유지.)

- [ ] **Step 2: 테스트 실패 확인**

Run (`apps/web`): `pnpm exec vitest run src/components/bambi/visual-job-components.test.ts -t "wires the seeker marketplace"`
Expected: FAIL — 아직 소스가 `max-w-[80%]`를 포함하고 `SEEKER_CONTENT_WIDTH` 미참조.

- [ ] **Step 3: 목록 화면 레이아웃 변경**

Modify `seeker-marketplace.tsx`:
- import 추가:
```tsx
import { cn } from "@bambi-app/ui/lib/utils";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { AdBannerRail } from "../ad-banner";
import { PremiumAdBannerSection } from "../premium-ad-banner-section";
```
- 최상단 컨테이너를 세로 스택으로 감싸고, 그 안에 상단 프리미엄 섹션 → 본문 행 순서로 배치.
  기존 `return (<div className="mx-auto flex ... md:max-w-[80%] ...">...)` 구조를 다음으로 교체:
```tsx
return (
  <div className="pb-24">
    <div
      className={cn(
        "mx-auto w-full px-5 py-5 md:px-6 md:py-10",
        SEEKER_CONTENT_WIDTH
      )}
    >
      <PremiumAdBannerSection className="mb-6" />
      <div className="relative flex w-full gap-5">
        <MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
        <section className="min-w-0 flex-1">
          {/* 기존 탭/검색/칩/에러/헤더/VisualJobExposureSections 그대로 */}
        </section>
        {/* 우측 세로 배너: 1120px 콘텐츠 바깥 여백에 앵커, 넓은 화면에서만 노출 */}
        <AdBannerRail className="-right-[260px] absolute top-0 hidden xl:flex" />
      </div>
    </div>
    <MarketplaceFilterSheet ... />
  </div>
);
```
- 좌측 필터 사이드바 아래 배너: `MarketplaceFilterSidebar`는 별도 컴포넌트라 직접 삽입이 어려우므로,
  좌측 배너는 사이드바 `aside` 하단에 오도록 목록 화면에서 필터 옆에 배너용 컬럼을 두지 않고,
  **좌측 배너는 사이드바 컴포넌트 내부가 아닌 화면단에서 필터 aside 다음에 배치**한다. 구현 상세:
  `MarketplaceFilterSidebar` 아래에 배너를 붙이기 위해 필터를 감싸는 좌측 컬럼을 만든다:
```tsx
<div className="hidden w-[236px] shrink-0 flex-col gap-4 lg:flex">
  <MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
  <AdBannerRail count={2} />
</div>
```
  이 경우 `MarketplaceFilterSidebar` 자체의 `hidden ... lg:block`·`sticky`는 유지되며 배너가 그 아래로 흐른다.

> **구현 판단:** 우측 여백 배너의 `-right-[260px] absolute`는 뷰포트가 좁으면 잘리므로 `hidden xl:flex`로 가린다. 실제 앵커 수치(`-right-*`)는 시각 확인으로 조정. 잘림이 문제면 컨테이너를 `relative`로 두고 배너를 음수 마진 대신 별도 여백 그리드로 재구성.

- [ ] **Step 4: 테스트 통과 확인**

Run (`apps/web`): `pnpm exec vitest run src/components/bambi/visual-job-components.test.ts`
Expected: PASS (seeker-marketplace assert 갱신 반영, 나머지 파일 assert 불변).

- [ ] **Step 5: 타입체크 + 린트**

Run (`apps/web`): `pnpm check-types`
Run (루트): `pnpm fix` 후 `pnpm check`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/screens/seeker-marketplace.tsx apps/web/src/components/bambi/visual-job-components.test.ts
git commit -m "feat: 채용 목록 고정폭 전환·광고 배너 배치

- 컨테이너를 SEEKER_CONTENT_WIDTH 고정폭으로 전환
- 상단에 프리미엄 가로 배너 섹션 삽입(필터/탭 위)
- 좌측 필터 사이드바 아래 세로 배너, 우측 여백에 sticky 세로 배너(xl+)
- visual-job-components.test.ts 폭 기대값을 SEEKER_CONTENT_WIDTH로 갱신"
```

> **시각 확인(사용자):** 필터 사이드바(236) + 카드 4열이 1120px 안에서 3열/4열 정상인지, 우측 배너 잘림 여부.

---

## Task 7: 상세 화면 고정폭 + 좌우 배너

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`

**Interfaces:**
- Consumes: `SEEKER_CONTENT_WIDTH`(Task 1), `AdBannerRail`(Task 4)

- [ ] **Step 1: 컨테이너 폭 전환 + 좌우 배너**

Modify `seeker-job-detail-responsive.tsx`:
- import 추가:
```tsx
import { cn } from "@bambi-app/ui/lib/utils";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { AdBannerRail } from "../ad-banner";
```
- 루트 컨테이너(line 74)의 `md:max-w-[80%]`를 상수로 교체하고 `relative` 추가:
```tsx
<div
  className={cn(
    "relative mx-auto w-full px-5 py-5 pb-28 md:px-6 md:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-8",
    SEEKER_CONTENT_WIDTH
  )}
>
```
- 컨테이너 안, `</aside>` 다음(모바일 고정바 앞)에 좌우 여백 배너 추가:
```tsx
{/* 좌우 콘텐츠 바깥 여백 세로 배너 — 넓은 화면 전용 */}
<AdBannerRail className="-left-[260px] absolute top-0 hidden xl:flex" count={2} />
<AdBannerRail className="-right-[260px] absolute top-0 hidden xl:flex" count={2} />
```
  (상세는 grid라 absolute가 grid 흐름 밖에 배치됨. 우측 배너가 320 CTA와 겹치지 않도록 `-right-*` 수치는 시각 확인 조정.)

- [ ] **Step 2: 타입체크 + 린트**

Run (`apps/web`): `pnpm check-types`
Run (루트): `pnpm fix` 후 `pnpm check`
Expected: PASS.

- [ ] **Step 3: 회귀 테스트**

Run (`apps/web`): `pnpm exec vitest run src/components/bambi/visual-job-components.test.ts`
Expected: PASS (상세는 폭 테스트 대상 아님).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx
git commit -m "feat: 채용 상세 고정폭 전환·좌우 배너

- 컨테이너를 SEEKER_CONTENT_WIDTH 고정폭으로 전환
- 좌·우 콘텐츠 바깥 여백에 sticky 세로 배너(xl+)
- 기존 본문+320 CTA 그리드 유지"
```

> **시각 확인(사용자):** 상세 좌우 배너가 본문/CTA와 겹치지 않는지, 좁은 화면에서 숨는지.

---

## Task 8: 최종 통합 검증

**Files:** 없음 (검증)

- [ ] **Step 1: 전체 타입체크**

Run (`apps/web`): `pnpm check-types`
Expected: PASS.

- [ ] **Step 2: 전체 린트**

Run (루트): `pnpm check`
Expected: PASS (필요 시 `pnpm fix`).

- [ ] **Step 3: 전체 vitest**

Run (`apps/web`): `pnpm exec vitest run src/components/bambi/visual-job-components.test.ts`
Expected: PASS. 특히 `lg:grid-cols-3` 포함·`2xl:grid-cols-4` 부재 assert 유지 확인.

- [ ] **Step 4: 사용자 시각 확인 요청**

dev 서버·스크린샷은 프로젝트 규칙상 금지. 사용자에게 다음 확인 요청:
- 목록: 데스크톱 4열, 상단 프리미엄 배너, 좌(필터 아래)·우 세로 배너, 모바일에서 배너/필터 정상 숨김
- 상세: 고정폭, 좌우 배너 겹침 없음
- 헤더-본문 폭 정렬(채용), public/employer 폭 변화 없음

- [ ] **Step 5: 최종 상태 보고 (push/PR 없이)**

브랜치 `feat/seeker-fixed-width-ad-banners`에 커밋 완료 보고. 시각 확인 결과에 따라 배너 앵커/카드 하단 미세조정 후속.

---

## Self-Review (작성자 체크 완료)

- **Spec coverage:** ①고정폭(Task 1,2,6,7) ②세로 배너(Task 4,6,7) ③상단 프리미엄(Task 5,6) ④카드 4열/컴팩트(Task 3,6) ⑤테스트 갱신(Task 6) ⑥헤더 정렬(Task 2) — 스펙 전 항목 매핑됨.
- **범위 안전:** 헤더 폭은 채용 경로에만 적용 → public/employer 테스트(line 73/85) 불변, seeker line 48만 갱신.
- **Type consistency:** `SEEKER_CONTENT_WIDTH`(컨테이너, md: 접두)와 `SEEKER_CONTENT_MAX_W`(헤더, 무접두) 구분 일관. `AdBannerRail`/`AdBanner`/`PremiumAdBannerSection` 시그니처 태스크 간 일치.
- **미확정(구현 중 확정):** 우측/좌우 배너 절대 위치 앵커 수치, 카드 하단 급여+채팅 배치, `Badge tone="pending"` 존재 여부 — 각 태스크에 확인 지점 명시.
- **UI 특성:** 픽셀 정합은 사용자 시각 확인으로 수렴(프로젝트 규칙: dev/스크린샷 금지).
