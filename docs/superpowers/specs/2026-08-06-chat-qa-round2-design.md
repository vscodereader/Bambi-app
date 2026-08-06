# 채팅 QA 2차 + 메시지 파이프라인 정비 설계 (2026-08-06)

로컬 QA 6건과 설계 검토에서 합의한 구조 개선 2건. 기준 브랜치 `fix/chat-prod-qa`,
작업 워크트리 `chat-qa-round2`. Cloud Run 설정 변경(--concurrency 등)은 이번 범위에서 제외.

## 1. 채팅 토스트 제거

`use-bambi-notification-stream.ts`의 "새 메시지가 도착했어요" 토스트(+보러 가기)를 제거한다.
SSE 수신과 안읽음·목록 캐시 무효화는 유지 — 알림 채널은 뱃지(핀)만 남긴다.
이 제거로 고아가 되는 코드(연속 토스트 접기 등)는 함께 정리한다.

## 2. 채팅방 내부 스크롤

방 화면이 내용만큼 세로로 자라는 문서 스크롤 구조를 뷰포트 고정 + 메시지 영역만
`overflow-y-auto` 내부 스크롤로 바꾼다. 새 메시지 수신 시 하단 고정(사용자가 위로
스크롤 중이면 위치 유지), "이전 메시지 더 보기"는 내부 스크롤 상단에서 동작.
모바일 사이즈 포함. px 임의값 금지(Tailwind 토큰).

## 3. 보고 있는 방 자동 읽음

기준: **탭 활성(visibilitystate visible) + 방 화면 표시 중**일 때만.
이 상태에서 소켓으로 수신된 상대 메시지는 즉시 markRead(기준선) 호출 + 안읽음 캐시
동기화로 핀이 아예 생기지 않아야 한다. 백그라운드 탭이면 핀이 뜨고, 탭 복귀 시 읽음 처리.
현재 결함: markRead가 방 데이터 로드 기준(lastVisibleMessageId effect)으로만 발화.

## 4. 재문의 시 방 부활 (정책 확정)

업주가 나간 방에 구직자가 `startFromJobPost`로 재문의하면 기존 방을 재사용하며
**양쪽 deletedAt을 리셋**해 부활시킨다(업주 목록에도 재노출). 지난 "재문의 영구 불가"
정책을 뒤집는 확정. 방 안 일반 발신의 상대 나감 차단(counterpart_left)은 유지.
유니크 제약(공고×구직자 방 1개)과 스키마는 그대로. "새 방" 안은 방 증식 벡터와
리모델링 규모 때문에 기각.

## 5. 가입 폼 정렬

아이디 필드 아래 한국어 안내 문구가 옆 닉네임 필드 정렬을 깨뜨리는 문제(auth-fields.tsx).
행 정렬 기준을 맞춰 해결. 시각 확인은 사용자가 한다(스크린샷·dev 서버 금지).

## 6. 푸터·게시판 CTA

- `/jobs/*`, `/board/*` 라우트에서만 SiteFooter 제거(각 layout.tsx). 다른 영역 유지.
- `/board`의 비회원 "본인인증하고 글쓰기" CTA 제거(목록·write 페이지). 비회원이
  `/board/*/write` 직접 진입 시 인증 게이트 대신 로그인 안내. 수다방 쪽 비회원 흐름은 유지.

## 7. 메시지 id 승격 — 정렬·중복·커서의 기준

- 공유 유틸 `@bambi-app/api/services/bambi-chat-message-id`의 `generateChatMessageId()`
  (UUIDv7, 브라우저·Node 공용) — 이미 생성됨, 계약 고정.
- 클라이언트가 전송 전에 id 생성해 요청에 포함. 서버는 zod `.uuid()` 검증 후 그 id로
  INSERT, PK `onConflictDoNothing`으로 재시도·더블클릭 흡수(기존 행 반환, 부수효과 재실행
  금지, 방·발신자 불일치면 CONFLICT). 서버발 메시지(contact_request)는 서버가 같은 유틸 사용.
  스키마 `defaultRandom()`은 안전망으로 유지.
- 전 조회 정렬을 `ORDER BY (created_at, id)` 총순서로 통일. 방 이력 "더 보기"를
  limit 확장(상한 500) 대신 `(created_at, id)` keyset 커서로 교체 → 상한 해제.
  `(chat_room_id, created_at)` 인덱스 활용. 적용 범위는 구직자·업주 방 화면
  (운영자 열람 화면은 기존 유지). 화면은 id 기준 중복 append 방어.
- 정렬 정본은 DB createdAt(서버 시각). id 내 타임스탬프는 클라이언트 시계라 신뢰하지 않음.

## 8. 채팅 메시지 전용 동기화 큐 (transactional outbox)

**채팅 메시지 전용** 큐 — 범용 이벤트 버스로 일반화하지 않는다.

- 테이블 `chat_message_sync_queue`: 메시지 INSERT와 **같은 트랜잭션**으로 이벤트 행 기록
  (roomId, messageId, senderUserId, createdAt 페이로드 + attempts).
- 커밋 직후 인프로세스 컨슈머를 직접 호출(체감 지연 0). 컨슈머가 기존 전파 로직 수행:
  프레즌스 판정 → 방 접속 중이면 소켓 전달 / 아니면 bambi_notification 생성 → SSE 뱃지.
- 처리 성공 행은 즉시 삭제. 실패는 attempts 증가, 부팅 시 + 저빈도 주기 스윕이 재시도,
  3회 초과는 로그만. at-least-once 중복은 7번 id로 화면이 방어.
- 인터페이스는 enqueue/drain으로 좁혀 나중에 Redis Stream 구현체로 교체 가능하게.
- 핀 숫자의 정본은 DB 집계(anti-join) 유지 — 큐 이벤트는 재계산 신호일 뿐, 증감 누적 금지.
- 마이그레이션 1건(0069) 필요 — 컨트롤러가 db:generate/migrate 수행.

## 검증 기준

- 순수 vitest(services·web 단위) 추가, routers/bambi DB 의존 스위트는 실행 금지.
- 4패키지 check-types + ultracite(경로 인자) 통과.
- 트랙별 커밋 후 `fix/chat-prod-qa`에 no-ff 병합. push·PR 금지.
