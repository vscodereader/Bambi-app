# Native 구직자 채팅 최신 develop 동등성 설계

## 기준과 목표

브랜치: feat/native-seeker-chat-parity
최초 기준: origin/mobile 64c11018

현재 mobile 채팅은 목록, 미읽음, 실시간 메시지, 읽음, 입력 중, 첨부, 연락처 공개 응답, 면접 응답, 신고, 차단과 나가기를 지원한다. 최신 develop의 접속 상태, 평균 응답시간, 공고 및 면접 정보, 인증 연락처와 면접 확정 확인 정책을 추가한다.

## 네이티브 기술 원칙

최신 develop 웹 채팅의 기능, 표시 정보, 배치 순서, 문구, 권한, 상태 우선순위와 확인 결과를 그대로 유지하고 표현 기술만 native로 변환한다.

- Expo SDK 56, expo-router, HeroUI Native와 Uniwind를 사용한다.
- apps/web의 ChatAvailabilityBadges, ChatActionConfirmation, Sheet와 CSS를 native에서 import하거나 복사하지 않는다.
- 같은 동작을 기존 native chat 컴포넌트와 HeroUI Native Dialog, BottomSheet로 구현한다.
- develop 코드는 API 필드, 상태 우선순위, 확인 결과와 문구를 확인하는 자료로만 사용한다.
- 공유 서비스는 React나 DOM 의존성이 없는 packages/api 모듈만 사용한다.
- web Sheet와 AlertDialog는 HeroUI Native BottomSheet와 Dialog, Next navigation은 expo-router, browser visibility는 AppState와 screen focus로 치환한다.

이 브랜치는 다른 구직자 브랜치 없이 기존 공고 상세과 채팅 경로에서 단독 검증되어야 한다.

## 최신 develop에서 반영할 계약

- packages/api chats의 counterpartIsOnline
- counterpartPresenceRefreshAt
- counterpartResponseBucket
- viewerIsOnline과 viewerPresenceRefreshAt
- bambi-chat-presence, bambi-chat-response-policy, bambi-chat-response
- user presence 저장 및 SSE 정책
- migration 0117_chat-response-activities.sql
- web ChatAvailabilityBadges와 ChatActionConfirmation 동작

현재 mobile migration은 0114까지다. 운영자 PR이 0115와 0116을 병합하기 전에는 이 브랜치에서 migration 번호를 확정하지 않는다. 구현 시작 시 최신 mobile의 journal과 SQL 파일을 읽고 0117이 그대로 비어 있을 때만 develop의 0117을 사용한다. 번호가 사용됐으면 Drizzle 규칙대로 다음 번호로 재생성하고 문서도 갱신한다.

## 구현 범위

### presence와 응답시간

- 앱 로그인 세션의 presence connect, renew, disconnect를 AppState와 session lifecycle에 연결
- 다중 기기 및 재연결 정책은 develop 공유 서비스를 그대로 사용
- 목록과 방에서 상대 온라인 또는 오프라인 표시
- 양쪽이 온라인이고 현재 socket이 연결됐을 때만 실시간 연결 표시
- 상대가 오프라인이고 응답 표본이 있을 때 평균 응답시간 bucket 표시
- 차단, 신고 검토, 탈퇴 상태가 presence보다 우선
- 오래된 presence 값을 화면에서 임의 시간으로 판정하지 않고 서버 결과 사용

PR 355가 먼저 mobile에 병합돼 같은 lifecycle이 존재하면 중복 구현하지 않고 그 파일을 재사용하고 구직자 채팅 소비만 추가한다.

### 목록

- 기존 ChatRoomListItem에 availability badges 추가
- 공고 제목, 상대 이름, 마지막 메시지, 미읽음과 상태 표시 유지
- 소켓 연결과 focus 복귀 재조회 유지
- presence 갱신이 메시지 목록 전체를 불필요하게 초기화하지 않도록 query update 범위 제한

### 채팅방 정보

- 채팅방 헤더의 정보 버튼으로 여는 HeroUI Native BottomSheet에서 공고 상세 이동
- 공고 공개, 비공개, 삭제 상태에 따라 링크 활성 상태 구분
- 공고 급여, 지역, 시간, 업종 요약
- 면접 일정 전체 목록과 상태
- 구직자에게 인증된 구인자 연락처 표시 및 전화 연결
- 연락처가 없거나 미인증이면 해당 행 숨김
- 연락처 보호, 신고와 차단 안내

### 면접 확정 확인

- 채팅 시스템 카드와 내 정보의 예정된 면접에서 confirmed mutation 전 동일 확인 UI 사용
- 확인 선택 시 confirmed
- 취소 선택 시 최신 develop 정책대로 declined
- 닫기 동작은 상태 변경 없이 확인창만 닫음
- pending 동안 모든 결정을 잠그고 중복 mutation 방지
- 실패 시 확인 대상을 유지하거나 사용자가 다시 시도할 수 있는 명확한 오류 제공

연락처 공개 확인도 최신 develop과 맞춘다. 확인은 reveal, 본문의 취소는 decline이며, 우상단 닫기와 Android back은 상태 변경 없이 창만 닫는다. 현재 mobile은 취소 버튼도 창만 닫으므로 이 브랜치에서 교정한다. 연락처와 면접은 같은 공통 상태 모델을 재사용한다.

## 예정 파일

- 수정: apps/native/app/_layout.tsx
- 수정: apps/native/src/lib/orpc.ts
- 수정: apps/native/src/components/chat/chat-rooms-screen.tsx
- 수정: apps/native/src/components/chat/chat-room-list-item.tsx
- 수정: apps/native/src/components/chat/chat-room-screen.tsx
- 수정: apps/native/src/components/chat/chat-room-header.tsx
- 수정: apps/native/src/components/chat/chat-system-card.tsx
- 수정: apps/native/app/(seeker)/me/interviews.tsx
- 추가: apps/native/src/components/chat/chat-availability-badges.tsx
- 추가: apps/native/src/components/chat/chat-action-confirmation.tsx
- 추가: apps/native/src/components/chat/chat-room-info-sheet.tsx
- 추가 또는 재사용: apps/native/src/components/user-presence-lifecycle.tsx
- 추가: apps/native/src/lib/chat/chat-availability.ts
- 최신 mobile 상태에 따라 API service, router, server plugin, DB migration 반영

## 독립성

- job detail 브랜치의 preflight나 후기 컴포넌트를 사용하지 않는다.
- 공고 이동은 현재 존재하는 jobs/[id] route를 사용한다.
- support와 community 알림이나 화면을 참조하지 않는다.
- presence 기반이 최신 mobile에 없으면 이 브랜치가 필요한 전체 계약을 포함한다.

## 테스트

- chat-availability.test.ts
  - 양쪽 온라인, socket 단절, 상대 오프라인, 응답 표본 없음, 차단, 탈퇴
- chat-action-confirmation.test.ts
  - 연락처와 면접 확인, 취소의 decline 및 declined 변환, 닫기, pending, 실패
- chat-room-info.test.ts
  - 공고 활성, 비공개, 삭제, 일정 정렬, 인증 연락처
- 기존 chat realtime, unread, typing, optimistic, errors 테스트 회귀
- packages/api chat response, realtime, router 테스트
- DB migration check와 재생성 결과 확인

실측:

- 두 계정으로 온라인 및 오프라인 전환
- 평균 응답시간 배지
- 앱 background 및 foreground
- 면접 확인, 취소, 닫기, 네트워크 실패
- 공고 링크와 인증 전화번호

## 검증

- migration 번호, journal, snapshot, 적용 이력 확인
- db:push 사용 금지
- native, API, server 타입 검사
- 관련 Vitest와 Drizzle check
- Android 두 세션 실측
- 변경 파일 Ultracite와 git diff --check
- 최신 origin/mobile 재반영 후 전체 재검증

## 2026-09-10 구현 및 검증 기록

- 최신 develop의 presence lifecycle, server SSE 연결, 사용자 presence API와 0115 migration을 현재 mobile 기반 native에 반영했다.
- 동적 수집 게시판 0116과 채팅 응답 활동 0117의 schema, snapshot과 journal을 순서대로 포함했다.
- chats 목록과 상세 응답에 상대 및 내 온라인 상태와 평균 응답 bucket을 연결했다.
- native 목록과 채팅방에 대화 가능, 오프라인, 실시간 연결, 평균 응답과 차단 및 탈퇴 우선 배지를 추가했다.
- 채팅방 정보 BottomSheet에 공고 상태와 이동, 급여, 지역, 업종, 근무시간, 면접 목록과 인증 연락처를 구현했다.
- 연락처 공개와 면접 확정에 공통 확인창을 적용했다. 본문의 취소는 실제 거절, 창 닫기는 상태 유지다.
- 내 정보의 예정된 면접 수락에도 같은 확인 정책을 적용했다.
- native와 server check-types 통과.
- native chat 관련 4 files, 22 tests 통과.
- native 전체 Vitest 38 files, 383 tests 통과.
- API presence, response, realtime 3 files, 25 tests 통과.
- native와 server check-types 통과. API check-types에는 이 브랜치 비변경 기존 bambi-job-media-policy 테스트의 undefined 오류 3건만 남아 있다.
- drizzle-kit check 결과 Everything's fine.
- 저장소 전체 Ultracite는 기존 web exhaustive-deps info 1건과 seed suppression warning 2건 외 오류 없이 통과했다.
## Android Studio AVD 검증 (2026-09-10)

- 빈 방 숨김, 첫 메시지 뒤 목록 노출, 메시지 송신, 읽지 않음 갱신, 오프라인과 대화 가능·실시간 연결 표시를 확인했다.
- 공고·면접 정보 패널의 공고 정보, 면접 일정, 인증 연락처를 확인했다.
- 면접 제안 확인창의 거절 결과와 별도 제안의 확정 결과를 확인했다.
- `pnpm --filter native test`: 38 files / 384 tests 통과. presence·응답시간 서비스 13 tests, native 타입 검사, Drizzle check, Ultracite, `git diff --check` 통과.
## 2026-09-11 독립성 재감사

- 다른 구직자 PR을 base로 사용하거나 해당 화면·컴포넌트를 import하지 않는다.
- migration 0116과 수집 커뮤니티 schema/API가 포함된 이유는 최신 develop의 확정 순서가 0115 presence → 0116 crawled community → 0117 chat response이기 때문이다. 0116을 생략하거나 다른 내용으로 재사용하면 mobile을 develop에 합칠 때 migration 번호와 snapshot이 충돌한다.
- UI 범위는 구직자 채팅이며 구인자·운영자 전용 route 또는 화면은 추가하지 않는다. 채팅 room과 server realtime은 양측이 공유하는 기존 계약이라 공용 계층에서만 변경한다.
