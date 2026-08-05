# 수집 공고 상세 이미지 편집기 구현 계획

> **For agentic workers:** 구현 전 이 문서와 `AGENTS.md`, `docs/superpowers/specs/2026-07-30-crawled-curation-design.md`, `docs/superpowers/specs/2026-07-30-crawled-image-reliability-design.md`를 다시 읽는다. 체크박스는 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다.

**Goal:** 운영자가 수집 공고의 상세 이미지를 순서 변경·표시 너비 조절·자르기·복사/붙여넣기·삭제한 뒤 한 번에 저장하고, 구직자 상세 화면이 저장된 편집 결과를 그대로 표시하게 한다.

**Architecture:** 크롤러 소유 원본 `detail_image_urls`는 재수집 가능한 원본으로 계속 보존한다. 운영자 편집 결과는 별도 nullable JSONB 문서에 저장하고 공개 API가 편집 문서가 있으면 이를 우선 투영한다. 편집기는 브라우저의 Canvas API와 Pointer Events로 동작하며, 모든 변경은 클라이언트 초안·undo 스택에만 쌓이다가 `저장` 한 번으로 원자 반영된다.

**Tech Stack:** Drizzle/PostgreSQL, oRPC, Zod, Next.js App Router, React 19, TanStack Query, shadcn/Base UI, Canvas API, Pointer Events, Vitest.

## 작업·브랜치 규칙

- 기준 브랜치: 최신 `develop`.
- 설계 전용 브랜치: `docs/crawled-job-image-editor-design`.
- 현재 설계 worktree: `C:\Users\user\bambi\.worktrees\crawled-job-image-editor-design`.
- 구현 통합 브랜치: 설계 승인 뒤 당시 최신 `develop`에서 새로 만든 `feat/crawled-job-detail-image-editor`. 과거에 잘못 원격 게시했다 삭제한 `feat/crawled-job-image-editor` 로컬 브랜치는 재사용하지 않는다.
- 기존 PR #71 브랜치 `fix/community-name-policy-chat-unread`와 변경을 섞지 않는다.
- 아래 작업을 **3개 설계·커밋 단위**로 구분하되 브랜치와 PR은 하나로 유지한다.
- 커밋은 한국어 Conventional Commit 형식 `type: 작업명`을 사용한다.
- PR 본문에는 연결된 이슈별 `Closes #<번호>`를 넣는다.
- 사용자가 명시적으로 요청하기 전에는 push·PR 생성·DB migrate를 실행하지 않는다.
- 구현 직전 최신 `develop`을 다시 받아 rebase하고, `packages/db/src/migrations/`의 다음 번호를 확인한 뒤 `db:generate`한다. 현재 `develop`은 0059까지지만 PR #71에 0060·0061이 있으므로 이 계획에서 마이그레이션 번호를 미리 고정하지 않는다.
- `pnpm db:push`는 사용하지 않는다.
- 커밋 전 변경 파일 경로를 명시해 `pnpm dlx ultracite fix <files...>`를 실행한다.

## 확정 요구사항

- `수집 공고 관리`의 점 3개 조치 메뉴에 `편집`을 추가한다.
- 편집 조회·저장·초기화는 운영자만 가능하고, 상태가 `active`(화면 표기 `수집됨`)인 공고만 대상이다.
- `편집`은 새 창이나 팝업이 아니라 같은 탭의 운영자 전용 페이지로 이동한다.
- 이미지를 우클릭하면 사용자 정의 메뉴가 열린다.
- 모바일에서는 길게 누르기를 쓰지 않고 이미지별 점 3개 버튼으로 같은 메뉴를 연다.
- 메뉴 항목은 `자르기`, `복사`, `붙여넣기`, `전체 선택`, `다른 이름으로 저장`, `삭제`, `실행 취소`다. 기존 예시의 `잘라내기`라는 이름은 사용하지 않는다.
- 편집 전 기본 표시는 현재처럼 본문 폭 100%다. 모서리를 잡아 크기를 바꾸는 순간부터 표시 너비를 px로 저장하며 원본 파일 해상도는 바꾸지 않는다.
- 원본 종횡비를 항상 고정하고 드래그 중 현재 표시 크기를 `N × M`으로 보여준다. 너비가 변하면 높이는 원본 비율에 맞춰 자동 계산한다.
- 최소 표시 너비는 50px이고 이미지는 항상 가운데 정렬한다. 원본 자체가 50px보다 작으면 그 원본 너비를 최솟값으로 사용한다.
- 크기는 네 모서리 손잡이, px Slider, px 숫자 입력을 모두 제공한다.
- 복사·붙여넣기는 같은 공고 편집 화면 안에서 이미지를 복제한다. OS 클립보드나 다른 프로그램과 이미지를 주고받는 기능이 아니다.
- 붙여넣기와 새 이미지 추가 위치는 운영자가 이미지 사이를 직접 클릭해 지정한 깜빡이는 삽입 커서 자리다. 초기 진입에는 커서를 표시하지 않고, 빈 편집 바탕이나 이미지를 좌클릭하면 커서를 해제한다.
- PC 파일 선택으로 새 이미지를 한 번에 한 장 추가할 수 있다.
- 이미지가 여러 장이면 각 이미지의 자르기·너비·삭제를 독립 적용하고, 이미지 순서를 변경할 수 있다.
- 전체 선택 뒤 복사·삭제·너비 일괄 변경·그룹 순서 이동을 허용한다. 자르기와 다른 이름으로 저장은 한 장 선택일 때만 허용한다.
- 저장 전 변경은 전부 임시 상태다. `취소`하거나 페이지 이탈을 확정하면 저장 전 변경을 모두 버린다.
- 변경된 상태에서 뒤로가기·새로고침·탭 닫기를 시도하면 변경 폐기 확인창을 띄운다.
- 자르기 화면은 선택 영역을 밝게, 잘릴 영역을 어둡게 표시한다. 네 모서리에는 카카오톡 예시와 같은 꺾쇠형 손잡이를 두고, 상·하·좌·우 네 변 전체도 잡을 수 있게 한다. 모서리는 두 축을, 변은 해당 축만 움직여 자유 비율로 자른다.
- 자르기 결과는 원본 MIME을 유지한다. JPEG·WebP는 품질 92%, PNG는 무손실로 다시 인코딩하고 GIF는 자르기를 비활성화한다.
- 자르기·너비·순서·붙여넣기·삭제·원본 초기화는 실행 취소 대상이다. 다시 실행은 제공하지 않고 저장 성공 시 실행 취소 기록을 초기화한다.
- `원본으로 초기화`는 현재 크롤링 원본을 초안으로 복원하며, 저장하기 전까지 서버에는 반영하지 않는다.
- 이미지를 전부 삭제한 빈 편집본도 저장할 수 있다.
- 저장 성공 후 목록으로 이동하지 않고 현재 편집 화면에 머문다.
- 마지막 이미지 작업 운영자와 작업 시각을 편집 화면에 표시한다.
- 편집된 공고를 삭제했다가 복구하면 저장돼 있던 편집본을 다시 사용한다. 삭제 상태에서는 편집 진입·저장을 허용하지 않는다.
- 저장 뒤 구직자 수집 공고 상세 화면은 편집된 순서·크롭 결과·표시 너비를 사용한다.

## 범위

### 포함

- `crawled_job_post.detail_image_urls`에 저장된 **상세 본문 이미지** 편집.
- `active` 상태의 수집 공고에 대한 운영자 전용 편집 조회·저장·원본 초기화.
- 마우스, 터치 Pointer Events, 키보드 대안.
- PC 파일 선택을 통한 상세 이미지 한 장씩 추가.
- 저장 충돌 감지, 서버 입력 검증, 이미지 용량 제한.
- 편집본이 있는 공고의 공개 상세 렌더링.

### 제외

- 목록 썸네일 `thumbnail_url` 편집.
- 가로·세로 광고 배너 `banner_horizontal_url`, `banner_vertical_url` 편집.
- 워터마크 자동 제거, 색상 보정, 그림 그리기, 필터, 회전.
- 외부 프로그램과 연결되는 시스템 클립보드 이미지 붙여넣기.
- 공고 본문 텍스트·급여·지역 등 이미지 외 필드 편집.
- 모바일 네이티브 앱 편집기.
- GIF 자르기와 다시 실행(redo).
- `needs_review`, `expired`, `removed` 상태 공고의 편집 진입·저장.

## 현재 코드 조사 결과

- `packages/db/src/schema/bambi.ts`
  - `crawledJobPost.detailImageUrls`는 `jsonb string[]`이며 Base64 data URI를 순서대로 저장한다.
  - 목록 쿼리에서 이 컬럼을 선택하지 않는 성능 규칙이 이미 있다.
- `packages/api/src/services/bambi-crawl-media.ts`
  - 허용 이미지 형식은 JPEG, PNG, GIF, WebP다.
  - 원본 이진 기준 한 장 8MB, 공고 합계 16MB 제한을 사용한다.
- `packages/api/src/services/bambi-crawl-ingest.ts`
  - 상세 재수집 시 내용 해시가 같아도 `detailImageUrls`를 갱신한다. 원본 컬럼을 직접 편집하면 운영자 변경이 다음 회차에 사라진다.
- `packages/api/src/routers/bambi/crawler.ts`
  - `crawler.list`는 이미지 바이트를 선택하지 않는다.
  - 운영자 전용 조치 API가 모여 있어 편집 조회·저장도 이 라우터에 두는 것이 기존 권한 경계와 맞는다.
- `apps/web/src/app/moderator/crawler/crawled-content-cards.tsx`
  - 조치 메뉴에는 현재 `상세 보기`, `삭제` 또는 `복구`만 있다.
- `packages/api/src/routers/bambi/crawled-jobs.ts`와 `seeker-crawled-job-detail.tsx`
  - 공개 상세는 원본 `detailImageUrls`를 항상 `w-full`로 세로 렌더링한다.
- `apps/web/src/components/bambi/ad-banner-editor/use-block-resize.ts`
  - Pointer Events, 퍼센트 좌표, 키보드 조작의 기존 패턴은 참고하되 수집 상세 이미지 편집 상태와 컴포넌트를 직접 공유하지 않는다.

## 설계 결정

### D1. 원본과 운영자 편집본을 분리한다

원본 `detailImageUrls`는 크롤러만 갱신한다. 새 nullable JSONB 컬럼 `editedDetailImageDocument`를 추가한다.

- `null`: 운영자가 저장한 편집본이 없음. 공개 화면은 원본 `detailImageUrls` 사용.
- 문서 객체: 운영자가 저장한 편집본이 있음. `items: []`도 유효하며 "상세 이미지를 전부 숨김"을 뜻한다.
- 재수집은 `editedDetailImageDocument`를 절대 덮지 않는다.
- 공개 상세는 편집 문서가 있으면 원본이 갱신돼도 편집본을 계속 사용한다.
- `원본으로 초기화` 초안을 그대로 저장하면 문서를 `null`로 되돌린다. 초기화 뒤 다시 편집하거나 이미지를 추가하면 새 문서 객체로 저장한다.

감사 추적용으로 다음 컬럼도 둔다.

- `detailImagesEditedAt: timestamp nullable`
- `detailImagesEditedByUserId: text nullable -> user.id`
- `detailImageEditRevision: integer default 0 not null`

편집 화면 상단에는 마지막 작업자의 표시 이름과 `detailImagesEditedAt`을 보여준다. 편집본을
저장한 뒤 공고가 삭제돼도 세 값과 편집 문서는 유지하며, 복구되면 같은 편집본이 다시 보인다.

### D2. 편집 문서는 자산과 배치 항목을 분리한다

복사·붙여넣기 때 동일한 Base64 문자열을 JSON에 반복 저장하지 않도록 한 문서 안에서 이미지 자산과 표시 항목을 분리한다.

```ts
export interface CrawledJobEditedImageAsset {
	id: string;
	dataUrl: string;
	height: number;
	width: number;
}

export interface CrawledJobEditedImageItem {
	assetId: string;
	// null은 편집 전 기본값인 본문 폭 100%. 숫자가 생기면 고정 px 너비이며
	// 공개 화면은 작은 viewport에서 max-width: 100%로만 축소한다.
	displayWidthPx: number | null;
	id: string;
}

export interface CrawledJobEditedImageDocument {
	assets: CrawledJobEditedImageAsset[];
	items: CrawledJobEditedImageItem[];
	version: 1;
}
```

- `items` 배열 순서가 공개 상세의 표시 순서다.
- 복사·붙여넣기는 새 item id만 만들고 같은 `assetId`를 참조한다.
- 자르기는 Canvas가 만든 새 Base64를 새 asset으로 넣고 해당 item만 새 asset을 가리킨다.
- 저장 직전 참조되지 않는 asset을 제거한다.
- 원본에서 편집기를 처음 열면 서버가 각 원본 Base64를 한 번씩 asset으로 바꾼 초기 문서를 내려준다. 운영자가 저장할 때만 이 스냅샷이 DB에 기록된다.

### D3. Base64 자르기 결과를 실제로 새로 저장한다

사용자 질문대로 자르기 완료 결과는 새 Base64 data URI가 된다.

1. 선택한 asset의 Base64를 `Image`로 디코딩한다.
2. 원본 픽셀 좌표로 환산한 crop rect만 offscreen canvas에 그린다.
3. 원본 MIME으로 다시 인코딩한다. JPEG·WebP는 quality `0.92`, PNG는 무손실이다.
4. Blob을 Base64 data URI로 변환하고 새 asset에 저장한다.

GIF asset은 자르기 메뉴와 버튼을 비활성화하고 이유를 안내한다. 복사·삭제·순서·너비·다운로드는
그대로 허용한다. 자르지 않은 JPEG/PNG/GIF/WebP와 새로 추가한 파일은 원본 Base64를 유지한다.

### D4. 서버가 이미지 문서를 다시 검증한다

클라이언트가 만든 Base64를 신뢰하지 않는다. API Zod schema와 서비스 검증을 함께 사용한다.

- 모든 object schema는 `.strict()`.
- 문서 버전은 `1`만 허용.
- item·asset id 중복 금지, 모든 item의 asset 참조 존재 필수.
- 참조되지 않는 asset 거부 또는 저장 전 정규화.
- 표시 너비는 null 또는 정수 px다. null은 본문 폭 100%, 숫자는 원본 너비 이하이며 최소 `min(50, asset.width)` 이상이다.
- 원본 픽셀 너비·높이는 양의 정수이며 디코딩 결과와 일치해야 한다.
- data URI MIME은 JPEG/PNG/GIF/WebP만 허용하고 Base64 디코딩 뒤 매직바이트를 확인한다.
- 고유 asset 기준 한 장 8MB, 합계 16MB를 유지한다. 복사된 item은 같은 asset을 참조하므로 용량을 중복 계산하지 않는다.
- 최대 asset 30개, 최대 item 60개. 지나친 복제로 DOM과 요청 크기가 폭증하지 않게 한다.
- 잘못된 입력은 `BAD_REQUEST`, 편집 revision 충돌 또는 저장 시점에 `active`가 아닌 공고는 `CONFLICT`, 없는 공고는 `NOT_FOUND`로 반환한다.

### D5. 저장은 낙관적 충돌 검사를 포함한 단일 mutation이다

`crawler.getPostImagesForEdit`는 편집 문서와 `detailImageEditRevision`을 반환한다.
`crawler.updatePostImages`는 `{ id, expectedRevision, document }`를 받고
`WHERE id = ? AND status = 'active' AND detail_image_edit_revision = ?`로 한 번에 갱신하면서 revision을 1 올린다.

- 두 운영자가 동시에 편집하면 먼저 저장한 결과만 성공하고 뒤의 오래된 revision 저장은 `CONFLICT`다.
- 재수집은 편집 revision을 바꾸지 않는다. 사용자가 확정한 대로 편집 뒤 새 원본 유입을 별도 처리하지 않는다.
- 편집 도중 공고가 삭제·만료·검토 대기로 바뀌면 저장을 막는다.
- 화면은 "공고가 편집 중 변경되었습니다. 새로 불러온 뒤 다시 편집해 주세요."를 보여준다.
- 저장 mutation은 공고 상태를 바꾸지 않는다.
- 저장 성공 후 운영자 목록·편집 조회·공개 상세 캐시를 invalidate한다.

### D6. 초안, 내부 클립보드, undo를 한 편집 상태로 관리한다

편집기 상태는 서버 응답과 분리된 `draft`다.

```ts
interface CrawledImageEditorSnapshot {
	document: CrawledJobEditedImageDocument;
	useOriginalFallback: boolean;
}

interface CrawledImageEditorState {
	clipboard: CrawledJobEditedImageItem[];
	document: CrawledJobEditedImageDocument;
	history: CrawledImageEditorSnapshot[];
	insertionIndex: number;
	selectedIds: Set<string>;
	useOriginalFallback: boolean;
}
```

- 순서 변경·너비 변경·자르기 완료·붙여넣기·삭제 전 현재 문서를 history에 push한다.
- 너비 드래그는 pointer move마다 history를 쌓지 않고 pointer down 시점의 문서를 한 번만 기록한다.
- `실행 취소`와 `Ctrl/Cmd+Z`는 직전 문서를 복원한다.
- `복사`는 선택 item들의 순서와 asset 참조를 내부 clipboard에 보관한다.
- 이미지 사이 삽입 지점을 클릭하면 해당 index에 깜빡이는 커서를 표시한다.
- `붙여넣기`와 새 이미지 추가는 `insertionIndex`에 넣고 삽입된 항목 뒤로 커서를 옮긴다.
- 복사본을 자르면 해당 item만 새 asset을 가리키고 원본 item은 바뀌지 않는다.
- 저장 성공 시 서버 반환값을 새 기준선으로 삼고 history·clipboard를 비운다.
- 저장 성공 후 같은 편집 화면에 머물고 revision·감사 표시를 새 응답으로 갱신한다.
- `취소`는 서버 mutation 없이 수집 공고 관리 목록으로 돌아간다.
- 초안이 기준선과 다르면 라우트 이탈과 브라우저 닫기 전에 확인한다.
- `원본으로 초기화`는 document를 현재 원본 기반 초안으로 교체하는 한 번의 undo 가능 작업이다.
- 초기화 직후에는 `useOriginalFallback=true`이고 저장 input의 document는 `null`이다. 그 뒤 crop·resize·reorder·paste·delete·upload가 일어나면 false로 바꿔 문서를 저장한다.

### D7. 우클릭 메뉴와 키보드 동작

이미지 좌클릭은 단일 선택, `Ctrl/Cmd+클릭`은 다중 선택 토글, `Shift+클릭`은 연속 범위 선택으로 한다. 우클릭은 해당 이미지가 선택돼 있지 않으면 그 이미지만 먼저 선택한 뒤 포인터 위치에 메뉴를 연다.

| 메뉴 | 동작 | 비활성 조건 |
|---|---|---|
| 자르기 | 단일 선택 이미지를 자르기 dialog에서 편집 | 선택이 정확히 1개가 아님 |
| 복사 | 선택 항목을 내부 clipboard에 저장 | 선택 없음 |
| 붙여넣기 | clipboard 항목을 새 id로 복제해 삽입 커서에 추가 | clipboard 비어 있음 또는 item 상한 도달 |
| 전체 선택 | 현재 모든 item 선택 | 이미지 없음 |
| 다른 이름으로 저장 | 선택 asset을 브라우저 다운로드 | 선택이 정확히 1개가 아님 |
| 삭제 | 선택 item 삭제 | 선택 없음 |
| 실행 취소 | 직전 초안 복원 | history 비어 있음 |

키보드 대안은 `Ctrl/Cmd+C`, `Ctrl/Cmd+V`, `Ctrl/Cmd+A`, `Delete`, `Ctrl/Cmd+Z`를 제공한다. 브라우저 기본 메뉴는 이미지 영역에서만 막고 페이지의 나머지 영역에서는 그대로 둔다. 메뉴는 `Escape`, 외부 클릭, 항목 실행 후 닫히며 focus를 원래 이미지로 돌린다.

모바일에서는 long-press를 가로채지 않는다. 각 이미지의 점 3개 버튼이 같은 명령 메뉴를 열며,
아이콘 전용 버튼에는 이미지 순번을 포함한 `aria-label`을 붙인다.

### D8. 표시 너비와 순서 변경

- 각 item의 `displayWidthPx` 기본값은 `null`이며 편집 전과 같은 본문 폭 100%를 뜻한다.
- 선택 이미지 네 모서리에 Pointer Events 크기 손잡이를 표시한다. 어느 모서리를 잡아도 종횡비는 고정되고 반대 모서리를 기준으로 크기가 변한다.
- 드래그를 시작할 때 실제 렌더된 너비를 px 기준값으로 잡고, 이동 거리를 1px 정수 단위 너비 변화로 환산한다. 높이는 `round(width × asset.height / asset.width)`로 계산하므로 세로로 긴 이미지는 너비 1px당 높이가 여러 px 변할 수 있다.
- 크기 조절은 주 마우스 버튼을 누른 상태에서만 동작하고, `pointerup`·`pointercancel`·pointer capture 상실을 전역에서 감지해 즉시 종료한다. 손잡이 밖에서 버튼을 놓아도 잔여 드래그 상태가 남지 않아야 한다.
- 크기 손잡이 드래그를 마친 뒤에도 조절하던 이미지 선택을 유지한다. 손잡이에서 발생한 후속 `click`은 편집 바탕의 선택 해제 처리로 전파하지 않는다.
- 드래그 중 이미지 옆에 현재 `너비 × 높이`를 px 숫자로 표시한다.
- 최솟값은 `min(50, asset.width)`, 최댓값은 원본 asset 너비다. 작은 화면에서는 preview만 컨테이너 폭에 맞춰 축소하고 저장값은 바꾸지 않는다.
- 정확한 값 입력을 위해 속성 패널에 px Slider와 px 숫자 입력을 함께 둔다.
- 방향키는 너비 1px, Shift+방향키는 10px 단위로 조절하며 높이는 비율대로 다시 계산한다.
- 순서 변경은 드래그 핸들을 사용하며 `위로 이동`·`아래로 이동` 버튼을 키보드 대안으로 제공한다. 다중 선택은 내부 순서를 유지한 한 그룹으로 이동한다.
- 여러 항목을 선택한 상태에서 px 값을 입력하면 선택 항목 모두 같은 목표 너비를 사용하되 각 이미지의 원본 너비를 넘지 않게 clamp한다.

### D9. 자르기 화면

- shadcn `Dialog` 안에 이미지 편집 캔버스를 배치한다.
- crop rect 바깥은 반투명 어두운 overlay, 안쪽은 원본 밝기로 표시한다.
- 네 모서리에 꺾쇠형 crop 표시와 pointer hit area를 두고, 상·하·좌·우 네 변 전체에도 pointer hit area를 둔다. 변은 한 축만, 모서리는 두 축을 함께 조절한다.
- 자유 비율 자르기이며 최소 영역은 각 축 32px 또는 원본의 2% 중 큰 값이다.
- crop rect는 이미지 자연 크기 좌표로 보관하고 화면 확대·축소와 분리한다.
- `완료`를 눌러야 draft에 새 asset이 들어가며, `취소`하면 자르기 시작 전 상태로 돌아간다.
- `완료` 처리 중에는 중복 클릭을 막고 `이미지를 처리하는 중…` 상태를 표시한다.
- GIF면 자르기 진입 자체를 막고 `GIF 이미지는 자를 수 없어요.`를 표시한다.

### D10. 공개 화면은 편집 결과를 그대로 렌더링한다

공개 API는 DB 컬럼을 그대로 노출하지 않되 Base64 중복 전송을 피하도록 자산과 표시 항목을
분리한 다음 투영을 반환한다.

```ts
interface CrawledJobDetailImageAsset {
	id: string;
	src: string;
	height: number;
	width: number;
}

interface CrawledJobDetailImageItem {
	assetId: string;
	id: string;
	widthPx: number | null;
}

interface CrawledJobDetailImageDocument {
	assets: CrawledJobDetailImageAsset[];
	items: CrawledJobDetailImageItem[];
}
```

- 편집 문서가 null이면 원본 배열을 자산과 `widthPx: null`인 item으로 매핑한다.
- 편집 문서가 있으면 유효한 asset과 item만 공개 응답 모양으로 매핑한다.
- 공개 화면은 asset map을 한 번 만들고 item 순서대로 참조한다. 같은 이미지를 복제해도 Base64는 응답에 한 번만 실린다.
- 공개 화면은 `widthPx=null`이면 기존 `w-full`, 숫자면 px CSS custom property를 사용한다. 두 경우 모두 `max-w-full`, `h-auto`, 가운데 정렬이라 모바일에서는 화면보다 커지지 않는다.
- 상세 화면 외 목록·검색·광고 배너 쿼리는 편집 Base64를 선택하지 않는다.

### D11. 원본 초기화·새 이미지 추가·감사 표시

- 편집 조회는 큰 Base64를 두 벌 동시에 반환하지 않는다. `getPostImagesForEdit`는 현재 유효 문서만 반환하고, 편집본이 있는 상태에서 `원본으로 초기화`를 누를 때 `getOriginalPostImagesForEdit`로 원본을 지연 조회한다.
- 원본 지연 조회도 adminProcedure이며 `active` 상태만 허용한다.
- 새 이미지 추가는 `accept="image/jpeg,image/png,image/gif,image/webp"`인 단일 파일 input이다. `multiple`은 사용하지 않는다.
- 선택한 파일의 MIME·매직바이트·크기·픽셀 크기를 클라이언트에서 먼저 확인하고, 최종 저장 때 서버가 다시 검증한다.
- 새 asset/item은 깜빡이는 삽입 커서 위치에 들어가며 `displayWidthPx=null`, 즉 기본 본문 폭 100%다.
- 마지막 작업자 표시 이름과 시각은 `getPostImagesForEdit` 응답에 포함한다. 저장 성공 응답으로 즉시 갱신하며 편집 이력이 없으면 `아직 편집한 운영자가 없습니다.`로 표시한다.

## 구현 단위 1 — DB·도메인 계약·운영자 API

**예상 커밋:** `feat: 수집 공고 이미지 편집 저장 구조 추가`

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: 다음 가용 Drizzle migration 및 snapshot/journal 산출물
- Create: `packages/api/src/services/bambi-crawled-image-document.ts`
- Create: `packages/api/src/services/bambi-crawled-image-document.test.ts`
- Modify: `packages/api/src/routers/bambi/crawler.ts`
- Modify: `packages/api/src/routers/bambi/crawler.test.ts`

- [x] `CrawledJobEditedImage*` 타입과 nullable JSONB·감사·전용 revision 컬럼을 스키마에 추가한다.
- [x] 최신 develop의 다음 번호 `0063_lonely_famine.sql`로 migration을 generate하고 컬럼 추가만 있는지 직접 읽어 확인한다.
- [x] 문서 Zod schema, Base64 매직바이트·크기·참조 무결성 검증, 정규화 함수를 작성한다.
- [x] `getPostImagesForEdit({ id })`와 원본 초기화용 `getOriginalPostImagesForEdit({ id })`를 adminProcedure로 추가하고 둘 다 `active` 상태만 허용한다. 목록용 `LIST_COLUMNS`에는 이미지 필드를 넣지 않는다.
- [x] 원본 배열을 초기 편집 문서로 바꾸는 변환을 추가한다.
- [x] `updatePostImages({ id, expectedRevision, document })`를 추가하고 `active`·revision을 원자 검사한 뒤 admin id·편집 시각·다음 revision을 기록한다. `document: null`은 원본 초기화 저장이다.
- [ ] 없는 행, revision 충돌, 잘못된 Base64, 깨진 asset 참조, 용량 초과, 복사 item의 asset 공유를 테스트한다.
- [x] migration은 사용자 승인 전 적용하지 않는다.

## 구현 단위 2 — 운영자 이미지 편집기 UI

**예상 커밋:** `feat: 수집 공고 이미지 편집 화면 추가`

**Files:**

- Modify: `apps/web/src/app/moderator/crawler/crawled-content-cards.tsx`
- Create: `apps/web/src/app/moderator/crawler/jobs/[id]/edit/page.tsx`
- Create: `apps/web/src/components/bambi/crawled-image-editor/crawled-image-editor.tsx`
- Create: `apps/web/src/components/bambi/crawled-image-editor/image-item.tsx`
- Create: `apps/web/src/components/bambi/crawled-image-editor/image-context-menu.tsx`
- Create: `apps/web/src/components/bambi/crawled-image-editor/crop-dialog.tsx`
- Create: `apps/web/src/components/bambi/crawled-image-editor/use-image-resize.ts`
- Create: `apps/web/src/components/bambi/crawled-image-editor/use-image-reorder.ts`
- Create: `apps/web/src/lib/bambi/crawled-image-editor.ts`
- Create: `apps/web/src/lib/bambi/crawled-image-editor.test.ts`

- [x] `active` 행의 점 3개 메뉴에만 `편집`을 추가해 같은 탭의 운영자 전용 edit route로 이동한다.
- [x] query 결과를 깊은 복사한 draft로 시작하고 로딩·오류·빈 이미지 상태를 처리한다.
- [x] 좌클릭·다중 선택·우클릭 메뉴와 키보드 단축키를 구현한다.
- [x] 깜빡이는 삽입 커서와 내부 clipboard 복사·붙여넣기, 한 장 파일 추가, item/asset 정리를 구현한다.
- [x] 네 모서리 px 크기 핸들·`N × M` 표시·px Slider·px 숫자 입력과 다중 선택 적용을 구현한다.
- [x] drag reorder와 키보드 위/아래 이동을 구현한다.
- [x] crop overlay, 네 모서리와 네 변 hit area, 자유 비율 좌표 변환, 원본 MIME Canvas Base64 출력, GIF 차단을 구현한다.
- [x] 다른 이름으로 저장 시 MIME에 맞는 확장자와 `수집공고-<id>-이미지-<순번>` 파일명을 사용한다.
- [x] 각 변경 작업의 undo 경계와 history 상한 50개를 구현한다.
- [x] `원본으로 초기화`, 마지막 작업자·시각 표시, 저장 후 화면 유지, 저장·취소·dirty 이탈 확인·CONFLICT 메시지를 구현한다.
- [x] 모바일 이미지별 점 3개 메뉴를 제공하고 long-press는 가로채지 않는다.
- [ ] 순수 상태 변환과 crop 좌표 계산을 Vitest로 검증한다.

## 구현 단위 3 — 공개 투영·렌더링·통합 검증

**예상 커밋:** `feat: 수집 공고 편집 이미지를 공개 상세에 반영`

**Files:**

- Modify: `packages/api/src/routers/bambi/crawled-jobs.ts`
- Modify/Create: `packages/api/src/routers/bambi/crawled-jobs.test.ts`
- Modify: `apps/web/src/components/bambi/screens/seeker-crawled-job-detail.tsx`
- Modify/Create: 관련 Web 소스 계약 테스트
- Modify: `docs/manual/moderator-manual.md`
- Modify: 이 계획의 체크박스와 검증 기록

- [x] 공개 API가 편집 문서 우선, null이면 원본 폴백으로 `detailImageDocument`를 반환하게 한다.
- [ ] 편집 문서가 빈 배열이면 공개 상세에 이미지가 0장 보이는지 테스트한다.
- [x] 공개 상세가 저장된 순서와 너비를 사용하고 원본 비율을 유지하게 한다.
- [x] 목록·검색 쿼리에 `editedDetailImageDocument`가 섞이지 않는지 코드로 확인한다.
- [x] 운영자 매뉴얼에 진입, 우클릭 메뉴, 자르기 밝음/어두움 의미, 저장·취소, 재수집 보존을 기록한다.
- [x] plan에 migration 파일명과 자동·수동 검증 결과를 기록한다.

## 테스트 계획

### API·DB

- 원본만 있는 공고는 초기 문서와 공개 100% 너비 이미지로 변환된다.
- 편집 문서가 있으면 원본보다 우선한다.
- 편집 문서 `items: []`는 원본 폴백이 아니라 의도적 0장이다.
- 복사 item 두 개가 같은 asset을 참조해도 저장된다.
- 중복 id, 없는 asset 참조, 미사용 asset, 잘못된 data URI, MIME 위장, 한 장/총량 초과는 거부된다.
- admin만 조회·저장·원본 초기화할 수 있다.
- `active`가 아닌 공고의 편집 조회·저장은 거부된다.
- 오래된 `expectedRevision` 저장은 CONFLICT이며 기존 편집본을 바꾸지 않는다.
- 저장해도 status, 원본 `detailImageUrls`, 수집 메타데이터는 바뀌지 않는다.
- 재수집 upsert 뒤에도 편집 문서와 감사 컬럼이 유지된다.
- 삭제·복구 뒤에도 편집 문서가 보존되고, 복구 후 공개 상세가 다시 편집본을 사용한다.
- `document: null` 저장은 원본 폴백으로 돌아가면서 revision·마지막 작업자·시각을 갱신한다.

### Web 단위

- 선택·Ctrl/Cmd 선택·Shift 범위 선택.
- 복사 후 붙여넣기가 새 item id와 같은 asset id를 만든다.
- 붙여넣기와 단일 파일 추가가 삽입 커서 위치에 들어간다.
- 복사본 자르기는 원본 item을 바꾸지 않는다.
- 여러 이미지 삭제 뒤 미사용 asset만 제거된다.
- reorder가 item 순서만 바꾼다.
- resize는 원본 비율을 유지하고 50px~원본 너비에서 clamp되며 한 드래그가 undo 한 단계다.
- px 너비가 1씩 변할 때 높이가 원본 비율로 계산되고 `N × M` 표시와 일치한다.
- crop 화면 좌표를 원본 픽셀 좌표로 정확히 바꾼다.
- JPEG·WebP 92%, PNG 무손실 출력과 GIF 자르기 비활성화를 검증한다.
- undo가 crop·paste·delete·reorder·resize를 각각 복원한다.
- 저장 성공 시 undo·clipboard가 초기화되고 같은 화면에 머문다.
- dirty 상태 취소와 clean 상태 취소가 구분된다.
- 우클릭 메뉴의 활성/비활성 조건과 단축키가 일치한다.

### 수동 브라우저 검증

- 운영자 콘솔 `수집됨` 행에만 `편집`이 보이고 다른 상태에서는 보이지 않는지 확인.
- 1장·여러 장·아주 긴 이미지 공고에서 편집 화면 확인.
- 좌클릭 선택, 우클릭 메뉴 위치, 외부 클릭/Escape focus 복귀 확인.
- 자르기 네 모서리 표시, 어두운 제거 영역, 밝은 유지 영역, 네 모서리·상하좌우 변 드래그와 자유 비율 확인.
- 기본 본문 폭 → 모서리 드래그 px 크기 변경, `N × M` 표시, 50px 최소 제한, 가운데 정렬 확인.
- 복사·붙여넣기, 전체 선택, 삭제, 실행 취소, 다른 이름 저장 확인.
- 삽입 커서 위치의 붙여넣기·한 장 파일 추가와 모바일 점 3개 메뉴 확인.
- 초기 진입에는 삽입 커서가 없고, 이미지 사이 클릭 후에만 깜빡이는 커서가 나타나며 빈 바탕·이미지 클릭 시 선택과 커서가 의도대로 해제되는지 확인.
- 크기 손잡이를 놓은 뒤 단순 hover로 크기가 바뀌지 않고, 빠른 드래그에서도 너비가 포인터 이동량에 맞는 1px 정수 단위로 변하는지 확인.
- 크기 손잡이에서 마우스를 놓은 뒤에도 이미지 선택 테두리와 네 모서리 손잡이가 유지되어 연속으로 다시 조절할 수 있는지 확인.
- GIF 자르기 비활성화, JPEG·WebP·PNG 출력 형식 확인.
- 원본 초기화는 저장 전 취소 가능하고 저장 후 원본 폴백으로 돌아가는지 확인.
- drag reorder와 키보드 위/아래 이동 확인.
- 변경 후 취소하면 공개 상세가 그대로인지 확인.
- 변경 후 저장하면 공개 상세의 순서·자르기·너비가 일치하는지 확인.
- 저장한 공고를 다시 수집한 뒤에도 편집본이 유지되는지 확인.
- 두 브라우저에서 같은 공고를 열고 먼저 저장한 뒤 두 번째 저장이 CONFLICT로 막히는지 확인.
- 저장 성공 뒤 같은 화면에 머물고 마지막 작업자·시각과 revision이 갱신되는지 확인.
- 편집본이 있는 공고를 삭제·복구했을 때 편집본이 다시 보이는지 확인.
- 모바일 폭에서 이미지·속성 패널·하단 저장/취소가 겹치지 않는지 확인.

## 검증 명령

구현 시 실제 파일 경로에 맞춰 대상 테스트를 먼저 실행한다.

```bash
pnpm --filter @bambi-app/api exec vitest run src/services/bambi-crawled-image-document.test.ts src/routers/bambi/crawler.test.ts src/routers/bambi/crawled-jobs.test.ts
pnpm vitest run apps/web/src/lib/bambi/crawled-image-editor.test.ts
pnpm --filter @bambi-app/db check-types
pnpm --filter @bambi-app/api check-types
pnpm --filter web check-types
pnpm dlx ultracite check <변경 파일 경로들>
git diff --check
```

DB 통합 테스트와 브라우저 검증은 migration 적용 승인 뒤 수행한다. 기존 기준선 오류가 있으면 전체 명령 결과와 변경 파일 대상 결과를 분리해 기록하고, 이번 변경이 새 오류를 만들지 않았다는 근거를 남긴다.

## 구현 검증 기록

- 생성 마이그레이션: `packages/db/src/migrations/0063_lonely_famine.sql`. 이미지 편집 JSONB·마지막 작업자·마지막 작업 시각·전용 revision 컬럼과 사용자 FK만 추가된 것을 직접 확인했다. 실제 DB에는 적용하지 않았다.
- `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-crawled-image-document.test.ts`: 3개 통과.
- `pnpm exec vitest run apps/web/src/lib/bambi/crawled-image-editor.test.ts`: 3개 통과.
- `pnpm --filter @bambi-app/db check-types`, `pnpm --filter @bambi-app/api check-types`, `pnpm --filter web check-types`: 모두 통과.
- 변경된 TypeScript·TSX 12개 파일 대상 `pnpm dlx ultracite check`: 통과.
- `git diff --check`: 통과.
- DB 마이그레이션 적용과 실제 운영자·구직자 브라우저 수동 검증은 수행하지 않았다.

## 완료 조건

- [x] 새 기능은 최신 develop 기반 `feat/crawled-job-detail-image-editor` 한 브랜치에만 있다.
- [x] 3개 구현 영역이 각각 구분 가능한 커밋으로 남는다.
- [x] 운영자 조치 메뉴에서 편집 화면에 진입한다.
- [x] 상세 이미지 각각의 너비·crop·복사·삭제·순서가 저장된다.
- [x] 우클릭 메뉴의 7개 명령과 키보드 대안이 동작한다.
- [x] 취소·이탈은 서버 데이터를 바꾸지 않는다.
- [x] 원본 크롤링 이미지는 보존되고 재수집이 편집본을 덮지 않는다.
- [x] 공개 상세가 편집본을 우선 사용한다.
- [x] 서버가 권한·문서 구조·MIME·용량·revision을 검증한다.
- [x] `active` 공고와 운영자만 편집할 수 있고 삭제·복구가 편집본을 지우지 않는다.
- [x] 원본 초기화·한 장 파일 추가·마지막 작업자/시각 표시가 동작한다.
- [x] 자동 테스트·타입 검사·Ultracite·diff check가 통과한다.
- [ ] 실제 운영자/구직자 화면과 재수집 보존을 수동 확인한다.
- [ ] 이슈와 통합 PR을 작성할 때 PR 본문에 `Closes #...`를 넣는다.

## 설계 시점 기록

- 2026-08-04: 사용자와 우클릭 메뉴, 표시 너비, 내부 복사/붙여넣기, 다중 이미지 개별 편집·순서 변경, 저장 전 임시 상태·취소 시 폐기를 확정했다.
- 2026-08-04: 운영자 전용·`active` 전용, 같은 탭 전용 페이지, 원본 별도 보존·초기화, 빈 이미지 저장, 가운데 정렬, 네 모서리 px 리사이즈·비율 고정·`N × M` 표시·50px 제한, Slider·숫자 입력, 자유 crop, 원본 MIME(JPEG/WebP 92%·PNG 무손실)과 GIF crop 금지, 삽입 커서, 단일 파일 추가, 모바일 점 3개, 감사 표시, 저장 후 화면 유지와 undo 초기화를 확정했다.
- 2026-08-05: crop 조절 영역을 네 모서리 전용에서 네 모서리와 상·하·좌·우 네 변 전체를 포함하는 8방향으로 확장했다. 변은 해당 축만, 모서리는 두 축을 함께 조절한다.
- 2026-08-05: 삽입 커서는 명시적인 위치 클릭 뒤에만 표시하고 빈 바탕·이미지 클릭으로 해제한다. 표시 크기 손잡이는 주 버튼을 누른 동안만 1px 정수 너비 단위로 동작하며 전역 pointer 종료 시 드래그 상태를 반드시 초기화한다.
- 2026-08-05: 표시 크기 조절을 마친 뒤에도 대상 이미지 선택을 유지해 다시 이미지를 클릭하지 않고 연속 조절할 수 있게 한다.
- 2026-08-04: 원본이 Base64라는 사실을 코드에서 확인했다. 자르기 결과 역시 새 Base64로 저장하되, 재수집 덮어쓰기를 막기 위해 원본 컬럼과 운영자 편집 문서를 분리하기로 했다.
- 2026-08-04: 기존 PR #71 작업 폴더를 보존하기 위해 최신 `origin/develop`에서 설계 전용 worktree와 `docs/crawled-job-image-editor-design` 브랜치를 새로 만들었다.
- 이 문서는 설계만 작성한 상태다. 설계 전용 브랜치는 원격에 push하지 않았고 구현·이슈·PR 생성도 아직 수행하지 않았다.
