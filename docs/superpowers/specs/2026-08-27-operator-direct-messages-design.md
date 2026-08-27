# 운영자 쪽지(다이렉트 메시지) 설계 (2026-08-27)

운영자가 구직자(법률자문가 포함)·구인자에게 쪽지를 보내고, 수신자는 쪽지함에서
읽고 보관·삭제하며, 쪽지 도착 시 기존 알림 파이프라인(SSE·OS 배너·벨 배지)으로
알림을 받는다.

## 확정 결정

- **답장 없음(수신 전용).** 답장이 필요하면 기존 문의 채팅으로 유도한다.
- **발송 대상**: 역할 단위(구직자만 / 구인자만 / 둘 다) + 특정 사용자 지정,
  두 방식을 섞어 쓸 수 있다. "구직자" 선택 시 `legal_advisor` 역할을 포함한다.
  `admin`·`guest`는 브로드캐스트 대상에서 제외한다.
- **수신자 측 보관·삭제 제공.** 삭제는 소프트 삭제 — 운영자의 발송 이력·읽음
  통계는 남는다.
- 문의 채팅(support-chat)은 재사용하지 않는다. 양방향 대화 + 7일 파생 종료
  구조라 일방 발송 모델과 맞지 않는다.

## 재사용하는 기존 구조

- 알림 파이프라인 전체: `bambi_notification` + `notifyBambiNotification()`(best-effort)
  + SSE(`bambi-notification-stream.ts`) + OS 배너 + 벨 배지(`notification-bell.tsx`)
  + 라벨·딥링크 맵(`notification-labels.ts`). 쪽지 알림은 `notification_target_type`
  enum 값 `direct_message` 하나 추가로 이 전체를 그대로 탄다.
- 알림함이 전 역할 공용 단일 경로(`/seeker/notifications`)인 패턴 — 쪽지함도
  동일하게 단일 경로 하나로 만든다.

## 1. DB (마이그레이션 0112, drizzle generate)

본문 1행 + 수신자 행 분리. 역할 브로드캐스트 시 본문을 수신자 수만큼 복제하지
않고, 수신자별 읽음·보관·삭제 상태는 수신자 행에만 둔다.

### `bambi_direct_message` (본문)

| 컬럼 | 내용 |
|---|---|
| id | uuid PK |
| senderUserId | 발송 운영자 (FK user, on delete **set null** — 운영자 탈퇴에도 쪽지는 남는다) |
| targetRoles | text[] — 발송 시 선택한 역할 스냅샷(표시용; `["job_seeker"]`, `["job_seeker","employer"]`, 개별 발송만이면 `[]`) |
| title | text not null |
| body | text not null |
| createdAt | timestamp defaultNow not null |

### `bambi_direct_message_recipient` (수신자별 상태)

| 컬럼 | 내용 |
|---|---|
| messageId | uuid FK → bambi_direct_message (cascade) |
| recipientUserId | text FK → user (cascade) |
| readAt | timestamp null — null이면 안읽음 |
| archivedAt | timestamp null — 보관함으로 이동 |
| deletedAt | timestamp null — 소프트 삭제(수신자 화면에서만 사라짐) |
| createdAt | timestamp defaultNow not null |

- PK: `(messageId, recipientUserId)`
- 인덱스: `(recipientUserId)` — 쪽지함 목록·카운트가 내 행만 읽는다.
  안읽음 카운트용 부분 인덱스
  `(recipientUserId) WHERE read_at IS NULL AND deleted_at IS NULL`.
- `notification_target_type` enum에 `direct_message` 추가.

## 2. API — 새 라우터 `routers/bambi/direct-messages.ts`

`bambi/index.ts`에 `directMessages`로 등록.

### 운영자 (adminProcedure)

- `send({ roles?: ("job_seeker" | "employer")[], recipientUserIds?: string[], title, body })`
  - 수신자 해석: `roles`의 역할 보유 계정 전체(`job_seeker` 선택 시
    `legal_advisor` 포함) ∪ `recipientUserIds`, 중복 제거. 둘 다 비면 에러.
  - 트랜잭션으로 본문 1행 + 수신자 행 N개 insert(대량 발송 대비 청크 insert).
  - 커밋 후 수신자마다 `notifyBambiNotification({ targetType: "direct_message",
    targetId: messageId, recipientUserId, actorUserId, metadata: { title } })`
    — best-effort라 알림 실패가 발송을 깨지 않는다.
- `listSent({ cursor })`: 발송 목록 — 제목·발송 시각·대상 요약(역할 스냅샷 +
  수신자 수)·읽음 수(수신자 행 집계). 소프트 삭제된 수신자 행도 집계에 포함.
- `sentDetail({ messageId })`: 수신자별 읽음 여부 목록(운영자 확인용).

### 수신자 (protectedProcedure)

- `listMine({ tab: "inbox" | "archived", cursor })`: 내 수신자 행 join 본문,
  `deletedAt IS NULL` 고정, inbox는 `archivedAt IS NULL` / archived는 반대.
- `unreadCount()`: 부분 인덱스를 타는 카운트.
- `read({ messageId })`: 상세 반환 + `readAt` 없으면 지금으로 기록(열람 = 읽음).
- `archive({ messageId, archived: boolean })`: 보관/보관 해제.
- `remove({ messageId })`: `deletedAt` 기록(소프트).

수신자 해석·상태 전이 같은 순수 로직은 서비스(`services/bambi-direct-messages.ts`)로
분리해 `packages/api/test/services`에서 테스트한다(라우터 스위트는 dev DB를
지우므로 만들지 않는다 — 기존 규칙).

## 3. 웹

### 쪽지함 `/seeker/messages` (전 역할 공용)

- 탭: 받은 쪽지 / 보관함. 목록 행: 제목·발송 시각·안읽음 표시, 열면 상세
  (Dialog 또는 확장)와 동시에 읽음 처리. 행 액션: 보관(해제)·삭제(확인 다이얼로그).
- 마이페이지 메뉴·persona-nav에 "쪽지함" 항목 + 안읽음 배지
  (알림 벨과 별개 배지, `unreadCount` 폴링은 기존 알림 SSE 수신 시 무효화로 갱신).
- 기존 shadcn 컴포넌트 재사용, 모바일 반응형 포함.

### 알림 연동

- `bambi-notification-stream.ts` 리터럴 유니온에 `direct_message` 추가
  (DB enum과 값 복제 규칙 — 파일 상단 주석 관례).
- `notification-labels.ts`: `direct_message` → 제목 "운영자 쪽지가 도착했어요",
  본문 `metadata.title`, 딥링크 `/seeker/messages`.

### 운영자 `/moderator/messages`

- 새 쪽지 작성: 대상 역할 체크박스(구직자[법률자문가 포함] / 구인자) +
  특정 사용자 검색 멀티선택(이름·역할 표시), 제목·본문 입력, 발송 전
  "N명에게 발송" 확인.
- 발송 목록: 제목·발송 시각·대상 요약·읽음 수, 행 클릭 시 수신자별 읽음 여부.
- `/moderator/users` 행 액션에 "쪽지 보내기" 진입점(해당 사용자가 미리 선택된
  작성 화면으로 이동).
- moderator 좌측 내비에 "쪽지" 메뉴 추가.

## 4. 매뉴얼 동기화

- moderator-manual: 쪽지 발송·발송 이력 섹션.
- seeker-manual / employer-manual: 쪽지함·알림·보관·삭제 안내.

## 범위 제외 (후속)

- 답장·수신자 간 쪽지(사용자 → 사용자, 사용자 → 운영자).
- 예약 발송·임시저장·발송 취소.
- 운영자 측 발송 이력 삭제.

## 테스트

- 서비스 단위 테스트(`packages/api/test/services`): 수신자 해석(역할 합집합·
  legal_advisor 포함·중복 제거·admin/guest 제외), 상태 전이(읽음·보관·소프트 삭제),
  빈 대상 에러.
- 웹 컴포넌트 테스트(`apps/web/test` 미러 구조): 쪽지함 탭 필터·라벨 맵
  (`direct_message` 제목·딥링크).
- 검증: ultracite(경로 인자 필수) + check-types, 시각 확인은 사용자가 HMR로.
