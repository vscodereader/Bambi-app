# 채팅 QA 3차 수정 설계 (2026-08-06)

로컬 QA 3차 피드백 반영. 기준 브랜치 `fix/chat-prod-qa`, 작업 워크트리 `chat-qa-round3`.
30초 유예 이탈은 QA 통과로 확정.

## F. 방 화면 실시간 연결·자동 읽음 강건화 (TC-3)

증상: 방을 보고 있어도 핀 1이 생기면 자동으로 안 꺼지고, 채팅을 쳐야(HTTP 경로) 꺼진다.
코드상 join은 진입 시 호출되지만 구조적 구멍이 3개 있어 어느 것이든 같은 증상을 낸다.

1. **진입 즉시 소켓 접속.** 현재 소켓 connect+join이 `roomQuery.data?.currentUserId`
   (방 HTTP 조회 완료)에 묶여 있다. 이 게이트를 풀어 방 화면 마운트 시 URL의 roomId로
   즉시 connect+join한다(참여자 검증은 서버 join 가드가 이미 한다). 자기 메시지 판별용
   currentUserId 비교는 데이터 도착 후 그대로.
2. **`connect_error` 복구.** 서버 인증 미들웨어 거절(레이트리밋·세션 순단)은 socket.io가
   자동 재시도하지 않는 네임스페이스 오류인데, 클라이언트 어디에서도 `connect_error`를
   처리하지 않는다 — 한 번 거절되면 소켓이 조용히 영구 사망(핀·목록·실시간 전부 정지,
   HTTP만 동작 = 관찰된 증상). 싱글턴(`bambi-chat-realtime.ts`)에 `connect_error` 핸들러와
   백오프 재접속 루프를 넣는다(구독자가 있는 동안만, 상한 백오프+지터).
3. **핀 신호 = 읽음 재주장.** 방 화면 표시 중 + 탭 활성일 때 이 방의 `chat:unread:updated`
   (unreadCount > 0)를 받으면, 이미 보낸 기준선이라도 markRead를 다시 쏜다
   (자동 읽음 훅에 reassert 경로 추가 — sentMessageIdRef 봉인 해제 후 flush).
   markRead 성공이 unreadCount=0 신호를 만들므로 루프는 돌지 않는다.
   이로써 "방을 보고 있는데 안 읽음 > 0" 상태는 어떤 레이스로 생겨도 자가 소멸한다.

SSE 폴백(방 무효화)·30초 유예·기존 markRead 총합 덮어쓰기는 그대로 둔다.

## G. 방 삭제 = 양측 소멸 + 재문의는 새 방 (TC-4 정책 재개정)

2차의 "전송=방 부활"을 폐기하고 다음으로 확정한다:

- **어느 한쪽이라도 나가면 방은 양쪽 모두에게서 사라진다.** 목록(listMine)에서 제외,
  방 열람(getById)·발신·읽음 처리 전부 차단(존재하지 않는 방 취급). 안 읽음 총합
  집계에서도 삭제 방을 제외한다(유령 핀 방지).
- **운영자는 삭제된 방의 내역을 계속 본다.** moderation 라우터는 이미 isDeleted
  플래그·필터로 삭제 방을 노출하고 있으므로 유지·검증만 한다.
- **재문의 = 새 방.** 공고 상세 "채팅 시작하기" 시 살아 있는 방이 있으면 그 방,
  없으면(삭제됐거나 최초) **새 chat_room을 INSERT**한다. 이전 대화는 이어지지 않는다.
- 스키마: `chat_room(job_post_id, job_seeker_user_id)` 전체 유니크 인덱스를
  **부분 유니크**(`WHERE seeker_deleted_at IS NULL AND employer_deleted_at IS NULL`)로
  교체 — 살아 있는 방은 여전히 1개, 삭제된 방은 이력으로 누적. 마이그레이션 0070.
  seeker/employer deletedAt 두 컬럼은 "누가 언제 나갔나" 기록으로 유지한다.
- 2차에 넣은 부활 장치 제거: `getChatRoomReviveFields`, sendMessage/첨부/면접/연락처의
  양측 deletedAt 리셋, startFromJobPost의 부활 경로. 나가기 실행 시 상대 목록도 즉시
  갱신되도록 양측에 `chat:list:updated`를 쏜다. 상대가 방 화면을 보고 있었다면 다음
  조회가 NOT_FOUND가 되고, 기존 오류/빈 상태 UI로 목록에 돌아간다.
- 유지: 운영자 차단(isBlocked)·사용자 간 차단·신고 대기 숨김, 리뷰의 chatRoomId 참조
  (행은 남으므로 무해).

## H. 가입 폼 크기 축소 (TC-5)

1열 전환 후 전체 높이가 커져 푸터 영역을 침범한다. 레이아웃(1열·필드 순서)은 유지하고
밀도만 줄인다: 패널 패딩·필드 간격·타이틀 크기·안내 문구 여백을 한 단계씩 축소.
Tailwind 스케일 토큰만 사용, 모바일 포함. 시각 확인은 사용자.

## 검증 기준

- 트랙별 파일 소유권: F=web 실시간(훅·싱글턴·방 화면), G=api/db/server+목록 화면
  (방 화면은 F 소유 — G가 필요하면 컨트롤러에 보고), H=auth 컴포넌트만.
- 순수 vitest만 실행(routers/bambi DB 의존 스위트 금지). check-types·ultracite는
  컨트롤러가 트랙 완료 후 일괄 실행. 마이그레이션 생성·적용도 컨트롤러가 수행.
- 트랙별 커밋 후 `fix/chat-prod-qa`에 no-ff 병합. push·PR 금지.
