# 공지 다중 게시판 노출·포인트 광고 보상·운영자 개인 UI 정리 Implementation Plan

## 목표

운영자가 공지사항을 한 번 작성해도 선택한 여러 게시판의 일반 글보다 위에 함께 노출되게 하고, 프리미엄·스페셜·추천 광고에서 매일 공통으로 선정되는 포인트 광고를 회원이 클릭하면 유형별 24시간에 한 번 포인트를 받게 한다. 동시에 운영자 개인 화면에서 불필요한 포인트·등급 노출을 제거하고 구직자·구인자 포인트 내역 화면에는 기존 내 정보 화면과 같은 좌우 광고 레일을 붙이며, 기타 포인트 설정을 세 개의 명확한 아코디언 그룹으로 재구성한다.

이 문서는 `feat/notice-cross-board-point-ad-rewards` 브랜치에서 구현할 전체 범위의 정본이다. 구현 중 기능을 생략하거나 임의로 축소하지 않는다. 코드와 문서가 충돌하면 사용자 확정 요구사항과 이 문서를 먼저 다시 대조하고, 필요한 경우 구현 전에 사용자에게 확인한다.

## 브랜치와 기준

- 기준 브랜치: `origin/develop`
- 기준 커밋: `b2282cf2` (`Merge pull request #230 from beyondsoft-kr/fix/moderator-qa-defects`)
- 작업 브랜치: `feat/notice-cross-board-point-ad-rewards`
- worktree: `C:\Users\user\bambi\.worktrees\notice-cross-board-point-ad-rewards`
- 사용자가 직접 커밋하고 푸시한다. 구현자는 커밋·푸시·머지를 수행하지 않는다.
- 강제 푸시 명령(`--force`, `--force-with-lease`)은 사용하거나 안내하지 않는다.
- PR 직전에 최신 `origin/develop`을 merge하고 충돌·마이그레이션 이력을 다시 검증한다.

## 절대 원칙

- 하드코딩하지 않는다. 게시판 목록·라벨은 `community_board`, 포인트 금액은 `bambi_site_settings`, 광고 후보는 현재 활성 광고/수집 공고 조회를 정본으로 사용한다.
- 기존 `Accordion`, `Switch`, `Checkbox`, 광고 배너·공고 카드·포인트 원장·알림·게시판 접근 정책을 재사용한다.
- DB 변경은 `db:push`가 아니라 Drizzle schema 변경 후 `db:generate`로 migration을 생성한다.
- 현재 최신 develop migration은 `0106_acoustic_triathlon`이며 본 작업 migration은 `0107_tricky_crystal`로 생성했다.
- 운영자 개인 포인트 제거와 운영자용 회원 포인트 관리 기능을 혼동하지 않는다. 운영자 콘솔의 회원 포인트·출석·기타 설정·포인트몰 관리는 유지한다.
- 포인트 지급 판정은 클라이언트 표시를 신뢰하지 않고 서버 트랜잭션에서 다시 검증한다.
- 공지 다중 노출은 게시물을 복제하지 않는다. 공지 한 행과 노출 게시판 연결만 저장해 수정·삭제·댓글·조회수·좋아요가 모든 노출 위치에서 하나로 유지되게 한다.

## 확정 요구사항

### 1. 운영자 개인 포인트 기능 제거

- 플랫폼 역할 `admin`은 개인 포인트를 사용하지 않는다.
- 운영자의 내 정보 화면에서 포인트 요약 카드와 포인트 조회 API 호출을 제거한다.
- 운영자의 개인 메뉴에서 `포인트 내역`을 숨긴다.
- 운영자에게 출석체크, 보유 포인트, 포인트 내역, 내 아이템, 포인트몰 구매 내역과 개인 포인트몰 사용 UI를 노출하지 않는다.
- 운영자가 개인 포인트 URL에 직접 접근해도 개인 포인트 화면을 렌더하거나 관련 API를 호출하지 않고 운영자 기본 화면으로 이동시킨다.
- 운영자 콘솔의 회원 포인트 조회·조정, 출석 관리, 기타 포인트 설정, 포인트몰 관리는 그대로 유지한다.

### 2. 공지사항 다중 게시판 노출

- 공지사항 글쓰기에서 운영자는 현재 활성 상태인 실제 게시판들을 복수 선택할 수 있다.
- 게시판 선택 목록은 DB `community_board`에서 동적으로 읽는다. 이후 운영자가 게시판을 추가하면 코드 변경 없이 자동으로 선택 목록에 나타난다.
- 가상 게시판 `best`는 실제 저장 게시판이 아니므로 선택 대상이 아니다.
- 공지사항 게시판은 공지가 항상 올라가는 기본 위치이므로 선택 목록에서 제외한다.
- 비활성 게시판은 새 선택 목록에 노출하지 않는다. 기존 배치가 나중에 비활성화된 게시판을 가리키면 해당 게시판 자체가 비노출이므로 공지도 함께 보이지 않는다. 다시 활성화하면 기존 연결을 복원해 보인다.
- 운영자가 선택한 모든 실제 게시판에는 같은 공지 한 건이 표시된다. 게시물 행을 게시판별로 복제하지 않는다.
- 공지의 제목·본문·댓글 작성 불가·비밀글 잠금·이벤트 표시 등 옵션은 모든 노출 위치에서 동일하다.
- 공지를 수정하면 모든 노출 위치에 즉시 반영된다.
- 공지를 삭제·숨김 처리하면 모든 노출 위치에서 함께 사라진다.
- 댓글·좋아요·조회수는 노출 게시판별로 나누지 않고 공지 한 건에 통합한다.
- 선택 게시판에서 공지를 눌러도 같은 공지 상세를 연다.
- 비밀글 게시판에 노출된 공지 작성자도 `밤비`로 익명화하지 않고 `운영자`로 표시한다. 공지의 저장 게시판은 `notice`, 작성 역할은 `admin`으로 유지한다.
- 기존 정책대로 이벤트 표시와 비밀글 잠금은 동시에 사용할 수 없다. UI 상호 배타 처리와 서버 검증을 모두 유지한다.

### 3. 공지 작성 UI와 정렬

- 공지사항 글쓰기의 옵션 영역은 `댓글 작성 불가`, `비밀글로 잠그기`, `이벤트로 표시하기`를 같은 옵션 묶음에서 보여준다.
- `비밀글로 잠그기` 아래에 `게시판 선택하기` 아코디언을 둔다.
- 아코디언 제목에는 선택 개수를 함께 보여준다. 예: `게시판 선택하기 · 3개 선택`.
- 아코디언 내부는 버튼형 토글이 아니라 게시판별 `Checkbox` 목록이다.
- 작성뿐 아니라 공지 수정 화면에서도 기존 선택값을 불러오고 추가·해제할 수 있다.
- 공지사항 게시판의 정렬은 기존 규칙을 유지한다.
  - 이벤트 공지가 항상 일반 공지보다 위다.
  - 이벤트 공지끼리는 작성 시각 최신순이다.
  - 일반 공지끼리도 작성 시각 최신순이다.
  - 동일 시각이면 ID 내림차순으로 안정 정렬한다.
- 공지를 선택한 다른 게시판에서는 다음 순서를 적용한다.
  - 해당 게시판에 연결된 공지들이 모든 일반 글보다 위다.
  - 연결된 공지끼리는 이벤트 여부와 관계없이 작성 시각 최신순이다.
  - 그 아래에 해당 게시판 일반 글을 기존 최신순으로 둔다.
  - 동일 시각이면 ID 내림차순으로 안정 정렬한다.
- 목록 페이지네이션과 홈 미리보기 모두 같은 정렬 함수를 사용한다. 공지가 여러 개여도 페이지 사이에서 중복되거나 누락되지 않게 DB 정렬·offset·limit 단계에서 하나의 결과 집합으로 처리한다.
- 공지 노출도 기존 검색·내 글·광고글/업소글 필터와 잠금 제목 마스킹을 같은 방식으로 통과한다.
- PR #227이 고정한 수다방 홈의 `공지사항 1행`, `베스트글 2행 첫 칸` 배치를 유지한다. 다중 노출 공지는 각 게시판 미리보기의 글 순서만 바꾸며 게시판 카드 자체의 고정 행·위치는 바꾸지 않는다.
- PR #227이 분리한 비밀글 읽기(`resolveCommunityReaderForBoard`)와 쓰기(`resolveCommunityActorForBoard` + `assertSecretActorIdentity`) 권한을 유지한다. 비밀글 게시판에 연결된 운영자 공지를 읽는다고 해서 일반 사용자의 비밀글 작성 자격이 완화되지 않는다.

### 4. 운영자·관리자 등급 숨김

- 플랫폼 역할 `admin`에는 회원 등급을 계산하거나 화면에 표시하지 않는다.
- 게시글 목록·상세, 댓글, 프로필, 내 정보, 포인트 화면, 운영자 사용자 목록 등 공용 `GradeBadge` 소비 위치에서 운영자 등급은 항상 `null`이어야 한다.
- 비밀글의 기존 등급 숨김 정책도 유지한다.
- 운영자 등급 관리 화면 자체와 일반 회원의 등급 관리·표시는 유지한다.
- 웹에서만 조건부로 감추지 않고 `loadGradeBadges`의 공용 배치 조회가 `admin`을 제외해 모든 소비처가 같은 정책을 재사용하게 한다.

### 5. 포인트 내역 좌우 광고 레일

- 구직자 `/seeker/attendance`와 구인자 `/employer/attendance` 포인트 내역 화면에 기존 내 정보 화면과 같은 좌측 가로 배너 3칸·우측 세로 배너 3칸을 표시한다.
- 기존 `SeekerMeLayout`의 레일 구조와 `HorizontalAdBannerRail`, `AdBannerRail`, `useAdBannerJobs`, `SEEKER_CONTENT_WIDTH`를 재사용 가능한 공용 레이아웃으로 추출한다.
- 기존과 동일하게 초광폭 `min-[1720px]` 이상에서만 사이드 레일을 표시하고 모바일·일반 데스크톱 폭은 현재 중앙 화면을 유지한다.
- 구직자와 구인자 양쪽 포인트 내역의 중앙 콘텐츠 폭·정렬을 기존 내 정보 화면과 맞춘다.
- 운영자는 개인 포인트 화면 자체가 없으므로 이 레일 적용 대상이 아니다.

### 6. 포인트 광고 선정

- 포인트 광고 유형은 `premium`, `special`, `recommended` 세 가지다.
- 매일 00:00 KST에 유형별 대상 한 건, 총 세 건을 모든 사용자에게 공통으로 선정한다.
- 선정은 서버 시각과 KST 날짜를 사용하며 클라이언트 날짜를 신뢰하지 않는다.
- 00시에 별도 배치가 반드시 실행돼야만 기능하는 구조로 만들지 않는다. 해당 날짜의 첫 광고 조회가 들어오면 서버가 트랜잭션과 유형별 advisory lock 아래에서 그날의 공통 선정을 멱등 생성한다.
- 같은 날짜·유형에는 DB unique 제약으로 한 대상만 존재한다.
- 후보는 해당 시점에 실제 노출 가능한 내부 광고와 노출 설정이 켜진 외부 수집 공고를 모두 포함한다.
- 내부 후보 조건:
  - 공고가 공개 가능한 상태다.
  - 결제·노출 기간·대기열 등 기존 광고 노출 자격을 통과한다.
  - `premium`은 현재 프리미엄 배너 후보 풀, `special`과 `recommended`는 기존 섹션 활성 후보 풀을 재사용한다.
- 외부 수집 후보 조건:
  - 공고 상태가 active이고 기존 수집 노출 스위치가 켜져 있다.
  - `premium`은 수집 광고 배너 후보 풀, `special`과 `recommended`는 기존 수집 섹션 후보 풀을 재사용한다.
- 후보가 없는 유형은 그날 대상 없음으로 응답하고 스티커·보상을 만들지 않는다. 다른 유형에서 추가 대상을 뽑아 보충하지 않는다.
- 선정 대상이 당일 중 비활성·만료·삭제되어 더 이상 열 수 없으면 같은 날짜·유형 lock 아래에서 현재 유효 후보로 교체한다. 교체 결과도 모든 사용자에게 동일하다.
- 랜덤 선택은 UI 새로고침마다 바뀌지 않는다. DB에 저장된 그날의 선정 행이 정본이다.

### 7. 포인트 스티커 노출 위치

- `premium`으로 선정된 광고에는 그 광고가 나타나는 모든 프리미엄 배너 지면에서 포인트 스티커를 붙인다.
  - 좌측 가로 프리미엄 배너 레일
  - 중앙 가로 프리미엄 배너 레일
  - 우측 세로 프리미엄 배너 레일
- 프리미엄 광고가 여러 지면에 보이더라도 프리미엄 보상은 계정당 한 번뿐이다.
- `special` 선정 대상은 중앙 스페셜 공고 카드에 스티커를 붙인다.
- `recommended` 선정 대상은 중앙 추천 공고 카드에 스티커를 붙인다.
- 스티커는 카드/배너의 기존 클릭 영역 안에 장식으로 얹고 별도 보상 버튼을 만들지 않는다. 사용자는 스티커가 붙은 광고 자체를 클릭한다.
- 스티커는 보상 금액을 노출하지 않고 `동전 아이콘 + POINT`로 표시한다. 설정이 null이거나 운영자가 0으로 저장하면 포인트 광고 기능을 비활성화하고 스티커를 표시하지 않는다.
- 기존 카드의 HIT 리본, 광고 등급 배지, 배너 레이아웃과 겹치지 않는 좌측 상단 오버레이로 배치하고 `pointer-events-none`으로 기존 링크 클릭을 방해하지 않는다.
- 보상을 받을 수 없는 다음 사용자에게는 스티커를 표시하지 않는다.
  - 운영자
  - 해당 유형 보상 수령 후 24시간이 지나지 않은 회원
  - 내부 공고의 소유 조직에 속한 구인자
- 클라이언트의 스티커 숨김은 안내용일 뿐이며 서버가 동일 조건을 다시 검증한다.

### 8. 포인트 지급과 24시간 제한

- 보상 대상은 로그인한 `job_seeker`와 `employer`다.
- 역할을 바꾸더라도 같은 계정이면 보상 이력을 공유한다.
- 운영자와 법률자문 역할에는 지급하지 않는다.
- 프리미엄·스페셜·추천은 서로 독립된 세 개의 24시간 쿨다운을 갖는다.
- 쿨다운은 달력일이 아니라 해당 유형 포인트가 실제 지급된 `rewarded_at`부터 정확히 24시간이다.
- 예: 프리미엄 10시 수령, 스페셜 18시 수령이면 다음 프리미엄은 다음 날 10시 이후, 다음 스페셜은 다음 날 18시 이후다.
- 포인트를 받지 않은 유형은 쿨다운이 시작되지 않는다.
- 매일 00시에 대상 광고가 바뀌어도 개인 쿨다운이 남아 있으면 새 대상 클릭으로 중복 지급하지 않는다.
- 세 유형을 모두 받을 수 있고 설정값이 10P이면 한 주기에서 최대 30P다.
- 내부 공고는 클릭 회원이 그 공고 조직의 소유자·대표·관리자·구성원인지 서버에서 조직 membership으로 검사한다. 자기 회사 공고면 지급하지 않는다.
- 외부 수집 공고는 밤비 내부 소유 조직이 없으므로 자기 회사 제외 판정을 적용하지 않는다.
- 지급 금액은 클릭 처리 시점의 최신 `bambi_site_settings.point_job_reward_points`를 사용한다. 선정 시점 금액을 snapshot으로 고정하지 않는다.
- 0P 설정은 보상 기능 중지다. 보상 이력을 만들거나 0원 원장·알림을 쌓지 않는다.
- 광고 클릭은 기존 상세 링크 이동을 유지하면서 보상 mutation을 호출한다. 보상 요청 실패가 상세 이동을 막지 않는다.
- 서버는 요청으로 받은 유형·대상 ID가 오늘 DB 선정 행과 정확히 일치하고 현재도 유효한지 확인한다.
- 계정·유형 advisory lock으로 동시에 여러 탭에서 클릭해도 한 번만 지급한다.
- lock 안에서 최근 동일 유형 보상 시각을 확인하고 24시간 미경과면 no-op 결과를 반환한다.
- 포인트 적립은 기존 `awardMemberPoints`와 포인트 상한 정책을 재사용한다.
- 보상 이력에는 사용자, 유형, 대상 원천(내부/수집), 대상 ID, 공고 제목 snapshot, 실제 적립액, 선정 KST 날짜, 지급 시각을 저장한다.
- 포인트 원장에는 `point_job_view` reason, 공고 제목을 포함한 description, 보상 이력 ID 기반 external key를 저장해 재시도에도 멱등하게 한다.
- 포인트 상한 때문에 설정액보다 실제 적립액이 줄어든 경우 보상 이력·토스트·알림에는 `awardMemberPoints`가 반환한 실제 적립액을 사용한다.

### 9. 포인트 지급 알림과 내역

- 실제 적립액이 1P 이상일 때만 개인 알림을 만든다.
- 알림은 기존 `notification_target_type = point_transaction`을 재사용하고 신규 enum 값을 추가하지 않는다.
- metadata action은 `point_job_reward`로 구분하고 유형, 공고 제목, 실제 적립액, 내부/수집 대상 ID를 포함한다.
- 알림 문구는 유형을 포함한다. 예: `스페셜 포인트 공고를 확인해 10포인트를 받았어요.`
- 알림 딥링크는 해당 내부 공고 또는 수집 공고 상세로 연결한다.
- 알림 생성은 포인트 트랜잭션 커밋 후 best-effort로 수행해 알림 장애가 포인트 지급을 롤백하지 않게 한다.
- 포인트 내역 라벨에 `포인트 공고 확인`을 추가하고 description의 공고 제목을 표시한다.
- 클라이언트는 성공 시 실제 적립액을 토스트로 알리고 관련 포인트·알림·광고 선정 query를 invalidate한다.

### 10. 기타 포인트 설정 아코디언

- 기타 포인트 설정의 순서는 정확히 다음과 같다.
  1. `회원가입과 출석`
  2. `공고 포인트`
  3. `게시판별 작성 포인트`
- 세 상위 행 모두 기존 shadcn `Accordion`으로 접고 펼친다. 여러 그룹을 동시에 펼칠 수 있는 `multiple` 모드를 사용한다.
- 최초 진입 시 세 그룹은 접힌 상태로 시작한다.
- 각 상위 행은 primary 배경을 사용하지 않고 기본 카드 배경을 유지한다. 예시 카드와 같은 얇은 시맨틱 테두리와 약한 그림자로 각 행을 독립적으로 구분한다.
- `회원가입과 출석` 안에는 기존 필드를 그대로 이동한다.
  - 회원가입 포인트
  - 출석 포인트
- `공고 포인트` 안에는 기존 필드와 신규 필드를 배치한다.
  - 후기 작성 포인트
  - 다른 구직자 후기 열람 포인트
  - 포인트 공고 확인 포인트
  - 공고 등록 결제 최소·최대 사용 포인트는 기존 기능을 보존하되 사용자가 지정한 세 항목에 섞지 않고 아코디언 아래의 `공고 결제 포인트 사용` 영역에 유지한다.
- `게시판별 작성 포인트` 안에는 기존 DB 기반 게시판별 하위 아코디언을 그대로 재사용한다.
- 새 게시판을 운영자가 만들면 기존 `getPointSettings().boards` 결과를 통해 자동으로 하위 목록에 나타난다.
- 전역 설정은 기존 통합 저장 mutation을 재사용·확장한다. 게시판별 저장 버튼은 기존 동작을 유지한다.

### 11. 유형별 포인트·로테이션 시간과 쿨타임 재조정

- 기존 단일 `포인트 공고 확인` 설정을 유형별 두 필드, 총 여섯 필드로 세분화한다.
  - 프리미엄 지급 포인트 / 프리미엄 로테이션 시간
  - 스페셜 지급 포인트 / 스페셜 로테이션 시간
  - 추천 지급 포인트 / 추천 로테이션 시간
- 각 유형의 로테이션 시간은 그 유형의 개인별 재지급 쿨타임과 같은 시간이다.
- 유형별 지급 포인트가 null 또는 운영자가 저장한 0이면 그 유형만 스티커·선정·보상을 비활성화한다.
- 로테이션 시간이 실제로 바뀐 유형만 기존 활성 쿨타임을 조정한다. 같은 값을 다시 저장하거나 포인트 금액만 변경하면 쿨타임을 건드리지 않는다.
- 변경 시 기존 남은 시간을 `R`, 새 시간을 `N`이라 할 때:
  - `R <= N`: 쿨타임을 현재 시각으로 초기화해 즉시 재수령 가능
  - `R > N`: 기존 쿨타임 종료 시각에서 N시간을 차감
- 시간 변경 즉시 해당 유형의 현재 전역 선정 광고를 폐기한다. 다음 조회에서 새 광고를 무작위 선정하고 저장 시각 이후 새로운 N시간 로테이션을 시작한다.
- 세 유형은 금액·로테이션·선정·개인 쿨타임을 전부 독립적으로 관리한다.

## 데이터 설계

### `community_notice_board_placement`

공지 한 건을 여러 게시판 목록에 노출하는 연결 테이블이다.

- `post_id uuid not null` → `community_post.id` `on delete cascade`
- `board_key text not null` → `community_board.key`
- `created_at timestamp not null default now()`
- 복합 PK 또는 unique: `(post_id, board_key)`
- 조회 인덱스: `(board_key, post_id)`
- CHECK/서버 검증: 연결 대상 post는 `community_post.board = 'notice'`
- 서버 검증: `board_key != 'notice'`, 실제 존재하고 활성인 게시판만 새로 저장

기존 공지에는 연결 행을 backfill하지 않는다. 기존처럼 공지사항 게시판에만 남는다.

### `point_job_reward_category`

- 값: `premium`, `special`, `recommended`
- 사용자 요구로 고정된 보상 유형이며 화면 라벨·후보 서비스·쿨다운 키가 같은 enum을 사용한다.

### `point_job_target_source`

- 값: `job_post`, `crawled_job_post`
- 내부·수집 공고의 다형 대상 식별자다.

### `bambi_point_job_daily_selection`

- `id uuid primary key`
- `selected_on date not null`: KST 날짜
- `category point_job_reward_category not null`
- `target_source point_job_target_source not null`
- `target_id uuid not null`
- `title_snapshot text not null`
- `selected_at timestamp not null default now()`
- unique `(selected_on, category)`
- 인덱스 `(target_source, target_id)`

대상이 삭제돼도 당일 선정·보상 감사 기록을 남기기 위해 다형 FK는 걸지 않고 서비스가 유효성을 검증한다.

### `bambi_point_job_reward`

- `id uuid primary key`
- `user_id text not null` → user cascade
- `category point_job_reward_category not null`
- `selection_id uuid` → daily selection `on delete set null`
- `selected_on date not null`
- `target_source point_job_target_source not null`
- `target_id uuid not null`
- `title_snapshot text not null`
- `amount integer not null`
- `rewarded_at timestamp not null default now()`
- CHECK `amount > 0`
- 인덱스 `(user_id, category, rewarded_at desc)`

rolling 24시간은 날짜 unique로 표현할 수 없으므로 계정·유형 advisory lock + 최신 `rewarded_at` 조회가 정본이다. 원장 `external_key = point_job_reward:{rewardId}`가 최종 멱등 방어다.

### `bambi_site_settings.point_job_reward_points`

- nullable `integer`, DB default 없음. `null`은 운영자가 아직 금액을 정하지 않은 상태다.
- null 또는 운영자가 직접 저장한 0이면 포인트 광고 스티커·지급·알림 전체 비활성
- 운영자 저장값은 다음 클릭부터 적용

## API와 서비스 설계

### 신규 서비스 `packages/api/src/services/bambi-point-job-rewards.ts`

다음 순수 타입·판정·DB 경계를 한곳에 둔다.

- `PointJobRewardCategory`
- `PointJobTargetRef`
- `getKstSelectionDate(now)` 또는 기존 KST 날짜 헬퍼 재사용
- `isPointJobRewardCooldownActive(lastRewardedAt, now)`
- `pickDailyPointJobTarget(candidates, randomValue)`
- 내부·수집 후보를 기존 광고 서비스에서 읽는 `loadPointJobCandidates(category, now)`
- 유형별 advisory lock을 취득하고 selection을 조회/생성/교체하는 `resolveDailyPointJobSelections(now)`
- 계정·유형 advisory lock을 취득하는 `acquirePointJobRewardLock(tx, userId, category)`
- 내부 공고 소유 조직 membership을 확인하는 `isOwnOrganizationJob(userId, jobPostId)`
- 현재 선정 대상과 요청 대상을 비교하는 `matchesDailySelection`

랜덤 선택은 DB에 한 번 저장하므로 앱 인스턴스가 여러 개여도 모든 사용자에게 같은 결과를 준다. 테스트에서는 RNG를 주입해 결정적으로 검증한다.

### `packages/api/src/routers/bambi/point-job-rewards.ts`

- `getCurrent`
  - 공개 광고 목록과 함께 쓰되 로그인 여부·역할·개인 쿨다운·자기 조직 여부를 반영한 표시 정보를 반환한다.
  - 비로그인에는 오늘 대상 ID와 금액을 내려 스티커를 보여주지 않는다. 로그인한 적격 회원에게만 `eligible` 대상 정보를 반환한다.
  - 세 유형별 `targetSource`, `targetId`, `rewardPoints`, `eligible`, `nextEligibleAt`을 제공한다.
- `claim`
  - protected procedure
  - 입력: `category`, `targetSource`, `targetId`
  - 활성 프로필 역할이 `job_seeker|employer`인지 확인
  - 오늘 전역 selection 재확인
  - 현재 후보 유효성 재검사
  - 내부 공고면 자기 조직 제외
  - 계정·유형 lock 후 최근 보상 24시간 확인
  - 최신 설정값이 1 이상인지 확인
  - 보상 이력 생성 → `awardMemberPoints` → 실제 금액 반영
  - 커밋 후 알림 발송
  - 이미 수령/부적격은 오류 토스트가 아니라 구조화된 no-op 결과(`awarded: false`, `reason`, `nextEligibleAt`)로 반환해 상세 이동을 방해하지 않는다.

라우터는 `packages/api/src/routers/bambi/index.ts`에 등록한다.

### 기존 광고 API 결합

- `jobs.listAdBanners`와 `jobs.list`/공고 피드 응답의 광고 행 ID 규약을 그대로 사용한다.
- 내부·수집 공고 모두 웹 매퍼에서 source를 잃지 않도록 `AdBannerItem`과 `Job`의 기존 `crawled` 판별을 사용한다.
- point selection을 광고 배열에 복제 저장하지 않는다. 웹은 `pointJobRewards.getCurrent` 결과와 각 카드/배너의 `(source,id)`를 비교한다.
- 서버 후보 서비스는 `groupAdBannerJobs`, `groupCrawledAdBannerJobs`, `buildExposureJobSections`, `loadCrawledJobSections`의 자격 판정을 재사용하거나 공용 후보 헬퍼로 추출한다. 기존 노출과 다른 필터를 새로 하드코딩하지 않는다.

### 공지 API 변경

- `createPostInput`, `updatePostInput`에 `noticeBoardKeys: string[]`를 추가한다.
- notice+admin에서만 허용하고 다른 게시판/역할이 보내면 거부한다.
- 중복 key, `notice`, 가상 `best`, 존재하지 않는 key, 비활성 key를 서버에서 거부한다.
- 공지 생성 트랜잭션에서 post insert 후 placement를 일괄 insert한다.
- 공지 수정 트랜잭션에서 post update와 placement 전량 교체를 함께 수행한다.
- `getPost`는 공지 수정 폼용 `noticeBoardKeys`를 반환한다.
- 목록 필터의 board 일치 조건을 다음으로 확장한다.
  - 원래 `community_post.board = requestedBoard`
  - 또는 published notice에 대해 placement가 `requestedBoard`에 존재
- `EXISTS` 서브쿼리로 연결을 검사해 한 글이 중복 행으로 늘어나지 않게 한다.
- 정렬은 requested board를 인자로 받는 공용 order helper에서 notice/event/normal 우선순위를 계산한다.
- `listPosts`, `overview`, count가 모두 같은 visible predicate와 order를 사용한다.

## 웹 구현 설계

### 공지 글쓰기·수정

- `apps/web/src/components/bambi/community-post-form.tsx`
  - 기존 `PostLockField`, `NoticeEventField`, 댓글 제한 Checkbox를 재사용한다.
  - notice admin에서 `communityBoards.listActive`를 조회한다.
  - notice와 best를 제외한 활성 board를 `Checkbox` 목록으로 렌더하는 `NoticeBoardPlacementField`를 추가한다.
  - `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`를 사용한다.
  - 선택 상태는 `Set<string>` 또는 string[] 한 축으로 관리하고 create/update payload에 실어 보낸다.
  - 수정 초기값은 `getPost.noticeBoardKeys`를 사용한다.
  - 제출 중 disabled, 빈 목록 안내, 선택 개수, 접근 가능한 라벨을 제공한다.
- 공지 목록/상세 카드의 기존 event Badge와 commentsDisabled 표시를 그대로 재사용한다.
- admin 공지 작성자의 표시명은 서버의 기존 admin 작성인 정규화 결과를 `운영자`로 통일한다.

### 포인트 스티커·클릭

- 신규 공용 컴포넌트 `apps/web/src/components/bambi/point-job-sticker.tsx`
  - 시맨틱 primary 토큰과 기존 `Badge`를 사용한다.
  - 금액을 `+{formatted}P`로 렌더한다.
  - 장식 요소는 `pointer-events-none`, 스크린리더 텍스트는 링크/card aria-label에 포인트 보상 정보를 추가한다.
- `AdBannerFrame`
  - `pointReward` optional prop을 받아 좌·중·우 배너에서 같은 오버레이와 click claim을 재사용한다.
  - 클릭 시 GA4 추적과 claim을 함께 시작하고 Link 기본 이동은 막지 않는다.
- `VisualJobCard`
  - `pointReward` optional prop을 받아 special/recommended 카드에 스티커를 붙인다.
  - 기존 `handleOpen`에서 claim을 먼저 fire-and-observe하고 기존 상세 이동을 계속 수행한다.
- `VisualJobExposureSections`
  - 현재 selection을 조회하고 각 `(tone, source, id)`를 비교해 해당 카드에만 prop을 전달한다.
- 광고 레일 호출부
  - `useAdBannerJobs` 데이터와 current selection을 한 공용 hook에서 결합하거나 `AdBannerRail`/`HorizontalAdBannerRail`에 selection을 전달한다.
  - 같은 premium 대상이 좌·중·우 어디에서 렌더돼도 동일하게 표시한다.
- 신규 hook `usePointJobReward`
  - `getCurrent` query, 대상 비교, claim mutation, 성공 토스트와 query invalidate를 한곳에 둔다.
  - 상세 이동을 기다리게 하지 않는다.

### 운영자 개인 포인트·등급 제거

- `apps/web/src/components/bambi/screens/seeker.tsx`
  - `SeekerMyPage`의 `hubSummary={<MyPointsSummaryCard />}`를 role 기반으로 분기해 admin이면 렌더하지 않는다.
- `apps/web/src/components/bambi/my-page-shell.tsx`
  - `isMyPageItemVisible`/메뉴 정의에서 admin의 포인트 내역 항목을 숨긴다.
- 포인트 라우트에 역할 가드를 추가해 admin 직접 접근을 운영자 기본 화면으로 보낸다.
- `packages/api/src/services/bambi-member-points.ts`
  - `loadGradeBadges`가 `bambi_profile.role != admin`만 계산하도록 공용 정책화한다.
- community/detail/comment/moderation은 공용 서비스 결과를 그대로 사용해 admin badge가 null인지 회귀 테스트한다.

### 포인트 내역 광고 레일

- `SeekerMeLayout`의 3열 레일 마크업을 공용 `MyPageAdRailLayout` 컴포넌트로 추출한다.
- `apps/web/src/app/seeker/me/layout.tsx`, `apps/web/src/app/seeker/attendance/page.tsx`, `apps/web/src/app/employer/attendance/page.tsx`가 같은 레이아웃을 사용한다.
- seeker attendance의 중복 `APP_CONTENT_WIDTH` 래퍼는 공용 layout 폭 계약으로 대체한다.
- employer attendance도 `MyPageShell`을 사용 중인지 호출 구조를 맞춰 제목·내비·중앙 폭이 seeker와 동일하도록 기존 화면을 재사용한다. 포인트 데이터/카드 컴포넌트는 `AttendancePanel` 한 벌만 유지한다.

### 기타 포인트 설정

- `apps/web/src/app/moderator/points/settings/page.tsx`
  - 기존 필드 state를 유지하고 `pointJobReward` state를 추가한다.
  - 최상위 `Accordion multiple` 아래 세 group item을 정확한 순서로 둔다.
  - 게시판별 기존 Accordion은 세 번째 group의 content 안에서 중첩 재사용한다.
  - 입력 검증·통합 저장 payload·저장 성공 invalidate에 신규 값을 추가한다.
- `packages/api/src/services/bambi-point-settings.ts`, `point-settings.ts`
  - get/save에 `pointJobRewardPoints`를 추가한다.
  - 기존 nonnegative 상한 검증을 재사용한다.

## 구현 순서와 커밋 단위

사용자가 직접 커밋하므로 아래 각 단계가 끝날 때 복사 가능한 제목+본문 커밋 명령을 제공한다. 실제 커밋은 하지 않는다.

1. `docs`: 본 계획서 작성 및 요구사항 커버리지 확정
2. `feat`: Drizzle schema·migration — 공지 배치, 포인트 광고 selection/reward, 설정 컬럼
3. `feat`: 공지 다중 게시판 API·정렬·테스트
4. `feat`: 공지 작성/수정 게시판 선택 Accordion UI
5. `feat`: 포인트 광고 선정·24시간 지급·자기 조직 제외·알림 API와 테스트
6. `feat`: 프리미엄/스페셜/추천 스티커와 클릭 보상 UI
7. `fix`: 운영자 개인 포인트·등급 숨김
8. `fix`: 구직자·구인자 포인트 내역 광고 레일 재사용
9. `refactor`: 기타 포인트 설정 3개 Accordion 재구성
10. `docs/test`: 매뉴얼·계획 검증 기록 갱신 및 전체 회귀 검증

관련 변경은 하나의 통합 브랜치와 PR에 올린다.

## 테스트 계획

### 공지 다중 노출

- notice admin만 placement를 create/update할 수 있다.
- 동적 활성 게시판만 선택할 수 있고 notice/best/중복/없는 key를 거부한다.
- 한 공지가 notice와 선택한 여러 게시판 목록에 각각 한 번만 나타난다.
- 선택 게시판의 공지는 일반 글보다 위, 공지끼리는 최신순이다.
- notice에서는 event 우선, 각 그룹 최신순이다.
- update로 선택 추가/해제 시 즉시 반영되고 post ID·댓글·좋아요·조회수는 유지된다.
- delete/hidden 시 모든 목록에서 사라진다.
- pagination과 overview에서 중복·누락이 없다.
- 댓글 작성 불가·잠금·이벤트 옵션이 모든 노출 위치에서 동일하다.
- 비밀글 게시판에서도 admin 공지는 `운영자`, 일반 비밀글 작성자는 기존 `밤비` 정책을 유지한다.

### 포인트 광고 선정

- KST 날짜 경계 23:59:59 → 00:00:00에서 selection date가 바뀐다.
- 같은 날짜·유형 동시 요청은 한 selection만 생성한다.
- 모든 계정이 같은 세 selection을 받는다.
- 내부·수집 premium/special/recommended 후보가 각각 포함된다.
- 후보 없는 유형은 null이며 다른 유형으로 보충하지 않는다.
- 무효 대상은 lock 아래에서 유효 후보로 교체된다.
- 새로고침·서버 인스턴스 차이에도 당일 selection이 유지된다.

### 포인트 지급

- job_seeker/employer만 지급, admin/legal_advisor/비로그인은 거부한다.
- premium/special/recommended 각각 독립 지급된다.
- 지급 순간부터 24시간 직전은 no-op, 정확히 24시간 경과 시 재지급된다.
- 달력 날짜가 바뀌어도 24시간 미경과면 지급되지 않는다.
- 포인트를 받지 않은 유형에는 쿨다운이 없다.
- 동시 다중 클릭은 한 reward·한 원장 행만 만든다.
- 오늘 selection과 다른 대상 ID 요청은 지급하지 않는다.
- 구인자의 자기 조직 내부 공고는 owner/manager/member 모두 지급하지 않는다.
- 다른 조직 공고와 외부 수집 공고는 지급된다.
- 0P 설정은 스티커·reward·원장·알림을 만들지 않는다.
- 상한 clamp 시 실제 적립액이 reward/원장/토스트/알림에 일치한다.
- 알림 실패에도 포인트 지급은 유지된다.

### 운영자 UI·등급·광고 레일

- admin 내 정보는 포인트 query를 호출하지 않고 오류 문구도 보이지 않는다.
- admin 메뉴·직접 URL에서 개인 포인트 기능이 보이지 않는다.
- 운영자용 회원 포인트 관리 화면은 유지된다.
- admin 작성 글·댓글·프로필의 GradeBadge가 null이고 일반 회원 등급은 유지된다.
- seeker/employer 포인트 내역에서 1720px 이상 좌우 광고 레일, 그 미만 기존 단일 중앙 열을 확인한다.
- 기존 차단·면접·내 정보 레일과 같은 좌표·폭을 유지한다.

### 설정 UI

- 그룹 순서가 회원가입과 출석 → 공고 포인트 → 게시판별 작성 포인트다.
- 세 header는 primary 배경 없이 기본 카드 배경이며 각 행은 얇은 테두리와 약한 그림자로 구분된다.
- 여러 group을 동시에 펼칠 수 있고 최초에는 모두 접혀 있다.
- 기존 값이 올바른 그룹으로 이동했으며 저장 결과는 이전과 같다.
- point job reward 값 저장·재조회·0 비활성화가 일치한다.
- 신규 게시판이 게시판별 하위 Accordion에 자동 표시된다.

## 검증 명령 계획

구체적인 변경 파일이 확정되면 좁은 검사부터 전체 검사 순으로 실행한다.

```powershell
Set-Location 'C:\Users\user\bambi\.worktrees\notice-cross-board-point-ad-rewards'

pnpm --filter @bambi-app/db db:generate
pnpm --filter @bambi-app/db check-types
pnpm --filter @bambi-app/api check-types
pnpm --filter web check-types

pnpm --filter @bambi-app/api test -- --run test/services/bambi-point-job-rewards.test.ts
pnpm --filter @bambi-app/api test -- --run test/services/bambi-community-authz.test.ts
pnpm --filter web exec vitest run test/lib/bambi/notification-labels.test.ts

pnpm dlx ultracite check
git diff --check
```

- DB 파괴 가능성이 있는 router 통합 테스트는 테스트 DB 격리가 확인되기 전 실행하지 않는다.
- migration은 임시 DB에서 `0000 → 최신` 전체 적용을 검증한다.
- `db:generate` 재실행 결과가 `No schema changes`인지 확인한다.
- migration snapshot `prevId`, `_journal.json` idx/when, 최신 develop과 번호 충돌을 확인한다.

## 수동 브라우저 검증

- 운영자 공지 작성에서 동적 게시판 여러 개 선택, 선택 개수, 수정 초기값 확인
- 댓글 작성 불가+이벤트+다중 게시판 조합이 각 목록·상세에 동일하게 반영되는지 확인
- 공지사항 event 우선 정렬과 선택 게시판 공지 최신순 상단 배치 확인
- 비밀글 선택 게시판에서 공지 작성자가 `운영자`로 보이고 일반 비밀글 익명 정책이 유지되는지 확인
- 00시 KST 전후 selection 변경 확인
- 좌·중·우 프리미엄 배너에서 같은 선정 대상에 스티커가 표시되는지 확인
- 스페셜·추천 선정 카드 스티커 확인
- 구직자/구인자 각 유형 클릭 지급, 알림, 포인트 내역 확인
- 개인별 유형 24시간 독립 쿨다운 확인
- 구인자 자기 조직 공고 스티커 미표시·직접 claim 무지급 확인
- 운영자 개인 포인트 메뉴/오류/등급이 사라지고 운영자 관리 기능은 유지되는지 확인
- 구직자·구인자 포인트 내역의 1719px/1720px 광고 레일 경계 확인
- 기타 포인트 설정 Accordion 순서·배경·다중 펼침·저장 확인

## 매뉴얼·문서 동기화

- `docs/manual/moderator-manual.md`
  - 공지 다중 게시판 선택과 정렬
  - 기타 포인트 설정 세 그룹과 포인트 공고 금액
  - 운영자 개인 포인트 비대상 정책
- `docs/manual/seeker-manual.md`
  - 포인트 스티커, 유형별 24시간, 알림·내역
- `docs/manual/employer-manual.md`
  - 포인트 스티커·24시간과 자기 회사 공고 보상 제외
- 본 계획서 구현 결과에 실제 migration 이름, 변경 파일, 테스트 결과, 브라우저 QA 결과를 기록한다.

## 요구사항 커버리지

| 사용자 요구 | 설계 절 |
|---|---|
| 운영자 개인 포인트 불필요·오류 제거 | 확정 요구사항 1, 웹 구현 `운영자 개인 포인트·등급 제거` |
| 공지 복수 게시판 선택·동적 게시판·상단 노출 | 확정 요구사항 2~3, `community_notice_board_placement`, 공지 API/UI |
| 운영자/관리자 등급 숨김 | 확정 요구사항 4 |
| 구직자·구인자 포인트 내역 사이드 광고 | 확정 요구사항 5 |
| 매일 공통 premium/special/recommended 각 1개 | 확정 요구사항 6 |
| 좌·중·우 프리미엄, 중앙 스페셜·추천 스티커 | 확정 요구사항 7 |
| 계정·유형별 수령 순간부터 24시간 | 확정 요구사항 8 |
| 구인자 자기 회사 공고 제외 | 확정 요구사항 7~8 |
| 외부 수집 공고 포함 | 확정 요구사항 6 |
| 운영자 설정 N포인트 | 확정 요구사항 8, 설정 컬럼/API/UI |
| 포인트 지급 알림·내역 | 확정 요구사항 9 |
| 설정 Accordion 순서·구성·독립 테두리 | 확정 요구사항 10 및 후속 UI 수정 |
| 하드코딩 금지·기존 코드 재사용 | 절대 원칙, API/웹 구현 설계 |
| Drizzle migration·충돌 이력 확인 | 브랜치와 기준, 데이터 설계, 검증 명령 계획 |

## 최신 develop 병합 기록

- 2026-08-20: `origin/develop@c8969174` fast-forward 반영
- 포함 PR: #227 `fix: 비밀글 열람·공고 결제·글 관리 UI 안정화`
- migration 기준 변경: `0105` → `0106_acoustic_triathlon`, 본 작업 `0107_tricky_crystal` 생성
- 보존할 회귀 계약:
  - 비밀글 읽기와 쓰기 자격 분리
  - 수다방 홈 공지사항 1행·베스트글 2행 첫 칸 고정
  - 좋아요/작성 글 독립 Accordion과 `post_created_at` snapshot
  - 구인자 공고 결제 포인트 차감 표시
- 2026-08-20: `origin/develop@b2282cf2` fast-forward 반영
- 포함 PR: #230 `fix: 운영자 화면 QA 결함 2건 — 작성 콘텐츠 이력 enum 노출·삭제된 채팅방 신고 열람 불가`
- 본 작업 파일·migration 번호와 충돌 없음. 운영자 작성 콘텐츠 라벨과 삭제 채팅 신고 fallback을 회귀시키지 않는다.

## PR 준비

- 관련 이슈: #232 `feat: 공지 다중 게시판 노출·유형별 포인트 광고 보상 통합`
- PR 본문은 목적, 공지 다중 노출, 포인트 광고 선정/지급, 운영자 UI, 설정 UI, DB migration, 검증 결과, 배포 체크리스트 순으로 작성한다.
- `Closes #이슈번호`를 포함한다. develop 대상 PR이 GitHub 기본 브랜치가 아니어서 이슈 자동 종료가 지연될 수 있으므로 merge 후 이슈 상태도 확인한다.
- 최종 merge는 동기가 수행한다.

## 구현 결과 및 검증 기록

- 구현 기준: `origin/develop@b2282cf2`, 충돌 없이 fast-forward 반영
- Drizzle migrations: `0107_tricky_crystal`, `0108_wandering_obadiah_stane`
- `drizzle-kit generate` 재실행: `No schema changes`
- `drizzle-kit check`: `Everything's fine`
- DB/API/Web `tsc --noEmit`: 통과
- 포인트 광고 순수 테스트: 5건 통과
- 알림 라벨·딥링크 테스트: 35건 통과
- Ultracite: 신규 오류 0, 최신 develop 기존 warning 2·info 2만 남음
- `git diff --check`: 통과
- 추가 회귀 검사:
  - `bambi-community-authz` 26건 통과
  - `bambi-member-points` 테스트는 worktree에 `apps/server.env`가 없어 환경 검증 단계에서 중단됨
  - `community-board-navigation`은 본 작업에서 수정하지 않은 develop 기존 `router.replace` 구현과 테스트 기대 불일치로 1건 실패
- 커밋·푸시·머지하지 않음

### 유형별 로테이션 후속 구현

- `0108_wandering_obadiah_stane`에서 단일 포인트 설정을 유형별 금액·시간으로 이관하고 기존 24시간 활성 쿨타임을 `cooldown_until`에 보존했다.
- Admin 설정 화면에 프리미엄·스페셜·추천 각각 `지급 포인트 + 로테이션 시간` 필드를 추가했다.
- 시간 값이 실제 변경된 유형만 활성 쿨타임을 사용자 확정 공식대로 조정하고 현재 선정 광고를 폐기한다.
- 이후 선정 광고와 신규 보상 쿨타임은 유형별 DB 설정 시간을 사용한다.
- 로컬 DB migration 적용 성공, 기존 10P는 세 유형에 각각 이관되고 시간은 기존 정책 24시간으로 보존됨을 확인했다.
- 포인트 광고 순수 테스트 5건, DB/API/Web 타입 검사 통과.
