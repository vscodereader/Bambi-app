# native 구직자 1:1 채팅 — 기능 동등 + UI 고도화 설계

작성 2026-09-03. 브랜치 `feat/native-chat`(base `mobile`), 작업 워크트리 `worktree-native-chat`.

## 목적

`apps/native` 구직자 앱의 채팅 탭·채팅방을 web(`apps/web`) 1:1 채팅과 **기능 동일**하게 맞추고, UI는 web보다 나은 메신저 경험을 제공한다. 현재 native 채팅은 스캐폴드 수준이다(메시지 카드 나열, 발신자 구분 없음, enum 원값 노출, 목록에 공고 id 앞 8자 노출, 실시간 없음, 전송 후 refetch만).

## 범위

포함
- 채팅 목록(`listMine`), 채팅방(`getById` keyset 페이징), 텍스트 전송(`sendMessage`, UUIDv7 멱등키), 첨부 전송(이미지·PDF, `createAttachmentUpload` → 서명 URL PUT → `sendMediaMessage`), 읽음(`markRead`), 면접 제안 카드 응답(`setInterviewStatus`), 연락처 요청 카드 응답(`respondContactReveal`), 연락처 공개 조회(`getContactReveal`, 기존 화면 유지), 나가기(`deleteChatRoom`), 차단(`blocks.blockUser`), 신고(기존 `ReportDialog`), 미읽음 총합(`unreadState`) 탭 배지.
- socket.io 실시간 수신: `chat:message:created`, `chat:message:read`, `chat:room:updated`, `chat:list:updated`, `chat:unread:updated`, `chat:typing:started/stopped`, `chat:error`. 발신: `chat:join`, `chat:leave`, `chat:typing:started/stopped`.
- 공고 상세 "1:1 채팅 시작" CTA는 기존 `startFromJobPost` 호출 유지, 실패 사유 인라인 안내만 보강.

제외(후속)
- 업체(employer) 측 채팅 화면, 운영자 문의 채팅(supportChat), 채팅 시작 프리플라이트 화면, 첨부 매직넘버 검사(서버 검증에 위임), 이미지 핀치 줌, 스와이프 삭제, 소켓 `chat:message:ack-read` 경로(HTTP `markRead`로 통일).

## 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 실시간 | `socket.io-client` 추가. `pnpm-workspace.yaml` catalog에 `socket.io-client: ^4.8.3` 등록, web·native `package.json`은 `"catalog:"` | 서버가 socket.io만 제공(`apps/server/src/bambi-realtime.ts`). web과 동일 버전 단일 관리 |
| 첨부 | 이미지(`expo-image-picker`, 기존) + PDF(`expo-document-picker`, 신규·catalog) | web과 완전 동일 |
| 공유 로직 | web 순수 계산 3파일을 `packages/api/src/services/`로 이동, web·native 공용 | native가 이미 `@bambi-app/api/services/*` 런타임 import 중. 두 벌 드리프트 방지 |
| 메시지 목록 | `FlatList inverted`, `onEndReached`로 과거 자동 로드 | web의 버튼식 "더 보기" 개선, 스크롤 점프 보정 불필요 |
| 전송 | 낙관적 삽입 + 실패 재전송(멱등키로 중복 방지) | web은 낙관적 삽입 없음 → 개선점 |
| 소켓 인증 | orpc와 동일하게 `authClient.getCookie()`를 `extraHeaders.Cookie`로 전달 | 서버 미들웨어가 `createContext(headers)`로 세션 조회 |
| 피드백 UI | `Alert.alert` 대신 heroui `Dialog`·`Toast` | 앱 톤 통일 |
| DB·서버 | 변경 없음 | 마이그레이션 0건 |

## 아키텍처

### 공유 계층 이동 (web import 경로 수정 동반)

| 이동 전 (`apps/web/src/lib/bambi/`) | 이동 후 (`packages/api/src/services/`) | 역할 |
|---|---|---|
| `chat-message-grouping.ts` | `bambi-chat-message-grouping.ts` | 같은 발신자·같은 날·같은 분 그룹핑, 날짜 칩 라벨 |
| `chat-room-messages.ts` | `bambi-chat-room-messages.ts` | `ChatMessageCursor` 타입, id 기준 dedupe + `(createdAt,id)` 정렬 병합 |
| `chat-block.ts` | `bambi-chat-block.ts` | `chatBlockReason` 4종 → 안내 문구 |

테스트 3개(`apps/web/test/lib/bambi/chat-*.test.ts`)도 `packages/api/test/services/`로 이동. 기존 `bambi-chat-message-id.ts`(`generateChatMessageId`), `bambi-chat-realtime.ts`(이벤트 타입), `bambi-media-policy.ts`(허용 mime·10MB)는 그대로 import.

### native 데이터·훅 계층 `apps/native/src/lib/chat/`

| 파일 | 책임 |
|---|---|
| `chat-socket.ts` | socket.io-client 싱글턴. `${EXPO_PUBLIC_SERVER_URL}` 접속, `autoConnect:false`, `extraHeaders.Cookie`. `connectChatSocket`, `joinChatRoom`(ack 5초), `leaveChatRoom`, `scheduleChatRoomLeave`(30초 유예), `emitTypingStarted/Stopped`. 미들웨어 거절(`socket.active===false`) 시 지수 백오프 재연결 |
| `use-chat-room-realtime.ts` | 방 진입 시 join, 이벤트 → 쿼리 무효화·타이핑 state. `connect` 시 재join + 재조회. AppState background→active 시 재조회. 소켓 끊김 동안 15초 폴링 보강. unmount 시 typing stop + leave 예약 |
| `use-chat-messages.ts` | `getById({id, limit:50})` 최신 페이지 + 커서 누적 과거 페이지 + 낙관적 메시지를 공유 병합 함수로 합쳐 inverted 배열 반환. `loadOlder()`는 `hasMoreMessages`·`nextCursor`로 fetchQuery |
| `use-chat-auto-read.ts` | 첫 로드 즉시 markRead, 이후 300ms 코얼레싱. 성공 시 `listMine` 해당 방 unreadCount 0, `unreadState`를 `totalUnreadMessageCount`로 setQueryData. `chat:unread:updated`가 0이 아니면 재주장. 화면 blur 시 중단 |
| `use-chat-send.ts` | 텍스트·첨부 전송 상태 머신(sending/failed/sent), 재전송, 첨부 업로드(mime·크기 사전 검사 → intent → PUT → sendMediaMessage) |
| `chat-optimistic.ts` | 낙관적 메시지 타입·병합(같은 id 서버 row 우선)·inverted 변환 — 순수 함수 |
| `chat-time.ts` | 목록 시각(오늘=HH:mm, 어제, M. D.), 말풍선 시각(오전/오후 h:mm) — 순수 함수 |
| `chat-typing.ts` | 타이핑 수신 리듀서(5초 타임아웃 자동 해제), 발신 판정(3초 무입력 stop) — 순수 함수 |

### native UI 계층 `apps/native/src/components/chat/`

| 파일 | 내용 |
|---|---|
| `chat-room-list-item.tsx` | `ListGroup.Item`: `Avatar` prefix, 상대명·공고명·마지막 메시지 content, 시각·미읽음 `Chip` suffix. 차단·탈퇴 상태 칩 |
| `chat-message-bubble.tsx` | 텍스트 말풍선. 내 것 `bg-accent text-accent-foreground` 우측, 상대 `Surface variant="secondary"` 좌측. 그룹 시작에만 아바타·이름, 그룹 끝에만 시각. 내 마지막 메시지 아래 읽음/전송 중/실패·재전송 |
| `chat-attachment-message.tsx` | 이미지: 색 말풍선 없이 `rounded-xl` 원본 비율(최대 너비 78%, 높이 상한), 탭 → 풀스크린 `Dialog` 뷰어. PDF: 아이콘·이름·용량 카드, 탭 → `expo-web-browser` |
| `chat-system-card.tsx` | 연락처 요청·면접 제안 카드. 가운데 `Surface`, 아이콘·제목·상세·상태 칩(라벨 맵). 응답 권한자에게만 `primary` 확정 + `tertiary` 거절 |
| `chat-date-chip.tsx` | 가운데 `Chip variant="soft"` 날짜 |
| `chat-typing-indicator.tsx` | 상대 아바타 + 점 3개 reanimated 말풍선 |
| `chat-composer.tsx` | `+` 첨부(BottomSheet: 앨범·카메라·파일) / `TextArea variant="secondary"` 1~5줄 / 전송 아이콘 `primary`(빈 내용 비활성). 첨부 선택 후 썸네일 미리보기 + 제거. `KeyboardStickyView`로 키보드 위 고정. 하단 safe-area 패딩 1회 |
| `chat-room-menu.tsx` | 헤더 케밥 `Menu`: 연락처 공개 보기(확정 면접 있을 때) · 차단 · 신고 · 나가기(`danger`). 차단·나가기는 `Dialog` 확인 |
| `chat-new-message-pill.tsx` | 위로 스크롤 중 새 메시지 도착 시 하단 "새 메시지 ↓" 플로팅 칩 |
| `chat-block-notice.tsx` | 차단·탈퇴·마감 사유 안내 카드(입력바 자리) |

### 화면

| 파일 | 변경 |
|---|---|
| `app/(seeker)/(tabs)/chats.tsx` | 전면 재작성. 헤더 "채팅", `Skeleton` 로딩, 메신저식 리스트, 빈 상태(아이콘 + 안내 + 탐색 탭 `secondary` 버튼), `chat:list:updated` 무효화 |
| `app/(seeker)/chats/[id].tsx` | 전면 재작성. 커스텀 헤더(뒤로·상대 아바타·상대명·공고명·케밥), 상태 줄(마감·탈퇴·차단 시만), `FlatList inverted` 본문, 타이핑 인디케이터, 새 메시지 칩, composer 또는 차단 안내 |
| `app/(seeker)/chats/[id]/reveal.tsx` | 유지. 문구·상태 라벨 맵만 정리 |
| `app/(seeker)/(tabs)/_layout.tsx` | 채팅 탭 `tabBarBadge` = `unreadState.unreadMessageCount`(0이면 미표시) |
| `app/_layout.tsx` | `ToastProvider` 추가 |
| `app/(seeker)/jobs/[id].tsx` | CTA 실패 사유 인라인 문구 보강(휴대폰 미인증·마감 등) |

## 데이터 흐름

### 전송
1. `generateChatMessageId()` → 낙관적 말풍선 삽입(status sending) → `sendMessage({chatRoomId, body, messageId})`.
2. 성공: 서버 row가 캐시에 들어오면 같은 id로 대체. 실패: 말풍선에 "재전송" 탭, 3회 실패 시 삭제 버튼.
3. 첨부: picker → 허용 mime 4종·10MB 사전 검사 → `createAttachmentUpload` → `fetch(uploadUrl, PUT)` → `sendMediaMessage({storageKey, fileName, mimeType, byteSize, messageId, body?, textMessageId?})`. 업로드 중 진행 스피너 카드.

### 수신
- 방 진입: `getById` → `chat:join`. `chat:message:created` → `getById` 무효화 → 병합. `chat:room:updated` → `getById` 무효화. `chat:message:read` → 읽음 표시. `chat:typing:*` → 리듀서(5초 타임아웃).
- 목록: `chat:list:updated` → `listMine`·`unreadState` 무효화.
- AppState active 복귀 → 방·목록 재조회. `connect` → 재join + 재조회.

### 읽음
- 서버 `markRead`는 `upToMessageId`를 무시하고 방 전체를 읽음 처리하므로 최신 메시지 id 하나만 전달.
- 응답 `totalUnreadMessageCount`로 `unreadState` 직접 갱신, `listMine` 해당 방 0.

### 과거 페이징
- `onEndReached`(inverted라 화면 위쪽) → `hasMoreMessages`면 `nextCursor`로 fetchQuery → 누적 배열 병합. 로딩 중 상단 `Spinner`.

### 타이핑 발신
- 입력 변화 시 `started` 1회, 3초 무입력·전송·blur 시 `stopped`.

## 에러 처리

| 상황 | 처리 |
|---|---|
| `getById` FORBIDDEN + `chatBlockReason` | 공유 문구 함수 → 입력바 자리 안내 카드, 이력은 표시 |
| `sendMessage` TOO_MANY_REQUESTS | 서버 메시지 인라인 경고 |
| CONFLICT(면접 상태 경합·연락처 응답 경합) | Toast 후 방 재조회 |
| 소켓 연결 실패 | 사용자에게 알리지 않음. 방 화면 표시 중 15초 폴링 보강, 재연결 시 중단 |
| 업로드 실패·크기 초과·mime 불허 | 각각 Toast 구분 안내 |
| 상대 탈퇴·공고 마감 | 상태 줄 표시 + 전송 차단 |
| 그 외 | `ErrorState` 재시도 |

## UI 원칙

- 색은 테마 토큰만(`accent`, `surface`, `muted`, `danger`). 임의 px 금지, Tailwind 스케일 사용. `primary` 버튼은 한 화면에 한 곳(전송 버튼, 카드 확정 버튼은 카드 내 로컬 위계).
- enum 원값 렌더 금지. 면접 상태·공고 상태는 라벨 맵 경유.
- 말풍선 최대 너비 78%. 내 말풍선 `rounded-2xl` 우하단만 작은 라운드.
- `ScrollShadow`는 `expo-linear-gradient` 의존이라 미사용.
- 다크 모드는 토큰이 처리.

## 테스트·검증

- 이동한 공유 로직 테스트 3개 `packages/api/test/services/`에서 통과 확인(cwd=packages/api, `test/services`만 실행).
- native 순수 함수 신규 테스트 `apps/native/test/lib/chat/`: 낙관적 병합·교체, inverted 변환, 시각 포맷, 타이핑 리듀서, 자동읽음 코얼레싱 판정. native에 vitest 설정이 없으면 `packages/api`와 같은 최소 config 추가.
- RN 렌더 테스트 없음(라이브러리 추가 금지). 로직은 훅 밖 순수 함수로 분리해 위 테스트로 덮음.
- 린트 `pnpm dlx ultracite check <경로>`(경로 인자 필수) + `tsc --noEmit`(native·web·api).
- 개발 서버·스크린샷 금지. 에뮬레이터 실측은 사용자가 수행.

## 의존성 변경

- `pnpm-workspace.yaml` catalog: `socket.io-client: ^4.8.3`, `expo-document-picker: <pnpm expo install이 고른 SDK 호환 버전>`.
- `apps/web/package.json`: `socket.io-client` → `"catalog:"`.
- `apps/native/package.json`: `socket.io-client`, `expo-document-picker` → `"catalog:"`.
- native 설치는 `pnpm expo install expo-document-picker`로 버전 확정 후 catalog에 반영.

## 참고

- web 채팅방: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`, 목록: `seeker-chat-list-responsive.tsx`, 소켓 클라이언트: `apps/web/src/lib/bambi-chat-realtime.ts`, 자동읽음: `apps/web/src/lib/bambi/use-chat-room-auto-read.ts`, 과거 페이징: `use-older-chat-messages.ts`.
- 서버: `packages/api/src/routers/bambi/chats.ts`, `apps/server/src/bambi-realtime.ts`, `packages/api/src/services/bambi-chat-realtime.ts`.
- 관련 스펙: `2026-08-07-mobile-chat-kakao-design.md`, `2026-08-06-chat-qa-round3-design.md`, `2026-08-12-chat-attachment-message-ui.md`.
