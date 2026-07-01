# 밤비 인증·모바일 UI 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구직자·구인자 "내 정보"에 로그아웃을 추가하고, 비로그인 모바일에서도 하단바를 노출하며, 보호 화면(내 정보·채팅)에 로그인 가드를 걸고, 모바일 필터를 데스크톱과 동등하게 맞춘다.

**Architecture:** 세션은 better-auth `authClient.useSession()`로 판별한다. 라우트 보호는 재사용 클라이언트 래퍼(`RequireAuth`)로 페이지 레벨에서 처리하고, 모바일 하단바는 재사용 컴포넌트(`MobileTabBar`)로 추출해 공개 마켓과 시커 셸이 공유한다. 모바일 필터는 사이드바 본문을 공용 컨트롤(`MarketplaceFilterControls`)로 추출하고 `Sheet` 드로어로 재사용한다. 요구사항 2번(세션 기반 셸 일치)은 보류.

**Tech Stack:** Next.js(App Router, RSC), React, better-auth, TanStack Query, shadcn(base-ui 기반) `@bambi-app/ui`, sonner, Tailwind v4.

## Global Constraints

- 스타일: 인라인 `style` 금지, Tailwind `className`만. `space-x/y-*` 금지 → `flex flex-col gap-*`. 정사각은 `size-*`. 조건부 클래스는 `cn()`. `rounded-none` 금지(반경 토큰 유틸). 오버레이 수동 `z-index` 금지.
- 컴포넌트: 버튼/체크박스/셀렉트/시트/토스트/스켈레톤 등은 `@bambi-app/ui/components`의 shadcn 사용. 단, `components/bambi/screens/*`·`ds.tsx`는 점진 전환 대상이라 기존 `../ds` 프로토타입 컴포넌트 사용을 허용한다(주변 코드와 일관 우선).
- base는 base-ui: 커스텀 트리거는 `asChild`가 아니라 `render` prop. `Sheet` 루트는 `open`/`onOpenChange`로 제어.
- 훅·이벤트 핸들러·브라우저 API 사용 파일은 최상단 `"use client"`.
- 커밋 메시지: 한국어 `type:` 제목 + 필요 시 블릿 본문(빈 줄 구분). 커밋은 워크트리에서 수행.
- **검증 방식(중요):** 이 레포엔 UI 단위테스트 하네스가 없다. 프로젝트 규약상 개발서버·스크린샷은 쓰지 않고 **타입체크(`pnpm --filter web check-types`) + 린트(`pnpm dlx ultracite fix`)** 로 검증하며, 시각 확인은 사용자가 수행한다. 각 태스크의 "테스트" 단계는 이 두 명령으로 대체한다.

---

## File Structure

- 신규
  - `apps/web/src/components/bambi/require-auth.tsx` — 로그인 가드 래퍼(요구사항 4).
  - `apps/web/src/components/bambi/mobile-tab-bar.tsx` — 모바일 하단 탭바(요구사항 3).
- 수정
  - `apps/web/src/components/providers.tsx` — `Toaster` 마운트(전제 A).
  - `apps/web/src/app/seeker/me/page.tsx`, `apps/web/src/app/seeker/chats/page.tsx` — 가드 적용.
  - `apps/web/src/components/bambi/screens/seeker.tsx`(SeekerMe), `screens/employer.tsx`(EmployerMe) — 로그아웃 버튼.
  - `apps/web/src/components/bambi/persona-nav.tsx`(SeekerNav) — 탭바 추출 사용.
  - `apps/web/src/components/bambi/screens/public-marketplace.tsx` — 하단바 + 필터 시트.
  - `apps/web/src/components/bambi/screens/seeker-marketplace.tsx` — 필터 시트.
  - `apps/web/src/components/bambi/marketplace.tsx` — `MarketplaceFilterControls`/`MarketplaceFilterSheet` 추출·신설.

---

## Task 1: Toaster 마운트 (요구사항 4 전제)

**Files:**
- Modify: `apps/web/src/components/providers.tsx`

**Interfaces:**
- Produces: 앱 전역에 sonner `<Toaster />`가 마운트되어 `toast()` 호출이 렌더된다(Task 2에서 소비).

- [ ] **Step 1: `Providers`에 Toaster 추가**

`apps/web/src/components/providers.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { Toaster } from "@bambi-app/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/utils/orpc";

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
	return (
		<QueryClientProvider client={queryClient}>
			{children}
			<Toaster richColors />
		</QueryClientProvider>
	);
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과(에러 0).

- [ ] **Step 3: 린트**

Run: `pnpm dlx ultracite fix`
Expected: 변경 없음 또는 자동 정렬만. 잔여 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/providers.tsx
git commit -m "fix: 전역 Toaster 마운트로 sonner 토스트 렌더 활성화"
```

---

## Task 2: RequireAuth 가드 + 내 정보·채팅 적용 (요구사항 4)

**Files:**
- Create: `apps/web/src/components/bambi/require-auth.tsx`
- Modify: `apps/web/src/app/seeker/me/page.tsx`
- Modify: `apps/web/src/app/seeker/chats/page.tsx`

**Interfaces:**
- Consumes: Task 1의 전역 `Toaster`, `authClient.useSession()`(`@/lib/auth-client`).
- Produces: `RequireAuth({ children }: { children: ReactNode })` — 비로그인 시 토스트 후 `/login`으로 `replace`, 로딩 중 `Skeleton`, 로그인 시 children 렌더.

- [ ] **Step 1: RequireAuth 작성**

`apps/web/src/components/bambi/require-auth.tsx` 신규:

```tsx
"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export function RequireAuth({ children }: { children: ReactNode }) {
	const router = useRouter();
	const session = authClient.useSession();
	const redirected = useRef(false);
	const isSignedIn = Boolean(session.data?.user);

	useEffect(() => {
		if (session.isPending || isSignedIn || redirected.current) {
			return;
		}
		redirected.current = true;
		toast("로그인이 필요해요");
		router.replace("/login");
	}, [session.isPending, isSignedIn, router]);

	if (session.isPending) {
		return (
			<div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-6">
				<Skeleton className="h-24 w-full rounded-2xl" />
			</div>
		);
	}
	if (!isSignedIn) {
		return null;
	}
	return <>{children}</>;
}
```

- [ ] **Step 2: 내 정보 페이지에 적용**

`apps/web/src/app/seeker/me/page.tsx` 전체 교체:

```tsx
import { RequireAuth } from "@/components/bambi/require-auth";
import { SeekerMe } from "@/components/bambi/screens/seeker";

export default function SeekerMePage() {
	return (
		<RequireAuth>
			<SeekerMe />
		</RequireAuth>
	);
}
```

- [ ] **Step 3: 채팅 페이지에 적용**

`apps/web/src/app/seeker/chats/page.tsx` 전체 교체(기존 본문을 `RequireAuth`로 감싼다):

```tsx
"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/bambi/require-auth";
import { SeekerChats } from "@/components/bambi/screens/seeker";
import { SeekerChatListResponsive } from "@/components/bambi/screens/seeker-chat-list-responsive";

export default function SeekerChatsPage() {
	const router = useRouter();
	return (
		<RequireAuth>
			<SeekerChatListResponsive
				onFallback={() => (
					<SeekerChats
						onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
					/>
				)}
				onOpen={(jobId) => router.push(`/seeker/chats/${jobId}` as Route)}
			/>
		</RequireAuth>
	);
}
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과.

- [ ] **Step 5: 린트**

Run: `pnpm dlx ultracite fix`
Expected: 잔여 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/require-auth.tsx apps/web/src/app/seeker/me/page.tsx apps/web/src/app/seeker/chats/page.tsx
git commit -m "feat: 내 정보·채팅에 비로그인 로그인 가드 추가"
```

---

## Task 3: 로그아웃 버튼 — 구직자·구인자 내 정보 (요구사항 1)

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker.tsx` (`SeekerMe`, 562~618)
- Modify: `apps/web/src/components/bambi/screens/employer.tsx` (`EmployerMe`, 447~502)

**Interfaces:**
- Consumes: `authClient.signOut()`(`@/lib/auth-client`), `useRouter`(`next/navigation`), `../ds`의 `Button`(이미 import됨).
- Produces: 각 화면 하단에 로그아웃 버튼. 클릭 시 `signOut` 후 `/`로 이동.

- [ ] **Step 1: seeker.tsx 상단 import 추가**

`apps/web/src/components/bambi/screens/seeker.tsx`의 `import { useEffect, useRef, useState } from "react";`(6행) 아래에 다음 두 줄을 추가:

```tsx
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
```

- [ ] **Step 2: SeekerMe에 로그아웃 핸들러 + 버튼 추가**

`SeekerMe` 함수(562행 `export function SeekerMe() {`)를 아래로 교체:

```tsx
export function SeekerMe() {
	const router = useRouter();
	const rows = [
		{ icon: <ClipboardListIcon />, label: "내 신고 내역", meta: "0건" },
		{ icon: <ClockIcon />, label: "예정된 면접", meta: "1건" },
		{ icon: <LockIcon />, label: "차단한 상대", meta: "0명" },
		{ icon: <SettingsIcon />, label: "계정 설정", meta: "" },
	];
	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/");
		router.refresh();
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col py-5">
			<div className="mx-auto w-full max-w-[860px] px-4 pt-2 pb-1 md:px-6">
				<h1 className="m-0 font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					내 정보
				</h1>
			</div>
			<div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col gap-[18px] overflow-y-auto px-4 py-4 md:px-6">
				<div className="flex items-center gap-[14px] rounded-[18px] border border-primary p-[18px]">
					<Avatar name="김하늘" ring size="lg" />
					<div className="flex-1">
						<div className="font-extrabold text-[18px] text-foreground">
							김하늘
						</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							구직자 · 강남 활동
						</div>
					</div>
					<Badge tone="primary">인증완료</Badge>
				</div>
				<div className="flex flex-col overflow-hidden rounded-2xl border border-border">
					{rows.map((r, i) => (
						<div
							className={cn(
								"flex items-center gap-3 p-4",
								i ? "border-border border-t" : "border-none"
							)}
							key={r.label}
						>
							<span className="inline-flex size-[22px] text-muted-foreground">
								{r.icon}
							</span>
							<span className="flex-1 font-semibold text-[15px] text-foreground">
								{r.label}
							</span>
							{r.meta ? (
								<span className="text-[13px] text-muted-foreground">
									{r.meta}
								</span>
							) : null}
							<span className="inline-flex size-[18px] text-[color:var(--text-subtle)]">
								<ChevronRightIcon />
							</span>
						</div>
					))}
				</div>
				<Button
					className="w-full"
					onClick={handleSignOut}
					variant="secondary"
				>
					로그아웃
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: employer.tsx 상단 import 추가**

`apps/web/src/components/bambi/screens/employer.tsx`의 `import { useState } from "react";`(7행) 아래에 추가:

```tsx
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
```

- [ ] **Step 4: EmployerMe에 로그아웃 핸들러 + 버튼 추가**

`EmployerMe` 함수(447행 `export function EmployerMe() {`)를 아래로 교체:

```tsx
export function EmployerMe() {
	const router = useRouter();
	const rows = [
		{ icon: <ClipboardListIcon />, label: "공고 검수 정책", meta: "" },
		{ icon: <AlertCircle />, label: "받은 경고", meta: "0회" },
		{ icon: <SettingsIcon />, label: "매장 정보", meta: "" },
	];
	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/");
		router.refresh();
	};
	return (
		<div className="mx-auto flex min-h-0 w-full max-w-[min(80%,72rem)] flex-1 flex-col py-5">
			<div className="px-6 pt-2 pb-1">
				<h1 className="font-extrabold text-2xl text-foreground">매장 정보</h1>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-4">
				<div className="flex items-center gap-[14px] rounded-[18px] border border-primary p-[18px]">
					<Avatar name="달밤 라운지" size="lg" square />
					<div className="flex-1">
						<div className="font-extrabold text-[18px] text-foreground">
							달밤 라운지
						</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							구인자 · 강남
						</div>
					</div>
					<Badge dot tone="success">
						정상
					</Badge>
				</div>
				<div className="flex flex-col overflow-hidden rounded-2xl border border-border">
					{rows.map((r, i) => (
						<div
							className={cn(
								"flex items-center gap-3 p-4",
								i ? "border-border border-t" : "border-none"
							)}
							key={r.label}
						>
							<span className="inline-flex size-[22px] text-muted-foreground">
								{r.icon}
							</span>
							<span className="flex-1 font-semibold text-[15px] text-foreground">
								{r.label}
							</span>
							{r.meta ? (
								<span className="text-[13px] text-muted-foreground">
									{r.meta}
								</span>
							) : null}
							<span className="inline-flex size-[18px] text-[color:var(--text-subtle)]">
								<ChevronRightIcon />
							</span>
						</div>
					))}
				</div>
				<Button
					className="w-full"
					onClick={handleSignOut}
					variant="secondary"
				>
					로그아웃
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과. (ds `Button`은 `className`/`onClick`/`variant` prop을 받음 — `marketplace.tsx`에서 동일 패턴 사용 확인됨.)

- [ ] **Step 6: 린트**

Run: `pnpm dlx ultracite fix`
Expected: 잔여 에러 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/screens/seeker.tsx apps/web/src/components/bambi/screens/employer.tsx
git commit -m "feat: 구직자·구인자 내 정보에 로그아웃 버튼 추가"
```

---

## Task 4: 모바일 하단바 추출 + 공개 마켓 노출 (요구사항 3)

**Files:**
- Create: `apps/web/src/components/bambi/mobile-tab-bar.tsx`
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (`SeekerNav`, import 정리)
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx`

**Interfaces:**
- Consumes: `../ds`의 `BottomNav`, `./icons`의 `Message`/`Search2`/`UserIcon`.
- Produces: `MobileTabBar({ homeHref }: { homeHref: string })` — 탐색/채팅/내 정보 하단 탭바. 활성 탭은 pathname 기준, 탐색은 `homeHref`로 이동.

- [ ] **Step 1: MobileTabBar 작성**

`apps/web/src/components/bambi/mobile-tab-bar.tsx` 신규:

```tsx
"use client";

// 밤비 — 모바일 하단 탭바(탐색·채팅·내 정보). 공개 마켓과 구직자 셸이 공유한다.

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "./ds";
import { Message, Search2, UserIcon } from "./icons";

export function MobileTabBar({ homeHref }: { homeHref: string }) {
	const path = usePathname();
	const router = useRouter();
	let value = "home";
	if (path === "/seeker/me") {
		value = "me";
	} else if (path === "/seeker/chats") {
		value = "chat";
	}
	const go = (v: string) => {
		if (v === "chat") {
			router.push("/seeker/chats");
		} else if (v === "me") {
			router.push("/seeker/me");
		} else {
			router.push(homeHref as Route);
		}
	};
	return (
		<div className="sticky bottom-0 z-30 border-border border-t bg-background md:hidden">
			<BottomNav
				badges={{ chat: 1 }}
				items={[
					{ value: "home", label: "탐색", icon: Search2 },
					{ value: "chat", label: "채팅", icon: Message },
					{ value: "me", label: "내 정보", icon: UserIcon },
				]}
				onChange={go}
				value={value}
			/>
		</div>
	);
}
```

- [ ] **Step 2: SeekerNav를 MobileTabBar 사용으로 교체**

`apps/web/src/components/bambi/persona-nav.tsx`의 `SeekerNav`(39~78행)를 아래로 교체:

```tsx
export function SeekerNav({ children }: { children: ReactNode }) {
	const path = usePathname();
	const showNav =
		path === "/seeker" || path === "/seeker/chats" || path === "/seeker/me";
	return (
		<>
			<Content>{children}</Content>
			{showNav ? <MobileTabBar homeHref="/seeker" /> : null}
		</>
	);
}
```

- [ ] **Step 3: persona-nav.tsx import 정리**

교체 후 `SeekerNav`가 더 이상 쓰지 않는 심볼을 정리한다:
- `./mobile-tab-bar`의 `MobileTabBar`를 import에 추가.
- `./icons` import에서 `Message`, `Search2`를 제거(이제 이 파일에서 미사용 — `UserIcon`은 `EmployerNav`가 계속 사용하므로 유지).
- `BottomNav`(`./ds`)는 `EmployerNav`가 계속 사용하므로 유지. `useRouter`는 `EmployerNav`/`ModeratorShell`이 사용하므로 유지. `NavBar`는 `ModeratorShell`이 사용하므로 유지.

수정 후 import 블록 예시(9~24행 영역):

```tsx
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { BottomNav } from "./ds";
import {
	ClipboardListIcon,
	PlusIcon,
	SettingsIcon,
	UserIcon,
} from "./icons";
import { MobileTabBar } from "./mobile-tab-bar";
import {
	ConsoleToast,
	ConsoleTop,
	ModTabs,
	QueueActionBar,
} from "./screens/moderator";
import { useMod } from "./screens/moderator-context";
```

> 참고: `ultracite fix`가 남은 미사용 심볼을 잡아주지만, Biome은 미사용 import를 에러로 표시하므로 위와 같이 수동으로 맞춰 둔다.

- [ ] **Step 4: 공개 마켓에 하단바 렌더**

`apps/web/src/components/bambi/screens/public-marketplace.tsx` 수정:

(a) import 추가(21행 `import { ResponsiveAppShell } from "../responsive-shell";` 부근):

```tsx
import { MobileTabBar } from "../mobile-tab-bar";
```

(b) 콘텐츠 컨테이너 하단 여백을 모바일 하단바 높이만큼 확보 — 50행의
`<div className="mx-auto flex w-full gap-5 px-5 py-6 pb-16 md:max-w-[80%] md:px-6 md:py-10">`
에서 `pb-16`을 `pb-24`로 변경.

(c) `</ResponsiveAppShell>` 직전(즉 콘텐츠 `</div>` 다음, 91행 부근)에 하단바를 추가:

```tsx
			<MobileTabBar homeHref="/" />
		</ResponsiveAppShell>
```

교체 대상 맥락(48~92행)의 최종 형태:

```tsx
	return (
		<ResponsiveAppShell headerSlot={headerSearch} variant="public">
			<div className="mx-auto flex w-full gap-5 px-5 py-6 pb-24 md:max-w-[80%] md:px-6 md:py-10">
				<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
				<section className="min-w-0 flex-1">
					{/* ...기존 내용 유지... */}
				</section>
			</div>
			<MobileTabBar homeHref="/" />
		</ResponsiveAppShell>
	);
```

> 주의: `section` 내부(53~89행)는 기존 코드를 그대로 둔다. 위 스니펫은 감싸는 구조만 보여준다.

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과.

- [ ] **Step 6: 린트**

Run: `pnpm dlx ultracite fix`
Expected: 미사용 import 없음, 잔여 에러 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/mobile-tab-bar.tsx apps/web/src/components/bambi/persona-nav.tsx apps/web/src/components/bambi/screens/public-marketplace.tsx
git commit -m "feat: 모바일 하단바를 재사용 컴포넌트로 추출하고 공개 마켓에 노출"
```

---

## Task 5: 모바일 필터 패리티 (새 요구사항 E)

**Files:**
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`

**Interfaces:**
- Consumes: `@bambi-app/ui/components/sheet`의 `Sheet`/`SheetContent`/`SheetTitle`(base-ui 제어형: `open`/`onOpenChange`), 기존 `MarketplaceFilters`/`FilterChange`.
- Produces:
  - `MarketplaceFilterControls({ filters, onChange }: { filters: MarketplaceFilters; onChange: FilterChange })` — 지역·업종·세부업종·최소시급·체크박스 3종.
  - `MarketplaceFilterSheet({ filters, onChange, open, onOpenChange }: { filters: MarketplaceFilters; onChange: FilterChange; open: boolean; onOpenChange: (open: boolean) => void })`.

- [ ] **Step 1: marketplace.tsx에 Sheet import 추가**

`apps/web/src/components/bambi/marketplace.tsx` 상단 import에 추가(체크박스 import 부근):

```tsx
import {
	Sheet,
	SheetContent,
	SheetTitle,
} from "@bambi-app/ui/components/sheet";
```

- [ ] **Step 2: MarketplaceFilterControls 추출**

`MarketplaceFilterSidebar`(47~193행)를 아래로 교체한다. 필터 컨트롤 본문을 `MarketplaceFilterControls`로 분리하고, 사이드바는 이를 감싼다:

```tsx
export function MarketplaceFilterControls({
	filters,
	onChange,
}: MarketplaceFilterSidebarProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	const subcategoryOptions = subcategoriesForCategory(filters.category);
	const subcategoryDisabled = subcategoryOptions.length <= 1;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">지역</span>
				<Select
					onValueChange={(value) => {
						if (value) {
							update({ region: value });
						}
					}}
					value={filters.region}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue>{(value) => value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{MARKETPLACE_REGIONS.map((region) => (
							<SelectItem key={region} value={region}>
								{region}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">업종</span>
				<Select
					onValueChange={(value) => {
						if (value) {
							update({ category: value, subcategory: ALL_OPTION });
						}
					}}
					value={filters.category}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue>{(value) => value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{MARKETPLACE_CATEGORIES.map((category) => (
							<SelectItem key={category} value={category}>
								{category}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">
					세부 업종
				</span>
				<Select
					disabled={subcategoryDisabled}
					onValueChange={(value) => {
						if (value) {
							update({ subcategory: value });
						}
					}}
					value={filters.subcategory}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue>{(value) => value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{subcategoryOptions.map((subcategory) => (
							<SelectItem key={subcategory} value={subcategory}>
								{subcategory}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">
					최소 시급
				</span>
				<Input
					defaultValue={String(filters.minimumPay || "")}
					onChange={(event) =>
						update({ minimumPay: Number(event.target.value || 0) })
					}
					placeholder="예: 17000"
					type="number"
				/>
			</div>
			<label
				className="flex items-center gap-2 font-bold text-sm"
				htmlFor="filter-only-verified"
			>
				<Checkbox
					checked={filters.onlyVerified}
					id="filter-only-verified"
					onCheckedChange={(checked) => update({ onlyVerified: checked })}
				/>
				검증 완료만 보기
			</label>
			<label
				className="flex items-center gap-2 font-bold text-sm"
				htmlFor="filter-only-today"
			>
				<Checkbox
					checked={filters.onlyToday}
					id="filter-only-today"
					onCheckedChange={(checked) => update({ onlyToday: checked })}
				/>
				오늘 면접 가능만 보기
			</label>
			<label
				className="flex items-center gap-2 font-bold text-sm"
				htmlFor="filter-only-beginner"
			>
				<Checkbox
					checked={filters.onlyBeginnerFriendly}
					id="filter-only-beginner"
					onCheckedChange={(checked) =>
						update({ onlyBeginnerFriendly: checked })
					}
				/>
				초보 가능만 보기
			</label>
		</div>
	);
}

export function MarketplaceFilterSidebar({
	filters,
	onChange,
}: MarketplaceFilterSidebarProps) {
	return (
		<aside className="hidden w-[236px] shrink-0 lg:block">
			<div className="sticky top-20 flex flex-col gap-4">
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="mb-4 flex items-center gap-2">
						<span className="inline-flex size-5 text-coral-600">
							<Search2 />
						</span>
						<h2 className="m-0 font-extrabold text-base">빠른 탐색</h2>
					</div>
					<MarketplaceFilterControls filters={filters} onChange={onChange} />
				</Card>
			</div>
		</aside>
	);
}
```

- [ ] **Step 3: MarketplaceFilterSheet 신설**

`marketplace.tsx`에서 `MarketplaceFilterSidebar` 정의 바로 아래에 추가:

```tsx
interface MarketplaceFilterSheetProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function MarketplaceFilterSheet({
	filters,
	onChange,
	onOpenChange,
	open,
}: MarketplaceFilterSheetProps) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent>
				<SheetTitle className="mb-4">빠른 탐색</SheetTitle>
				<MarketplaceFilterControls filters={filters} onChange={onChange} />
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 4: 공개 마켓에 필터 시트 연결**

`apps/web/src/components/bambi/screens/public-marketplace.tsx` 수정:

(a) 필터 컴포넌트 import에 `MarketplaceFilterSheet` 추가(16~20행 `from "../marketplace"` 블록):

```tsx
import {
	MarketplaceFilterSheet,
	MarketplaceFilterSidebar,
	MarketplaceRegionChips,
	MarketplaceSearch,
} from "../marketplace";
```

(b) 컴포넌트 함수 본문 상단(25행 `const router = useRouter();` 아래)에 시트 open 상태 추가:

```tsx
	const [filtersOpen, setFiltersOpen] = useState(false);
```

(c) `MarketplaceSearch`(54~58행)에 `onOpenFilters` 연결:

```tsx
						<MarketplaceSearch
							filters={filters}
							onChange={setFilters}
							onOpenFilters={() => setFiltersOpen(true)}
							searchFieldClassName="md:hidden"
						/>
```

(d) `MobileTabBar`(Task 4에서 추가) 앞 또는 `</ResponsiveAppShell>` 직전에 시트 렌더:

```tsx
			<MarketplaceFilterSheet
				filters={filters}
				onChange={setFilters}
				onOpenChange={setFiltersOpen}
				open={filtersOpen}
			/>
			<MobileTabBar homeHref="/" />
		</ResponsiveAppShell>
```

- [ ] **Step 5: 시커 마켓에 필터 시트 연결**

`apps/web/src/components/bambi/screens/seeker-marketplace.tsx` 수정:

(a) import에 `MarketplaceFilterSheet` 추가(12~16행 블록):

```tsx
import {
	MarketplaceAxisChips,
	MarketplaceFilterSheet,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
} from "../marketplace";
```

(b) 함수 본문 상단(32행 `const [discoveryTabId, ...]` 부근)에 상태 추가:

```tsx
	const [filtersOpen, setFiltersOpen] = useState(false);
```

(c) `MarketplaceSearch`(76~80행)에 `onOpenFilters` 연결:

```tsx
					<MarketplaceSearch
						filters={filters}
						onChange={setFilters}
						onOpenFilters={() => setFiltersOpen(true)}
						searchFieldClassName="md:hidden"
					/>
```

(d) 최상위 컨테이너(54행 `<div className="mx-auto flex ...">`)의 닫는 `</div>`(121행) 직전에 시트 렌더:

```tsx
			<MarketplaceFilterSheet
				filters={filters}
				onChange={setFilters}
				onOpenChange={setFiltersOpen}
				open={filtersOpen}
			/>
		</div>
	);
```

- [ ] **Step 6: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과. (`useState`는 두 화면 모두 이미 import됨.)

- [ ] **Step 7: 린트**

Run: `pnpm dlx ultracite fix`
Expected: 잔여 에러 0.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/components/bambi/marketplace.tsx apps/web/src/components/bambi/screens/public-marketplace.tsx apps/web/src/components/bambi/screens/seeker-marketplace.tsx
git commit -m "feat: 모바일 필터 시트 추가로 데스크톱 사이드바와 필터 패리티 확보"
```

---

## Task 6: 공개 마켓 discovery 탭 파리티 (새 요구사항)

**배경:** 데스크톱 로그인 상태 채용정보(`/seeker`)에는 전체·지역별·업종별 discovery 탭이 있으나, 비로그인 채용정보(공개 마켓 `/`)에는 지역 칩만 있고 탭이 없다. 비로그인도 로그인과 동일한 탭/축 칩을 갖도록 discovery 로직을 공용화해 양쪽에 적용한다. **이 태스크는 Task 5 완료 이후 실행**하며, Task 5가 두 화면에 추가한 `filtersOpen` 상태·`MarketplaceFilterSheet`는 그대로 보존한다.

**Files:**
- Modify: `apps/web/src/components/bambi/marketplace.tsx` (공용 discovery 추출)
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx` (공용 컴포넌트 사용으로 리팩터)
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx` (discovery 탭 도입)

**Interfaces:**
- Consumes: `applyDiscoveryAxis`/`discoveryAxisForTab`(`@/lib/bambi/marketplace`), 기존 `MarketplaceAxisChips`.
- Produces:
  - `MARKETPLACE_DISCOVERY_TABS`, `MarketplaceDiscoveryTabId` 타입.
  - `useMarketplaceDiscovery(filters, onChange)` → `{ discoveryTabId, selectDiscoveryTab }`.
  - `MarketplaceDiscoveryTabs({ onSelect, value })`, `MarketplaceDiscoveryAxisChips({ discoveryTabId, filters, onChange })`.

- [ ] **Step 1: marketplace.tsx에 react/lib import 추가**

`apps/web/src/components/bambi/marketplace.tsx` 상단 import 보강:
- `import { useState } from "react";` 추가.
- `@/lib/bambi/marketplace` import에 `applyDiscoveryAxis`, `discoveryAxisForTab` 추가(기존 `ALL_OPTION` 등과 같은 블록).

- [ ] **Step 2: 공용 discovery 컴포넌트/훅 추가**

`marketplace.tsx`의 `MarketplaceAxisChips`/`MarketplaceRegionChips` 정의 아래(즉 `MarketplaceAxisChips`가 정의된 이후 어느 위치)에 추가:

```tsx
export const MARKETPLACE_DISCOVERY_TABS = [
	{ disabled: false, id: "all", label: "전체" },
	{ disabled: false, id: "region", label: "지역별" },
	{ disabled: false, id: "category", label: "업종별" },
	{ disabled: true, id: "map", label: "지도" },
	{ disabled: true, id: "recent", label: "오늘 본 공고" },
] as const;

export type MarketplaceDiscoveryTabId =
	(typeof MARKETPLACE_DISCOVERY_TABS)[number]["id"];

export function useMarketplaceDiscovery(
	filters: MarketplaceFilters,
	onChange: FilterChange
) {
	const [discoveryTabId, setDiscoveryTabId] =
		useState<MarketplaceDiscoveryTabId>("all");
	const selectDiscoveryTab = (tabId: MarketplaceDiscoveryTabId) => {
		setDiscoveryTabId(tabId);
		onChange(applyDiscoveryAxis(filters, discoveryAxisForTab(tabId)));
	};
	return { discoveryTabId, selectDiscoveryTab };
}

export function MarketplaceDiscoveryTabs({
	onSelect,
	value,
}: {
	onSelect: (tabId: MarketplaceDiscoveryTabId) => void;
	value: MarketplaceDiscoveryTabId;
}) {
	return (
		<div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
			{MARKETPLACE_DISCOVERY_TABS.map((tab) => (
				<button
					aria-pressed={value === tab.id}
					className={cn(
						"h-9 shrink-0 rounded-lg px-3 font-bold text-sm disabled:opacity-50",
						value === tab.id
							? "bg-foreground text-background"
							: "border border-border bg-card text-muted-foreground"
					)}
					disabled={tab.disabled}
					key={tab.id}
					onClick={() => onSelect(tab.id)}
					type="button"
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

export function MarketplaceDiscoveryAxisChips({
	discoveryTabId,
	filters,
	onChange,
}: {
	discoveryTabId: MarketplaceDiscoveryTabId;
	filters: MarketplaceFilters;
	onChange: FilterChange;
}) {
	if (discoveryTabId === "region") {
		return (
			<MarketplaceAxisChips
				axis="region"
				filters={filters}
				onChange={onChange}
			/>
		);
	}
	if (discoveryTabId === "category") {
		return (
			<MarketplaceAxisChips
				axis="category"
				filters={filters}
				onChange={onChange}
			/>
		);
	}
	return null;
}
```

- [ ] **Step 3: seeker-marketplace.tsx를 공용 컴포넌트 사용으로 리팩터(동작 동일)**

`apps/web/src/components/bambi/screens/seeker-marketplace.tsx` 수정(기능 변화 없음, 중복 제거):

(a) import 정리:
- `@/lib/bambi/marketplace` import에서 `applyDiscoveryAxis`, `discoveryAxisForTab` 제거.
- `../marketplace` import에서 `MarketplaceAxisChips` 제거, `MarketplaceDiscoveryAxisChips`·`MarketplaceDiscoveryTabs`·`useMarketplaceDiscovery` 추가.(Task 5에서 추가된 `MarketplaceFilterSheet`, 기존 `MarketplaceFilterSidebar`·`MarketplaceSearch`는 유지.)

(b) 파일 상단의 로컬 `discoveryTabs` 상수와 `DiscoveryTabId` 타입 정의(20~28행 부근) 제거.

(c) 컴포넌트 본문에서 로컬 상태·핸들러를 훅으로 교체:
- `const [discoveryTabId, setDiscoveryTabId] = useState<DiscoveryTabId>("all");` 제거.
- `selectDiscoveryTab` 함수 정의 제거.
- 대신 추가: `const { discoveryTabId, selectDiscoveryTab } = useMarketplaceDiscovery(filters, setFilters);`
  (`filters`/`setFilters`는 기존 `useSeekerFilters()`에서 가져온 값. `useState`는 Task 5의 `filtersOpen`에서 계속 쓰이므로 import 유지.)

(d) 탭 버튼 블록 교체 — 기존:

```tsx
						<div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
							{discoveryTabs.map((tab) => (
								<button ...>
									{tab.label}
								</button>
							))}
						</div>
```

를 다음으로:

```tsx
						<MarketplaceDiscoveryTabs
							onSelect={selectDiscoveryTab}
							value={discoveryTabId}
						/>
```

(e) 조건부 축 칩 블록 교체 — 기존 두 블록:

```tsx
						{discoveryTabId === "region" ? (
							<MarketplaceAxisChips axis="region" filters={filters} onChange={setFilters} />
						) : null}
						{discoveryTabId === "category" ? (
							<MarketplaceAxisChips axis="category" filters={filters} onChange={setFilters} />
						) : null}
```

를 다음 한 줄로:

```tsx
						<MarketplaceDiscoveryAxisChips
							discoveryTabId={discoveryTabId}
							filters={filters}
							onChange={setFilters}
						/>
```

- [ ] **Step 4: public-marketplace.tsx에 discovery 탭 도입**

`apps/web/src/components/bambi/screens/public-marketplace.tsx` 수정:

(a) `../marketplace` import 정리: `MarketplaceRegionChips` 제거, `MarketplaceDiscoveryAxisChips`·`MarketplaceDiscoveryTabs`·`useMarketplaceDiscovery` 추가.(Task 5에서 추가된 `MarketplaceFilterSheet`, 기존 `MarketplaceFilterSidebar`·`MarketplaceSearch` 유지.)

(b) 컴포넌트 본문 상단(Task 5의 `const [filtersOpen, setFiltersOpen] = useState(false);` 부근)에 훅 추가:

```tsx
	const { discoveryTabId, selectDiscoveryTab } = useMarketplaceDiscovery(
		filters,
		setFilters
	);
```

(c) `<div className="mb-4 flex flex-col gap-3">` 블록에서 `MarketplaceSearch` 앞에 탭을 추가하고, 기존 `<MarketplaceRegionChips .../>`를 discovery 축 칩으로 교체. 최종 형태:

```tsx
					<div className="mb-4 flex flex-col gap-3">
						<MarketplaceDiscoveryTabs
							onSelect={selectDiscoveryTab}
							value={discoveryTabId}
						/>
						<MarketplaceSearch
							filters={filters}
							onChange={setFilters}
							onOpenFilters={() => setFiltersOpen(true)}
							searchFieldClassName="md:hidden"
						/>
						<MarketplaceDiscoveryAxisChips
							discoveryTabId={discoveryTabId}
							filters={filters}
							onChange={setFilters}
						/>
					</div>
```

> 주의: `MarketplaceSearch`의 `onOpenFilters`는 Task 5에서 이미 연결됨 — 위 스니펫은 그 상태를 유지한다. `section` 내부의 다른 요소(에러 알림·헤더·`VisualJobExposureSections`)는 그대로 둔다.

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과.

- [ ] **Step 6: 린트**

Run: `pnpm dlx ultracite fix`
Expected: 미사용 import 없음(예: seeker-marketplace의 `MarketplaceAxisChips`, public-marketplace의 `MarketplaceRegionChips`), 잔여 에러 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/marketplace.tsx apps/web/src/components/bambi/screens/seeker-marketplace.tsx apps/web/src/components/bambi/screens/public-marketplace.tsx
git commit -m "feat: 공개 마켓 채용정보에 전체·지역별·업종별 discovery 탭 파리티 추가"
```

---

## 최종 검증 (전 태스크 완료 후)

- [ ] **전체 타입체크**: `pnpm --filter web check-types` → 통과.
- [ ] **전체 린트**: `pnpm dlx ultracite fix` 후 `pnpm check` → 에러 0.
- [ ] **시각 확인 요청**: 사용자에게 아래 시나리오 확인을 요청(개발서버는 사용자가 구동):
  - 내 정보(구직자/구인자) 하단 로그아웃 → 클릭 시 `/`로 이동, 세션 해제.
  - 모바일 폭에서 비로그인으로 `/` 접속 → 하단바(탐색·채팅·내 정보) 노출.
  - 비로그인 상태로 `/seeker/me`·`/seeker/chats` 진입 → "로그인이 필요해요" 토스트 후 `/login`.
  - 모바일 폭에서 "필터" 버튼 → 시트 열림, 데스크톱 사이드바와 동일 항목.

---

## Self-Review 기록

- **Spec 커버리지**: A(Toaster)=Task1, [1]로그아웃=Task3, [3]하단바=Task4, [4]가드=Task2, [E]필터=Task5. 보류 [2]는 계획 제외(스펙과 일치).
- **Placeholder 스캔**: 코드 스텝은 모두 실제 코드 포함. "기존 내용 유지" 표기는 대규모 미변경 블록을 감싸는 구조만 보일 때 사용(해당 원본은 현재 파일에 존재).
- **타입/이름 일관성**: `MobileTabBar({ homeHref })`, `RequireAuth({ children })`, `MarketplaceFilterControls`/`MarketplaceFilterSheet({ filters, onChange, open, onOpenChange })`, `handleSignOut` — 태스크 간 시그니처 일치. `authClient.signOut()`/`useSession()`·sonner `toast()`·base-ui Sheet `open`/`onOpenChange` 사용 일관.
