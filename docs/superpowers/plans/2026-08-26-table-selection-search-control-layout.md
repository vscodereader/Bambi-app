# 사용자 선택 열·헤더 검색·모바일 신고창 배치 수정 계획

> **For agentic workers:** 이 문서는 아래 세 가지 비색상 UI 배치 변경만 구현한다. 다크모드·색상·테마 토큰과 그 관련 파일은 수정하지 않는다.

**Goal:** 운영자 사용자 관리 선택 열을 출석 관리와 같은 여백·정렬로 맞추고, 공용 헤더 검색 버튼 크기를 다른 아이콘 버튼과 통일하며, 모바일 신고창의 과도한 폭·세로 길이를 기존 디자인 토큰으로 줄인다.

**Architecture:** 최신 `develop`에서 분리된 `fix/table-selection-search-control-layout` 브랜치 하나를 사용한다. 사용자 선택 열은 출석 관리 표의 기존 `w-10`, TableCell `p-2`, `flex justify-center` 패턴을 그대로 재사용한다. 검색 버튼은 별도 크기 override를 제거하고 공통 Button `icon-lg`만 사용한다. 신고창은 공통 Dialog의 데스크톱 기본값을 유지하고 `max-md:` 기존 Tailwind 토큰만 추가한다.

**Issue/PR:** 이 브랜치는 별도 이슈·PR을 만들기 전까지 구현·검증·push만 준비한다.

## 확정 범위

- 사용자 관리 체크박스 열과 이름 열 사이 세로선을 두지 않는다.
- 선택 열은 출석 관리와 같은 내부 여백과 중앙 정렬을 사용한다.
- 사용자 관리 테이블 wrapper·전체 폭·행 높이·다른 열 구성은 변경하지 않는다.
- 공용 검색 트리거는 해/달·채팅·알림 등 헤더 아이콘 버튼과 같은 `icon-lg` 크기를 사용한다.
- 검색 아이콘 자체도 Button의 기존 공통 아이콘 토큰을 사용한다.
- 구직자·구인자·운영자 공용 헤더의 데스크톱·모바일 호출부에 같은 결과가 적용되어야 한다.
- 모바일 신고창은 폭·padding·gap·사유 항목·상세 입력·액션 배치만 축소한다.
- 신고 사유 항목은 최소 44px 터치 높이를 유지한다.
- 데스크톱 신고창은 기존 크기와 배치를 유지한다.
- 색상, 테마 Provider, 다크 토큰, 공통 Button 색 정책, 모달 외곽선, 채팅 UI는 변경하지 않는다.
- 신규 px·색상·매직 넘버를 만들지 않고 기존 Tailwind·Table·Button 토큰만 재사용한다.

## Task 1: 사용자 관리 선택 열을 출석 관리 패턴으로 통일

**Files:**

- Modify: `apps/web/src/components/bambi/moderator-users-table.tsx`
- Create: `apps/web/test/components/bambi/moderator-users-table-layout.test.ts`

**Implementation:**

- 선택 열에 출석 관리와 같은 `w-10`, TableCell 기본 `p-2`, `align-middle`을 적용한다.
- wrapper의 전역 `px-1`보다 선택 열의 기존 Table padding이 우선하도록 해당 열에서만 복원한다.
- 헤더와 행 체크박스를 출석 관리와 같은 `flex justify-center` wrapper에 둔다.
- `border-r`은 추가하지 않는다.

- [x] 사용자 관리 선택 열 구현
- [x] 선택 열 전용 회귀 테스트

## Task 2: 헤더 검색 트리거 크기 통일

**Files:**

- Modify: `apps/web/src/components/bambi/job-search-command.tsx`
- Create: `apps/web/test/components/bambi/header-search-button-size.test.ts`

**Implementation:**

- 검색 트리거의 별도 `size-10` class를 제거한다.
- 기존 `size="icon-lg"`만 남겨 다른 헤더 아이콘 버튼과 같은 Button size variant를 사용한다.
- 검색 Dialog 동작·hotkey·검색 결과 처리는 변경하지 않는다.

- [x] 검색 트리거 크기 구현
- [x] 검색 버튼 크기 회귀 테스트

## Task 3: 모바일 신고창 밀도 축소

**Files:**

- Modify: `apps/web/src/components/bambi/report-dialog.tsx`
- Modify: `apps/web/src/components/bambi/safety-kit.tsx`
- Create: `apps/web/test/components/bambi/report-dialog-mobile-density.test.ts`

**Implementation:**

- 모바일 DialogContent는 기존 `w-80`, `gap-3`, `p-4` 토큰을 사용한다.
- 신고 폼은 모바일에서 기존 spacing·typography 토큰으로 gap·padding·제목·입력 높이를 한 단계 줄인다.
- 사유 항목은 `min-h-11`을 사용해 최소 터치 높이를 유지한다.
- 취소·접수 버튼은 모바일에서도 2열로 배치한다.
- 선택 사유 색상·상태 배지·서버 제출 로직은 변경하지 않는다.

- [x] 모바일 신고창 밀도 구현
- [x] 모바일 신고창 회귀 테스트

## 검증

- [x] `pnpm --filter web check-types`
- [x] 관련 Vitest 3파일 4테스트 통과
- [x] 변경 파일 Biome 통과
- [x] `git diff --check`
- [x] 변경 파일이 위 세 작업의 소스 4개·테스트 3개·설계서 1개로 한정됨

## 커밋 구분

1. `docs: 사용자 선택 열·검색 버튼·모바일 신고창 분리 계획 작성`
2. `fix: 사용자 선택 열·검색 버튼·모바일 신고창 배치 정리`

사용자가 요청한 세 비색상 배치 변경은 하나의 브랜치로 묶되, 설계와 구현 커밋을 분리한다. `--force`를 사용하지 않고 최종 머지는 직접 수행하지 않는다.
