# 사용자 온라인 접속 상태 설계·구현 계획

## 목표

로그인한 계정의 마지막 **인정 활동**과 살아 있는 클라이언트 연결을 바탕으로 온라인·오프라인 상태를 판정하고, 운영자가 사용자 관리·사용자 상세·출석 관리에서 새로고침 없이 상태 변화를 확인하게 한다. 오프라인 전환 시간은 사용자 관리 화면에서 운영자가 분 단위로 변경한다.

## 변경 불가 조건

- 기준 브랜치는 작업 시작 시점 최신 `origin/develop`의 `1945b213`이며 작업 브랜치는 `feat/user-online-presence`다.
- 커밋과 푸시는 사용자가 직접 수행한다.
- 사용자 관리와 출석 관리의 기존 표 외곽 너비·좌표·헤더 높이·행 높이·폰트·테두리·페이지네이션 위치는 유지한다.
- 요청으로 추가하는 접속 열·설정 UI, 사용자 상세 접속 배지, 출석 회원 셀 1줄화 외의 화면 배치와 동작은 바꾸지 않는다.
- 새 raw px·색상·문자 수 기반 자르기를 만들지 않는다. 기존 Tailwind 디자인 토큰과 공용 컴포넌트를 재사용한다.
- 이름·소속 업소·이메일·아이디·회원 표시는 실제 열 너비에서 CSS 말줄임표로 자르고 원문은 접근 가능한 설명으로 확인할 수 있게 한다.
- DB 스키마 변경은 `db:push`가 아니라 다음 Drizzle migration으로만 반영한다. 최신 `develop`의 마지막 번호는 `0114`이므로 이 기능이 `0115`를 선점한다. 아직 `develop`에 병합되지 않은 다른 작업 브랜치의 번호는 이 작업의 migration chain에 섞지 않는다.

## 확정된 사용자 요구사항

### 활동과 상태

- 추적 대상은 Web과 Native에 로그인한 구직자·구인자·법률자문·운영자다. 계정이 없는 guest는 제외한다.
- 첫 로그인 후 앱 화면이 데이터를 요청하는 순간 온라인으로 전환한다.
- 페이지 진입, 상세 조회, 검색, 페이지네이션, 등록·수정·삭제 등 사용자 행동이 유발한 인증 API 요청을 인정 활동으로 본다.
- API 요청이 업무 검증 오류로 끝나도 인증된 사용자의 행동이면 활동으로 인정한다. 인증되지 않은 요청은 인정하지 않는다.
- SSE 하트비트·재연결, Socket.IO 연결·재연결·타이핑, 자동 폴링, 자동 캐시 갱신은 인정 활동에서 제외한다.
- API 요청 없는 읽기·입력·스크롤·클라이언트 전용 필터는 활동으로 인정하지 않는다.
- 기본 오프라인 기준은 마지막 인정 활동으로부터 20분 이상 경과다.
- 운영자가 설정값을 바꾸면 저장 즉시 모든 사용자를 새 기준으로 다시 판정한다. 기준을 늘리면 최근 활동 사용자가 다시 온라인이 될 수 있고 줄이면 즉시 오프라인이 될 수 있다.
- 마지막 활동 기록이 없는 기존 계정은 오프라인이며 상세에는 `마지막 활동 기록 없음`을 표시한다.
- 탈퇴 계정은 항상 오프라인이다. 정지 계정은 실제 인증 활동이 있으면 온라인이다.
- 같은 계정의 여러 탭·기기 중 하나라도 연결돼 있으면 한 클라이언트의 정상 종료만으로 계정 전체를 오프라인으로 만들지 않는다.
- 마지막 연결의 정상 종료·명시적 로그아웃·앱 백그라운드는 감지되는 경우 즉시 오프라인 처리한다. 브라우저 강제 종료·전원 종료·통신 단절처럼 종료 신호가 서버에 도착하지 않으면 마지막 활동 제한시간으로 최종 오프라인 처리한다.

### 실시간 표시

- 운영자 브라우저가 사용자 전체 목록을 주기적으로 다시 조회하지 않는다.
- 인정 활동과 마지막 연결 종료는 DB 정본을 먼저 갱신하고 PostgreSQL 알림을 통해 모든 서버 인스턴스에 전달한다.
- 각 서버는 기존 알림 SSE와 분리된 운영자 전용 presence SSE로 상태 이벤트를 전달한다.
- 운영자 클라이언트는 이벤트의 대상 사용자만 로컬 캐시에 반영한다.
- 오프라인 제한시간 만료는 `lastActivityAt + offlineAfterMinutes`를 기준으로 브라우저의 단일 최근 만료 타이머가 처리한다.
- SSE 재연결 시 현재 사용자 목록과 설정 정본을 한 번 다시 조회해 유실 구간을 복구한다.
- 같은 사용자의 연속 API 호출은 서버의 조건부 갱신으로 10초 이내 한 번만 DB에 기록·전파한다. UI 허용 오차는 최대 10초다.

### 사용자 관리 화면

- 체크박스와 이름 사이에 체크박스와 같은 `size-4` 시각 크기의 접속 상태 원을 둔다.
- 헤더명은 `접속`이며 정렬 가능하다.
- 최초 정렬은 온라인 우선, 같은 상태에서는 마지막 활동이 최근인 순이다. 반대 정렬은 오프라인 우선이다.
- 온라인은 기존 성공 의미 토큰, 오프라인은 기존 비활성 의미 토큰을 사용한다. raw 색상값을 추가하지 않는다.
- 원에는 `온라인` 또는 `오프라인` 접근성 이름과 툴팁을 제공해 색상만으로 정보를 전달하지 않는다.
- 설정 폼은 상태 탭·`이름·이메일·로그인 아이디 검색`과 같은 첫 번째 행 오른쪽에 `오프라인 기준 : 마지막 활동기준 [숫자] 분 후, [저장]` 형태로 둔다.
- 설정 입력은 1 이상의 안전한 정수만 허용하고 기본값 20분을 DB/서비스의 공용 정책에서 제공한다. 빈 값·0·음수·소수·안전하지 않은 정수는 서버와 클라이언트 양쪽에서 거부한다. 인위적인 운영 최대치는 두지 않는다.
- 데스크톱에서는 기존 필터·버튼 위치를 바꾸지 않고 남는 오른쪽 공간을 사용한다. 공간이 부족한 폭에서만 설정 폼이 다음 줄 오른쪽으로 이동한다.
- 이름·소속 업소·이메일 사이의 기존 과한 여백을 접속 열에 재배분하되, 모든 셀은 한 줄이고 소속 업소가 길어도 행 높이가 변하지 않는다.
- 기존 이름 7자·이메일 20자 수동 자르기 함수는 제거하고 현재와 같은 열 시각 폭 안에서 CSS `truncate`를 사용한다.

### 사용자 상세 화면

- 프로필 카드의 기존 계정 상태 배지 옆에 `● 온라인` 또는 `● 오프라인` 배지를 둔다.
- 계정 상태와 접속 상태는 별도 정보이며 기존 정상·경고·정지·탈퇴 배지는 유지한다.
- 계정 정보에 `마지막 활동`을 추가하고 기존 날짜 포맷을 재사용한다.

### 출석 관리 화면

- 체크박스와 회원 사이에 사용자 관리와 같은 `접속` 열과 상태 원을 둔다.
- 회원 셀의 이름·로그인 아이디·`오늘 출석` 배지를 한 행에 표시한다.
- 셀 폭을 넘으면 텍스트만 말줄임하고 `오늘 출석` 배지는 줄바꿈 없이 유지한다.
- 기존 표 외곽 크기와 다른 열 위치는 접속 열에 필요한 최소 재배분 외에는 유지한다.

## 기술 설계

### 1. DB 정본

`user`에 다음 필드를 추가한다.

- `last_activity_at timestamp null`: 가장 최근 인정 활동 시각
- `presence_disconnected_at timestamp null`: 마지막 살아 있는 클라이언트가 정상 종료된 시각. 새 인정 활동 또는 새 연결이 생기면 null로 되돌린다.

`bambi_site_settings`에 다음 필드를 추가한다.

- `user_offline_after_minutes integer null`: null이면 공용 기본값 20분
- 1 이상의 정수 check constraint

여러 탭·기기를 구분하기 위해 transient 연결 테이블을 추가한다.

- `bambi_user_presence_connection`
- `id`는 클라이언트가 생성한 UUID
- `user_id` FK cascade
- `session_id`는 Better Auth session id
- `platform`은 `web | native`
- `connected_at`, `lease_expires_at`, `updated_at`
- 연결 종료 시 행을 삭제한다. 활동 이력으로 보관하지 않는다.
- `session_id`는 Better Auth `session.id` FK cascade로 연결하고 사용자·세션·lease 만료 조회 index를 둔다.
- 정상 close를 받지 못한 행은 lease가 지나면 살아 있는 연결로 취급하지 않는다. Web SSE 연결은 기존 heartbeat 주기에 서버 인스턴스가 보유한 연결 id를 한 번의 bulk UPDATE로 갱신하고, Native 연결은 앱 active 수명 동안 같은 lease 계약을 갱신한다.

사용자 상태 변경 trigger는 `pg_notify`로 사용자 id, last activity, disconnected 시각만 발행한다. 설정 변경 trigger는 새 제한시간을 발행한다. 알림은 트랜잭션 commit 뒤 전달되므로 SSE가 DB보다 앞서지 않는다.

### 2. 공용 presence 정책 서비스

`packages/api`에 순수 정책과 DB 동작을 분리한다.

- 기본 20분, 기록 병합 10초를 이름 있는 상수로 정의한다.
- `resolveOfflineAfterMinutes`, `isUserOnline`, 정렬값, 다음 만료시각 계산은 순수 함수로 작성하고 단위 테스트한다.
- 온라인 판정은 탈퇴 여부, 마지막 활동 존재, 제한시간 미경과, 정상 종료 이후 새 활동 여부를 함께 본다.
- 인정 활동 갱신은 `last_activity_at`이 없거나 10초 이상 지났거나 정상 종료 이후 첫 활동일 때만 조건부 UPDATE한다.
- 연결 등록은 같은 id를 idempotent upsert하고 `presence_disconnected_at`을 지운다.
- 연결 해제는 사용자별 transaction advisory lock 안에서 대상 연결을 삭제하고, lease가 남은 다른 연결이 없을 때만 `presence_disconnected_at`을 기록한다. 만료 행은 판정 전에 함께 정리해 서버 강제 종료가 이후 즉시 오프라인 판정을 영구 방해하지 않게 한다.
- 명시적 로그아웃은 현재 클라이언트 연결을 먼저 해제한 뒤 기존 auth sign-out을 실행한다.

### 3. 인정 활동 신호

공용 요청 헤더 이름과 값은 `packages/api`에서 한 번만 정의한다.

Web:

- oRPC 링크가 최초 문서 데이터 요청과 신뢰할 수 있는 클릭·제출·키보드 실행 직후의 요청에만 활동 헤더를 붙인다.
- 일반 문자 입력·스크롤은 신호를 만들지 않는다.
- 신호는 UI 허용 오차와 같은 공용 10초 유효시간과 1회 소비 방식으로 자동 폴링이 과거 클릭을 주워 활동으로 오판하지 않게 한다.
- SSR 요청은 사용자의 새 페이지 진입이므로 인증 세션이 있으면 활동 신호를 전달한다.

Native:

- 현재 Native에는 interval polling이 없으므로 oRPC 링크는 앱이 active 상태에서 발생한 요청에 활동 헤더를 붙인다. 공용 요청 옵션에 자동 요청용 activity opt-out을 제공해 이후 polling이 추가돼도 접속 상태를 연장하지 않게 한다.
- 앱 background/inactive 전환 시 현재 연결 해제를 best effort로 요청하고 active 복귀 시 연결을 재등록한다.

Server:

- `createContext`가 헤더를 boolean으로 정규화하고, 인증 세션과 활동 신호가 함께 있을 때 handler 실행 전에 인정 활동을 기록한다.
- 기록 위치를 `protectedProcedure`에 한정하지 않는다. 공고·커뮤니티처럼 로그인 사용자도 호출하지만 `publicProcedure`로 선언된 기존 API까지 빠짐없이 포함한다.
- 따라서 개별 router마다 코드를 복제하지 않는다. SSE·Socket.IO·OpenAPI reference는 활동 헤더를 보내지 않아 기록되지 않는다.
- 자동 요청은 클라이언트가 헤더를 붙이지 않으므로 활동이 되지 않는다.

### 4. 연결 수명과 종료

- Web의 기존 전역 알림 SSE는 모든 인증 셸에서 이미 하나만 열리므로 이 연결에 presence connection id를 함께 전달해 재사용한다.
- SSE 개시 시 연결을 등록하고 `close/error/세션 무효`에서 연결을 해제한다.
- `pagehide`에서는 keepalive 종료 요청을 보조로 보내 정상 탭 종료를 빠르게 반영한다.
- 중복 close는 idempotent다.
- Native는 앱 수명 연결 id를 유지하며 AppState로 등록·해제하고 lease를 갱신한다.
- 종료 신호가 유실된 연결은 온라인을 영구 유지시키지 않는다. 온라인의 절대 상한은 언제나 마지막 인정 활동 제한시간이다.

### 5. 운영자 presence SSE

- 서버에 admin 인증 전용 `/sse/presence`를 추가한다.
- 기존 CORS·rate-limit·heartbeat·세션 재검사 패턴을 재사용한다.
- 서버 패키지는 DB 패키지가 이미 사용하는 동일 `pg` 버전을 직접 의존성으로 선언한다.
- 각 서버 인스턴스는 전용 PostgreSQL Client의 `LISTEN`으로 DB trigger 이벤트를 수신하고 자기 인스턴스의 admin subscribers에 fan-out한다. 연결 오류에는 지수 백오프 재연결을 적용하고 서버 shutdown에서 listener와 timer를 정리한다.
- 연결 오류는 백오프 재연결하며, client SSE 재연결 때 목록·설정 query를 무효화한다.
- payload에는 개인정보를 넣지 않고 사용자 id와 상태 계산 필드만 담는다.

### 6. API 응답과 UI 캐시

- `moderation.listUsers`와 `attendance.adminList`에 `lastActivityAt`, `presenceDisconnectedAt`, 서버가 계산한 초기 `isOnline`을 추가한다.
- 사용자 상세는 같은 `ManagedUser` 정본을 사용한다.
- 사이트 설정 router에 admin get/update presence policy를 추가한다.
- 기존 사이트 설정 update 프로시저들이 별도 `adminModerationAction`을 만들지 않는 관례를 그대로 따라 presence 설정도 별도 감사 행을 추가하지 않는다.
- Web의 presence 훅은 사용자 이벤트를 두 목록 캐시에 patch하고 다음 오프라인 만료 타이머를 재예약한다.
- 타이머는 행마다 만들지 않고 가장 가까운 만료 하나만 예약한다.

### 7. 시각 규격 보존

- 접속 표시 공용 컴포넌트 `UserPresenceIndicator`를 만든다.
- 시각 원은 체크박스의 기존 `size-4` 디자인 토큰과 동일한 크기이며 클릭 컨트롤이 아니다.
- 사용자 표의 기존 `h-14`, `w-10`, `px-1`, 표 wrapper와 페이지 예약 높이는 그대로 둔다.
- 열 너비 규칙을 이름 있는 상수로 모으되 현재 Tailwind 토큰 값을 바꾸지 않는다.
- 수동 문자 자르기만 제거하고 `min-w-0`, `truncate`, `whitespace-nowrap`으로 실제 셀 폭을 제한한다.
- 사용자 표의 최초 온라인 우선 정렬은 공용 `DataTable`의 기본 정렬 동작을 바꾸지 않고 이 화면의 입력 배열만 `온라인 → 최근 활동`으로 안정 정렬한다. 접속 헤더 토글도 같은 상태 안에서는 최근 활동 순서를 유지한다.
- 첨부된 기준 화면과 동일 viewport에서 변경 전 screenshot·DOM bounding box를 먼저 저장하고, 변경 후 외곽·행·헤더·페이지네이션 위치를 비교한다.

## 구현 순서

1. migration 번호·journal·snapshot 최신 상태 확인 후 schema와 `0115` migration 생성
2. presence 순수 정책·DB 서비스와 단위 테스트
3. Context 전역 인증 활동 기록 배선(`publicProcedure`의 로그인 호출 포함)
4. Web/Native 활동 신호와 연결 수명 배선
5. PostgreSQL LISTEN → admin presence SSE와 Web 구독 훅
6. 사이트 설정 get/update와 사용자 관리 설정 폼
7. 사용자 목록 접속 열·정렬·말줄임·공간 재배분
8. 사용자 상세 접속 배지·마지막 활동
9. 출석 관리 접속 열·회원 한 줄 표시
10. 관련 API·Web·Native 테스트와 문서 검증
11. 최신 `develop` 반영 여부와 migration 충돌 재확인(커밋·푸시는 하지 않음)

## 검증 기준

### 정책 단위 테스트

- 기록 없음, 제한 직전, 정확히 제한 도달, 제한 경과
- 설정 1·10·20·100분과 큰 안전 정수
- 정상 종료 뒤 새 활동 전/후
- 탈퇴·정지 계정
- 온라인/오프라인 정렬과 동일 상태 최근 활동 순
- 10초 조건부 기록 경계

### API·통합 검증

- 인증 활동 헤더가 있을 때만 last activity 갱신
- 자동 요청·SSE heartbeat·Socket typing은 미갱신
- 여러 연결 중 하나 종료 시 온라인 유지, 마지막 연결 종료 시 즉시 오프라인
- 중복 연결 등록·종료 idempotency
- 설정 저장 검증과 즉시 재판정
- presence API와 SSE는 admin 외 접근 거부
- DB notify가 다른 서버 listener에도 전달 가능한 wire format
- server listener 연결 실패·재연결·shutdown 정리
- lease 갱신·만료 연결 무시·만료 행 정리

### 화면 검증

- 사용자 관리 최초 온라인 우선, 헤더 토글 반대 정렬
- 활동 이벤트 수신 후 대상 행만 초록색으로 변경
- 설정 시간 도달 시 새로고침 없이 회색으로 변경
- 설정 20→10, 20→100 저장 직후 전체 재판정
- 사용자 상세 배지와 마지막 활동
- 출석 관리 접속 열과 `이름 · 아이디 · 오늘 출석` 한 줄
- 긴 이름·업소·이메일·아이디에서 2줄 없음, `…`와 원문 설명 제공
- 9개/10개 행에서 기존 예약 높이와 페이지네이션 위치 유지
- 기존 기준 viewport에서 표 외곽·행 높이·헤더 높이·필터와 버튼 위치가 요청 변경 외 동일
- 좁은 viewport에서는 표 가로 스크롤과 설정 폼 줄바꿈만 발생하며 셀은 한 줄

### 명령 검증

- `pnpm --filter @bambi-app/db check-types`
- `pnpm --filter @bambi-app/api test`
- `pnpm --filter @bambi-app/api check-types`
- `pnpm --filter server check-types`
- `pnpm --filter web check-types`
- `pnpm --filter native check-types`
- 관련 Web/Native Vitest
- 변경 파일 Ultracite/Biome
- `git diff --check`

## 배포 주의

- 배포 전 운영 DB에 `0115` migration을 적용한다.
- Web과 API 서버를 혼합 버전으로 순차 배포하는 동안 새 헤더·필드는 선택적으로 처리해 구버전 클라이언트가 깨지지 않게 한다.
- PostgreSQL LISTEN 연결 실패 시 상태 정본과 시간 기반 오프라인 판정은 유지되지만 즉시 온라인 push가 지연된다. SSE 재연결 정본 조회로 복구한다.
- 전체 접속 이력은 보관하지 않는다. 최신 마지막 활동과 현재 transient 연결만 저장한다.

## 구현 결과 및 검증 기록

- `0115_user-presence` migration으로 사용자 마지막 활동·정상 종료 시각, 사이트 오프라인 기준, Web/Native transient 연결 lease와 PostgreSQL notification trigger를 추가했다.
- 인증 세션과 명시적 활동 헤더가 함께 있는 모든 oRPC 요청에서 마지막 활동을 기록하고, 10초 조건부 UPDATE로 연속 요청의 DB 쓰기·이벤트를 합쳤다.
- Web은 최초 진입·클릭·제출·키보드 실행 뒤 1회 활동 신호만 보내며 자동 polling·prefetch·SSE heartbeat는 신호를 보내지 않는다. Native lifecycle renew도 활동 신호 없이 실행한다.
- 기존 알림 SSE 연결을 Web connection lifecycle로 재사용하고 Native AppState 연결을 추가했다. 마지막 유효 연결 종료와 명시적 로그아웃은 즉시 오프라인을 기록하며 유실된 종료는 설정 시간으로 제한한다.
- 운영자 전용 presence SSE와 PostgreSQL `LISTEN/NOTIFY`를 연결해 전체 목록 polling 없이 대상 사용자 이벤트만 반영한다. 재연결 시 정본 query를 다시 읽는다.
- 사용자 관리 첫 번째 행의 검색 오른쪽에 오프라인 기준 설정을 배치했다. 사용자 관리·사용자 상세·출석 관리에 공용 `size-4` 접속 표시를 사용했다.
- 사용자 관리 이름·이메일 문자 수 자르기를 제거하고 실제 열 너비 CSS 말줄임으로 바꿨다. 출석 회원 이름·아이디·오늘 출석을 한 줄에 유지했다.
- 임시 PostgreSQL 18에서 `0000~0115` migration 전체 적용 성공, trigger 2개·신규 컬럼·연결 등록/활동 기록/마지막 연결 종료를 실DB로 확인했다.
- 브라우저 실측에서 PostgreSQL 사용자 활동 UPDATE 후 새로고침 없이 오프라인→온라인 변경, 온라인 우선 재정렬, 기준 20→100 저장 즉시 반영, 탭 종료 즉시 연결 0·종료 시각 기록을 확인했다.
- 사용자 관리와 출석 관리 데이터 행 높이는 모두 기존 56px, `nowrap`이 아닌 데이터 셀은 0개였으며 표 너비는 기존 컨테이너 1070px 안에서 유지됐다.
- DB·API·Server·Web·Native TypeScript 검사 통과, presence 정책 4건과 Web UI 회귀 7건 통과, 변경 파일 Biome 및 `git diff --check` 통과.
- 개발 시드의 공고 이미지 파일 부재 경고 외 presence·사용자 관리·출석 관리 관련 브라우저 오류는 없었다.

### PR #291 동료 리뷰 반영

- 연결 재등록이 `presenceDisconnectedAt`을 null로 복구하도록 수정해 SSE 재연결·Native foreground 복귀 뒤 다음 클릭 전까지 오프라인에 고착되는 문제를 해소했다. 재연결은 마지막 활동 시각을 연장하지 않는다.
- 사용자 목록의 오프라인 기준 조회를 즉시 await해 floating promise의 unhandled rejection 가능성을 제거했다.
- `createContext`의 presence 부가 기록 실패를 본 요청과 격리해 일시적 DB 오류가 무관한 API를 실패시키지 않게 했다.
- Web connection id는 `sessionStorage`·Web Crypto 접근을 방어하고 검증된 저장 id → `crypto.randomUUID` → 탭 수명 인메모리 UUID 순으로 폴백한다.
- presence 구독과 10초 시계 tick을 대형 `ModProvider` 밖으로 옮겨 사용자 목록·사용자 상세·출석 화면만 다시 계산하도록 제한했다.
- Native 자동 presence 호출 제외를 전역 depth가 아니라 oRPC path 단위로 판정해 동시에 발생한 실제 사용자 요청의 활동 헤더가 사라지지 않게 했다.
- Native connect 진행 중 background 전환을 `shouldBeConnected`와 in-flight promise로 직렬화해 완료 뒤 유령 lease가 남지 않게 했다.
- `useSyncExternalStore` 서버 snapshot의 기준시각을 실제 현재시각으로 바꿔 향후 SSR/prefetch에서도 활동 기록 사용자가 잘못 온라인으로 렌더되지 않게 했다.
- 기존 `SITE_SETTINGS_ROW_ID`, SSE heartbeat·세션 재검사 정책을 재사용하고 presence 경로·query key·분 환산값을 공용 상수로 모았다. 온라인 정렬의 임의 `padStart(15)`도 제거했다.
- 동료 리뷰 회귀 5건을 추가해 Web UI 12건과 presence 정책 4건이 통과했다. DB·API·Server·Web·Native 타입 검사와 변경 파일 Biome, `git diff --check`가 통과했다.
- 임시 PostgreSQL 18에서 활동 → 마지막 연결 종료 → 같은 연결 재등록을 실행해 `presence_disconnected_at`이 다시 null이 되는 것을 확인했다.
- 추가 감사에서 PostgreSQL `LISTEN`만 재연결되고 운영자 SSE는 유지되는 경우의 유실 구간을 발견해, listener 복구 시 `resync` 이벤트를 보내 사용자·설정 정본을 다시 읽도록 보완했다.
