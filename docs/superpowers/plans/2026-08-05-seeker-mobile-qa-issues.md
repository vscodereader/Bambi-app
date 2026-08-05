# 구직자 면접·인증 문구·모바일 UI 배포 검수 수정 계획

> **For agentic workers:** 이 문서의 체크박스는 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다.

**Goal:** 배포된 구직자 웹에서 확인된 면접 목록 갱신 누락, 비회원 인증 버튼 문구, 모바일 채팅 제목 잘림, 공고 신고 입력창의 키보드 가림을 한 번에 교정한다.

**Architecture:** 최신 `develop`에서 통합 브랜치 `fix/seeker-mobile-qa-issues` 하나를 사용하고, 변경은 검토 가능한 3개 커밋 영역으로 나눈다. 면접 상태의 서버 계약과 예정 목록 필터는 유지하고 React Query 캐시만 정확히 무효화한다. 모바일 레이아웃은 기존 채팅 헤더와 공용 신고 `Dialog`·`ReportForm`을 재사용하며 shadcn/Tailwind 범위 안에서 반응형 구조와 동적 뷰포트 스크롤을 보완한다.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack React Query, oRPC, shadcn/base-ui, Tailwind CSS v4, Vitest.

## 확정 요구사항

- 면접 일정이 `confirmed`로 바뀌면 `내 정보 > 예정된 면접`에 즉시 반영한다.
- `completed`로 바뀌면 예정된 면접에서 제거한다. 완료된 면접의 별도 이력 화면은 이번 범위에 포함하지 않는다.
- `완료` 버튼 문구는 의미가 분명하도록 `면접 완료`로 변경한다.
- 아무도 완료하지 않아도 예정 시간이 지나면 기존처럼 예정된 면접에서 제외한다.
- 로그인 화면의 `비회원으로 목록만 보기` 버튼 문구만 `비회원으로 인증하기`로 변경한다. 인증 방식, 게스트 권한, 인증 후 이동은 바꾸지 않는다.
- 모바일 채팅방 제목은 최대 두 줄로 읽을 수 있게 하고 `공고 보기`, 대화 상태, 실시간 상태는 제목 아래 별도 줄에 배치한다. 데스크톱 정보와 기능은 유지한다.
- 모바일 공고 신고 Dialog는 소프트 키보드가 열린 동적 뷰포트 안에서 스크롤 가능해야 하며, 상세 입력란에 포커스하면 입력란이 가려지지 않아야 한다.
- 네 항목을 하나의 이슈·브랜치·PR로 묶고 PR base는 `develop`으로 한다.

## 현재 원인

1. `setInterviewStatus` 성공 콜백이 현재 채팅방 쿼리만 무효화하고 `listMyUpcomingInterviews`를 무효화하지 않아, 이미 캐시된 내 정보 화면이 확정·완료 상태를 즉시 반영하지 못한다.
2. 비회원 인증 버튼의 `triggerLabel`이 이전 문구로 하드코딩되어 있다.
3. 모바일 채팅 헤더에서 제목과 모든 액션·상태 배지가 한 flex 행의 너비를 경쟁하고, 제목에는 `truncate`가 적용되어 몇 글자만 남는다.
4. 공용 `DialogContent`는 세로 스크롤을 지원하지만 동적 뷰포트 기준 최대 높이가 없어, Android Chrome 키보드가 열린 뒤 ReportForm 하단 입력란이 축소된 화면 밖에 남을 수 있다.

## 공통 작업 규칙

- 브랜치: `fix/seeker-mobile-qa-issues`, base: 최신 `origin/develop` (`a9eb836`에서 생성).
- DB 스키마·migration·API 상태 계약은 변경하지 않는다.
- `apps/web/CLAUDE.md`에 따라 shadcn 컴포넌트와 Tailwind만 사용한다. 인라인 style, 신규 CSS 파일, raw 색상은 추가하지 않는다.
- 변경 전 회귀 테스트를 추가하고 웹 타입 검사, 관련 Vitest, 변경 파일 Ultracite, `git diff --check`를 통과시킨다.
- 아래 3개 작업 영역별로 커밋을 분리하되 브랜치와 PR은 추가 분리하지 않는다.

## 이슈 문구

> 구직자 배포 검수 오류(버그/모바일): 채팅에서 면접 상태를 확정·완료해도 내 정보의 예정된 면접 캐시가 즉시 갱신되지 않고, 비회원 인증 버튼 문구가 실제 동작을 충분히 설명하지 못하며, 모바일 채팅 제목이 액션 배지에 밀려 잘리고 공고 신고 상세 입력란이 소프트 키보드에 가려짐 — 면접 목록 쿼리 무효화와 `면접 완료` 표기, `비회원으로 인증하기` 문구 적용, 모바일 채팅 헤더 재배치 및 동적 뷰포트 기반 신고 Dialog 스크롤 보완

---

## Task 1: 면접 예정 목록 캐시와 완료 의미 보완

**Files:**

- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.test.ts`

**Interfaces:**

- `setInterviewStatusMutation.onSuccess`는 기존 `invalidateRoom()`과 함께 `orpc.bambi.chats.listMyUpcomingInterviews.queryKey()`를 무효화한다.
- 서버의 예정 목록 조건인 `status IN ('proposed', 'confirmed') AND scheduledAt >= now`는 유지한다.
- `confirmed`는 재조회 후 목록에 포함되고 `completed`는 재조회 후 제외된다.
- 채팅 카드의 `completed` 전환 버튼 문구만 `면접 완료`로 변경한다.

- [x] 쿼리 무효화와 버튼 문구 회귀 테스트를 먼저 추가한다.
- [x] 상태 변경 성공 시 채팅방과 예정 면접 목록을 모두 갱신한다.
- [x] 버튼 문구를 `면접 완료`로 변경한다.
- [ ] 관련 테스트와 웹 타입 검사를 통과시킨다.
- [ ] `fix: 면접 예정 목록 상태 갱신 보완` 커밋으로 분리한다.

## Task 2: 비회원 인증 문구와 모바일 채팅 헤더

**Files:**

- Modify: `apps/web/src/components/bambi/auth/auth-panel.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Create: `apps/web/src/components/bambi/screens/seeker-mobile-copy-layout.test.ts`
- Modify: `docs/manual/seeker-manual.md`
- Modify: `docs/test-flows/seeker-test-flow.md`

**Interfaces:**

- `PhoneVerifyDialog`의 guest `triggerLabel`만 `비회원으로 인증하기`로 변경한다.
- 모바일 채팅 헤더는 제목 영역과 액션 영역을 두 행으로 분리한다. 제목은 `min-w-0`, 단어 줄바꿈, 최대 두 줄을 사용한다.
- `sm` 이상에서는 기존처럼 한 행에 가까운 배치를 유지하되, 좁아지면 안전하게 wrap한다.
- 목록 버튼, 상대 이름, 업종·지역, 공고 보기, 차단·대화 상태, 실시간 상태의 데이터와 클릭 동작은 바꾸지 않는다.

- [ ] 문구와 모바일 레이아웃 회귀 테스트를 먼저 추가한다.
- [ ] 비회원 버튼 문구와 사용자 매뉴얼·테스트 플로우를 동기화한다.
- [ ] 모바일 제목과 액션을 분리하고 제목을 최대 두 줄로 표시한다.
- [ ] 관련 테스트와 웹 타입 검사를 통과시킨다.
- [ ] `fix: 비회원 문구와 모바일 채팅 헤더 정리` 커밋으로 분리한다.

## Task 3: 모바일 공고 신고 입력창 키보드 가림 해소

**Files:**

- Modify: `apps/web/src/components/bambi/report-dialog.tsx`
- Modify: `apps/web/src/components/bambi/safety-kit.tsx`
- Create: `apps/web/src/components/bambi/report-dialog-mobile.test.ts`

**Interfaces:**

- 공고 신고를 포함한 공용 `ReportDialog`의 `DialogContent`에 동적 뷰포트 기준 최대 높이를 적용한다.
- Dialog 내부의 기존 `overflow-y-auto`·`overscroll-contain`을 그대로 활용해 키보드가 열리면 폼 내부가 스크롤되게 한다.
- 상세 textarea에는 포커스 시 브라우저가 스크롤 대상으로 인식할 여백과 `scrollIntoView({ block: 'nearest' })`를 제공한다.
- 신고 사유, 상세 내용, 취소·신고 접수 동작과 데스크톱 중앙 Dialog 표현은 유지한다.

- [ ] 동적 뷰포트 최대 높이와 입력란 포커스 회귀 테스트를 먼저 추가한다.
- [ ] ReportDialog 최대 높이와 ReportForm textarea 스크롤 동작을 구현한다.
- [ ] 관련 테스트와 웹 타입 검사를 통과시킨다.
- [ ] `fix: 모바일 신고 입력창 키보드 가림 수정` 커밋으로 분리한다.

## 최종 검증

- [ ] `confirmed` 변경 직후 `/seeker/me/interviews`에 일정이 나타난다.
- [ ] `면접 완료` 변경 직후 같은 일정이 예정 목록에서 사라진다.
- [ ] 로그인 화면의 버튼이 `비회원으로 인증하기`이고 기존 인증·게스트 이동이 동일하다.
- [ ] 320~430px 모바일 폭에서 긴 공고 제목이 최대 두 줄로 보이고 액션·상태가 아래 줄에 표시된다.
- [ ] Android Chrome에서 공고 신고 상세 입력란을 누르면 키보드 위에 입력란이 보이며 폼을 스크롤해 취소·접수 버튼까지 접근할 수 있다.
- [ ] 관련 Vitest, `pnpm --filter web check-types`, 변경 파일 Ultracite, `git diff --check` 통과.
- [ ] 이슈 본문과 PR 본문에 검증 결과를 기록하고 PR에 `Closes #<issue-number>`를 넣는다.

## PR 초안

**제목:** `fix: 구직자 면접·모바일 배포 검수 오류 수정`

**본문 구성:**

- 면접 확정·완료 후 예정 목록 캐시 즉시 갱신 및 `면접 완료` 문구 적용
- 비회원 인증 버튼 문구 변경
- 모바일 채팅 제목·상태 영역 반응형 재배치
- 모바일 신고 Dialog 동적 뷰포트·키보드 스크롤 보완
- 자동·수동 검증 결과
- `Closes #<issue-number>`
