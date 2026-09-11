# 채팅 상대 접속·응답시간 및 공고 메타데이터 뱃지 설계·구현 계획

## 목표

PR #291에서 만든 사용자 presence 정본을 채팅 참여자 화면까지 안전하게 확장한다. 구직자와 구인자가 모두 온라인일 때만 `대화 가능`과 `실시간 연결`을 표시하고, 상대가 오프라인이면 `오프라인`과 상대 개인의 최근 30일 평균 응답시간 뱃지로 교체한다. 동시에 Web의 공고·채팅 화면에서 `지역 · 세부지역 · 업종 · 세부업종`처럼 가운데점으로 이어 붙인 공고 메타데이터를 재사용 가능한 개별 뱃지로 통일한다.

## 변경 불가 조건

- 기준 브랜치는 작업 시작 시점 최신 `origin/develop`의 `558fec44`이며 작업 브랜치는 `fix/mobile-chat-attachment-layout`이다.
- PR #291에 커밋을 추가하지 않고 이 브랜치에서 별도 PR을 만든다.
- 커밋과 푸시는 사용자가 직접 수행한다. 구현 중 임의 커밋·푸시하지 않고 최종적으로 복사 가능한 PowerShell 명령과 제목·본문이 있는 커밋 메시지를 제공한다.
- `--force`를 사용하는 명령은 만들지 않는다. 최종 머지는 동기가 수행한다.
- 이번 화면 범위는 Web이다. `apps/native` 아래 파일은 수정하지 않고 Native 공고·채팅 화면에도 뱃지를 추가하지 않는다. 다만 DB/API의 응답시간 정본은 플랫폼에 종속되지 않으므로 Native에서 기존 공용 API로 보낸 메시지·면접·연락처 액션도 동일한 개인 통계에 포함된다.
- 새 raw 색상·임의 CSS·인라인 style·문자열별 임의 간격을 만들지 않는다. 기존 `Badge`, 시맨틱 색상, 반경·간격 토큰을 재사용한다.
- 공고의 지역·세부지역·업종 값은 기존 API 필드와 지역 마스터의 표시값을 사용한다. 화면에서 문자열을 추측해 지역을 새로 만들거나 값별 색상을 하드코딩하지 않는다.
- DB 변경은 `db:push`가 아니라 Drizzle migration으로만 반영한다. 최신 `develop`과 현재 로컬 worktree 전체에서 `0117` 이상 migration이 없음을 확인했으므로 이 작업은 `0117_chat-response-activities`를 사용한다. 구현 직전과 PR 준비 직전에 다시 충돌을 확인한다.

## 확정된 사용자 요구사항

### 접속 상태 뱃지

- 현재 보는 사용자와 채팅 상대가 모두 온라인일 때만 성공 톤의 `대화 가능` 뱃지를 표시한다.
- 두 사용자 모두 온라인이고 현재 Web 채팅 소켓도 실제 `connected`인 경우에만 성공 톤의 `실시간 연결` 뱃지를 표시한다. 양쪽 presence가 온라인이어도 소켓이 연결 중이거나 끊겼으면 이 뱃지를 표시하지 않는다.
- 둘 중 상대방이 오프라인이면 `대화 가능`과 `실시간 연결`을 모두 숨기고 `오프라인` 뱃지를 표시한다.
- 상대방의 계산 가능한 평균 응답 표본이 있으면 `오프라인` 옆에 평균 응답시간 뱃지를 표시한다.
- 현재 사용자가 화면을 보고 있으므로 실질적인 표시 분기는 `상대 온라인/오프라인`이다. API와 순수 정책은 양쪽 상태를 모두 확인해 거짓 온라인 표시가 생기지 않게 한다.
- 차단, 운영자 조치, 탈퇴 등 기존 대화 불가 상태는 presence보다 우선한다. 이때 기존 `차단됨` 또는 `대화 불가능`을 유지하고 접속·응답시간 뱃지를 노출하지 않는다.
- 소켓이 연결 중이거나 끊겼지만 양쪽 presence가 온라인이면 `대화 가능`은 유지하되 `실시간 연결`은 표시하지 않고 기존 연결 상태 문구를 사실에 맞게 유지한다.

### 평균 응답시간

- 통계 주체는 업소나 채팅방이 아니라 실제 상대 `user` 개인이다.
- 구직자가 볼 때는 방의 `employerUserId`, 구인자가 볼 때는 `jobSeekerUserId`의 평균을 표시한다.
- 배포 후 새로 성공하는 대화 액션부터 activity를 적재한다. 기존 메시지·상태 이력 30일분은 백필하지 않는다.
- 응답 표본이 1건만 있어도 표시한다.
- 상대가 보낸 연속 메시지 묶음에 내가 처음 답한 시점만 응답 1건으로 계산한다.
- 상대가 여러 대화 액션을 연속으로 보냈다면 묶음의 첫 액션 시각부터 내 첫 응답 액션 시각까지를 잰다. 같은 사용자의 연속 액션은 추가 응답 표본을 만들지 않는다.
- 일반 텍스트, 이미지·PDF 첨부, 면접 제안·수락·거절·취소·완료, 연락처 요청·수락·거절·공개처럼 사용자가 채팅 관계 안에서 성공시킨 모든 대화 액션을 같은 기준으로 포함한다. 새 `chat_message`를 만들지 않고 일정이나 기존 메시지 metadata만 갱신하는 액션도 포함한다.
- 읽음 처리, 입력 중 신호, 방 입장·퇴장, 신고·차단·채팅방 삭제는 상대에게 보내는 응답이 아니므로 포함하지 않는다.
- 답이 오지 않은 발신 묶음은 표본에 포함하지 않는다.
- 평균 조회 범위는 응답 완료 시각 기준 최근 30일이다. 30일이 지난 표본은 평균에서 제외하되 감사·재계산을 위해 즉시 삭제하지 않는다.
- 계산 가능한 표본이 없으면 응답시간 뱃지를 아예 렌더하지 않는다. 이 경우 상대가 오프라인이면 `오프라인`만 표시한다.
- 실제 응답 초는 자르지 않고 저장하며 화면에서만 다음 구간으로 분류한다.
  - 평균 10분 이하: `평균 10분 이내 응답`
  - 평균 10분 초과, 30분 이하: `평균 30분 이내 응답`
  - 평균 30분 초과, 60분 이하: `평균 60분 이내 응답`
  - 평균 60분 초과: `응답 낮음`
- 정확히 10·30·60분인 값은 각각 해당 `이내` 구간에 포함한다.

### 공고 메타데이터 뱃지

- Web의 실제 공고·수집 공고·채팅에서 공고 메타데이터를 가운데점 텍스트로 이어 붙이는 모든 사용자 화면을 공용 뱃지 묶음으로 전환한다.
- `경기 · 성남시 · 룸싸롱 · 퍼블릭`은 `경기`, `성남시`, `룸싸롱`, `퍼블릭` 네 개의 개별 뱃지로 렌더한다.
- 값이 없는 항목은 빈 뱃지를 만들지 않는다.
- API가 이미 분리해 주는 `region`, `district`, `industryCategory`를 그대로 사용한다.
- 수집 공고의 `industryRaw`에 정규화 업종과 세부업종이 함께 있으면 수집기가 이미 사용하는 업종 구분 기호(`·`, 하이픈 계열)를 공용 상수로 정의해 순수 함수 한 곳에서만 분리한다. 정규화 업종과 공백 정규화 후 같은 조각은 한 번만 표시하고 원문에만 있는 세부업종은 원문 순서대로 별도 뱃지로 보존한다. 값 자체(`퍼블릭` 등)를 조건문이나 색상표로 하드코딩하지 않는다.
- 공고 메타데이터가 아닌 업체명·리뷰 수·시간·문장 내부의 가운데점은 변경하지 않는다.
- 온보딩용 정적 미리보기는 실제 공고 데이터를 렌더하는 화면이 아니므로 이번 일괄 전환에서 제외한다. 실제 서비스 화면의 컴포넌트를 재사용하는 미리보기라면 그 컴포넌트 변경 결과만 자연스럽게 반영한다.

## 기술 설계

### 1. 대화 액션·응답시간 DB 정본

`chat_response_activity` 테이블 하나를 추가한다. 배포 후 발생한 모든 응답 가능 액션을 이 테이블에서만 이어 보므로 기존 `chat_message`가 첫 평균에 섞이지 않는다.

- `id bigint generated always as identity primary key`: 같은 millisecond에 액션이 연속돼도 방별 잠금 뒤의 DB 삽입 순서를 잃지 않는 내부 순번
- `chat_room_id uuid not null` → `chat_room.id`, 방 삭제 시 cascade
- `actor_user_id text not null` → `user.id`
- `activity_key text not null unique`: 메시지는 `message:{messageId}`, 상태 전이는 해당 일정·요청 id와 확정 상태로 구성한 안정적인 키. API 재시도와 중복 전파가 같은 액션을 두 번 세지 않는 멱등키다.
- `occurred_at timestamp not null`: 메시지는 DB의 `chat_message.created_at`, 상태 전이는 성공한 서버 시각
- `prompt_started_at timestamp null`: 발신 방향이 바뀐 경우 직전 상대 연속 액션 묶음의 첫 시각
- `response_seconds integer null`: 발신 방향이 바뀐 행에만 0 이상의 값
- `created_at timestamp not null defaultNow`
- 방의 직전 액션과 연속 actor 묶음을 찾는 `(chat_room_id, id)` index
- 최근 30일 사용자 평균 조회를 위한 `(actor_user_id, occurred_at)` index
- `prompt_started_at`과 `response_seconds`가 함께 null이거나 함께 값이 있어야 하는 check, `response_seconds >= 0` check

기존 메시지는 migration에서 읽거나 백필하지 않는다. migration은 빈 액션 테이블·FK·check·index만 생성한다. 따라서 배포 후 첫 액션은 과거 `chat_message`에 대한 답처럼 보여도 기준점이 없으므로 표본을 만들지 않고, 두 번째 액션부터 새 정본 안에서 방향이 바뀔 때 계산한다.

응답 표본을 사용자 행의 누적 평균 컬럼으로 저장하지 않는다. 누적 합계는 30일 창에서 빠지는 표본을 정확히 제거할 수 없고, 최근 30일 요구를 만족하려면 별도 일별 롤업이나 재계산이 필요하기 때문이다. 대화 액션 행 중 `response_seconds is not null`인 원자 표본을 정본으로 두고 인덱스 범위에서 평균을 구한다.

### 2. 대화 액션·응답 표본 기록 서비스

`packages/api`에 채팅 응답시간 순수 정책과 DB 기록 함수를 분리한다.

- 성공한 대화 액션과 액션 행 기록은 같은 transaction 안에서 처리한다. 기존에 transaction 밖에서 상태를 갱신하던 면접·연락처 액션도 원본 상태 전이와 activity insert가 함께 성공하거나 롤백되게 감싼다.
- 방 id 기반 `pg_advisory_xact_lock(hashtextextended(...))`으로 같은 방의 동시 액션을 직렬화한다. 잠금은 기존 presence·포인트 서비스의 transaction advisory lock 관례를 재사용하며, 메시지 insert나 상태 update보다 먼저 획득해 원본 액션과 activity 순서가 어긋나지 않게 한다.
- 잠금을 얻은 뒤 `chat_response_activity`의 마지막 행을 identity `id` 역순으로 찾는다. `occurred_at`은 평균 창과 실제 시간차에 쓰고 동률 액션의 순서 정본으로 쓰지 않는다.
- 직전 액션이 없거나 actor가 새 액션 actor와 같으면 새 행의 응답시간은 null이다.
- 직전 액션과 같은 actor가 연속으로 만든 묶음의 첫 activity 시각을 찾고 그 시각을 `prompt_started_at`으로 사용한다.
- `response_seconds = floor((occurred_at - prompt_started_at) / 1000)`이며 DB check와 코드 가드로 음수가 들어가지 않게 한다.
- `activity_key` unique conflict는 아무 작업 없이 기존 결과를 반환해 메시지 id 재시도와 상태 전이 재호출을 보존한다.
- 텍스트·첨부·첨부와 함께 보낸 텍스트·면접 제안·연락처 요청의 `chatMessage` insert 경로가 공용 함수로 메시지 activity를 기록한다.
- `setInterviewStatus`, `revealContact`, `respondContactReveal`처럼 메시지를 만들지 않는 성공 액션도 공용 함수에 명시적인 안정 key와 서버 확정 시각을 전달한다.
- 면접 제안·연락처 요청처럼 원본 상태와 안내 메시지를 함께 만드는 흐름은 메시지 activity 하나만 기록해 한 번의 클릭이 중복 액션이 되지 않게 한다.
- seed와 운영자 테스트용 직접 insert는 사용자 발신 API가 아니므로 런타임 통계를 만들지 않는다.

DB trigger보다 애플리케이션 transaction helper를 사용한다. 새 메시지를 만들지 않는 대화 액션까지 같은 정의로 기록하고, Drizzle 타입과 기존 메시지 멱등 흐름을 유지하며, 테스트에서 업무 상태와 activity를 한 단위로 검증할 수 있기 때문이다. 모든 런타임 메시지 insert와 대화 상태 전이 지점을 회귀 테스트로 잠가 새 액션이 추가될 때 공용 helper를 거치게 한다.

### 3. 최근 30일 평균 정책

- 공용 상수로 30일 창과 10·30·60분 경계를 정의한다.
- DB 조회는 `occurred_at >= now - 30 days`, `response_seconds is not null`, `actor_user_id IN (...)`을 사용해 목록에서도 사용자별 N+1 조회를 만들지 않는다.
- 평균은 초 단위 `AVG` 결과를 숫자로 정규화하고, UI에 raw 평균값 대신 서버가 공용 정책으로 계산한 `ten_minutes | thirty_minutes | sixty_minutes | low | null` 구간을 전달한다.
- 순수 함수는 0초, 정확히 10·30·60분, 각 경계 바로 초과, 표본 없음과 60분 초과를 테스트한다.
- 평균은 채팅방별이 아니라 사용자의 모든 채팅 응답 표본을 합산한다.

### 4. 채팅 API의 초기 상태

`chats.listMine`과 `chats.getById`가 현재 사용자와 상대방의 presence 정본 및 상대의 최근 30일 응답 구간을 반환한다.

- 기존 PR #291의 `isUserOnline`, `getUserOfflineAfterMinutes`, 사용자 presence 필드를 재사용한다.
- 목록은 화면에 있는 상대 id를 모아 presence와 평균을 각각 한 번의 batch query로 조회한다.
- 방 상세는 참여자 권한 확인이 끝난 뒤 두 사용자의 상태와 상대 평균을 조회한다.
- 응답에는 UI에 필요한 `viewerIsOnline`, `viewerPresenceRefreshAt`, `counterpartIsOnline`, `counterpartPresenceRefreshAt`, `counterpartUserId`, `counterpartResponseBucket`만 노출하고 연결 row·세션 id·원본 마지막 활동 시각은 노출하지 않는다. 각 `presenceRefreshAt`은 현재 온라인 판정이 만료될 다음 시각이며 클라이언트가 그때 정본을 다시 조회하기 위한 최소 정보다.
- 차단·탈퇴·활성 신고로 숨겨진 방에 대한 기존 접근 정책을 우회하지 않는다.

### 5. 일반 채팅 참여자의 실시간 presence

운영자 전용 `/sse/presence`의 권한을 완화하거나 모든 사용자 이벤트를 일반 회원에게 방송하지 않는다.

- PR #291의 PostgreSQL `LISTEN bambi_user_presence` listener와 파싱 코드를 재사용한다.
- presence 이벤트가 들어오면 서버는 변경된 사용자와 현재 유효한 채팅방을 공유하는 상대 사용자 id를 batch 조회한다.
- 현재 서버 인스턴스의 기존 Socket.IO 개인 room 중 변경된 사용자 본인의 room과 허용된 상대 room에만 `chat:participant:presence` 이벤트를 보낸다. 본인 이벤트까지 보내야 `viewerIsOnline`이 바뀌는 경우에도 `둘 다 온라인` 조건을 즉시 다시 판정할 수 있다.
- payload는 변경된 `userId`, 서버가 계산한 `isOnline`, 다음 정본 확인 시각 `presenceRefreshAt`만 담고 원본 마지막 활동·세션·연결 id는 포함하지 않는다.
- 채팅 목록은 기존 개인 socket room을 통해, 방 상세는 기존 socket과 방 참여 검증을 통해 같은 이벤트를 받는다.
- 클라이언트는 이벤트의 user id가 현재 사용자면 모든 행의 viewer 상태를, 각 행의 `counterpartUserId`와 같으면 그 행의 상대 상태만 갱신한다. 온라인→오프라인 이벤트에서는 최근 응답시간까지 함께 최신화되도록 `listMine`과 현재 `getById` 정본 query를 invalidate한다.
- PostgreSQL listener 재연결의 `resync`와 운영자의 오프라인 기준 `policy` 변경은 개인정보 없는 `chat:counterpart:presence:resync` 신호를 인증된 채팅 socket 전체에 보내고, 각 클라이언트가 자신이 열어 둔 목록·방만 다시 조회한다.
- 시간 경과에 따른 오프라인 전환은 `presenceRefreshAt` 중 가장 가까운 시각에 단일 타이머로 관련 query를 다시 읽는다. 원본 활동 시각을 일반 상대에게 공개하지 않으면서 PR #291과 같은 서버 정본 판정을 사용한다.
- 메시지를 만들지 않는 면접·연락처 액션에서 새 응답 표본이 생긴 경우에도 양쪽 개인 room에 기존 `chat:list:updated`와 방의 `chat:room:updated`를 보내 평균 캐시가 다음 오프라인 표시 전에 낡지 않게 한다.
- presence 전파 실패는 메시지 송수신과 기존 운영자 presence를 실패시키지 않도록 격리한다.

### 6. 채팅 상태 뱃지 공용화

채팅 목록과 방 상세가 같은 순수 상태 판정과 뱃지 컴포넌트를 사용한다.

우선순위는 다음과 같다.

1. 탈퇴: `대화 불가능`
2. 차단·운영자 조치: 기존 차단 상태 문구
3. 양쪽 온라인: `대화 가능`; 소켓 connected일 때 `실시간 연결`
4. 상대 오프라인: `오프라인` + 응답 구간이 있을 때 평균 응답 뱃지
5. 초기 상태를 아직 불러오지 못함: 온라인을 추측하지 않고 성공 뱃지를 숨김

`오프라인`은 비활성 의미의 기존 neutral 토큰을 사용한다. 평균 10·30·60분은 정보성 neutral/secondary 톤을 사용하고 `응답 낮음`은 사용자를 처벌하는 오류가 아니므로 danger로 과장하지 않는다. 실제 tone은 기존 `ds.tsx` Badge 변형 중 대비와 일관성이 맞는 값을 재사용한다.

### 7. 공고 메타데이터 공용 뱃지

`JobMetadataBadges` 공용 컴포넌트와 순수 항목 조립 함수를 추가한다. 컴포넌트는 새 배지 구현을 만들지 않고 `@bambi-app/ui/components/badge`의 shadcn `Badge`를 직접 재사용한다. 기존 `ds.Badge`도 같은 primitive의 얇은 tone adapter이므로 상태 뱃지는 현재 API를 유지한다.

- 입력은 `region`, `district`, `industryCategory`, 선택적인 `industryRaw`처럼 의미가 분리된 값이다.
- 조립 함수가 trim·빈 값 제거·중복 제거·기존 수집 업종 원문의 세부 조각 보존을 담당한다.
- 컴포넌트는 `flex flex-wrap gap-*`과 기존 중립 `Badge`를 사용한다.
- 좁은 화면에서는 뱃지 단위로 자연스럽게 다음 줄로 이동하고 뱃지 내부 텍스트는 쪼개지지 않는다.
- 스크린리더에는 DOM 순서대로 `지역 → 세부지역 → 업종 → 세부업종`이 읽히며 색상만으로 종류를 구분하지 않는다.
- 상세의 원래 muted 한 줄보다 시각적 무게가 과도해지지 않도록 작은 기존 Badge 크기를 재사용한다.

적용 대상은 검색으로 식별한 실제 Web 사용자 화면을 기준으로 한다.

- 일반 공고 상세 `SeekerJobDetailResponsive`
- 수집 공고 상세 `SeekerCrawledJobDetail`
- 채팅방 데스크톱·모바일 헤더 `SeekerChatRoomResponsive`
- 실제 공고 목록 카드 `VisualJobCard`와 이를 사용하는 마켓플레이스 노출 섹션
- 공고 검색 결과 `JobSearchCommand`
- 공개 공고 랜딩 카드 `PublicJobLanding`은 업체명은 기존 텍스트로 분리하고 지역·세부지역·업종만 공용 뱃지 사용
- 구인자 공고 관리 요약과 표의 `직종·지역` 값(`apps/web/src/app/employer/page.tsx`, `EmployerJobsColumns`)
- 채팅 목록에 지역·업종 메타를 새로 추가하지 않는다. 현재 목록은 공고 제목·상대 이름·마지막 메시지만 표시하므로 요구하지 않은 정보와 높이를 만들지 않는다.
- 로그인 배경의 장식용 공고, 운영자 내부 표, legacy/prototype 화면, `InfoTile`처럼 가운데점 조합이 아닌 단일 의미 필드는 구조를 바꾸지 않는다.
- 최종 `rg` 감사에서는 `region/location/district`와 `industry/type`을 한 텍스트 행에서 가운데점으로 조합하는 실제 공고 렌더가 위 목록 밖에 남았는지만 확인한다. 업체명·제목·급여·후기 등 공고 분류가 아닌 값은 뱃지로 바꾸지 않는다.

업체명과 지역처럼 서로 다른 정보 문장을 합친 행, 리뷰·날짜·통계·광고 설명, 운영자 내부 표, 정적 온보딩 목업은 자동 치환하지 않는다.

## 구현 순서와 커밋 단위

### Task 1: 설계서

- 이 문서로 확정 정책, DB 정본, 권한, UI 범위와 검증 기준을 기록한다.
- 구현 중 실제 migration 파일명·범위·검증 결과가 달라지면 즉시 문서를 동기화한다.
- 권장 커밋 단위: `docs: 채팅 접속·응답시간과 공고 메타 뱃지 계획 작성`

### Task 2: 응답시간 migration·정책 서비스

- schema, 관계, `0117_chat-response-activities` SQL, snapshot, journal을 추가한다.
- 최근 30일 평균 구간 순수 함수와 DB batch 조회·표본 기록 함수를 구현한다.
- migration은 기존 데이터를 백필하지 않는다.
- 경계·연속 메시지·멱등성 테스트를 먼저 작성한다.
- 권장 커밋 단위: `feat: 채팅 사용자 응답시간 표본과 최근 30일 평균 정책 추가`

### Task 3: 모든 사용자 발신 경로에 표본 기록 배선

- 채팅 router의 텍스트·첨부·면접·연락처 메시지 insert와 메시지 없는 면접·연락처 상태 전이를 공용 helper에 연결한다.
- 원본 메시지·상태 전이와 activity/응답 표본은 같은 transaction에서 성공하거나 함께 롤백한다.
- 연속 발신, 발신 방향 전환, 첨부+텍스트, 요청 재시도 테스트를 추가한다.
- 권장 커밋 단위: `feat: 모든 채팅 발신 흐름에 응답시간 기록 연결`

### Task 4: 채팅 presence API·실시간 전파

- 목록·상세 초기 응답에 양쪽 상태와 상대 평균 구간을 추가한다.
- 기존 PostgreSQL presence listener에서 허용된 채팅 상대에게만 Socket.IO presence 이벤트를 전달한다.
- 멀티 인스턴스, listener resync, 시간 만료, 권한·개인정보 비노출 테스트를 추가한다.
- 권장 커밋 단위: `feat: 채팅 참여자 접속 상태를 실시간으로 전달`

### Task 5: 채팅 상태 뱃지 교정

- 목록과 상세의 기존 상시 `대화 가능`을 공용 상태 뱃지로 교체한다.
- `실시간 연결`은 양쪽 presence와 실제 socket connected를 함께 만족할 때만 표시한다.
- 상대 오프라인에는 `오프라인`과 선택적 평균 응답 뱃지를 표시한다.
- 차단·탈퇴 우선순위와 모바일·데스크톱 레이아웃을 회귀 테스트한다.
- 권장 커밋 단위: `fix: 채팅 상대 접속 상태에 맞게 대화 뱃지 표시`

### Task 6: 공고 메타데이터 뱃지 공용화

- 순수 항목 조립 함수와 `JobMetadataBadges`를 추가한다.
- 일반·수집 공고 상세, 공고 카드, 채팅 헤더와 확인된 실제 Web 렌더 위치를 전환한다.
- 중복·빈 값·수집 세부업종·긴 값·모바일 wrap 테스트를 추가한다.
- 권장 커밋 단위: `refactor: Web 공고 지역·업종 메타데이터를 공용 뱃지로 통일`

### Task 7: 통합 검증과 문서 동기화

- 최신 `develop`을 일반 merge로 다시 반영하고 migration 번호·journal·snapshot 충돌을 해결한다.
- 전체 관련 검증 결과와 잔여 수동 확인을 이 문서에 기록한다.
- 커밋·푸시·PR 생성은 하지 않고 사용자가 실행할 명령과 CMU02 형식의 이슈·PR 본문을 제공한다.

## 검증 기준

### 응답시간 정책·DB

- 빈 migration 적용 후 기존 `chat_message`가 있어도 표본 수 0
- 상대 첫 메시지 → 내 첫 답장 1건 생성
- 상대 연속 3개 → 내 첫 답장 1건, prompt는 연속 묶음의 첫 메시지
- 같은 발신자의 연속 메시지는 표본 없음
- 이후 방향이 다시 바뀌면 새 responder의 표본 1건
- 텍스트, 이미지, PDF, 면접 제안·상태 전이, 연락처 요청·응답·공개 액션을 모두 응답으로 인정
- 읽음·typing·방 입장·신고·차단·삭제는 activity를 만들지 않음
- 배포 전 메시지에 대한 배포 후 첫 답장은 표본을 만들지 않음
- 같은 방의 동시 액션은 advisory lock으로 순서가 고정되고 중복·음수 표본 없음
- 같은 message id 재시도 시 표본 중복 없음
- 메시지 transaction 실패 시 표본도 없음
- 30일 경계 안 표본만 평균에 포함하고 과거 표본은 제외
- 표본 1건부터 구간 계산
- 정확히 10·30·60분과 각 1초 초과 구간
- 방 삭제 cascade와 FK 무결성

### presence 권한·실시간

- 양쪽 온라인 + socket connected: `대화 가능`, `실시간 연결`
- 양쪽 온라인 + socket connecting/offline: `대화 가능`, 실시간 성공 뱃지 없음
- 상대 오프라인 + 평균 없음: `오프라인`만 표시
- 상대 오프라인 + 10·30·60분 구간: `오프라인`과 해당 평균 뱃지
- 상대 오프라인 + 60분 초과: `오프라인`, `응답 낮음`
- 차단·탈퇴 상태는 presence 뱃지를 덮어씀
- 상대가 다른 페이지에서 온라인/오프라인으로 바뀌어도 새로고침 없이 목록·방 상세 갱신
- 공유 채팅방이 없는 사용자의 presence 이벤트는 받지 못함
- 세션·connection id·정확한 마지막 활동 시각은 상대에게 노출하지 않고 서버 재조회용 만료시각만 전달
- 운영자 presence 화면과 SSE는 기존대로 동작
- listener 재연결 후 정본 query로 복구

### 공고 메타데이터 UI

- `서울 · 강남구 · 다방`이 세 뱃지로 표시
- `경기 · 성남시 · 룸싸롱 · 퍼블릭`이 네 뱃지로 표시
- district·industryRaw가 없으면 존재하는 값만 표시하고 빈 뱃지 없음
- 업종 정규값과 원문 조각이 같으면 중복 뱃지 없음
- 일반 공고 상세, 수집 공고 상세, 목록 카드, 채팅방 모바일·데스크톱 헤더에서 동일한 공용 컴포넌트 사용
- 작은 viewport에서 뱃지가 컨테이너 밖으로 넘치지 않고 뱃지 단위로 wrap
- 공고 외 가운데점 텍스트는 변경되지 않음
- 기존 제목·업체명·CTA·안전 안내·공고 이동 동작 유지

### 명령 검증

- `pnpm --filter @bambi-app/db check-types`
- `pnpm --filter @bambi-app/api test`
- `pnpm --filter @bambi-app/api check-types`
- `pnpm --filter server check-types`
- `pnpm --filter web check-types`
- 관련 Web Vitest
- 변경 파일 Ultracite/Biome
- `git diff --check`
- 임시 PostgreSQL에 `0000~0117` 전체 migration 적용
- 최신 `develop` 대비 migration 번호·journal·snapshot 재확인

## 배포 주의

- 배포 전 운영 DB에 `pnpm db:migrate`로 `0117_chat-response-activities`를 적용한다.
- `db:push`는 사용하지 않는다.
- migration은 기존 채팅을 백필하지 않으므로 배포 직후에는 대부분 `오프라인`만 보이고, 각 사용자의 첫 완료 응답부터 평균 뱃지가 생기는 것이 정상이다.
- DB/API/Server/Web 혼합 버전 배포 동안 새 응답 필드와 Socket.IO 이벤트는 선택적으로 처리해 구버전 Web이 깨지지 않게 한다.
- activity 보존량이 장기적으로 커질 수 있으므로 `(actor_user_id, occurred_at)` index를 유지한다. 삭제·집계 정책 변경은 실제 데이터량을 확인한 별도 작업으로 둔다.

## 구현 결과 및 검증 기록

- `chat_response_activity`와 `0117_chat-response-activities` migration을 추가했다. 기존 이력 백필 없이 메시지·면접 상태·연락처 상태 액션을 방 단위 advisory lock 안에서 직렬 기록하고, identity 순번으로 연속 actor 묶음의 첫 시각부터 응답 초를 계산한다.
- 최근 30일의 `response_seconds is not null` 표본을 사용자별 한 번의 집계로 읽고 10·30·60분·낮음 구간으로 변환한다. 표본이 없거나 30일이 지난 표본뿐이면 null이다.
- `chats.listMine`과 `getById`에 본인·상대 온라인 상태, 다음 정본 재조회 시각, 상대 응답 구간을 추가했다. 차단·탈퇴 대상의 presence·응답 정보는 목록 응답에서 숨긴다.
- PR #291의 PostgreSQL presence listener를 재사용해 변경 사용자 본인과 현재 유효한 채팅 상대의 Socket.IO 개인 room에 최소 상태만 전파한다. 신고·차단·나간 방은 상대 전파 대상에서 제외하고, 정책 변경·listener 재연결은 인증 socket 전체에 데이터 없는 resync 신호만 보낸다.
- 채팅 목록·방 상세·모바일 정보 서랍은 공용 `ChatAvailabilityBadges` 정책을 사용한다. 양쪽 온라인일 때 `대화 가능`, 실제 socket까지 connected일 때만 `실시간 연결`, 상대 오프라인일 때 `오프라인`과 선택적인 평균 응답 뱃지를 표시한다.
- 모바일 채팅 정보의 `공고 조건` 카드는 제목이 상태 뱃지 때문에 꺾이지 않도록 제목을 단독 행으로 유지하고, 접속·평균 응답 뱃지 묶음을 시급 행 바로 위에 배치했다. 데스크톱 채팅 헤더 배치는 변경하지 않았다.
- 공용 shadcn `Badge` 기반 `JobMetadataBadges`와 순수 조립 함수를 추가했다. 일반·수집 공고 상세, 채팅 헤더, 실제 공고 카드, 검색 결과, 공개 공고 랜딩, 구인자 공고 관리 모바일 카드·표를 전환했다. 지역·세부지역·정규 업종·수집 원문 세부업종을 빈 값·중복 없이 렌더한다.
- 메타데이터 값이 아니라 역할을 기준으로 광역지역은 기존 green, 세부지역은 기존 sky, 업종·세부업종은 연한 primary 토큰을 사용한다. 평균 응답시간과 `응답 낮음`은 기존 warning(amber) 뱃지로 통일하고 `오프라인`은 neutral을 유지한다.
- `apps/native` 파일은 수정하지 않았다. Native에서 기존 공용 API로 발생한 대화 액션만 서버 통계에 포함된다.
- 임시 빈 PostgreSQL DB에서 `0000~0117` 전체 118개 migration 적용과 `chat_response_activity` 생성에 성공했고 검증 DB는 삭제했다.
- DB/API/Server/Web 타입 검사가 통과했다.
- Web Vitest 전체 120 files / 919 tests가 통과했다.
- 응답 정책·activity 통합·면접 상태 응답·연락처 응답·Socket.IO 최소 payload·메타데이터 조립의 집중 API 테스트가 통과했다.
- API 전체 테스트는 최신 `develop` 기준의 기존 실패가 남아 있다. 격리한 빈 DB에서도 128 files 중 105 files, 1268 tests 중 1217 tests가 통과하고 23 files/51 tests가 실패했다. 실패는 기존 커뮤니티 입력 계약·사업자 서류 요구·알림 FK cleanup·공고 노출 fixture 등 이번 변경 밖이며, 이 작업의 집중 테스트는 별도로 통과했다.
- 로컬 렌더에서 공고 카드 뱃지가 썸네일 옆 좁은 칸에 세로로 쌓이는 것을 발견해 카드 전체 너비의 공용 메타 행으로 이동했고 가로 배치를 확인했다. 이후 내부 `.worktrees` 경로가 Web의 기존 `../../../packages/ui/src/styles/globals.css` 상대경로와 충돌해 Turbopack 재시작 렌더는 완료하지 못했다.
- 변경 파일 Biome, `git diff --check`, 최신 `origin/develop` 일치(`558fec44`), `0117` 번호 비충돌을 확인했다.
