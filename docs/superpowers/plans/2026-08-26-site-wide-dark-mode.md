# 사이트 전역 수동 다크모드 구현 계획

> **For agentic workers:** 이 문서는 구현 시 직접 따라야 하는 작업 명세다. 체크박스는 해당 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다.

**Goal:** 웹의 공개·구직자·업주·운영자·로그인·고객센터·편집기 화면에 사용자가 직접 전환하고 재방문에도 유지되는 다크모드를 제공한다. 다크모드는 흰 계열 페이지·카드 표면과 일반 검은 계열 문자를 어두운 표면·밝은 문자로 전환하되, 브랜드/상태 버튼과 테두리의 기존 색상은 유지하고 outline 버튼은 테마 표면을 따른다.

**Architecture:** `next-themes`를 기존 Providers 계층에 연결하고 클래스 기반 테마를 루트 HTML에 적용한다. 최초 방문은 라이트로 고정하며 사용자가 선택한 `light`/`dark` 값을 브라우저 저장소에 유지한다. 페이지별 색을 새로 하드코딩하지 않고 기존 shadcn 시맨틱 토큰과 밤비 디자인 토큰을 다크 클래스에서 재매핑한다. 공통 해/달 토글은 재사용 가능한 한 컴포넌트로 만들고 공개·구직자·업주·운영자·로그인·고객센터·편집기에서 실제로 사용하는 데스크톱 헤더와 모바일 메뉴 진입점에 배치한다. 토큰을 우회하는 고정 흰 표면·고정 어두운 글자는 감사해 의미에 맞는 기존 시맨틱 토큰으로 바꾼다.

**Tech Stack:** Next.js 16 App Router, React 19, `next-themes`, Tailwind CSS v4, shadcn/base-ui, Vitest.

**Issue:** `#249` — 웹 전역 수동 다크모드와 UI 대비 정리

## 확정 요구사항

- 범위는 `apps/web`의 공개·구직자·업주·운영자·로그인·고객센터·편집기 화면이다.
- Expo 네이티브 앱은 이번 PR에서 변경하지 않는다.
- 실제 사용자에게 노출되는 메인 팝업 UI만 다크모드 적용 대상에서 제외한다. `/moderator/popups` 운영자 관리 화면과 그 Dialog·Popover는 다른 운영자 콘솔과 동일하게 선택 테마를 따른다.
- 일반 Dialog, AlertDialog, Sheet, Dropdown, Popover, Toast 등 공통 오버레이는 각 대상 화면의 일부이므로 다크모드를 적용한다.
- 다크 페이지 배경은 기존 `ink-950`, 카드·팝오버 등 상승 표면은 `ink-900`/`ink-800` 계열을 재사용해 첨부 레퍼런스처럼 층위를 구분한다. 순수 검정 한 색으로 모든 표면을 평탄화하지 않는다.
- 일반 본문·제목처럼 라이트 모드에서 검은 계열인 문자는 다크모드에서 흰색 또는 밝은 중립색으로 전환한다.
- 브랜드·상태 버튼의 배경색과 그 배경에 대응하는 기존 글자색은 다크모드에서도 유지한다. 공통 outline 버튼은 라이트에서 흰 배경·어두운 글자, 다크에서 카드 배경·밝은 글자·기존 밝은 테두리를 사용한다. 로그아웃과 실제 메인 팝업의 outline만 라이트 렌더를 유지한다.
- 기존 테두리 색상은 다크모드에서도 변경하지 않는다. 두께·투명도뿐 아니라 실제 `border`/`input` 토큰 색상도 라이트 모드와 동일하게 유지한다.
- 업로드 이미지, GIF, 광고 소재, 사용자 생성 이미지, 배너·이미지 편집 결과는 색상 변환하지 않는다. 주변 도구막대·패널·입력 UI만 다크모드를 적용한다.
- 헤더와 모바일 메뉴에 해/달 토글을 제공한다.
- 최초 방문은 라이트 모드이며 시스템 테마를 자동 추종하지 않는다.
- 사용자의 선택을 브라우저에 저장하고 새로고침·재방문 때 복원한다.
- 기존 코드와 공통 컴포넌트·토큰을 우선 재사용하고 색상값을 페이지별로 하드코딩하지 않는다.
- 브랜치와 PR은 `feat/site-wide-dark-mode` 하나로 유지하고 PR base는 `develop`으로 한다.
- 사용자가 직접 커밋·push하므로 요청 전에는 커밋하거나 원격에 push하지 않는다.

## 기준 상태와 주의점

- 브랜치는 최신 `origin/develop`의 `cee75b1e`에서 생성했다.
- `packages/ui/src/styles/globals.css`에는 일반 shadcn `.dark` 토큰이 있으나 웹의 `apps/web/src/index.css`가 라이트 밤비 토큰만 다시 정의한다.
- 웹 Providers에는 `ThemeProvider`가 없고 Toaster가 `theme="light"`로 고정되어 있어 현재 웹 다크모드는 활성화되지 않는다.
- `packages/ui`의 기존 `.dark` 기본값은 primary·secondary·border·input도 변경하므로 이번 요구사항에 그대로 사용할 수 없다. 웹 레이어에서 밤비 정책으로 명시적으로 덮어써야 한다.
- `apps/web/src/styles/bambi/tokens.css`의 `--surface-*`, `--text-*`를 직접 쓰는 기존 DS 화면과 `bg-background`, `bg-card`, `text-foreground`를 쓰는 shadcn 화면이 공존한다. 두 토큰 계층이 같은 결과를 내도록 함께 매핑한다.
- `bg-white`, `text-white`, `border-white`, 인라인 색상은 모두 오류가 아니다. 브랜드 버튼, 이미지 편집 핸들, 역상 배너처럼 원색 유지가 의도된 용례와 일반 표면 하드코딩을 구분해 변경한다.
- 루트 viewport `themeColor`가 현재 흰색 고정이므로 활성 수동 테마에 맞춰 `<meta name="theme-color">`와 `color-scheme`을 동기화하는 클라이언트 효과를 공통 테마 계층 한 곳에 둔다. 화면별로 DOM을 직접 수정하지 않는다.
- Tailwind의 현재 dark variant는 `.dark` 조상만 확인하므로 하위 요소에 `.light`를 붙이는 것만으로는 메인 팝업 예외가 되지 않는다. 전역 다크 variant와 토큰 스코프가 명명된 `theme-light-scope` 경계를 함께 존중하도록 만든다.
- `MainPopupLayer`는 포털이 아니라 루트 레이아웃 아래 fixed DOM을 직접 렌더하므로 데스크톱·모바일 최상위 래퍼에 같은 라이트 스코프를 적용한다.
- `/moderator/popups` 안의 Dialog/Popover는 `body` 포털로 렌더되며 문서의 활성 테마를 그대로 상속한다. 관리 화면에는 라이트 강제 스코프를 두지 않는다.
- `packages/ui`의 공통 outline variant가 라이트/다크 표면 전환을 소유하고, 화면별 `dark:bg-*` 복제를 금지한다. 로그아웃만 공유 예외 클래스로 라이트 outline을 복원하며 실제 메인 팝업은 light scope가 dark variant 자체를 차단한다.

## 색상 정책

| 의미 | 라이트 | 다크 | 정책 |
| --- | --- | --- | --- |
| 페이지 배경 | 기존 `background`/`surface-page` | 기존 `ink-950` | 공통 토큰 전환 |
| 카드·기본 표면 | 기존 흰색 | 기존 `ink-900` | 공통 토큰 전환 |
| 팝오버·상승 표면 | 기존 흰색 | 기존 `ink-800` | 공통 토큰 전환 |
| 기본·강조 문자 | 기존 gray/foreground | 흰색 계열 | 공통 토큰 전환 |
| 보조 문자 | 기존 muted gray | 읽을 수 있는 밝은 중립색 | 기존 중립 토큰 재사용 |
| 브랜드·상태 버튼 | 기존 색 | 기존 색 | 배경과 내부 대비색 모두 유지 |
| outline 버튼 | 흰 배경·어두운 글자 | 카드 배경·밝은 글자 | 로그아웃·실제 메인 팝업만 라이트 유지 |
| 테두리·입력 테두리 | 기존 색 | 기존 색 | 정확한 색상 유지 |
| 미디어·광고 소재 | 원본 | 원본 | 필터·반전 금지 |

## Task 1: 테마 기반과 토큰 정책 구축

**Files:**

- Modify: `apps/web/src/components/providers.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/styles/bambi/tokens.css`
- Create: `apps/web/src/components/bambi/theme-client-effects.tsx`
- Modify: 정책과 충돌하는 `packages/ui/src/components/{button,badge,checkbox,input,select,switch,tabs,textarea,toggle}.tsx`
- Create/Modify: 웹 테마 초기화·토큰 회귀 테스트

**Interfaces:**

- `ThemeProvider`는 `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`를 사용하고 현재 프로젝트의 `next-themes` 의존성을 재사용한다.
- 저장 키는 한 곳의 명명된 상수로 관리한다. `next-themes`의 허용 themes를 `light`/`dark`로 제한해 그 이외의 저장값은 적용하지 않는다.
- 서버 HTML과 첫 클라이언트 렌더의 hydration 경고·테마 깜빡임을 방지하도록 루트 `<html>` 설정을 구성한다.
- Toaster는 고정 라이트가 아니라 `resolvedTheme`을 통해 활성 수동 테마를 따르되 브랜드/상태 색상은 유지한다.
- 웹 `.dark`에서 시맨틱 배경·글자·카드·팝오버·밤비 `surface`/`text` 토큰을 함께 재정의한다.
- `--primary`, 상태 팔레트, 브랜드 coral/ink 계열 자체와 `--border`, `--input`은 라이트 값을 유지한다.
- 라이트 모드 렌더는 기존 값과 동일해야 한다.

- [x] 테마 Provider 기본값·시스템 비추종·저장 설정 회귀 테스트를 추가한다.
- [x] 다크 토큰이 어두운 표면·밝은 문자를 제공하고 버튼·테두리 토큰은 유지되는 테스트를 추가한다.
- [x] 웹 ThemeProvider와 hydration-safe 루트 설정을 구현한다.
- [x] shadcn·밤비 양쪽 토큰 계층을 다크 정책에 맞게 매핑한다.
- [x] Toaster, `color-scheme`, 브라우저 theme-color를 활성 테마에 맞춘다.
- [x] 공통 UI 프리미티브의 기존 `dark:` 분기를 감사해 버튼·상태·테두리 유지 정책과 충돌하는 값을 제거한다.
- [x] 관련 테스트, 웹 타입 검사, Ultracite, `git diff --check`를 통과시킨다.

## Task 2: 공통 토글과 모든 내비게이션 진입점 연결

**Files:**

- Create: `apps/web/src/components/bambi/theme-toggle.tsx`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx`
- Modify: `apps/web/src/app/jobs/layout.tsx`
- Modify: `apps/web/src/app/board/layout.tsx`
- Modify: `apps/web/src/app/(legal)/layout.tsx`
- Modify: `apps/web/src/components/bambi/auth/auth-backdrop.tsx`
- Modify: `apps/web/src/app/ad-banner-editor/ad-banner-editor-window.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Create/Modify: 토글 hydration·접근성·내비게이션 배치 회귀 테스트

**Interfaces:**

- 공통 토글 하나가 현재 테마에 따라 달/해 아이콘과 다음 동작을 표시한다.
- 버튼은 semantic `<button>` 또는 기존 Button을 사용하고 키보드 조작, focus-visible, `aria-label`을 제공한다.
- 마운트 전에는 서버와 동일한 안정적인 자리표시자를 렌더해 hydration mismatch와 레이아웃 이동을 막는다.
- `ResponsiveAppShell`은 공개 기본·구직자·업주·운영자·고객센터·매뉴얼·포인트몰의 공통 진입점이므로 데스크톱 헤더와 모바일 헤더 우측 액션에 토글을 한 번씩 배치한다. 이 셸을 쓰는 호출부마다 토글을 반복 주입하지 않는다.
- `/jobs/**`, `/board/**`, 법적 문서는 `ResponsiveAppShell`을 쓰지 않으므로 각각의 공통 layout 헤더 우측에 동일 토글을 배치한다.
- 비로그인 `/seeker` 로그인·회원가입 게이트는 `AuthBackdrop` 헤더에 토글을 배치한다. 인증 패널 내부에 별도 토글을 중복 배치하지 않는다.
- `/ad-banner-editor`는 앱 셸을 의도적으로 벗어난 새 창이므로 `AdBannerEditorWindow` 최소 헤더의 닫기 버튼 옆에 토글을 배치한다.
- 모바일 채팅 상세는 공통 모바일 헤더를 숨기고 자체 fixed 헤더를 사용하므로 해당 채팅 헤더의 정보 메뉴 앞에 토글을 배치한다.
- 모바일 전용 별도 메뉴가 없는 셸은 토글을 만들기 위해 새 메뉴를 발명하지 않고 기존 모바일 헤더 액션에 노출한다. 운영자 `더보기` Sheet 등 기존 메뉴가 있는 경우에도 헤더 토글과 중복 노출하지 않는다.
- 화면마다 별도 theme state나 localStorage 코드를 만들지 않는다.
- 메인 팝업 UI 내부에는 토글을 추가하지 않는다.

- [x] 라이트→다크→라이트 전환과 접근 가능한 레이블 테스트를 추가한다.
- [x] 마운트 전 안정 렌더와 저장된 테마 복원 테스트를 추가한다.
- [x] 공통 ThemeToggle을 구현한다.
- [x] `ResponsiveAppShell` 데스크톱·모바일 헤더에 연결해 구직자·업주·운영자·고객센터·매뉴얼·포인트몰을 함께 커버한다.
- [x] 공개 공고·공개 게시판·법적 문서의 독립 헤더에 연결한다.
- [x] 로그인 게이트와 독립 광고 배너 편집 창 헤더에 연결한다.
- [x] 중복 토글 또는 토글이 없는 경로가 없는지 라우트별로 점검한다.
- [x] 관련 테스트, 웹 타입 검사, Ultracite, `git diff --check`를 통과시킨다.

## Task 3: 대상 화면의 고정 라이트 색상 감사와 교정

**Files:**

- Modify: 대상 범위의 `apps/web/src/app/**` 페이지·레이아웃
- Modify: 대상 범위에서 사용하는 `apps/web/src/components/bambi/**`
- Modify: 필요 시 `packages/ui/src/components/**`의 공통 프리미티브
- Create/Modify: 색상 정책 회귀 테스트

**Interfaces:**

- 공개 페이지: `/`, `/jobs/**`, `/board/**`, 법적 문서·매뉴얼 등 공개 셸과 footer를 포함한다.
- 구직자: `/seeker/**`의 마켓플레이스·공고·커뮤니티·채팅·알림·마이페이지·출석·포인트 화면을 포함한다.
- 업주: `/employer/**`의 공고·편집·업체 정보·팀·결제·프로모션·분석·출석 화면을 포함한다.
- 운영자: `/moderator/**` 전체를 포함하며 `/moderator/popups` 관리 화면과 포털 UI도 포함한다.
- 로그인: 인증 backdrop, 로그인·회원가입·본인인증·계정 복구 화면을 포함한다.
- 고객센터: `/support/**`와 고객센터 채팅 위젯을 포함한다.
- 편집기: 공고 블록 편집기, 광고 배너 편집기, 커뮤니티 편집기, 수집 이미지 편집기의 도구 UI를 포함하고 캔버스 미디어 결과는 보존한다.
- `/preview`는 실제 서비스 라우트가 아니라 인라인 스타일과 고정 다크 스테이지를 사용하는 내부 디자인 데모이므로 사용자 결정에 따라 이번 적용·검수 대상에서 제외한다.
- 일반 흰 표면 하드코딩은 `background`/`card`/`popover` 등 기존 의미 토큰으로 바꾼다.
- 브랜드 버튼·상태 배지·광고 소재·이미지 편집 핸들의 의도된 `white`/원색은 유지한다.
- 텍스트가 밝은 배경과 어두운 배경 모두에서 WCAG AA에 준하는 대비를 갖는지 대표 상태로 확인한다.
- hover, focus, selected, disabled, error, skeleton, empty state도 기본 상태와 함께 점검한다.

- [x] 하드코딩된 흰 표면·어두운 일반 글자 목록을 만들고 의미별 유지/교정으로 분류한다.
- [x] 공통 프리미티브와 셸을 먼저 교정해 페이지별 중복 수정을 줄인다.
- [x] 공개·로그인 화면 전체를 교정한다.
- [x] 구직자 화면 전체를 교정한다.
- [x] 업주 화면 전체를 교정한다.
- [x] 운영자 화면 전체와 `/moderator/popups` 관리 기능을 교정하되 실제 노출 메인 팝업은 제외한다.
- [x] 고객센터·편집기 UI 전체를 교정한다.
- [x] 버튼·배지·테두리·미디어가 요구대로 유지되는 회귀 테스트를 추가한다.
- [x] 관련 테스트, 웹 타입 검사, Ultracite, `git diff --check`를 통과시킨다.

## Task 4: 메인 팝업 라이트 고정과 전 페이지 검수

**Files:**

- Modify: `apps/web/src/components/bambi/main-popup/main-popup-layer.tsx`
- Modify: `apps/web/src/index.css`의 light-scope 토큰·dark variant 경계
- Modify/Create: 메인 팝업 다크모드 제외 회귀 테스트
- Modify: 관련 `docs/test-flows/*.md`
- Modify: 이 계획 문서의 완료 체크와 검증 결과

**Interfaces:**

- 사이트가 다크모드여도 실제 노출 메인 팝업 콘텐츠는 기존 라이트 렌더를 유지한다. 운영자 관리 기능은 다크모드를 따른다.
- 일반 메인 팝업은 `theme-light-scope` 하나로 라이트 토큰과 dark variant를 함께 차단한다.
- 팝업 관리 라우트는 별도 테마 조작 없이 전역 선택 테마를 그대로 사용한다.
- 팝업을 닫은 뒤 주변 페이지는 계속 선택된 다크모드를 유지한다.
- 데스크톱과 320~430px 모바일 폭에서 대상 라우트의 대표 화면을 각각 확인한다.
- 새로고침, 직접 URL 진입, 로그아웃·로그인, 역할 간 이동 후에도 저장된 테마가 유지되어야 한다.
- 라이트 모드 시각 회귀가 없어야 한다.

- [x] 메인 팝업 라이트 고정 회귀 테스트를 추가한다.
- [x] `MainPopupLayer`에 포털 없는 라이트 토큰·variant 스코프를 구현한다.
- [x] `/moderator/popups`의 라이트 강제를 제거해 관리 화면과 포털이 선택 테마를 따르게 한다.
- [x] 전체 라우트 매트릭스를 빌드·코드 감사하고 접근 가능한 대표 화면을 데스크톱/모바일에서 수동 검수한다.
- [x] 이미지·GIF·광고·편집 캔버스에 전역 필터나 반전을 추가하지 않았음을 확인한다.
- [x] 버튼 색과 테두리 색이 라이트/다크에서 동일한지 확인한다.
- [x] 새로고침·직접 URL 이동 후 테마 유지와 초기 hydration 안정성을 확인한다.
- [x] 관련 테스트와 전체 `pnpm --filter web check-types`, 웹 Vitest, `pnpm check`, `git diff --check` 결과를 기록한다.

## 커밋 구분

## 구현 검증 결과 (2026-08-26)

- `pnpm --filter web check-types`: 통과.
- `pnpm --filter web build`: 233개 정적 페이지 생성까지 통과. 기존 `local-grade-icons` NFT 추적 경고 1건만 출력됐다.
- 관련 테마·수다방·운영자 테이블·성별 표식 Vitest 4파일 16개 테스트 통과.
- 전체 웹 Vitest: 99개 파일 중 93개 통과, 745개 테스트 중 739개 통과. 실패 6개는 최신 `develop` 기준 기대값 드리프트다. 실패 대상 중 `moderator.tsx`, 운영자 queue/chats/report, community board 파일은 이 브랜치에서 변경하지 않았고, 채팅방 파일의 diff는 ThemeToggle import·렌더 2줄뿐이라 기존 `messageId` 기대 개수와 무관하다.
- `pnpm check`: 오류 없이 통과. 이번 변경과 무관한 기존 exhaustive-deps 정보 2건과 unused suppression 경고 2건이 남아 있다.
- `git diff --check`: 통과.
- 실제 브라우저 데스크톱 `/jobs`: 라이트에서 `body #fff / text #111827`, 다크에서 페이지 `#0b1018`, 카드 `#0f1620`, 본문 흰색으로 전환됨을 확인했다. 테두리는 두 모드 모두 `#eef0f3`를 유지하며 outline 버튼은 다크 카드 표면·밝은 글자로 전환한다.
- 390×844 모바일 `/jobs`와 `/seeker`: 모바일 헤더 토글 노출, 어두운 계층 표면, 밝은 일반 문자, 기존 버튼·배지 색을 확인했다.
- `/board`, `/privacy`, `/support`: 직접 URL 이동 후에도 `.dark`와 어두운 배경이 유지되고 각 활성 헤더에 토글이 노출됨을 확인했다. `ResponsiveAppShell`은 데스크톱·모바일 인스턴스를 CSS로 전환하므로 DOM에는 2개가 있어도 현재 breakpoint에서는 하나만 보인다.
- 다크 전환 뒤 `/jobs` 새로고침: `.dark`와 "라이트모드로 전환" 레이블이 복원되어 저장 지속성을 확인했다.
- `/preview`: 사용자 결정에 따라 구현·검수에서 제외했다.

사용자가 커밋을 요청할 때 아래 단위로 제목과 상세 본문을 함께 제공한다.

1. `feat: 웹 다크모드 기반과 공통 토글 추가`
2. `feat: 전체 서비스 화면 다크모드 적용`
3. `test: 다크모드 전 페이지 검수와 팝업 예외 보강`

관련 변경은 `feat/site-wide-dark-mode` 한 브랜치와 하나의 PR로 올린다. PR 전 최신 `origin/develop`을 다시 반영하고 충돌 및 마이그레이션 이력을 확인한다. 이 작업은 DB 변경을 요구하지 않으며 migration을 만들지 않는다.

## PR 검증 기록 양식

- 자동 검증: 실행 명령과 통과 결과
- 라이트 회귀: 대표 라우트와 결과
- 다크 데스크톱: 공개·구직자·업주·운영자·로그인·고객센터·편집기 결과
- 다크 모바일: 각 역할 헤더·메뉴·토글과 대표 라우트 결과
- 정책 예외: 버튼·테두리·미디어 원색 유지, 메인 팝업 라이트 고정 결과
- 지속성: 새로고침·재방문·직접 URL·인증 전환 결과
