# /moderator 헤더 중복 제거 + UI 정리 — 설계

- 날짜: 2026-07-02
- 대상: 운영자(moderator) 콘솔 — 검수 큐 / 신고 / 사용자
- 범위: 헤더 chrome 중복 제거 + 눈에 띄는 UI/UX 정리 (코드는 최소 수정, 시각적 완성도 집중)

## 배경 / 문제

`apps/web/src/app/moderator/layout.tsx`가 **각자 헤더를 가진 두 컴포넌트를 겹쳐 쌓아** chrome이 중복 렌더된다.

- 바깥 `ResponsiveAppShell`(`components/bambi/responsive-shell.tsx`) — 자체 헤더에 로고 + (모바일)벨을 렌더. 헤더를 끄는 prop은 없고 `showDesktopNav`(데스크톱 nav 토글)만 있음. 모바일 헤더(`md:hidden`)는 항상 렌더.
- 안쪽 `ModeratorShell` → `ConsoleTop`(`components/bambi/screens/moderator.tsx`) — 목록 라우트에서 로고(`:247`) + 벨(`:256`) + `ConsoleTabs`를 **또** 렌더. `md:hidden`이 없어 모든 뷰포트에서 표시.

결과(목록 라우트 `/moderator`, `/moderator/reports`, `/moderator/users`):

- 데스크톱: 로고 2개, 벨 1개 + 섹션 탭 2벌(상단 nav + ConsoleTabs)
- 모바일: 로고 2개, 벨 2개 + 섹션 탭 2벌(ConsoleTabs + 하단 ModTabs)

상세 라우트(`/moderator/queue/[id]` 등)는 `ModeratorShell`이 `isDetail` 분기로 `ConsoleTop`을 건너뛰어 중복이 없다(AppShell 헤더만 남음).

부가 문제: 전 화면이 모바일 폭 단일 컬럼 기준이라, 데스크톱에서 넓은 `max-w-[80%]` main에 그대로 늘어나 흩어져 보인다. 가로 패딩도 ConsoleTop(px-5) vs 목록(px-6)로 불일치.

## 목표

1. 로고 1개 / 벨 1개 / 섹션 탭 1벌로 chrome 중복 완전 제거.
2. 데스크톱에서 콘텐츠가 중앙 정렬 컬럼으로 정돈되게.
3. 상세/목록/모바일에서 헤더·탭·액션바 계층과 여백 일관성 확보.

## 비목표 (이번에 안 함)

- `screens/moderator.tsx`의 임의 px → 디자인 토큰 전면 마이그레이션, 네이티브 요소 → shadcn 치환(별도 점진 전환 작업).
- seeker/employer의 유사 중복 패턴.
- 목록 → 데스크톱 테이블형 레이아웃 재설계.

## 설계

### 1. 헤더 chrome 통합 (A안 — AppShell이 전역 chrome 단독 소유)

**`ResponsiveAppShell` (`responsive-shell.tsx`)**

- `variant === "moderator"`일 때 헤더 우측 액션을 운영자용으로 분기:
  - 데스크톱 헤더: 기본의 "연락처 보호" 배지 + "내 정보/시작하기" 링크 대신 `[운영자 모드 배지] + [알림 벨]`을 렌더.
  - 모바일 헤더: 기본의 "보호 중" 배지 대신 `[운영자 모드 배지] + [알림 벨]`(벨은 기존 유지).
- 로고·벨은 이제 AppShell 헤더가 단독 소유한다.
- 기존 public/seeker/employer variant 동작은 변경하지 않는다(분기 추가만).

**`ConsoleTop` (`moderator.tsx`)**

- 로고·벨·`운영자 모드` 배지 제거.
- `ConsoleTabs` 제거 — 섹션 이동은 데스크톱 상단 nav와 모바일 하단 `ModTabs`가 담당.
- 남기는 것: `운영자 콘솔` 타이틀 + `StatGroup`(검수 대기 / 신고 대기 / 경고 사용자). 역할을 "콘솔 상태 요약 배너"로 축소.
- 탭 관련 prop(`tab`, `onTab`)이 불필요해지므로 시그니처와 `ModeratorShell`의 호출부(`persona-nav.tsx:154-162`)를 함께 정리한다. `counts`만 남긴다.

**중복 해소 결과**: 로고 1개 · 벨 1개 · 섹션 탭 1벌(데스크톱=상단 nav, 모바일=하단 ModTabs).

### 2. 데스크톱 레이아웃 — 중앙 정렬 컬럼

- moderator 콘텐츠(ConsoleTop + 목록/상세)를 중앙 정렬 max-width 컬럼(`mx-auto w-full max-w-3xl`)으로 감싼다. 데스크톱에서 폭이 정돈되고, 모바일은 그대로 full-width.
- 한 곳에서만 조정: `ModeratorShell`의 `Content`/셸 래퍼 또는 `moderator/layout.tsx` 레벨. `ResponsiveAppShell`의 `main`은 이미 `mx-auto`라 그 안쪽 moderator 콘텐츠에 컬럼 래퍼를 추가하는 방식으로 최소 수정.
- 폭 값은 프로젝트 컨벤션(`max-w-[1180px]` 등 임의 고정폭 금지)에 맞춰 Tailwind 스케일 토큰(`max-w-3xl`)을 사용.

### 3. 폴리시 (시각적 완성도)

- 가로 패딩 통일: ConsoleTop과 목록의 좌우 패딩을 한 값으로 맞춘다.
- 상단 요약 배너(ConsoleTop)와 스크롤 목록 사이 구분(구분선/여백) 톤 정리.
- 상세 페이지: AppShell 헤더 + 내부 `AppBar`가 이중 헤더처럼 보이지 않도록 여백/계층 점검.
- 모바일: 하단 탭바 + (선택 시)액션바 겹침 여백 확인.

## 영향 파일

- `apps/web/src/components/bambi/responsive-shell.tsx` — moderator variant 헤더 우측 분기.
- `apps/web/src/components/bambi/screens/moderator.tsx` — `ConsoleTop` 축소(로고/벨/탭 제거), 패딩 정리.
- `apps/web/src/components/bambi/persona-nav.tsx` — `ConsoleTop` 호출부 정리 + 중앙 컬럼 래퍼.
- (필요 시) `apps/web/src/app/moderator/layout.tsx` — 래퍼 위치 조정.

## 검증

- `pnpm dlx ultracite fix`로 Biome 정렬·린트.
- 타입체크 통과.
- 개발서버 실행·스크린샷은 하지 않는다(프로젝트 관례). 시각 확인은 사용자가 수행.
- 수동 확인 체크리스트:
  - 목록 3개 라우트에서 데스크톱/모바일 각각 로고 1 · 벨 1 · 섹션 탭 1벌인지.
  - 상세 라우트에서 헤더가 하나만 보이는지.
  - 데스크톱에서 콘텐츠가 중앙 정렬되는지, 모바일은 full-width인지.
  - 기존 public/seeker/employer 헤더가 변경되지 않았는지.

## 리스크

- `ResponsiveAppShell`은 여러 variant가 공유 → moderator 분기 추가 시 다른 variant 회귀 없도록 조건 분기만 추가.
- `ConsoleTop` prop 시그니처 변경이 `persona-nav.tsx`와 `preview/page.tsx`(`ModeratorApp` 경유) 등 다른 사용처에 영향. 호출부를 함께 수정하고 타입체크로 확인. `preview`는 데모 전용 예외지만 컴파일은 통과해야 함.
