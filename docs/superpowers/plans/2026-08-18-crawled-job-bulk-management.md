# 수집 공고 페이지 복귀·현재 페이지 일괄 삭제 구현 계획

**Goal:** 운영자가 수집 공고 이미지 편집을 마친 뒤 기존 상태 탭과 페이지로 돌아가 연속 작업할 수 있게 하고, 현재 페이지에서 삭제 가능한 공고를 최대 10개까지 선택해 한 번에 `삭제됨` 상태로 옮긴다. 공개·구직자 메인의 전체 공고는 삭제된 행을 제외한 상태로 최초 48개와 더보기 48개 단위를 계속 유지한다.

**Architecture:** 최신 `origin/develop`에서 통합 브랜치 `feat/crawled-job-bulk-management` 하나를 사용한다. 수집 공고 목록의 `status`와 `page`를 URL 검색 파라미터에 기록해 목록과 이미지 편집 화면 사이의 복귀 위치를 보존한다. 일괄 삭제는 운영자 전용 API가 최대 10개의 고유 ID를 한 요청으로 받아 삭제 가능한 행만 원자적으로 `removed`로 변경하며, 클라이언트는 현재 페이지에서 선택 가능한 행만 관리한다. 삭제 성공 뒤 목록·요약·공개 공고 쿼리를 무효화하고 현재 페이지를 다시 조회해 뒤 행으로 최대 10개를 채운다. 현재 페이지가 더 이상 존재하지 않을 때만 마지막 유효 페이지로 보정한다. DB 스키마 변경은 없다.

**Branch / worktree:**

- Branch: `feat/crawled-job-bulk-management`
- Worktree: `C:\Users\user\bambi\.worktrees\crawled-job-bulk-management`
- Base: `origin/develop` `f7f2db1199824f484330a09e06db494e0d2592e0`
- 사용자가 직접 커밋·푸시하며 Codex는 커밋·푸시·머지를 수행하지 않는다.

## 확정 요구사항

- 수집 공고 관리 목록은 한 페이지에 10개를 표시한다.
- `수집됨` 5페이지에서 이미지 편집으로 들어가 저장하거나 취소하면 `수집됨` 5페이지로 돌아온다.
- 목록 복귀 시 상태 탭과 페이지를 복원하며 스크롤 위치는 복원 범위에 포함하지 않는다.
- 제목 왼쪽에 행 체크박스를 추가한다.
- 선택 범위는 현재 페이지의 삭제 가능한 공고 최대 10개로 제한한다.
- 헤더 체크박스는 현재 페이지의 삭제 가능한 공고만 전체 선택·해제한다.
- 페이지 또는 상태 탭이 바뀌면 선택을 초기화한다.
- 하나 이상 선택했을 때만 `삭제됨` 탭 옆에 빨간색 삭제 버튼을 표시한다.
- 선택 삭제는 확인 창 한 번을 거쳐 선택한 공고를 모두 `삭제됨` 상태로 옮긴다.
- 이미 `삭제됨`인 행은 선택할 수 없다. `삭제됨` 탭에는 체크박스와 일괄 삭제 버튼을 표시하지 않고 기존 복구 기능만 유지한다.
- `전체` 탭에서 이미 삭제된 행은 체크박스를 비활성화하고 헤더 전체 선택 대상에서 제외한다.
- 일괄 삭제 뒤 같은 페이지를 다시 조회해 뒤 공고를 당겨 최대 10개를 채운다.
- 마지막 페이지 삭제로 현재 페이지 번호가 사라진 경우에만 직전 마지막 유효 페이지로 이동한다.
- 비로그인 메인과 로그인 구직자 메인의 전체 공고는 모두 최초 48개, 더보기마다 48개를 추가한다.
- 삭제된 공고는 공개 목록에서 제외하고 그만큼 다음 공고를 당겨 각 묶음을 48개로 채운다. 전체 잔여 공고가 부족한 마지막 묶음만 48개 미만일 수 있다.
- DB 행을 물리 삭제하지 않는다. 기존 정책대로 `crawled_job_post.status = 'removed'` 톰스톤을 사용해 재수집 부활을 막고 `삭제됨` 탭에서 복구 가능하게 한다.

## 현재 코드 확인 결과

- `CrawledJobPostsCard`의 `statusFilter`와 `page`가 `useState`에만 있어 편집 화면으로 이동하면 목록 상태가 사라진다.
- 이미지 편집 링크는 공고 ID만 전달하고, 편집기의 취소·변경 버리기는 `/moderator/crawler`로 고정 이동한다.
- 이미지 저장 성공은 현재 편집 화면에 머물도록 구현되어 있다. 이번 작업에서는 운영자의 연속 처리 흐름에 맞춰 저장 성공 후에도 보존된 목록 위치로 돌아가게 한다.
- 단건 삭제 API `crawler.removePost`는 `status='removed'`로 갱신하며, 목록·배너에서 즉시 제외되고 복구할 수 있다.
- 공개 공고 조회는 `active` 수집 공고만 포함한다.
- Web 클라이언트의 `MARKETPLACE_PAGE_SIZE`는 이미 `48`이며 비로그인·로그인 구직자 화면이 같은 `useMarketplaceJobs` 경로를 사용한다. 이번 작업은 이 계약을 유지하고 삭제 후 빈자리가 생기지 않는 회귀 테스트를 보강한다.
- DB 스키마나 Drizzle migration 변경은 필요하지 않다.

## 구현 단위 1 — 목록 위치를 URL 정본으로 전환

**예상 커밋:** `fix: 수집 공고 편집 후 목록 위치 복원`

**Files:**

- Modify: `apps/web/src/app/moderator/crawler/crawled-content-cards.tsx`
- Modify: `apps/web/src/app/moderator/crawler/jobs/[id]/edit/page.tsx`
- Modify: `apps/web/src/components/bambi/crawled-image-editor/crawled-image-editor.tsx`
- Create: `apps/web/src/lib/bambi/crawled-job-management.ts`
- Create: `apps/web/test/lib/bambi/crawled-job-management.test.ts`

### URL 계약

- 목록 URL은 `jobStatus`와 `jobPage` 검색 파라미터를 사용한다.
- 허용 상태는 `all | active | needs_review | expired | removed`, 페이지는 1 이상의 정수만 허용한다.
- 잘못되거나 누락된 값은 각각 `all`, `1`로 정규화한다.
- 다른 카드나 화면이 사용하는 검색 파라미터는 보존한다.
- 상태 탭 변경은 `jobPage=1`로 함께 기록한다.
- 이전·다음 페이지 이동은 `jobPage`만 변경한다.
- 이미지 편집 링크에는 검증된 `returnStatus`와 `returnPage`만 전달한다. 임의의 `returnTo` URL은 받지 않아 외부 리디렉션과 잘못된 내부 경로를 막는다.
- 편집 화면은 위 두 값으로 `/moderator/crawler?jobStatus=...&jobPage=...` 복귀 URL을 조립한다.

### 저장·취소 동작

- 저장 성공 시 편집 쿼리와 공개 상세 쿼리 무효화를 완료한 뒤 보존된 목록 URL로 `router.replace`한다.
- 변경 없는 취소도 같은 복귀 URL로 이동한다.
- 변경이 있는 취소는 기존 확인 창을 유지하고, `변경 버리기` 확정 시 같은 복귀 URL로 이동한다.
- 저장 실패·revision 충돌은 편집 화면에 남겨 사용자가 내용을 잃지 않게 한다.
- 브라우저 새로고침과 직접 URL 진입에서도 안전한 기본값 `전체` 1페이지로 복귀한다.

### 테스트

- 상태·페이지 파라미터의 정상값, 누락값, 잘못된 값, 음수·소수 페이지를 검증한다.
- 목록 URL과 편집 URL, 복귀 URL 조립이 상태와 페이지를 보존하는지 검증한다.
- 다른 검색 파라미터를 덮어쓰지 않는지 검증한다.
- 편집 저장 성공·취소·변경 버리기가 동일한 복귀 URL을 사용하는 소스 계약 또는 컴포넌트 테스트를 추가한다.

## 구현 단위 2 — 현재 페이지 체크박스와 원자적 일괄 삭제

**예상 커밋:** `feat: 수집 공고 현재 페이지 일괄 삭제 추가`

**Files:**

- Modify: `packages/api/src/routers/bambi/crawler.ts`
- Modify: `packages/api/test/routers/bambi/crawler.test.ts`
- Modify: `apps/web/src/app/moderator/crawler/crawled-content-cards.tsx`
- Modify: `docs/manual/moderator-manual.md`
- Modify: `docs/test-flows/moderator-test-flow.md`

### 서버 계약

- `crawler.removePosts` 운영자 전용 mutation을 추가한다.
- 입력은 `{ ids: uuid[] }`이며 최소 1개, 최대 `PAGE_SIZE`와 같은 10개, 중복 금지로 검증한다. 숫자 `10`을 호출부마다 복제하지 않고 이름 있는 공유 상수 또는 서버 전용 상수를 사용한다.
- 하나의 DB update에서 `id IN (...)` 및 `status != 'removed'` 조건으로 선택 대상을 `removed`로 변경한다.
- 요청 ID 중 존재하지 않거나 이미 삭제된 행이 섞이면 일부만 성공시키지 않고 전체 요청을 실패시킨다. 검증과 갱신은 transaction 안에서 수행해 선택 묶음의 원자성을 보장한다.
- 성공 응답은 삭제된 ID와 건수를 반환해 클라이언트가 결과를 명확히 안내할 수 있게 한다.
- 기존 단건 `removePost`와 복구 API는 유지한다.

### 체크박스와 버튼

- 제목 열 앞에 선택 열을 추가하고 헤더와 각 행에 공용 Checkbox를 사용한다.
- 삭제 가능한 행은 `status !== 'removed'`인 현재 페이지 행이다.
- 헤더 체크박스는 현재 페이지의 삭제 가능한 행이 모두 선택되면 checked, 일부만 선택되면 indeterminate, 없으면 disabled다.
- 선택 상태는 `Set<string>`으로 관리하고 페이지·상태 탭 변경 시 즉시 비운다.
- 목록 재조회로 현재 페이지 행이 달라지면 화면에 없는 ID를 선택 상태에서 제거한다.
- 선택 건수가 1개 이상일 때만 상태 탭 줄의 `삭제됨` 옆에 destructive 버튼 `선택 삭제 (N)`을 표시한다.
- 버튼 클릭 시 선택 건수와 공개 목록·배너에서 즉시 빠진다는 내용을 포함한 확인 창을 한 번 표시한다.
- mutation 중 체크박스, 페이지 이동, 상태 변경, 단건 조치와 삭제 확인 버튼을 잠가 중복 요청과 선택 대상 변경을 막는다.
- 성공 시 선택과 확인 창을 비우고 목록·요약·공개 공고 관련 쿼리를 무효화한다.
- 실패 시 선택과 확인 창을 유지해 다시 시도할 수 있게 한다.

### 페이지 재충전과 유효 페이지 보정

- 삭제 성공 뒤 현재 `jobStatus`와 `jobPage`로 목록을 다시 조회한다. offset 기반 조회이므로 삭제된 행 뒤의 공고가 자동으로 앞으로 당겨져 현재 페이지를 최대 10개로 채운다.
- 재조회된 `total`로 `totalPages = max(1, ceil(total / 10))`을 계산한다.
- 현재 페이지가 `totalPages`보다 클 때만 `jobPage=totalPages`로 URL을 교체한다.
- 예: 10페이지에서 8개를 삭제해도 뒤 공고가 있으면 10페이지를 유지하고 다시 10개를 표시한다.
- 예: 마지막 10페이지 전체 삭제 후 총 페이지가 9가 되면 9페이지로 이동한다.
- `전체` 탭에서는 삭제된 행이 같은 결과 집합에 계속 포함되므로 총 페이지가 줄지 않을 수 있다. 이 경우 현재 페이지를 유지하되 삭제된 행의 체크박스만 비활성화한다.

### 테스트

- API가 1~10개 ID를 한 번에 removed로 바꾸고 반환 건수·ID가 일치하는지 검증한다.
- 빈 배열, 11개, 중복 UUID, 잘못된 UUID를 거부하는지 검증한다.
- 존재하지 않는 ID 또는 이미 removed인 ID가 섞이면 다른 행도 변경하지 않는지 검증한다.
- 비운영자 호출이 거부되는지 검증한다.
- 선택 가능한 행 계산, 전체 선택, 일부 선택, indeterminate, 삭제됨 제외를 순수 헬퍼 테스트로 검증한다.
- 페이지·상태 변경 시 선택 초기화와 목록 갱신 시 화면 밖 ID 제거를 검증한다.
- 삭제 성공 후 같은 페이지 유지와 마지막 유효 페이지 보정을 검증한다.

## 구현 단위 3 — 48개 공개 목록 계약 회귀 검증과 문서 동기화

**예상 커밋:** `test: 수집 공고 삭제 후 48개 목록 채움 검증`

**Files:**

- Modify: `packages/api/test/services/bambi-job-feed.test.ts`
- Modify: `packages/api/test/routers/bambi/jobs-list-exposure.test.ts` 또는 현재 `jobs.list` 통합 테스트 소유 파일
- Modify: `apps/web/test/lib/bambi/api-jobs.test.ts`
- Modify: `docs/manual/moderator-manual.md`
- Modify: `docs/test-flows/moderator-test-flow.md`
- Modify: `docs/test-flows/seeker-test-flow.md`
- Modify: 이 계획 문서의 체크박스와 검증 기록

### 공개 목록 계약

- 기존 `MARKETPLACE_PAGE_SIZE = 48`을 단일 클라이언트 정본으로 유지한다.
- 비로그인 `PublicMarketplace`와 로그인 `SeekerMarketplace`가 모두 같은 hook과 48개 limit을 사용하는지 확인한다.
- 서버의 전체 공고 조회는 `crawled_job_post.status = 'active'` 조건을 계속 사용한다.
- 최초 응답에 유효 공고가 48개 이상이면 정확히 48개를 반환한다.
- 첫 48개 후보 중 1개 또는 6개를 `removed`로 바꿔도 다음 active 공고가 당겨져 응답이 다시 48개가 되는지 검증한다.
- 다음 커서 호출도 중복·누락 없이 48개를 반환하며, 남은 전체 공고가 48개 미만인 마지막 호출만 잔여 개수를 반환하고 `hasMore=false`가 되는지 검증한다.
- 자체 공고와 수집 공고가 섞인 경우에도 두 원천의 커서 소비량이 삭제된 수집 행 때문에 어긋나지 않는지 검증한다.

## 접근성·UX 기준

- 모든 행 체크박스의 접근성 이름에 공고 제목을 포함한다.
- 헤더 체크박스에는 `현재 페이지 공고 전체 선택` 이름을 제공한다.
- 삭제 버튼 문구에 선택 건수를 표시한다.
- 삭제 확인 창 제목·설명에 선택 건수, 즉시 비노출, `삭제됨` 탭에서 복구 가능함을 명시한다.
- 체크박스 클릭은 제목 링크나 행 조치 메뉴를 실행하지 않는다.
- 로딩·삭제 중 레이아웃 폭이 흔들리지 않도록 선택 열 너비를 고정한다.

## DB 및 migration

- 스키마 변경 없음.
- Drizzle migration 생성·적용 없음.
- `db:push` 사용 없음.

## 검증 명령

실제 변경 파일에 맞춰 대상 검사를 먼저 실행한다.

```powershell
Set-Location 'C:\Users\user\bambi\.worktrees\crawled-job-bulk-management'

if (-not (Test-Path 'apps\server\.env')) {
    Copy-Item 'C:\Users\user\bambi\apps\server\.env' 'apps\server\.env'
}

if (-not (Test-Path 'apps\web\.env')) {
    Copy-Item 'C:\Users\user\bambi\apps\web\.env' 'apps\web\.env'
}

pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/crawler.test.ts test/services/bambi-job-feed.test.ts test/routers/bambi/jobs-list-exposure.test.ts
pnpm --filter web exec vitest run test/lib/bambi/crawled-job-management.test.ts test/lib/bambi/api-jobs.test.ts
pnpm --filter @bambi-app/api check-types
pnpm --filter web check-types
pnpm exec ultracite check <변경한 TypeScript·TSX 파일 경로>
git diff --check
```

### 수동 브라우저 검증

- `수집됨` 5페이지의 공고를 편집하고 저장했을 때 `수집됨` 5페이지로 복귀한다.
- 같은 흐름에서 변경 없는 취소와 변경 버리기도 `수집됨` 5페이지로 복귀한다.
- 저장 실패 또는 revision 충돌 시 편집 화면과 변경 내용이 유지된다.
- 현재 페이지에서 1개, 일부, 10개 전체 선택과 해제가 동작한다.
- 하나도 선택하지 않으면 빨간 삭제 버튼이 보이지 않는다.
- 페이지나 상태 탭을 바꾸면 선택이 초기화된다.
- `전체` 탭의 삭제됨 행은 선택할 수 없고 헤더 전체 선택에서도 제외된다.
- `삭제됨` 탭에는 체크박스와 일괄 삭제 버튼이 없으며 복구는 정상 동작한다.
- 10페이지에서 8개 삭제 후 뒤 공고가 당겨져 같은 10페이지가 다시 최대 10개로 채워진다.
- 마지막 페이지 전체 삭제로 페이지 수가 줄면 새 마지막 페이지로 이동한다.
- 비로그인·로그인 구직자 전체 공고가 최초 48개이며 더보기마다 48개씩 추가된다.
- 첫 묶음의 수집 공고 6개를 삭제한 뒤 새로 조회하면 다음 공고 6개가 당겨져 다시 48개가 표시된다.
- 마지막 더보기만 남은 공고 수만큼 표시되고 더보기 버튼이 종료된다.

## PR 준비 기준

- 구현 완료 후 계획 체크박스와 실제 검증 결과를 이 문서에 기록한다.
- PR 전 최신 `origin/develop`을 다시 반영하고 충돌 및 migration 이력을 확인한다.
- CMU02의 최신 이슈·PR·커밋 형식을 확인해 같은 구조와 문체를 사용한다.
- PR 본문에 변경 목적, 구현 내용, 자동·수동 검증 결과와 `Closes #이슈번호`를 포함한다.
- 커밋 메시지는 제목과 상세 본문을 함께 작성한다.
- 사용자가 직접 실행할 커밋·푸시 명령을 PowerShell에 붙여넣을 수 있는 형태로 제공한다.
- PR은 동료가 최종 머지하며 Codex는 머지하지 않는다.

## 완료 조건

- [x] 이미지 편집 저장·취소·변경 버리기 후 원래 상태 탭과 페이지로 복귀한다.
- [x] 현재 페이지의 삭제 가능한 공고를 최대 10개 선택할 수 있다.
- [x] 하나 이상 선택했을 때만 빨간 일괄 삭제 버튼이 표시된다.
- [x] 일괄 삭제가 한 번의 확인과 원자적 서버 요청으로 처리된다.
- [x] 삭제 성공 후 같은 페이지가 뒤 공고로 최대 10개까지 다시 채워진다.
- [x] 사라진 마지막 페이지에서만 직전 유효 페이지로 이동한다.
- [x] 삭제됨 행과 삭제됨 탭은 선택 대상에서 제외되고 기존 복구 기능은 유지된다.
- [x] 공개·구직자 전체 공고의 최초 48개와 더보기 48개 계약을 유지하고 관련 문서를 동기화했다.
- [x] 마지막 묶음만 48개 미만이고 더보기 종료 상태가 정확한 기존 커서 계약을 유지했다.
- [x] DB 스키마와 migration을 변경하지 않는다.
- [x] 변경 대상 API·Web 테스트, 타입 검사, Ultracite, `git diff --check`가 통과한다.
- [ ] 운영자·비로그인·로그인 구직자 화면의 수동 검증 결과를 기록한다.

## 구현 검증 기록

- 페이지·상태 URL 변경에는 `scroll: false`를 적용해 수집 공고 카드의 현재 화면 위치를 유지한다.
- 이미지 편집 진입 직전의 목록 스크롤 위치를 세션에 저장하고, 저장·취소·변경 버리기로 목록 데이터가 다시 준비되면 해당 위치를 한 번 복원한다.
- `lastSeenAt`이 같은 공고도 재조회 시 순서가 바뀌지 않도록 `id desc`를 보조 정렬 기준으로 사용한다.
- `전체` 탭에서는 `removed` 행을 목록 맨 뒤로 정렬해 삭제 직후 뒤의 정상 공고가 현재 페이지로 자동으로 당겨지게 한다. 삭제 이력은 전체 목록 끝과 `삭제됨` 탭에서 유지한다.
- `pnpm --filter web exec vitest run test/lib/bambi/crawled-job-management.test.ts test/lib/bambi/api-jobs.test.ts`: 2개 파일, 11개 테스트 통과.
- `pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/crawler.test.ts`: 12개 테스트 통과. 일괄 삭제 성공, 원자적 실패, 1~10개·중복 제한, 비운영자 거부를 포함한다.
- `pnpm --filter web check-types`, `pnpm --filter @bambi-app/api check-types`: 통과.
- 변경 TypeScript·TSX 7개 파일 대상 `pnpm exec ultracite check`: 통과.
- `git diff --check`: 통과.
- `bambi-job-feed.test.ts`와 `jobs-list-exposure.test.ts` 통합 실행은 로컬 개발 DB가 최신 develop 스키마보다 뒤처져 `bambi_site_settings.max_member_points` 컬럼 부재로 실패했다. 이번 변경에는 DB 스키마가 없으므로 임의 migration을 적용하지 않았다. 같은 실행에서 공유 DB 픽스처 간 간섭에 따른 기존 목록 단언 실패도 함께 발생했다.
- 실제 브라우저의 페이지 복귀·체크박스·삭제 후 10개 재충전과 공개 48개 표시는 사용자 수동 검증 대상으로 남긴다.

## 설계 확정 기록

- 2026-08-18: 선택 범위는 현재 페이지 최대 10개이며 페이지·상태 탭 변경 시 초기화하기로 확정했다.
- 2026-08-18: 헤더 체크박스는 현재 페이지의 삭제 가능한 행만 선택하고, 하나 이상 선택해야 빨간 삭제 버튼을 표시하기로 확정했다.
- 2026-08-18: 선택 삭제는 확인 창 한 번 뒤 기존 톰스톤 정책으로 모두 `삭제됨` 상태에 놓기로 확정했다.
- 2026-08-18: 삭제됨 탭은 체크박스 없이 기존 복구 기능만 유지하고, 전체 탭의 삭제됨 행도 선택에서 제외하기로 확정했다.
- 2026-08-18: 이미지 편집 저장·취소 후 원래 상태 탭과 페이지로 복귀하기로 확정했다.
- 2026-08-18: 삭제 후 뒤 공고를 당겨 현재 페이지를 다시 최대 10개로 채우기로 확정했다.
- 2026-08-18: 비로그인·로그인 구직자 전체 공고 모두 최초 48개, 더보기마다 48개, 마지막 묶음만 48개 미만으로 확정했다.
