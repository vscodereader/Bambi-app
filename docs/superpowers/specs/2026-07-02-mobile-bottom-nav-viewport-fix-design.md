# 모바일 하단 탭바 뷰포트 고정 설계

- 날짜: 2026-07-02
- 상태: 승인 대기(스펙 리뷰)
- 대상: `apps/web` (구직자·공개 마켓·구인자·운영자 셸 공용 하단 탭바)

## 배경 / 문제

라이브 배포 사이트를 모바일에서 확인하면, 하단 탭바가 항상 화면 바닥에
고정되어 있어야 하는데 **가끔 공중에 떠 있는** 현상이 발생한다. 모바일
크롬·사파리 등은 스크롤에 따라 주소창(브라우저 UI)이 접혔다 펼쳐지는데,
그 UI가 사라지는 전환 순간에 탭바가 실제 뷰포트 바닥에서 떨어져 붕 뜬다.

### 현재 구현 진단

- **스크롤 모델**: 페이지는 `window`/`body` 스크롤. 내부 `overflow` 스크롤
  컨테이너 없음.
- **하단 탭바 래퍼**: 아래 두 곳이 **동일한 클래스**로 각각 선언되어 있다.
  - `apps/web/src/components/bambi/mobile-tab-bar.tsx:52`
  - `apps/web/src/components/bambi/persona-nav.tsx:26` (`NavBar`)
  - 클래스: `sticky bottom-0 z-30 border-border border-t bg-background md:hidden`
- **높이**: 루트 `min-h-[100dvh]`, `main`은 `min-h-[calc(100dvh-56px)]`로 이미
  `dvh` 단위를 사용 중.
- **뷰포트 설정 없음**: `apps/web/src/app/layout.tsx`에 `viewport` export가 없어
  `viewport-fit=cover` 미적용 → `env(safe-area-inset-*)`가 값을 반환하지 않고,
  `theme-color`/`interactive-widget`도 미설정.

### 원인

`position: sticky; bottom: 0`은 모바일 브라우저(특히 iOS Safari)에서 주소창이
접히거나 펼쳐지는 전환 중 스크롤포트 하단 계산이 불안정해, 탭바가 뷰포트
바닥에서 떨어져 뜨는 잘 알려진 버그가 있다. 이미 `dvh`를 쓰고 있으므로 뷰포트
단위만 더 손봐도 이 sticky 특유의 문제는 완전히 해결되지 않는다. 지속적으로
바닥에 붙는 하단 내비게이션의 업계 표준은 `position: fixed` + safe-area 처리다.

## 목표 / 비목표

**목표**
- 모바일에서 하단 탭바가 주소창 접힘/펼침 전환과 무관하게 **항상 뷰포트
  바닥에 고정**된다.
- iPhone 홈 인디케이터(safe-area) 영역을 침범하지 않는다.
- 콘텐츠가 고정된 탭바 뒤에 가려지지 않는다.

**비목표**
- 데스크톱 레이아웃 변경(탭바는 `md:hidden`).
- `100dvh` 기반 상세/채팅 화면(`seeker-job-detail-responsive`,
  `seeker-chat-*`)의 높이 로직 변경.
- 소프트 키보드가 열릴 때의 정밀 대응(visualViewport JS 제어). 탭바가 노출되는
  라우트에는 하단 텍스트 입력이 없어 현재 범위에서 제외한다. `interactiveWidget`
  설정은 저비용이라 예방적으로만 포함한다.

## 설계

### 1. 뷰포트 메타 설정

`apps/web/src/app/layout.tsx`에 Next.js `viewport` export 추가.

```ts
import type { Viewport } from "next";

export const viewport: Viewport = {
  viewportFit: "cover",           // env(safe-area-inset-*) 활성화
  themeColor: "#ffffff",          // 주소창 색 일관성 (브랜드 배경과 맞춤)
  interactiveWidget: "resizes-content", // 키보드 시 레이아웃 축소(예방적)
};
```

- `viewport-fit=cover`가 있어야 `env(safe-area-inset-bottom)`가 실제 값을
  반환한다.
- `themeColor` 값은 실제 헤더/배경 토큰과 일치하도록 구현 시 재확인한다.

### 2. sticky → fixed 전환 + 공유 래퍼 추출

동일 클래스가 두 곳에 중복되어 있으므로 **공유 래퍼 컴포넌트 하나**로 추출해
중복을 제거하고, 양쪽이 이를 사용한다.

- 새 파일: `apps/web/src/components/bambi/bottom-nav-shell.tsx`
  - `"use client"` 불필요(순수 래퍼). 필요 시 최소 props(`children`)만.
  - 래퍼 클래스:
    `fixed inset-x-0 bottom-0 z-30 border-border border-t bg-background md:hidden`
    + `pb-[env(safe-area-inset-bottom)]`
  - 탭바 콘텐츠 높이를 결정적으로 만들기 위해 **명시적 높이/최소높이**를 부여하고,
    스페이서에서 참조할 수 있도록 CSS 변수(예: `--bottom-nav-h`)로 노출한다.
    (구현 시 `BottomNav`의 실제 렌더 높이를 측정해 값 확정)
- 적용 지점:
  - `mobile-tab-bar.tsx:52`의 `<div className="sticky …">`를 공유 래퍼로 교체.
  - `persona-nav.tsx`의 로컬 `NavBar`(line 24~30)를 공유 래퍼로 교체(구인자·운영자
    셸이 이미 `NavBar`를 사용하므로 내부 구현만 위임).

> z-index는 프로젝트 규칙상 오버레이(Dialog/Sheet 등)에는 수동 지정 금지지만,
> 하단 탭바는 오버레이가 아니라 앱 셸 레이어이므로 기존 `z-30`을 유지한다.

### 3. 콘텐츠 하단 스페이서

`fixed`는 문서 흐름에서 빠지므로 스크롤 콘텐츠가 탭바 뒤로 가려진다. 탭이
노출될 때만 스크롤 콘텐츠 하단에 여백을 준다.

- 적용 위치: `persona-nav.tsx`의 `Content`(line 20~22) 래퍼에 조건부 하단 패딩.
  - 패딩: `pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0`
  - **탭이 보이는 라우트에서만** 적용. `SeekerNav`/`EmployerNav`/`ModeratorShell`가
    각자 `showNav`(또는 상세 여부)를 계산하므로, 그 플래그를 `Content`에 전달해
    스페이서 on/off를 제어한다.
  - 탭 미노출 라우트(채팅방·상세 등)에는 스페이서 미적용.

### 4. 스택 상호작용 점검 (운영자)

`ModeratorShell`(`persona-nav.tsx:152~`)은 선택 시 나타나는 `QueueActionBar`를
`NavBar` 위에 렌더한다. 탭바가 `fixed`가 되면 액션 바가 탭바와 겹치거나 가려질
수 있으므로, 액션 바가 탭바 **바로 위**에 오도록 위치/여백을 조정한다(예: 액션
바도 fixed로 두고 `bottom`을 `--bottom-nav-h` + safe-area 만큼 띄우거나, 액션 바
표시 시 스페이서 높이를 합산). 구현 시 실제 겹침 여부를 확인해 최소 변경으로
처리한다.

## 영향 파일

- `apps/web/src/app/layout.tsx` — `viewport` export 추가.
- `apps/web/src/components/bambi/bottom-nav-shell.tsx` — 신규 공유 래퍼.
- `apps/web/src/components/bambi/mobile-tab-bar.tsx` — 래퍼 교체.
- `apps/web/src/components/bambi/persona-nav.tsx` — `NavBar`/`Content` 교체,
  스페이서 플래그 배선, 운영자 액션 바 스택 조정.

## 검증

프로젝트 지침(개발서버·스크린샷 금지, 린트+타입체크만)에 따른다.

- `pnpm dlx ultracite fix` (Biome 정렬·린트)
- 타입체크 통과
- 실제 모바일(크롬·사파리) 주소창 접힘/펼침·홈 인디케이터 시각 확인은 **사용자**가
  진행.

## 리스크 / 대안

- **safe-area 미반환**: `viewport-fit=cover` 누락 시 `env()`가 0을 반환. 1번을
  반드시 선행.
- **스페이서 높이 오차**: 탭바 실제 높이와 `--bottom-nav-h` 불일치 시 여백 과부족.
  탭바에 명시적 높이를 주어 결정적으로 맞춘다.
- **키보드 상호작용**: 현재 탭 노출 라우트에 하단 입력이 없어 범위 밖. 추후 입력이
  생기면 visualViewport 기반 후속 작업으로 분리.
