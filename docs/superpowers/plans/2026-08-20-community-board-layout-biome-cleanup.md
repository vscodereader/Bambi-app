# 게시판 홈 배치 Biome 예외 주석 제거 설계

## 목표

PR #218 머지 뒤 작업 브랜치에만 남은 게시판 홈 배치의 `biome-ignore` 제거 변경을 최신
`develop` 기준 별도 PR로 반영한다. 기존 drag-and-drop 기능과 키보드 대체 조작은 유지하면서
JSX 접근성 예외 지시문 없이 Biome 검사를 통과시킨다.

## 변경 범위

- `apps/web/src/app/moderator/community-boards/page.tsx`
  - 행 드롭 영역과 게시판 드래그 카드의 `biome-ignore` 주석 4개를 제거한다.
  - 네이티브 drag 이벤트를 ref 기반 공용 드롭 대상 컴포넌트에서 연결한다.
  - `dragstart`, `dragover`, `drop`의 기존 데이터 형식과 이동 함수를 그대로 사용한다.
- DB·API·라우팅·게시판 데이터에는 손대지 않는다.

## 동작 보존

- 게시판을 같은 행 또는 다른 행으로 드래그할 수 있다.
- 특정 카드 위에 드롭하면 해당 위치로 이동한다.
- 행 빈 영역에 드롭하면 그 행 마지막에 추가한다.
- 각 행의 추가 선택기와 게시판 제거 버튼은 그대로 유지한다.
- 중첩된 제거 버튼 때문에 드래그 카드를 `<button>`으로 바꾸지 않는다.

## 검증

- 변경 파일 Biome 검사
- Web TypeScript 검사
- `git diff --check`
- PR 직전 최신 `origin/develop` 재확인

## Git

- 기준: 최신 `origin/develop`
- 브랜치: `fix/community-board-layout-biome-cleanup`
- 관련 이슈: `#220`
- 최종 머지는 동기가 수행한다.
