# 운영자 실시간 채팅 문의 설계 (2026-08-18)

## 목적

비회원·구직자·구인자가 사이트 어디서든 플로팅 버튼으로 운영자에게 실시간 문의 채팅을
보낼 수 있게 한다. 운영자는 전용 콘솔에서 문의 방 목록을 보고 답변하며, 채팅 창 오른쪽
패널에서 문의자 정보를 확인한다. 새 메시지는 양쪽 모두 알림으로 받는다.

기존 고객센터 문의(`supportInquiry` 티켓 + `moderator/support` 답변 큐)는 그대로 두고
**별도 신설**한다 — 티켓은 정식 접수, 채팅은 즉답 창구로 성격이 다르다.

## 확정 결정

| 결정 | 값 |
|---|---|
| 비회원 신원 | 본인인증 없이 익명 서명 쿠키 발급 (채널톡 방식) |
| 기존 티켓 문의와의 관계 | 별도 신설, 티켓 유지 |
| 운영자 배정 | 공용 큐 — 모든 admin이 같은 목록을 보고 아무나 답변 |
| 방 수명 | 1인 1방 계속 이어짐 (회원 userId당 1방, 비회원 쿠키당 1방) |
| 실시간 전달 | **A안: 폴링** — 위젯 열림 3초, 뱃지 30초, 운영자 콘솔 5초. 소켓 인증(로그인 전제)을 건드리지 않아 익명 소켓 슬롯 DoS 표면이 없다. push가 필요해지면 기존 socket.io 계층을 얹는 업그레이드 경로가 살아 있다. |

## 데이터 모델 (마이그레이션 1건)

```
support_chat_room
  id                 uuid pk defaultRandom
  user_id            text null → user.id (onDelete cascade)   -- 회원 방이면 값
  guest_id           text null                                 -- 비회원 방이면 쿠키의 uuid
  is_blocked         boolean default false not null            -- 운영자가 도배 방 잠금
  user_last_read_at  timestamp null                            -- 문의자 측 읽음 워터마크
  admin_last_read_at timestamp null                            -- 운영자 측 워터마크(공용 큐라 1개)
  last_message_at    timestamp default now not null
  created_at / updated_at

  부분 유니크: user_id  WHERE user_id IS NOT NULL   -- 1인 1방
  부분 유니크: guest_id WHERE guest_id IS NOT NULL
  CHECK: (user_id IS NULL) <> (guest_id IS NULL)    -- 정확히 한 축만

support_chat_message
  id             uuid pk defaultRandom
  room_id        uuid → support_chat_room.id (onDelete cascade)
  sender_type    enum support_chat_sender ('inquirer','admin')
  sender_user_id text null → user.id                -- admin이면 어느 운영자인지 감사용
  body           text (입력단에서 1000자 제한)
  created_at

  index (room_id, created_at)
```

읽음은 기존 채팅의 행 단위 read-state 대신 **방 단위 워터마크 2개**로 단순화한다.
미읽음 수 = 워터마크 이후에 쌓인 상대측 메시지 count. 메시지별 읽음 표시는 없다.

## 비회원 신원

- `bambi_support_chat` httpOnly·signed 쿠키. payload는 uuid(gsid) 하나, 서명은 기존
  `resolveGuestTokenSecret`(`BAMBI_GUEST_TOKEN_SECRET`) 인프라 재사용.
- 위젯에서 **첫 메시지를 보낼 때** 발급한다(방문만으로 쿠키·방을 만들지 않는다).
- 쿠키를 지우면 다음 문의는 새 방 — 옛 방은 콘솔에 이력으로 남는다.
- 회원 로그인 시 userId 방을 쓴다. 게스트 방과의 병합은 하지 않는다(이연).

## API — `packages/api/src/routers/bambi/support-chat.ts` (신규)

문의자 측(`publicProcedure`, 회원·비회원 공용 — 세션 있으면 userId 축, 없으면 쿠키 축):

| 프로시저 | 동작 |
|---|---|
| `getMyRoom` | 내 방 + 메시지(커서 페이지) + 미읽음 수. 방 없으면 null. |
| `sendMessage` | 방 없으면 생성 후 삽입(비회원이면 쿠키 발급). `is_blocked`면 FORBIDDEN. 레이트리밋: 회원 userId 1축, 비회원 gsid·IP 2축, 1분 10회(기존 `rate-limit.ts` 재사용). 방 생성 자체도 IP당 리밋. |
| `markRead` | `user_last_read_at` 갱신 |

운영자 측(`adminProcedure`):

| 프로시저 | 동작 |
|---|---|
| `listRooms` | lastMessageAt 내림차순 + 방별 미읽음 수, 페이징 |
| `getRoom` | 메시지 + 문의자 정보(회원: 역할·닉네임/이름·성별·가입일·조직명 / 비회원: "비회원"·최초 문의일) |
| `sendMessage` | admin 메시지 삽입(sender_user_id 기록) |
| `markRead` | `admin_last_read_at` 갱신 |
| `setBlocked` | 방 잠금/해제 |

금칙어 검사는 걸지 않는다 — 수신자가 운영자뿐이다.

## 실시간 전달 (A안: 폴링)

- 위젯 패널 열림: 3초 `refetchInterval`로 `getMyRoom` 재조회
- 플로팅 버튼 뱃지: 30초 간격 미읽음 수만
- 운영자 콘솔: 목록·열린 방 5초 간격
- 소켓·SSE 변경 없음. 진짜 push가 필요해지면 기존 socket.io 계층에 support 채널을
  얹는다(업그레이드 경로, 이연).

## 웹 위젯 (비회원/구직자/구인자 공용 컴포넌트 1개)

- **플로팅 버튼**: 데스크톱은 우측 레일 `AdBannerRail` 세로 배너 스택 **바로 아래**에
  함께 렌더, 모바일은 우하단 고정(fixed) 플로팅 버튼. 미읽음 뱃지 표시.
- 클릭 → 우하단 채팅 패널(shadcn 컴포넌트 재사용): 말풍선 목록 + 입력창.
  열릴 때 `markRead`, 열려 있는 동안 3초 폴링. 로그인 여부와 무관하게 동일 UI.
- 운영자(admin) 계정에는 위젯을 렌더하지 않는다 — 자기가 자기에게 문의하는 큐 오염 방지
  (기존 티켓의 `ADMIN_CANNOT_CREATE_INQUIRY`와 같은 이유).

## 운영자 콘솔 — `moderator/support-chats` (신규 페이지)

3열 레이아웃: 방 목록(미읽음 뱃지) | 채팅 창 | 문의자 정보 패널.
moderator 레이아웃에 메뉴 추가. 감시용 `moderator/chats`와는 별개 화면이다.
모바일 폭에서는 목록 → 방 상세로 전환되는 스택 구성.

## 알림

- **운영자에게**: inquirer 메시지 삽입 시 **운영자 미읽음이 0→1로 바뀌는 순간에만**
  `notifyBambiNotification(recipientRole: "admin", targetType: "support_chat")` 1행.
  기존 SSE 스트림을 타고 알림함·OS 알림까지 그대로 흐른다. 메시지마다 쌓지 않는다.
- **회원 문의자에게**: admin 답변 시 같은 에지 트리거(문의자 미읽음 0→1)로 개인 알림 1행.
  알림 클릭 href는 위젯을 여는 경로.
- **비회원에게**: SSE가 로그인 전제라 알림함 없음 — 플로팅 버튼 뱃지 폴링이 유일한 채널
  (알려진 한계).
- `notification-labels.ts`에 `support_chat` 라벨·href 추가(enum 원값 노출 금지 규칙).

## 보안·도배 방지

- 발신 레이트리밋(1분 10회)·방 생성 IP 리밋 — 기존 `rate-limit.ts` 인메모리
  (`max-instances=1` 전제, 기존 한도들과 동일 조건)
- 본문 1000자 zod 제한
- `is_blocked` 방 잠금(운영자 토글) — 잠긴 방의 쿠키/계정은 발신 403
- 쿠키는 httpOnly + HMAC 서명 — 위조 gsid로 남의 방을 열 수 없다

## 테스트·문서

- 미읽음 계산·알림 에지 트리거 판정·쿠키 검증을 **순수 헬퍼로 분리**해
  `packages/api/test/services/`에서 단위 테스트 (dev DB를 지우는 라우터 스위트 위치는
  피한다)
- 사용자 매뉴얼(구직자·구인자)·운영자 매뉴얼에 문의 채팅 항목 추가

## 스코프 밖 (이연)

- 첨부/이미지 전송, 타이핑 표시, 메시지별 읽음 표시
- 게스트 방 ↔ 회원 방 병합
- 소켓 push 전환, 담당자 배정, 상담 종료/재개 상태
- 운영시간 안내·부재중 자동응답
