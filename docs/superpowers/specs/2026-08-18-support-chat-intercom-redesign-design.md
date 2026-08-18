# 문의 채팅 인터콤 스타일 개편 설계 (2026-08-18)

운영자 실시간 문의 채팅(2026-08-18-operator-support-chat-design.md로 구현 완료)의
위젯·운영자 콘솔을 인터콤(Intercom) 스타일로 개편한다. 사용자 확정 결정:

- **여러 대화 스레드**: 1인 1방을 폐기하고, 대화가 종료되면 새 대화를 시작할 수 있다.
  과거 대화는 위젯 메시지 탭에 목록으로 남는다.
- **홈 탭 구성**: 인사말 + "메시지를 보내주세요" 버튼, FAQ 바로가기 카드, 공지/상태
  배너. (도움말 검색은 미채택.)
- **대화 종료**: 운영자 명시 종료 + 자동 종료(마지막 메시지 후 7일 무활동).
  문의자는 언제든 새 대화를 시작할 수 있다.

폴링·알림·익명 쿠키 신원 체계는 기존 설계를 그대로 쓴다. 소켓·SSE 무변경.

## 1. 데이터 모델 (마이그레이션 0094)

### support_chat_room 변경

- **부분 유니크 2개 삭제**: `support_chat_room_user_id_uidx`,
  `support_chat_room_guest_id_uidx` → 1인(축) N방 허용.
- **`status` 컬럼 추가**: 새 enum `support_chat_room_status` = `open` | `closed`,
  default `open` not null.
- **`closed_at` timestamp 추가**(nullable): 운영자 종료 시각. 자동 종료는 기록하지
  않는다(파생 판정이라 행이 안 바뀐다).
- **목록 조회 인덱스 추가**: `(user_id, last_message_at)`, `(guest_id, last_message_at)`.
- CHECK(owner one-of)·워터마크 2개·isBlocked·lastMessageAt은 유지.

### 자동 종료 = 파생 판정 (cron 없음)

`유효 종료(effectively closed) = status = 'closed' OR lastMessageAt < now − 7일`.

- 조회(문의자 목록·운영자 목록/상세)와 발신 검증 시점에 계산한다. DB 배치·cron이
  없어 구조가 단순하고, 행이 바뀌지 않으니 동시성 문제도 없다.
- 문의자가 유효 종료된 방에 발신 시도 → 409 CONFLICT. 위젯은 이를 받으면 "새 대화
  시작" 흐름으로 안내한다.
- 운영자가 유효 종료된 방에 발신 → **자동 재개**: `status='open', closedAt=null`로
  되돌리고 lastMessageAt 갱신(7일 창도 자연히 리셋). 실수로 닫아도 답변으로 살린다.

### 차단은 소유자 축

방 단위 isBlocked를 그대로 두되 **판정·적용을 소유자(userId 또는 guestId) 축으로**
바꾼다 — 방 단위로 두면 새 대화 생성으로 차단을 우회한다.

- `admin.setBlocked`: 해당 방 소유자의 **모든 방**에 isBlocked를 일괄 적용.
- 문의자 발신·새 대화 생성 검증: "그 소유자의 방 중 isBlocked인 방이 하나라도
  있으면" 403. (컬럼 이동 없이 우회를 막는 최소 변경.)

### bambi_site_settings

`support_chat_notice`(text, nullable) 컬럼 추가 — 위젯 홈 탭 공지 배너 문구.
null/빈 값이면 배너를 그리지 않는다.

## 2. API (packages/api/src/routers/bambi/support-chat.ts)

### 문의자 측 — getMyRoom 폐기, 대화 목록 구조로 교체

- `getMyRooms` (publicProcedure, 입력 없음): 내 대화 목록. 신원 없으면 `{ rooms: [] }`.
  각 방: `{ id, status: "open"|"closed"(유효 상태), lastMessageAt, lastMessagePreview,
  unreadCount, createdAt }`, lastMessageAt 내림차순. 미읽음 합계는 위젯이 클라에서
  합산해 뱃지에 쓴다.
- `getRoomMessages` (publicProcedure, `{ roomId }`): 소유 검증(신원 축 + id 일치) 후
  `{ room: { id, isBlocked, status }, messages }`. 대화 뷰 폴링 대상.
- `sendMessage` (`{ body, roomId? }`): `roomId` 없으면 **새 대화 생성**(소유자 차단
  검사 → 방 insert → 메시지 insert), 있으면 소유·유효 open·차단 검증 후 발신.
  반환 `{ id, roomId }` — 새 대화 첫 발신 후 위젯이 대화 뷰를 그 roomId로 고정한다.
  레이트리밋(10/분, 회원 1축·게스트 sid+IP 2축)은 그대로 — 방 생성도 발신에서만
  일어나므로 방 양산 리밋을 겸한다.
- `markRead` (`{ roomId }`): 소유 검증 후 해당 방 userLastReadAt 갱신.
- `getWidgetHome` (publicProcedure, 입력 없음): 홈 탭 데이터 1회 호출.
  `{ notice: string|null, faqs: { id, question }[] }` — 사이트 설정의
  supportChatNotice + 게시된(isPublished) FAQ를 sortOrder 순 상위 5개.
  게시 FAQ는 공개 콘텐츠라 인증 불요(기존 listFaq는 protectedProcedure로 유지).

### 운영자 측

- `admin.listRooms` (`{ page, status: "open"|"closed" }`): 유효 상태로 필터(SQL로
  `status='closed' OR last_message_at < now()-interval '7 days'` / 그 부정).
  기존 미읽음·미리보기 배치 쿼리에 더해, 페이지 내 방 소유자별 **총 대화 수**
  (`ownerRoomCount`)를 한 방 쿼리로 병기 — 콘솔이 "대화 N개"를 표시한다.
- `admin.getRoom`: room payload에 `status`(유효 상태)·`closedAt` 추가.
- `admin.sendMessage`: 유효 종료 방이면 재개(status='open', closedAt=null) 후 발신.
- `admin.setClosed` (`{ roomId, closed: boolean }`) 신설: status/closedAt 토글.
- `admin.setBlocked`: 소유자 축 일괄 적용으로 변경(위 1절).
- 알림: 기존 에지 트리거(수신측 미읽음 0→1)·타깃 규칙 그대로, 방 단위 유지.

## 3. 위젯 (apps/web/src/components/bambi/support-chat/)

패널을 3개 뷰 + 하단 2탭(홈·메시지)으로 개편한다. 파일 분리:

- `support-chat-widget.tsx` — 셸: 런처 버튼(레일 앵커 포털/fixed 폴백 로직 **보존**),
  mounted·?auth= 숨김·딥링크·폴링 게이트, 뷰 상태 라우팅.
- `widget-home.tsx` — 홈 뷰: 인사 카드("안녕하세요 👋 무엇을 도와드릴까요?"), 공지
  배너(notice 있을 때만), "메시지를 보내주세요" 버튼(진행 중 최신 대화가 있으면 그
  대화로, 없으면 새 대화), FAQ 카드 목록(클릭 시 `/support` 이동, 패널 닫기).
- `widget-messages.tsx` — 메시지 뷰: 대화 목록(미리보기·상대시간·미읽음 뱃지),
  하단 "메시지를 보내주세요" 버튼(새 대화).
- `widget-conversation.tsx` — 대화 뷰: 뒤로가기 헤더 + 기존 말풍선/입력 UI.
  유효 종료 대화면 입력창 대신 "종료된 대화예요" 안내 + "새 대화 시작" 버튼.
  발신 409(종료 경합) 수신 시에도 같은 안내로 전환.

뷰 상태: `{ name: "home" } | { name: "messages" } | { name: "conversation",
roomId: string | null }` (null = 새 대화, 첫 발신 성공 시 반환 roomId로 고정).

폴링: 뱃지·목록은 getMyRooms(패널 닫힘 30초/열림 3초), 대화 뷰는 getRoomMessages
3초. markRead는 대화 뷰에서 미읽음>0일 때. 딥링크 `?support-chat=1`은 홈 뷰로 연다.

## 4. 운영자 콘솔·설정

- `/moderator/support-chats`: 목록 상단에 **진행 중/종료 탭**(listRooms status
  입력). 방 카드에 종료 뱃지·"대화 N개"(ownerRoomCount>1일 때) 병기. 상세 헤더에
  종료/재개 버튼(setClosed). 차단 토글 문구를 "문의자 발신 잠금"(소유자 축)으로.
  종료 방 컴포저에 "답변을 보내면 대화가 다시 열려요" 안내.
- `/moderator/site-settings`: "문의 채팅" 카드 신설 — 공지 문구 Textarea(300자,
  빈 값 = 미설정). 라우터에 admin 조회·저장 프로시저 추가.

## 5. 테스트·검증·문서

- 순수 헬퍼 TDD: `isSupportChatRoomEffectivelyClosed({ status, lastMessageAt }, now)`
  (7일 상수 포함) 신설 + 기존 supportChatSendKeys·알림 타깃 테스트 유지.
- 라우터 테스트 스위트(`test/routers/bambi`)는 dev DB를 지우므로 실행 금지.
- web tsc·ultracite(경로 인자 필수)로 검증. dev 서버·빌드 기동 금지(HMR).
- 매뉴얼 3종(구직자·구인자·운영자)의 문의 채팅 절을 새 구조로 갱신.
- 배포 시 운영 DB에 0094 migrate 필요(0093과 함께).
