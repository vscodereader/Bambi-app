# 모바일 하단 탭바 뷰포트 고정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 하단 탭바가 브라우저 주소창 접힘/펼침과 무관하게 항상 뷰포트 바닥에 고정되도록 `sticky`를 `fixed` + safe-area 방식으로 전환한다.

**Architecture:** 두 곳에 중복된 하단 탭바 래퍼(`mobile-tab-bar.tsx`, `persona-nav.tsx`의 `NavBar`)를 공유 `BottomNavShell` 컴포넌트로 추출해 `position: fixed` + `env(safe-area-inset-bottom)`로 통일한다. `fixed`는 문서 흐름에서 빠지므로, 탭바가 노출되는 스크롤 콘텐츠에 하단 스페이서(공유 상수)를 더해 콘텐츠가 가려지지 않게 한다. 운영자 콘솔은 흐름에 있던 액션바/토스트를 고정 탭바 위로 재배치한다.

**Tech Stack:** Next.js 16 (App Router, RSC), React, Tailwind CSS v4, shadcn(base-ui) — `apps/web`.

## Global Constraints

- **스타일은 Tailwind `className`만.** 인라인 `style` 금지, 새 `.css`/전역 클래스 금지 (`apps/web/CLAUDE.md`).
- **조건부 클래스는 `cn()`** (`@bambi-app/ui/lib/utils`). 템플릿 리터럴 삼항 금지.
- **시맨틱 토큰 사용**: `bg-background`, `border-border` 등. raw hex 금지.
- **공유 스페이서/오프셋 문자열(정확히 이 리터럴 사용, Tailwind가 스캔해 생성):**
  - `BOTTOM_NAV_CONTENT_SPACER = "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"`
  - `BOTTOM_NAV_STACK_OFFSET = "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"`
  - `4.5rem`(72px)는 `BottomNav` 실제 렌더 높이(≈67px: border 1 + pt-2.5/pb-2 + 아이콘 24 + gap-1 + 라벨 ≈ 12 + py-1)를 안전하게 초과하도록 선택. 라벨/패딩이 바뀌면 재검토.
- **검증**: `pnpm --filter web check-types` + `pnpm dlx ultracite fix`. 이 작업은 CSS/레이아웃 변경이라 자동 테스트가 프로젝트 패턴에 없다(메모리: 개발서버·스크린샷 금지, 시각 확인은 사용자). className을 문자열로 단언하는 저가치 테스트는 작성하지 않는다. 각 태스크 끝에 사용자가 수행할 **수동 확인 항목**을 명시한다.
- **커밋 메시지**: 한국어 `type:` 제목 + 빈 줄 + 불릿 본문. `git commit -F <file>` 또는 heredoc 사용. 커밋 후 `git log -1 --format=%B`로 래퍼 문자 없는지 확인.
- **push/PR 금지**: 사용자가 명시 지시하기 전까지 커밋까지만 (메모리 `bambi-no-auto-push-pr`).

---

## Task 0: 워크트리 의존성 설치 (사전 준비)

**Files:** 없음 (환경 준비)

- [ ] **Step 1: 워크트리에 의존성 설치**

worktree는 node_modules가 없어 `tsc`/lefthook이 동작하지 않는다(메모리 `bambi-worktree-commit-prereqs`).

Run: `pnpm install`
Expected: 설치 성공, 에러 없이 완료.

- [ ] **Step 2: 기준 타입체크가 통과하는지 확인**

Run: `pnpm --filter web check-types`
Expected: PASS (변경 전 기준선 확인).

---

## Task 1: 뷰포트 메타 추가 (safe-area 활성화)

`viewport-fit=cover`가 있어야 이후 태스크의 `env(safe-area-inset-bottom)`가 실제 값을 반환한다. 이 태스크를 먼저 둔다.

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: HTML `<head>`에 `viewport-fit=cover` meta 및 `theme-color` 출력. 이후 태스크의 `env(safe-area-inset-*)` 값이 유효해짐.

- [ ] **Step 1: `Viewport` 타입 import 추가**

`apps/web/src/app/layout.tsx` 상단 import를 수정한다. 현재:

```ts
import type { Metadata } from "next";
```

로 변경:

```ts
import type { Metadata, Viewport } from "next";
```

- [ ] **Step 2: `viewport` export 추가**

기존 `metadata` export 바로 아래에 추가한다. 현재:

```ts
export const metadata: Metadata = {
	description: "밤비 — 합법 유흥·접객 채용의 신뢰와 안전 흐름",
	title: "밤비 · 신뢰와 안전",
};
```

아래로 변경(export 추가):

```ts
export const metadata: Metadata = {
	description: "밤비 — 합법 유흥·접객 채용의 신뢰와 안전 흐름",
	title: "밤비 · 신뢰와 안전",
};

export const viewport: Viewport = {
	interactiveWidget: "resizes-content",
	themeColor: "#ffffff",
	viewportFit: "cover",
};
```

- [ ] **Step 3: 린트 + 타입체크**

Run: `pnpm dlx ultracite fix && pnpm --filter web check-types`
Expected: PASS. `viewport` export 타입 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/layout.tsx
git commit -F - <<'EOF'
feat: viewport-fit=cover로 safe-area 인셋 활성화

- 하단 탭바 고정을 위한 env(safe-area-inset-*) 사용 준비
- themeColor·interactiveWidget 설정 추가
EOF
```

**수동 확인(사용자):** 배포 후 모바일에서 홈 인디케이터 영역이 인식되는지(다음 태스크와 함께 확인).

---

## Task 2: 공유 `BottomNavShell` 컴포넌트 생성

`sticky` 래퍼를 `fixed` + safe-area로 통일하고, 스페이서/오프셋 상수를 한곳에서 export 한다.

**Files:**
- Create: `apps/web/src/components/bambi/bottom-nav-shell.tsx`

**Interfaces:**
- Produces:
  - `BottomNavShell({ children }: { children: ReactNode })` — `fixed inset-x-0 bottom-0` + safe-area padding + `md:hidden` 래퍼.
  - `BOTTOM_NAV_CONTENT_SPACER: string` — 스크롤 콘텐츠 하단 패딩 클래스.
  - `BOTTOM_NAV_STACK_OFFSET: string` — 고정 탭바 위에 다른 요소를 띄울 때 쓰는 `bottom-*` 클래스.

- [ ] **Step 1: 파일 생성**

`apps/web/src/components/bambi/bottom-nav-shell.tsx`:

```tsx
// 밤비 — 모바일 하단 탭바 공유 셸.
// position: fixed + env(safe-area-inset-bottom)로 주소창 접힘/펼침·홈 인디케이터에
// 무관하게 항상 뷰포트 바닥에 고정한다. sticky 특유의 iOS 부유 버그를 피한다.

import type { ReactNode } from "react";

// 고정 탭바가 흐름에서 빠지므로, 노출 라우트의 스크롤 콘텐츠 하단에 더할 패딩.
// 4.5rem(72px)은 BottomNav 실제 높이(≈67px)를 안전하게 초과하도록 선택.
export const BOTTOM_NAV_CONTENT_SPACER =
	"pb-[calc(4.5rem+env(safe-area-inset-bottom))]";

// 고정 탭바 위에 다른 고정 요소(운영자 액션바·토스트)를 띄울 때의 bottom 오프셋.
export const BOTTOM_NAV_STACK_OFFSET =
	"bottom-[calc(4.5rem+env(safe-area-inset-bottom))]";

export function BottomNavShell({ children }: { children: ReactNode }) {
	return (
		<div className="fixed inset-x-0 bottom-0 z-30 border-border border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
			{children}
		</div>
	);
}
```

> 훅·이벤트 핸들러가 없어 `"use client"` 불필요(클라이언트 컴포넌트가 import 해도 안전).

- [ ] **Step 2: 린트 + 타입체크**

Run: `pnpm dlx ultracite fix && pnpm --filter web check-types`
Expected: PASS. 미사용 export 경고가 있어도 이후 태스크에서 소비하므로 무시.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/bambi/bottom-nav-shell.tsx
git commit -F - <<'EOF'
feat: 하단 탭바 공유 셸(BottomNavShell) 추가

- fixed + env(safe-area-inset-bottom) 고정 래퍼
- 콘텐츠 스페이서·스택 오프셋 클래스 상수 export
EOF
```

---

## Task 3: `MobileTabBar` + 공개 마켓 스페이서 배선

구직자 셸과 공개 마켓이 공유하는 `MobileTabBar`를 `BottomNavShell`로 교체하고, 공개 마켓의 기존 `pb-24` 스페이서를 safe-area 인식 스페이서로 바꾼다.

**Files:**
- Modify: `apps/web/src/components/bambi/mobile-tab-bar.tsx:52`
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx:59`

**Interfaces:**
- Consumes: `BottomNavShell`, `BOTTOM_NAV_CONTENT_SPACER` (Task 2).

- [ ] **Step 1: `MobileTabBar` 래퍼를 `BottomNavShell`로 교체**

`mobile-tab-bar.tsx`의 import에 추가(기존 `import { BottomNav } from "./ds";` 아래 등):

```ts
import { BottomNavShell } from "./bottom-nav-shell";
```

그리고 반환부 래퍼(현재 line 52~67)를 교체. 현재:

```tsx
	return (
		<div className="sticky bottom-0 z-30 border-border border-t bg-background md:hidden">
			<BottomNav
				badges={{ chat: 1 }}
```

변경:

```tsx
	return (
		<BottomNavShell>
			<BottomNav
				badges={{ chat: 1 }}
```

그리고 닫는 태그(현재 `</div>`, line 67)를 `</BottomNavShell>`로 변경:

```tsx
				onChange={go}
				value={value}
			/>
		</BottomNavShell>
	);
```

- [ ] **Step 2: 공개 마켓 스페이서 교체**

`public-marketplace.tsx` import에 추가:

```ts
import { BOTTOM_NAV_CONTENT_SPACER } from "../bottom-nav-shell";
```

`cn` 미import 시 추가:

```ts
import { cn } from "@bambi-app/ui/lib/utils";
```

현재 콘텐츠 래퍼(line 59):

```tsx
			<div className="mx-auto flex w-full gap-5 px-5 py-6 pb-24 md:max-w-[80%] md:px-6 md:py-10">
```

변경(`pb-24` 제거, 스페이서 상수 합성 — `md:py-10`이 데스크톱 하단 패딩을 덮으므로 모바일 전용 예약으로 충분):

```tsx
			<div
				className={cn(
					"mx-auto flex w-full gap-5 px-5 py-6 md:max-w-[80%] md:px-6 md:py-10",
					BOTTOM_NAV_CONTENT_SPACER
				)}
			>
```

- [ ] **Step 3: 린트 + 타입체크**

Run: `pnpm dlx ultracite fix && pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/mobile-tab-bar.tsx apps/web/src/components/bambi/screens/public-marketplace.tsx
git commit -F - <<'EOF'
fix: 구직자·공개 마켓 하단 탭바 fixed 고정 전환

- MobileTabBar를 BottomNavShell(fixed+safe-area)로 교체
- 공개 마켓 pb-24를 safe-area 인식 스페이서로 대체
EOF
```

**수동 확인(사용자):** 모바일 크롬/사파리에서 `/seeker`, `/`(공개 마켓) 스크롤 시 주소창 접힘/펼침에도 탭바가 바닥에 고정되고, 마지막 카드가 탭바에 가리지 않는지.

---

## Task 4: `persona-nav`의 `Content` 스페이서 + `NavBar` 교체 (구직자·구인자)

로컬 `NavBar`를 공유 셸로 바꾸고, `Content`에 조건부 스페이서를 넣어 각 셸이 탭 노출 여부를 전달한다.

**Files:**
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (`Content` 20-22, `NavBar` 24-30, `SeekerNav` 43, `EmployerNav` 79-92)

**Interfaces:**
- Consumes: `BottomNavShell`, `BOTTOM_NAV_CONTENT_SPACER` (Task 2).
- Produces: `Content`가 `withBottomNav?: boolean` prop을 받아 탭 노출 시 모바일 하단 스페이서를 적용.

- [ ] **Step 1: import 추가**

`persona-nav.tsx` 상단에 추가:

```ts
import { cn } from "@bambi-app/ui/lib/utils";
import {
	BOTTOM_NAV_CONTENT_SPACER,
	BottomNavShell,
} from "./bottom-nav-shell";
```

- [ ] **Step 2: `Content`에 스페이서 prop 추가**

현재(line 20-22):

```tsx
function Content({ children }: { children: ReactNode }) {
	return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
```

변경:

```tsx
function Content({
	children,
	withBottomNav = false,
}: {
	children: ReactNode;
	withBottomNav?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col",
				withBottomNav && BOTTOM_NAV_CONTENT_SPACER,
				withBottomNav && "md:pb-0"
			)}
		>
			{children}
		</div>
	);
}
```

- [ ] **Step 3: 로컬 `NavBar`를 공유 셸로 위임**

현재(line 24-30):

```tsx
function NavBar({ children }: { children: ReactNode }) {
	return (
		<div className="sticky bottom-0 z-30 border-border border-t bg-background md:hidden">
			{children}
		</div>
	);
}
```

변경(공유 셸 재사용):

```tsx
function NavBar({ children }: { children: ReactNode }) {
	return <BottomNavShell>{children}</BottomNavShell>;
}
```

- [ ] **Step 4: `SeekerNav`가 스페이서를 전달하도록 수정**

현재(line 40-45):

```tsx
	return (
		<>
			<Content>{children}</Content>
			{showNav ? <MobileTabBar homeHref="/seeker" /> : null}
		</>
	);
```

변경:

```tsx
	return (
		<>
			<Content withBottomNav={showNav}>{children}</Content>
			{showNav ? <MobileTabBar homeHref="/seeker" /> : null}
		</>
	);
```

- [ ] **Step 5: `EmployerNav`가 스페이서를 전달하도록 수정**

현재(line 76-79):

```tsx
	return (
		<>
			<Content>{children}</Content>
			{showNav ? (
```

변경:

```tsx
	return (
		<>
			<Content withBottomNav={showNav}>{children}</Content>
			{showNav ? (
```

- [ ] **Step 6: 린트 + 타입체크**

Run: `pnpm dlx ultracite fix && pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/persona-nav.tsx
git commit -F - <<'EOF'
fix: 구직자·구인자 셸 하단 탭바 fixed 고정 전환

- NavBar를 BottomNavShell(fixed+safe-area)로 위임
- Content에 withBottomNav 스페이서 추가로 콘텐츠 가림 방지
EOF
```

**수동 확인(사용자):** 모바일에서 `/employer`(구인 관리) 스크롤 시 탭바 고정 및 콘텐츠 가림 여부.

---

## Task 5: 운영자 콘솔 스택 정리 (`ModeratorShell` 액션바·토스트)

`NavBar`가 `fixed`가 되면, 흐름에 있던 `QueueActionBar`와 `absolute bottom-[84px]`인 `ConsoleToast`가 탭바와 어긋난다. 고정 탭바 위로 정렬한다. 데스크톱(탭바 `md:hidden`)에서는 기존 흐름/오프셋을 유지한다.

**Files:**
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (`ModeratorShell` 130-177)
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx` (`ConsoleToast` 1413-1424)

**Interfaces:**
- Consumes: `Content`(withBottomNav, Task 4), `BOTTOM_NAV_STACK_OFFSET` (Task 2).

- [ ] **Step 1: 상세 뷰가 아닌 운영자 콘솔의 `Content`에 스페이서 적용**

`ModeratorShell` 내 상세 분기(현재 line 130-132)는 그대로 둔다:

```tsx
		if (isDetail) {
			return <Content>{children}</Content>;
		}
```

콘솔 본문 반환부(현재 line 152-177)에서 `Content`와 액션바를 수정한다. 현재:

```tsx
		return (
			<>
				<ConsoleTop
					counts={{
						queue: queue.length,
						reports: openReports,
						warned: warnedUsers,
					}}
					onTab={go}
					tab={tab}
				/>
				<Content>{children}</Content>
				{showActionBar ? (
					<QueueActionBar
						count={selected.length}
						isApplying={isBulkApplying}
						onAction={bulkAction}
						scope={bulkScope}
					/>
				) : null}
				<NavBar>
					<ModTabs setTab={go} tab={tab} />
				</NavBar>
				{toast ? <ConsoleToast message={toast} /> : null}
			</>
		);
```

변경(`Content`에 `withBottomNav`, 액션바를 모바일에서만 고정 탭바 위로 띄움):

```tsx
		return (
			<>
				<ConsoleTop
					counts={{
						queue: queue.length,
						reports: openReports,
						warned: warnedUsers,
					}}
					onTab={go}
					tab={tab}
				/>
				<Content withBottomNav>{children}</Content>
				{showActionBar ? (
					<div className="max-md:fixed max-md:inset-x-0 max-md:z-30 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]">
						<QueueActionBar
							count={selected.length}
							isApplying={isBulkApplying}
							onAction={bulkAction}
							scope={bulkScope}
						/>
					</div>
				) : null}
				<NavBar>
					<ModTabs setTab={go} tab={tab} />
				</NavBar>
				{toast ? <ConsoleToast message={toast} /> : null}
			</>
		);
```

> `max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`는 `BOTTOM_NAV_STACK_OFFSET`(`bottom-[calc(...)]`)의 `max-md:` 변형이다. 상수는 base 변형이라 여기서는 리터럴을 직접 쓴다(데스크톱은 흐름 유지).

- [ ] **Step 2: `ConsoleToast` 오프셋을 고정 탭바에 맞춤**

`moderator.tsx`의 `ConsoleToast`(현재 line 1413-1424). 하드코딩된 `bottom-[84px]`가 iPhone safe-area를 고려하지 않아 노치 기기에서 탭바와 겹칠 수 있다. `BOTTOM_NAV_STACK_OFFSET`로 교체.

import 추가(파일 상단 import 구역):

```ts
import { BOTTOM_NAV_STACK_OFFSET } from "../bottom-nav-shell";
```

`cn` 미import 시 추가:

```ts
import { cn } from "@bambi-app/ui/lib/utils";
```

현재(line 1415):

```tsx
		<div className="pointer-events-none absolute right-0 bottom-[84px] left-0 z-30 flex justify-center px-4">
```

변경:

```tsx
		<div
			className={cn(
				"pointer-events-none absolute right-0 left-0 z-30 flex justify-center px-4",
				BOTTOM_NAV_STACK_OFFSET
			)}
		>
```

> 주의: 이 파일 하단(≈line 1598)에 또 다른 `absolute bottom-[84px]` 프로토타입 스크린이 있으나 `ModeratorShell`이 사용하지 않으므로 범위 밖. 건드리지 않는다.

- [ ] **Step 3: 린트 + 타입체크**

Run: `pnpm dlx ultracite fix && pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/persona-nav.tsx apps/web/src/components/bambi/screens/moderator.tsx
git commit -F - <<'EOF'
fix: 운영자 콘솔 액션바·토스트를 고정 탭바 위로 정렬

- 콘솔 Content에 하단 스페이서 적용
- 선택 액션바를 모바일에서 고정 탭바 위로 배치(데스크톱은 흐름 유지)
- ConsoleToast 오프셋을 safe-area 인식 값으로 교체
EOF
```

**수동 확인(사용자):** 모바일 `/moderator`에서 항목 선택 시 액션바가 탭바 바로 위에 오고, 토스트가 탭바와 겹치지 않는지. 데스크톱 레이아웃 변화 없음.

---

## Task 6: 최종 통합 검증

**Files:** 없음 (검증)

- [ ] **Step 1: 전체 린트 + 타입체크**

Run: `pnpm dlx ultracite fix && pnpm --filter web check-types`
Expected: PASS, diff 없음(이미 fix 반영됨).

- [ ] **Step 2: 잔여 sticky 하단 탭 없음 확인**

Run: `git grep -n "sticky bottom-0" apps/web/src`
Expected: 하단 탭바 관련 매치 없음(다른 sticky UI가 있다면 의도된 것인지 확인).

- [ ] **Step 3: 커밋 로그 래퍼 문자 확인**

Run: `git log --oneline -6` 및 최근 커밋 `git log -1 --format=%B`
Expected: 한국어 `type:` 제목 + 불릿 본문, 스트레이 `@`/따옴표 없음.

**수동 확인(사용자):** 실기기(iOS Safari, Android Chrome)에서 주소창 접힘/펼침 반복, 홈 인디케이터 영역, 키보드 없는 탭 라우트 전반 시각 점검. push/PR은 사용자 지시 후 진행.

---

## Self-Review 결과 (작성자 점검)

- **스펙 커버리지**: 스펙 1(뷰포트 메타)→Task 1, 2(sticky→fixed·공유 래퍼)→Task 2·3·4, 3(콘텐츠 스페이서)→Task 3·4·5, 4(운영자 스택)→Task 5. 전 항목 태스크 존재.
- **플레이스홀더**: 없음. 모든 코드 블록에 실제 클래스/코드 포함.
- **타입 일관성**: `BottomNavShell`/`BOTTOM_NAV_CONTENT_SPACER`/`BOTTOM_NAV_STACK_OFFSET` 이름이 Task 2 정의와 Task 3·4·5 소비에서 일치. `Content`의 `withBottomNav` prop 이름 일관.
- **비고**: 자동 테스트 미작성은 프로젝트 CSS 검증 관례(린트+타입체크+사용자 시각 확인)에 따른 의도적 결정.
