# 메인·수다방 게시판 배치 분리 및 글 상세 탐색 설계

## 1. 목적

현재 운영자 게시판 관리의 `수다방 홈 행 배치` 한 벌을 구직자 메인(`/seeker`)과 수다방 홈(`/seeker/community`)이 함께 사용한다. 이를 `메인페이지 행 배치`와 `수다방 행 배치`로 분리해 운영자가 두 화면의 게시판 노출·행·열 순서를 독립적으로 관리할 수 있게 한다.

게시글 상세 하단에는 현재 게시판 목록과 수다방 홈으로 돌아가는 버튼, 등록시간 기준 이전글·다음글 탐색을 추가한다. 로그인 여부와 관계없이 `수다방` 버튼은 `/seeker/community`로 이동하며 수다방 홈의 게시판 미리보기를 볼 수 있어야 한다.

## 2. 확정 요구사항

- 새 브랜치는 최신 `origin/develop`에서 생성한다.
- 작업 브랜치: `feat/community-layout-post-navigation`
- 관련 이슈: `#245`
- 메인페이지 배치의 최초 값은 배포 시점의 기존 수다방 배치를 그대로 복사한다.
- 이후 메인페이지와 수다방 배치는 서로 독립적으로 저장·조회한다.
- 두 배치 모두 공지사항(`notice`)과 베스트글(`best`)을 고정하지 않는다.
- 두 배치 모두 기존 편집기의 행 추가, 게시판 추가·제거, 행/행 내부 드래그 이동, 저장 기능을 동일하게 제공한다.
- 운영자 게시판 관리에서 `메인페이지 행 배치`를 `수다방 행 배치` 위에 둔다.
- 두 편집기는 shadcn Accordion으로 감싸고 최초 진입 시 모두 접힌 상태다.
- 메인(`/seeker`)은 메인페이지 배치만, 수다방 홈(`/seeker/community`)은 수다방 배치만 렌더한다.
- 비로그인·로그인 여부와 관계없이 수다방 홈 자체와 게시판 미리보기는 표시한다. 글 목록·상세·작성·참여 권한은 기존 정책을 유지한다.
- 글 상세 하단의 상단 버튼은 왼쪽 `목록`, 오른쪽 `수다방`이다.
  - `목록`: 현재 화면의 게시판 목록으로 이동한다.
  - `수다방`: 항상 `/seeker/community`로 이동한다.
- 버튼 아래에 이전글과 다음글을 등록시간 기준으로 표시한다.
  - 이전글: 현재 글보다 먼저 등록된 글 중 가장 가까운 글.
  - 다음글: 현재 글보다 나중에 등록된 글 중 가장 가까운 글.
  - 등록시간이 같으면 글 ID를 보조 총순서로 사용한다.
- 다른 게시판에 교차 노출된 공지사항은 해당 게시판의 이전글·다음글 후보에서 제외한다.
- 공지사항 게시판에서 직접 상세를 열었을 때만 공지사항끼리 이전글·다음글을 제공한다.
- 베스트글, 밤문화 이야기의 수집 글, 비밀글을 포함한 모든 수다방 상세 유형에 탐색을 제공한다.
- 후보 글의 노출·잠금·권한 판정은 각 게시판 목록과 동일한 서버 규칙을 재사용한다.
- 커밋과 푸시는 사용자가 직접 수행하고, Codex는 임의로 커밋·푸시·머지하지 않는다.
- `--force`는 사용하지 않는다.

## 3. 현행 구조

### 3.1 배치 저장과 소비

- DB: `community_board_home_layout`
  - `board_key` 단일 PK라 같은 게시판을 두 배치에 동시에 저장할 수 없다.
  - `row_index + position` 유니크 인덱스로 한 화면 안의 슬롯 중복을 막는다.
- API: `packages/api/src/routers/bambi/community-boards.ts`
  - `getHomeLayout`, `updateHomeLayout`이 단일 배치를 읽고 전체 삭제 후 재삽입한다.
  - `assertHomeLayoutFixedSlots`가 공지 1행·베스트 2행 첫 칸을 강제한다.
- 미리보기: `packages/api/src/routers/bambi/community.ts`의 `overview`
  - 단일 배치를 읽어 `rowIndex`, `position`을 붙인다.
- Web:
  - `HomeCommunitySection`과 `CommunityHomeScreen`이 같은 `overview` 응답과 `CommunityOverviewGrid`를 사용한다.
  - `HomeLayoutEditor`가 고정 키를 이동·제거하지 못하게 한다.

### 3.2 상세와 목록

- 회원/게스트 상세: `CommunityPostDetailScreen` → `community.getPost`.
- 수집 글 상세: `CommunityCrawledTopicDetailScreen` → 수집 글 전용 상세 API.
- 공개 SEO 상세: `/board/[boardSlug]/[postId]`가 별도 서버 렌더 경로를 가진다.
- 목록 정렬은 일반 게시판 `created_at DESC, id DESC`, 공지는 이벤트 우선, 베스트는 추천수 우선이다.
- 이번 이전글·다음글은 목록의 화면 정렬이 아니라 사용자 확정 사항인 **등록시간 총순서**만 사용한다.
- `work_talk` 목록은 밤비 글과 수집 글을 `UNION ALL`로 합칠 수 있다.

## 4. 데이터 모델 및 migration

### 4.1 배치 표면 구분

기존 `community_board_home_layout` 행을 재사용하면서 배치 표면을 구분하는 `surface` 컬럼을 추가한다.

- 값: `main`, `community`
- PK: `(surface, board_key)`
- 슬롯 유니크: `(surface, row_index, position)`
- 동일 게시판은 한 표면 안에서 한 번만 배치할 수 있고, 서로 다른 표면에는 각각 배치할 수 있다.
- TypeScript와 DB에서 공용 상수/enum을 사용하고 문자열을 호출부마다 하드코딩하지 않는다.

### 4.2 기존 데이터 이전

Drizzle migration에서 다음 순서를 보장한다.

1. 기존 행을 모두 `community` 표면으로 귀속한다.
2. 같은 행·위치·게시판 값을 `main` 표면으로 복제한다.
3. 복합 PK와 표면 포함 유니크 인덱스를 적용한다.
4. migration 이후 두 표면은 독립적으로 수정 가능하다.

최신 migration 번호와 `_journal.json`/snapshot 체인을 다시 확인한 뒤 다음 번호로 생성한다. 구현 시작 기준 최신은 `0108`이며, 충돌이 없으면 `0109`를 사용한다. `db:generate` 재실행 시 `No schema changes`를 확인하고 migration SQL·snapshot·journal을 함께 검증한다.

## 5. API 설계

### 5.1 운영자 배치 API

- 기존 배치 행 타입과 검증 로직을 공용화한다.
- 조회/저장은 `surface`를 명시적으로 받거나 표면별 프로시저가 공용 서비스에 surface를 전달한다.
- 저장 검증:
  - 빈 행은 저장하지 않는다.
  - 한 표면 안에 같은 게시판을 두 번 넣지 않는다.
  - DB 게시판 또는 가상 베스트글 키만 허용한다.
  - 공지·베스트 고정 슬롯 검증은 제거한다.
- 저장은 해당 표면의 행만 삭제 후 삽입한다. 다른 표면은 절대 변경하지 않는다.
- 게시판 삭제 시 두 표면에 남은 해당 게시판 배치 행을 함께 제거한다.

### 5.2 미리보기 API

`overview`의 게시판·글 미리보기 생성 로직은 한 번만 유지하고 `surface`별 배치 조회를 주입한다.

- 메인 호출: `surface = main`
- 수다방 홈 호출: `surface = community`
- 현재 역할별 게시판 필터와 잠금 제목 마스킹, 수집 글 혼합, 공지 교차 노출 제외 규칙을 그대로 재사용한다.
- surface 입력은 허용된 두 값으로만 검증한다.

### 5.3 이전글·다음글 API

탐색 응답은 화면이 직접 SQL 규칙을 복제하지 않도록 서버에서 계산한다.

- 입력 문맥:
  - 현재 화면 게시판 key/slug
  - 현재 항목의 source(`native`/`crawled`)
  - 현재 항목 ID
- 출력:
  - `previous: { id, source, title, boardKey, boardSlug, createdAt } | null`
  - `next: { ... } | null`
- 정렬 총순서: `(createdAt ASC, id ASC)`.
  - 이전글: 현재 총순서보다 작은 후보 중 내림차순 첫 건.
  - 다음글: 현재 총순서보다 큰 후보 중 오름차순 첫 건.
- 일반 게시판 후보는 기존 게시판 필터를 재사용하되, 현재 게시판이 `notice`가 아니면 실제 board가 `notice`인 행을 제외한다.
- `notice`: 공지 글만 후보로 삼으며 이벤트 우선 정렬은 사용하지 않는다.
- `best`: 기존 최근 30일·추천 기준을 통과한 글만 후보로 삼되, 이웃 선택 순서는 등록시간이다.
- `work_talk`: 수집 피드가 켜져 있으면 기존 union 자격을 재사용해 native/crawled 양쪽에서 이웃을 찾는다.
- 비밀글과 잠금글은 목록과 동일한 자격·마스킹 규칙을 사용한다. 링크는 표시하되 제목은 권한에 따라 마스킹한다.
- 존재하지 않거나 현재 사용자가 접근할 수 없는 현재 글을 기준으로 탐색 결과만 유출하지 않는다.
- native와 crawled 링크 생성은 기존 `communityPostPath`, `communityCrawledPath`를 재사용한다.
- native·crawled 후보 쿼리에서 현재 글 ID를 명시적으로 제외하고, Web에서도 현재 ID가 이웃으로 반환되면 숨겨 자기 글로 순환하는 링크를 방지한다.

## 6. Web UI 설계

### 6.1 운영자 게시판 관리

- `HomeLayoutEditor`를 표면에 무관한 `BoardLayoutEditor`로 일반화한다.
- 제목·설명·저장 상태·rows/setRows/onSave를 props로 받는다.
- 고정 게시판 분기와 `고정` 라벨을 삭제한다.
- 공지·베스트도 다른 게시판과 동일하게 drag/remove/add 처리한다.
- 같은 공용 편집기를 두 AccordionItem에서 재사용한다.
  1. 메인페이지 행 배치
  2. 수다방 행 배치
- Accordion은 기본값을 주지 않아 최초에 모두 닫는다.
- 각 저장 mutation은 자기 surface의 query/cache만 무효화하고 성공 토스트를 구분한다.

### 6.2 메인과 수다방 홈

- `CommunityOverviewGrid`와 카드 렌더링은 그대로 재사용한다.
- `HomeCommunitySection`은 main surface overview를 요청한다.
- `CommunityHomeScreen`은 community surface overview를 요청한다.
- `/seeker/community` 레이아웃에서 홈 루트까지 가로막는 접근 게이트가 있다면 홈 루트는 예외로 통과시킨다.
- 게시판 목록·상세·쓰기에서 사용하는 기존 `RequireCommunityAccess`는 유지한다.
- 메인 카드 클릭 시 기존 본인인증/역할 안내 정책은 유지하며, 수다방 홈 자체로 이동하는 링크는 로그인 여부와 관계없이 허용한다.

### 6.3 상세 하단 탐색

공용 `CommunityPostNavigation` 컴포넌트를 만들어 native·guest·crawled·공개 상세에서 재사용한다.

- 댓글/상호작용 영역 아래 배치한다.
- 상단 액션:
  - 이전글·다음글 박스 바로 아래 오른쪽에 콘텐츠 폭을 채우지 않는 작은 `sm` 버튼 2개를 나란히 둔다.
  - 왼쪽 `목록`: 현재 게시판 목록 경로.
  - 오른쪽 `수다방`: `/seeker/community`.
  - 기존 coral/primary 디자인 토큰의 Button을 사용하고 raw 색상은 사용하지 않는다.
- 하단 이웃 행:
  - `이전글`과 `다음글`을 각각 한 행으로 표시한다.
  - 이웃이 있으면 라벨과 제목을 링크로 렌더한다.
  - 첫 글처럼 이전글이 없으면 이전글 행 자체를 숨기고, 마지막 글처럼 다음글이 없으면 다음글 행 자체를 숨긴다.
  - 이전글과 다음글이 모두 없으면 이웃 글 박스 전체를 숨긴다.
  - 긴 제목은 truncate 처리하고 키보드 포커스·시맨틱 링크를 보장한다.
- 화면별 중복 쿼리를 피하도록 상세 데이터에 탐색 정보를 포함하거나 공용 query 하나를 사용한다.
- 잠금 게이트를 통과하기 전에는 이웃 제목을 노출하지 않는다.

## 7. 테스트 계획

### 7.1 API/서비스

- 배치 검증:
  - 공지·베스트 이동 및 제거 허용.
  - 같은 표면 중복 게시판 거부.
  - 메인 저장이 수다방 배치를 건드리지 않음.
  - 수다방 저장이 메인 배치를 건드리지 않음.
- migration:
  - 기존 community 행 유지.
  - main 행 동일 복제.
  - 표면별 PK/슬롯 유니크 제약 확인.
- 이전/다음:
  - 일반 글의 시간 경계.
  - 같은 시각 ID 보조 정렬.
  - 다른 게시판 교차 공지 제외.
  - 공지 게시판에서는 공지끼리 탐색.
  - 베스트 최근 30일·추천 자격 유지 + 시간 탐색.
  - work_talk native/crawled 경계 양방향 탐색.
  - 후보 없음, 삭제/숨김 글 제외, 잠금 제목 마스킹.

### 7.2 Web

- 두 Accordion이 기본 접힘 상태이며 동일 편집기를 사용.
- 공지·베스트에 고정 라벨/이동 제한/제거 제한이 없음.
- 메인과 수다방이 서로 다른 surface를 요청.
- 비로그인 수다방 버튼과 직접 `/seeker/community` 진입이 홈을 표시.
- 목록·수다방 링크가 정확한 경로를 사용.
- 이전·다음 native/crawled 링크 분기와 빈 상태 렌더.
- 기존 카드 외곽선·행 열수 렌더 회귀 테스트 유지.

## 8. 검증 명령

구현 후 최소 다음을 실행한다.

```powershell
pnpm --filter @bambi-app/db db:generate
pnpm --filter @bambi-app/db check-types
pnpm --filter @bambi-app/api test
pnpm --filter @bambi-app/api check-types
pnpm --filter web check-types
pnpm --filter web exec vitest run
pnpm dlx ultracite check
```

필요하면 server/web env를 원본 저장소에서 worktree로 복사한 뒤 실제 화면을 확인한다. DB에는 `db:push`를 사용하지 않고 migration만 사용한다.

## 9. 완료 조건

- 운영자가 메인·수다방 배치를 독립적으로 저장하고 두 화면에서 각각 확인할 수 있다.
- 배포 직후에는 두 화면이 기존 수다방 배치와 동일해 회귀가 없다.
- 공지·베스트를 두 배치 어디서나 이동·제거할 수 있다.
- 두 편집기는 접힌 Accordion이며 펼치면 기존 전체 기능을 제공한다.
- 로그인 여부와 관계없이 수다방 버튼이 수다방 홈을 보여준다.
- 모든 지원 상세 유형에서 목록·수다방·등록시간 기준 이전/다음 탐색이 동작한다.
- 다른 게시판의 이웃 탐색에 교차 공지가 섞이지 않는다.
- 최신 develop 재반영, migration 체인, 타입 검사, 관련 테스트, Ultracite 검증 결과를 이 문서에 기록한다.
- 사용자가 직접 상세 본문이 있는 커밋을 만들고 푸시할 수 있도록 최종 명령을 제공한다.

## 10. 구현 체크리스트

- [x] Drizzle schema와 migration으로 surface 분리 및 기존 배치 복제
- [x] 운영자 배치 API surface 분리·고정 슬롯 제거
- [x] overview surface 분리
- [x] 운영자 공용 배치 편집기 + 기본 접힘 Accordion 2개
- [x] 메인/수다방 surface 연결
- [x] 비로그인 수다방 홈 진입 허용
- [x] 공용 이전/다음 탐색 서비스/API
- [x] native·guest·crawled·공개 상세 공용 하단 UI
- [x] API/Web 회귀 테스트
- [x] migration·타입·테스트·Ultracite 검증
- [x] 최신 develop 재반영 및 충돌 확인
- [x] 최종 검증 결과 문서 반영

## 11. 구현 결과

### 11.1 데이터와 API

- `community_board_layout_surface(main|community)` enum과 `surface` 컬럼을 추가했다.
- migration `0109_yielding_songbird.sql`이 기존 행을 `community`로 귀속한 뒤 동일 행을 `main`으로 복사한다.
- PK는 `(surface, board_key)`, 슬롯 유니크는 `(surface, row_index, position)`으로 변경했다.
- `getHomeLayout`/`updateHomeLayout`은 surface 입력을 필수로 받고 해당 surface만 조회·교체한다.
- 공지·베스트 고정 슬롯 검증을 제거하고 한 surface 안의 중복 게시판만 거부한다.
- `overview`에 surface 입력을 추가해 메인과 수다방이 같은 미리보기 조립 로직을 유지하면서 서로 다른 배치를 소비한다.
- `getPostNavigation`이 native/crawled 후보를 각각 가장 가까운 한 건만 조회한 뒤 `(createdAt, id)` 총순서로 합친다.
- 일반 게시판 탐색은 실제 board가 같은 글만 조회해 교차 공지를 제외하고, 공지 게시판은 공지끼리 탐색한다.
- 베스트의 최근 30일·추천 자격, work_talk 수집 피드 스위치·30일 자격, 잠금 제목 마스킹, 역할별 접근 검사를 기존 함수로 재사용한다.
- 공개 `/board` 상세는 공개 게시판·비잠금 글로 좁힌 같은 탐색 API를 사용한다.

### 11.2 Web

- 운영자 화면에 `메인페이지 행 배치`, `수다방 행 배치` Accordion을 순서대로 추가했다.
- 두 Accordion은 `multiple`이지만 `defaultValue`가 없어 최초에 모두 접히며 `BoardLayoutEditor` 하나를 재사용한다.
- 공지·베스트의 고정 라벨과 이동·제거 제한을 모두 제거했다.
- 메인은 `surface: main`, 수다방 홈은 `surface: community`를 요청한다.
- proxy와 seeker 레이아웃을 조정해 비로그인도 `/seeker/community` 홈은 열고, 하위 게시판·상세·쓰기 게이트는 그대로 유지했다.
- 메인 섹션의 `수다방` 더보기는 인증 팝업으로 가로채지 않고 공개 수다방 홈으로 이동한다.
- `CommunityPostNavigation`을 일반 회원 상세, 인증 게스트 상세, 수집 글 상세, 공개 상세에서 재사용한다.
- 하단에 `이전글`/`다음글` 링크 행을 두고 그 아래 우측에 작은 `목록`/`수다방` primary 버튼을 추가했다.

## 12. 검증 결과

### 12.1 통과

- `pnpm --filter @bambi-app/db db:generate` → `No schema changes, nothing to migrate`
- `pnpm --filter @bambi-app/db exec drizzle-kit check` → `Everything's fine`
- DB/API/Web `check-types` 통과
- 변경 관련 API 테스트 4건 통과
  - 배치 자유 이동·제거/중복 거부
  - native/crawled 등록시간 탐색과 같은 시각 ID 보조 정렬
- 변경 관련 Web 테스트 32건 통과
  - 비로그인 수다방 홈 게이트
  - 메인/수다방 surface 분리
  - 기본 접힘 Accordion 2개와 공용 편집기
  - 목록·수다방·이전글·다음글 경로 생성
- `pnpm dlx ultracite check` exit 0
  - 이번 변경과 무관한 기존 info 2건(`support-chat` hook dependency)과 warning 2건(`seed-ad-catalog` suppression)은 유지했다.
- `git diff --check` 통과
- 최종 fetch 기준 `HEAD`, `origin/develop`, merge-base가 모두 `fa050831`로 일치해 추가 반영·충돌 없음
- 로컬 DB에서 migration `0109` 적용 후 `surface` enum·복합 PK를 확인했고, 배치 행이 `main` 4개·`community` 7개로 독립 저장되는 것을 확인

### 12.2 환경상 미실행/기존 실패

- 전체 API 테스트는 `.env`를 복사한 뒤 실행했으나 테스트 DB `localhost:55432`가 실행 중이지 않아 DB 연동 386건이 `ECONNREFUSED`로 실패했다. Docker Desktop도 실행 중이 아니어서 로컬 DB를 기동할 수 없었다.
- 전체 Web 테스트는 738건 중 731건 통과, 7건 실패했다.
  - 이번 변경으로 기대값을 갱신해야 했던 seeker auth gate 테스트 1건은 수정 후 재실행해 통과했다.
  - 나머지 6건은 이번 diff와 무관한 최신 develop 기존 소스 문자열 기대값 불일치다: 채팅 messageId, 제재 이력 페이지 크기, 결제 패널, 신고 자동 완료, 채팅 첨부 강조, 게시판 페이지 이동.
- 실제 브라우저 데이터 검증은 API/DB 서버가 실행되지 않아 수행하지 못했다. 타입·정적 테스트·migration 정합 검증으로 대체했다.
