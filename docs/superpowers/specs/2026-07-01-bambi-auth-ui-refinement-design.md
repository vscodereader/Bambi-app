# 밤비 인증·모바일 UI 개선 설계

작성일: 2026-07-01
브랜치 기준: `feat/bambi-ui-refinement`
대상 앱: `apps/web`

## 배경

밤비 web UI에서 로그인/비로그인 상태와 모바일 내비게이션·필터 관련 결함이 보고되었다.
better-auth(`authClient.useSession()`)로 세션을 판별하지만, 헤더/셸의 로그인 UI 분기는
**세션이 아니라 라우트별로 하드코딩**되어 있고, 라우트 보호가 컴포넌트 레벨에 없다.

## 범위

이번 스펙은 다음 4가지를 다룬다. **요구사항 2번(로그인 상태에서 로고/헤더 클릭 시
로그인 UI 불일치)은 세션 기반 셸 리팩터가 필요해 이번 범위에서 보류한다.**

- **[1] 로그아웃 버튼** — 구직자·구인자 "내 정보" 하단에 로그아웃 추가
- **[3] 모바일 하단바 노출** — 비로그인 모바일에서도 하단바(탐색·채팅·내 정보) 표시
- **[4] 보호 화면 가드** — 비로그인 상태에서 "내 정보"·"채팅" 진입 시 로그인 가드
- **[E] 모바일 필터 패리티** — 모바일 필터를 데스크톱 사이드바와 동등하게

## 결정 사항 (사용자 확인 완료)

- 로그아웃 후 이동: **`/`(공개 마켓)**
- 로그아웃 버튼 위치: **구직자(SeekerMe) + 구인자(EmployerMe) 둘 다**
- 가드 동작: **토스트 안내 후 `/login` 리다이렉트**
- 가드 대상 탭: **내 정보 + 채팅 둘 다** (탐색은 공개 유지)
- 모바일 필터: **데스크톱 사이드바 전 항목을 시트로 동등하게**

## 현재 구조 요약 (근거)

- 인증: `apps/web/src/lib/auth-client.ts` — `authClient.useSession()` →
  `Boolean(session.data?.user)`로 로그인 판별. `authClient.signOut()` 사용 가능.
- 셸: `apps/web/src/components/bambi/responsive-shell.tsx` — `variant` prop이
  라우트별로 로그인/공개 UI를 하드코딩. `/`는 항상 공개(로그아웃) UI.
- 하단바: `apps/web/src/components/bambi/persona-nav.tsx`의 `SeekerNav` — `/seeker`,
  `/seeker/chats`, `/seeker/me`에서만 표시. 세션 체크 없음. 공개 마켓 `/`엔 하단바 없음.
- 내 정보: `screens/seeker.tsx`의 `SeekerMe`(562~618), `screens/employer.tsx`의
  `EmployerMe`(447~502). 둘 다 세션 확인 없이 가짜 데이터 렌더, 로그아웃 버튼 없음.
- 공개 마켓: `app/page.tsx` → `screens/public-marketplace.tsx` →
  `ResponsiveAppShell variant="public"` (하단바 미포함).
- 필터: `components/bambi/marketplace.tsx`
  - `MarketplaceFilterSidebar`(47~193): 데스크톱 전용(`hidden lg:block`). 지역·업종·
    세부업종 Select, 최소 시급 Input, 검증/오늘/초보 Checkbox 3종.
  - `MarketplaceSearch`(202~265): 모바일 "필터" 버튼(`lg:hidden`)에 `onOpenFilters`
    콜백이 있으나 **호출부(공개/시커 마켓)에서 연결하지 않아 버튼이 무동작**.
  - `PublicMarketplaceScreen`·`SeekerMarketplaceScreen` 모두 `onOpenFilters` 미전달.
- 토스트: `sonner`의 `toast()`는 일부 employer 페이지에서 사용되나, 실제
  `components/providers.tsx`에 `<Toaster />`가 **마운트되어 있지 않음**(`src_temp`에만 존재).
- 셸/오버레이: `packages/ui/src/components/sheet.tsx` 존재(모바일 필터 시트에 사용).

## 상세 설계

### A. 사전작업 — Toaster 마운트 (요구사항 4 전제)

- `apps/web/src/components/providers.tsx`의 `Providers`에 `<Toaster richColors />`
  (`@bambi-app/ui/components/sonner`) 추가.
- 효과: 요구사항 4의 안내 토스트가 실제로 렌더되고, 기존 employer 페이지 toast도 살아남.

### B. 요구사항 1 — 로그아웃 버튼

- 대상: `SeekerMe`(`screens/seeker.tsx`), `EmployerMe`(`screens/employer.tsx`).
- 각 컴포넌트에 로그아웃 핸들러 추가:
  - `authClient.signOut()` 호출 → 성공 시 `router.push("/")`.
  - react-query 캐시 무효화(`queryClient.clear()` 또는 관련 쿼리 invalidate)로 세션 잔상 제거.
- UI: 메뉴 리스트 **하단**에 shadcn `Button`(`@bambi-app/ui/components/button`,
  `variant="outline"`, 풀폭). 아이콘은 lucide 사용 가능(선택).
- 두 파일은 이벤트 핸들러/`useRouter`를 쓰므로 `"use client"` 필요(현재 screens 파일들이
  이미 클라이언트 전제인지 확인해 없으면 추가).

### C. 요구사항 3 — 비로그인 모바일 하단바 노출

- `persona-nav.tsx`의 SeekerNav 내부 모바일 탭바(탐색·채팅·내 정보 `BottomNav` +
  `NavBar`)를 재사용 컴포넌트로 추출: `MobileTabBar`.
  - props: `homeHref`(탐색 탭 목적지). 활성 탭은 `usePathname()`으로 계산.
  - 탭 목적지: 탐색 → `homeHref`, 채팅 → `/seeker/chats`, 내 정보 → `/seeker/me`.
  - `SeekerNav`는 `homeHref="/seeker"`로 이 컴포넌트를 사용(기존 동작 동일).
- `PublicMarketplaceScreen`에 `MobileTabBar`(`homeHref="/"`)를 렌더해 `/` 모바일에서
  하단바 노출. `ResponsiveAppShell`의 `<main>` 내부(콘텐츠 다음 형제)에 배치해
  `sticky bottom-0 md:hidden` 동작을 시커와 동일하게 맞춘다.
- 콘텐츠 하단 패딩을 하단바 높이만큼 확보(공개 마켓 컨테이너 `pb-*` 조정).
- 참고: 채팅/내 정보 탭은 D의 가드가 비로그인 진입을 처리하므로 하단바는 단순 네비게이션만
  담당한다(하단바 자체에 세션 분기를 넣지 않는다).

### D. 요구사항 4 — 내 정보·채팅 로그인 가드

- 재사용 클라이언트 래퍼 `RequireAuth` 신설(위치: `components/bambi/require-auth.tsx`).
  - `authClient.useSession()` 사용.
  - `isPending` → 로딩 자리표시(`Skeleton`) 또는 `null`.
  - 유저 없음 → `toast("로그인이 필요해요")` 후 `router.replace("/login")`, 렌더는 `null`.
  - 유저 있음 → `children` 렌더.
  - 리다이렉트 중복 실행 방지(effect 가드 + 이미 리다이렉트했는지 ref/state 체크).
- 적용:
  - `app/seeker/me/page.tsx` → `<RequireAuth><SeekerMe /></RequireAuth>`.
  - `app/seeker/chats/page.tsx` → 기존 클라이언트 페이지 본문을 `RequireAuth`로 감쌈.
- 효과: 하단바·헤더·직접 URL 등 모든 진입점에서 비로그인 접근을 일관되게 차단.
- 범위 밖: 구인자(`/employer/*`) 가드는 이번 스펙 대상 아님(추후 동일 패턴으로 확장 가능).

### E. 새 요구사항 — 모바일 필터 패리티

- `marketplace.tsx`의 `MarketplaceFilterSidebar` 본문(필터 컨트롤 묶음)을 공용 컴포넌트
  `MarketplaceFilterControls`로 추출.
  - props: `filters`, `onChange`(기존 sidebar와 동일 시그니처).
  - 데스크톱 `MarketplaceFilterSidebar`는 이 컨트롤을 `aside`(`hidden lg:block`)로 감쌈.
- 모바일 필터 `Sheet` 신설(예: `MarketplaceFilterSheet`, `sheet.tsx` 사용).
  - `MarketplaceFilterControls`를 시트 본문으로 렌더.
  - open 상태는 호출 화면에서 관리하거나 시트 컴포넌트가 트리거+상태를 캡슐화.
- `MarketplaceSearch`의 "필터" 버튼(`onOpenFilters`)을 시트 열기에 연결.
- 적용 화면: `PublicMarketplaceScreen`, `SeekerMarketplaceScreen` 양쪽.
  - 각 화면에서 시트 open 상태를 두고 `MarketplaceSearch onOpenFilters`로 토글.
- 동작 패리티: 지역·업종·세부업종·최소 시급·검증/오늘/초보 체크박스 전부 시트에 포함.
  기존 모바일 퀵필터 태그/축 칩은 유지(중복 UX 확인해 필요 시 정리).

## 스타일·규약 준수

- `apps/web/CLAUDE.md`: 인라인 style 금지, shadcn 컴포넌트 우선, 시맨틱/브랜드 토큰,
  `gap-*` 스택, `size-*`, `cn()`, `rounded-none` 금지(반경 토큰), 오버레이 수동 z-index 금지.
- 콜아웃/토스트/시트/버튼/체크박스/셀렉트는 `@bambi-app/ui/components`의 shadcn 사용.
- base는 base-ui: 커스텀 트리거는 `asChild`가 아니라 `render` prop.

## 검증

프로젝트 메모리 규약에 따라 개발서버·스크린샷 없이 검증한다.

- `pnpm dlx ultracite fix`(Biome 정렬·린트) 후 잔여 경고 확인.
- 타입체크(레포 표준 명령) 통과.
- 시각 확인은 사용자가 수행.
- 커밋 전제: `pnpm install`(worktree), 줄바꿈 LF, 한국어 `type:` 커밋 컨벤션.

## 영향 파일 (예상)

- 신규: `components/bambi/require-auth.tsx`, `components/bambi/mobile-tab-bar.tsx`(또는
  `persona-nav.tsx` 내 export), `marketplace.tsx` 내 `MarketplaceFilterControls` +
  `MarketplaceFilterSheet`.
- 수정: `components/providers.tsx`, `screens/seeker.tsx`(SeekerMe),
  `screens/employer.tsx`(EmployerMe), `persona-nav.tsx`(SeekerNav),
  `screens/public-marketplace.tsx`, `screens/seeker-marketplace.tsx`,
  `components/bambi/marketplace.tsx`, `app/seeker/me/page.tsx`,
  `app/seeker/chats/page.tsx`.

## 보류 (후속)

- **[2]** 세션 기반 셸/헤더 일치화: `/` 및 공개 진입점에서도 세션이 있으면 로그인 UI를
  유지하도록 `ResponsiveAppShell`의 `variant` 하드코딩을 세션 인지 방식으로 전환. 별도 스펙.
