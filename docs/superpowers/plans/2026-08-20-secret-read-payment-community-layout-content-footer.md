# 비밀글 열람·공고 포인트·수다방 배치·글 관리·푸터 안정화 설계

## 목표

성별·생년월일이 없는 활성 회원도 비밀글을 읽을 수 있게 하되 작성 시 기존 본인인증 요건은
유지한다. 구인자 공고 등록의 포인트 사용과 결제 총액을 한 흐름으로 합치고, 수다방 카드
테두리·운영자 고정 배치·회원 글 관리·푸터 사이트 정보의 초기 렌더를 정리한다.

## 기준 브랜치

- 최신 `origin/develop`
- 브랜치: `fix/secret-read-payment-community-layout-content-footer`
- Graphify는 사용하지 않는다.
- 사용자가 직접 커밋·푸시하며 최종 머지는 동기가 수행한다.

## 1. 비밀글 읽기와 쓰기 권한 분리

### 읽기

- 로그인한 활성 회원은 역할·성별·생년월일 설정 여부와 무관하게 비밀글 목록과 상세를 읽는다.
- `listPosts`, `getPost`, `listComments`는 읽기 전용 actor resolver를 사용한다.
- 비회원은 기존의 서명된 본인인증 guest token이 있어야 읽는다.
- 일반 게시판은 기존 여성 회원·광고 중 구인자·역할 제한을 유지한다.

### 쓰기·상호작용

- 비밀글 글·댓글 작성은 기존 `resolveCommunityActorForBoard`와
  `assertSecretActorIdentity`를 그대로 통과한다.
- 성별과 성인 본인인증이 확인되지 않은 회원은 글·댓글을 작성할 수 없다.
- 수정·삭제·추천 등 읽기 외 동작의 기존 권한은 넓히지 않는다.
- 비밀글의 성별 익명 아이콘과 `밤비` 표시는 기존 정책을 유지한다.

## 2. 구인자 공고 등록 포인트·결제 총액 통합

- 포인트 입력 영역을 `JobExposureFields`의 끌어올리기 옵션 바로 아래에 배치한다.
- 포인트 입력 UI는 부모 공고 등록 화면이 소유하되 `JobExposureFields`의 명시적인 슬롯으로
  전달해 노출 상품·옵션 흐름 안에서 렌더한다.
- `PayableTotal`에 사용 포인트를 전달한다.
- 총액은 `광고 + 상세이미지 옵션 + 끌어올리기 옵션 - 포인트`로 계산하되 0원 미만이 되지
  않게 기존 서버 계산과 동일하게 보정한다.
- 상세 내역에는 포인트 사용 시 `포인트 N원`을 빼기 항목으로 표시한다.
- 하단 포인트 카드의 중복 `결제 예정 금액 / 최종 입금액` 요약은 제거한다.
- 결제 방법·무통장 안내·포인트 환급 안내와 서버 payload는 변경하지 않는다.

## 3. 수다방 카드 외곽선 보존

- `CommunityOverviewGrid`의 컨테이너가 첫 카드 왼쪽과 마지막 카드 오른쪽 border를 자르지
  않도록 프로덕션과 같은 가로 여백·overflow 규칙을 사용한다.
- 카드 자체의 border, 색, 크기는 변경하지 않는다.
- 1열·3열·4열 등 운영자 배치 수에 관계없이 데스크톱 양끝 border가 보여야 한다.
- 모바일 한 열 배치도 같은 좌우 여백을 유지한다.

## 4. 운영자 수다방 홈 고정 슬롯

- 1행은 `notice` 한 개만 허용한다.
- 1행 추가·삭제·드롭·제거·다른 게시판 삽입을 막는다.
- 2행 1열은 가상 게시판 `best`로 고정한다.
- `best`를 제거하거나 다른 행·열로 이동할 수 없고 다른 게시판을 2행 1열에 놓을 수 없다.
- 2행 2열 이후와 3행 이후는 기존 drag-and-drop·선택기·제거 기능을 유지한다.
- 클라이언트 UI만 믿지 않고 `updateHomeLayout` API도 동일한 불변식을 검증한다.
- 게시판 아이콘·설명·노출 여부 등 별도 관리 기능은 유지한다.

## 5. 구직자·구인자 글 관리

- `좋아요 누른 글`, `내가 작성한 글`을 각각 독립 Accordion으로 감싼다.
- 최초 진입 시 두 Accordion 모두 닫혀 있다.
- 열렸을 때만 해당 목록 조회를 활성화해 불필요한 요청을 줄인다.
- 각 목록은 기존 10건 페이지네이션과 독립 페이지 상태를 유지한다.
- 포인트 내역 표의 반응형 글자 크기와 3열 table 문법을 재사용한다.
- 열은 `게시판 / 제목 / 날짜`이며 두 목록 모두 원글 작성일을 표시한다.
- 각 행의 연한 primary 배경을 제거하고 table border 행으로 표시한다.
- 게시 중인 글은 기존 게시판 상세로 이동한다.
- 삭제·숨김·이동된 글은 snapshot을 목록에 유지하고 기존 안내 toast를 표시한다.

### 좋아요 snapshot 작성일

- `community_post_like_history.post_created_at`을 추가한다.
- 기존 행은 살아 있는 `community_post.created_at`으로 backfill하고, 원문이 이미 없는 행은
  기존 `liked_at`을 보존용 fallback으로 채운다.
- 신규 좋아요 생성·재활성화 시 원글 `created_at`을 snapshot에 저장한다.
- API의 좋아요 목록 `createdAt`은 `post_created_at`을 반환한다.
- DB 변경은 Drizzle migration으로만 수행하며 기존 migration을 수정하지 않는다.

## 6. 사이트 푸터 TODO·hydration 안정화

- `SiteFooter`는 사이트 설정 쿼리가 준비되기 전에 `BAMBI_COMPANY`의 `TODO_*` 값을 렌더하지
  않는다.
- 서버 렌더와 첫 클라이언트 렌더는 동일한 중립 로딩 상태를 사용한다.
- 설정 로드 후 DB 값이 있는 항목만 사업자 정보 줄에 표시한다.
- 대표자·사업자등록번호·주소가 비어 있으면 해당 조각만 숨긴다.
- 고객센터 전화가 비어 있으면 `TEL` 조각 전체를 숨기고 광고 문의 전화로 대체하지 않는다.
- 고객문의 이메일과 직업정보제공사업 신고번호는 기존대로 유지한다.
- API 오류 때도 `TODO_*` 문자열을 사용자에게 노출하지 않는다.

## 변경 예상 파일

- `packages/api/src/services/bambi-community-authz.ts`
- `packages/api/src/routers/bambi/community.ts`
- `packages/api/src/routers/bambi/community-boards.ts`
- `packages/api/src/routers/bambi/content-history.ts`
- `packages/db/src/schema/bambi.ts`
- `packages/db/src/migrations/0106_*.sql` 및 meta snapshot/journal
- `apps/web/src/app/employer/new/page.tsx`
- `apps/web/src/components/bambi/job-exposure-fields.tsx`
- `apps/web/src/components/bambi/community-board-preview.tsx`
- `apps/web/src/app/moderator/community-boards/page.tsx`
- `apps/web/src/components/bambi/screens/my-content-screen.tsx`
- `apps/web/src/components/bambi/site-footer.tsx`
- 관련 API·Web 단위 테스트

## 검증

- 성별·생년월일 없는 활성 구인자의 비밀글 목록·상세 성공
- 같은 구인자의 비밀글 글·댓글 작성 거부 유지
- 공고 등록 포인트 차감 총액·상세 내역과 중복 요약 제거 확인
- 수다방 1·3·4열 배치에서 양끝 border 확인
- notice 및 best 고정 슬롯 클라이언트·API 가드 테스트
- 글 관리 두 Accordion 기본 닫힘·독립 10건 페이지네이션·작성일 확인
- 푸터 로딩·빈 필드·API 오류에 `TODO_*` 미노출 및 hydration 일치 확인
- DB/API/Web `check-types`, 변경 파일 Biome, 관련 Vitest, `git diff --check`
- PR 전 최신 `origin/develop` 재확인
