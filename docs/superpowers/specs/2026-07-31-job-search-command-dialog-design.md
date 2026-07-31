# 공고 검색 CommandDialog 전환 설계

- 날짜: 2026-07-31
- 상태: 사용자 승인됨
- 브랜치: `worktree-job-search-command` → `fix/admin-review-search-ux`

## 배경·목표

현재 헤더 검색창(seeker 셸·public 마켓플레이스)과 본문 모바일 검색창은 `MarketplaceFilters.query`를
갱신해 **로드된 공고만 클라이언트에서 즉시 필터링**한다. 더보기 페이지네이션 도입 후 첫 페이지
약 80건만 검색 대상이 되어 전체 공고(~360건)를 찾을 수 없다.

목표: 검색창을 shadcn **CommandDialog**(모달) 기반으로 전환하고, 모달 안에서 **서버 전체 검색**
결과 공고를 보여준다(썸네일 + 제목 + 업종·지역 + 급여, 상품 검색 모달 스타일).

## 사용자 결정 사항

1. 검색 범위: **서버 전체 검색** — 신규 `bambi.jobs.search` API (로드된 공고만 검색하는 안 기각)
2. 본문 모바일 검색창도 **같은 모달로 통일** — 라이브 필터용 `query` 로컬 필터는 제거

## 설계

### 1. 서버 — `bambi.jobs.search` 신설 (`packages/api/src/routers/bambi/jobs.ts`)

- `publicProcedure`. 입력 `{ query: string(1~100자, trim), limit?: int ≤ 20(기본 20) }`.
- 두 블록을 검색해 **자체 → 수집** 순으로 이어붙인다(기존 노출 우선순위 규칙, 블록 내 최신순):
  - **자체 job_post**: 기존 `list`와 동일한 노출 자격 조건 + `ilike`(제목·업소 표시명·region·district)
  - **수집 crawled_job_post**: 기존 `crawledJobFeedConditions` 재사용 + `ilike`(title·shopName·region·district·industryRaw)
- 응답 항목은 기존 `list`와 같은 모양(`toListItem` 재사용) → 웹 `toMarketplaceJob` 매퍼 재사용.
- 신규 프로시저 추가만이므로 native·기존 `list` 완전 무영향(하위호환).

### 2. UI 킷 — `CommandInput`·`CommandDialog` 추가 (`packages/ui/src/components/command.tsx`)

- 현재 command.tsx에 둘 다 없음. shadcn 원본을 포팅하되 밤비 재테마 규칙 준수:
  `rounded-none` 금지·반경 토큰, 기존 재테마 `dialog.tsx` 조합, base-ui `render` prop 규칙.

### 3. 웹 — `job-search-command.tsx` 신설 + 트리거 교체 (`apps/web`)

- **다이얼로그**: `shouldFilter={false}`(서버 결과 그대로), 입력 250ms 디바운스 →
  `orpc.bambi.jobs.search` react-query 조회(빈 질의는 비활성). 결과 행: 썸네일(`coverImage`,
  수집 공고는 폴백 타일) + 제목(truncate) + 업종·지역 서브라인 + 우측 급여. "검색 결과" 그룹
  헤딩, `CommandEmpty` 빈 상태, 로딩 스켈레톤, `Ctrl/Cmd+K` 단축키.
- **선택 시 이동**: 수집 → `/seeker/jobs/crawled/[id]`, 자체 → `/seeker/jobs/[id]`.
  seeker 셸에서 게스트는 기존 openJob 규칙대로 `/seeker?auth=signup`.
- **트리거 교체 3곳**: `SeekerAppShell`의 `SeekerHeaderSearch`, `PublicMarketplaceScreen`의
  headerSearch, 본문 모바일 `MarketplaceSearch` 검색 필드 — 기존 검색창과 같은 룩의 버튼으로
  바꾸고 클릭 시 모달 오픈(모바일 "필터" 버튼은 유지).
- **로컬 query 필터 제거**: `MarketplaceFilters.query`·`jobMatchesQuery`·`hasLocalOnlyFilters`의
  query 항목과 관련 테스트 정리. 검색 동작을 모달 한 가지로 통일하고 헤더 "N개" 표기를 단순화.

### 4. 오류·상태 처리

- 검색 API 실패 시 모달 안에 재시도 안내(빈 상태와 구분). 로딩 중 스켈레톤.
- 게스트/비로그인: 모달 자체는 열리되 선택 시 기존 게이트 규칙 적용.

### 5. 검증

- ultracite(경로 인자 필수), api·web check-types, 관련 vitest(marketplace 필터 테스트 갱신).
- `docs/manual/seeker-manual.md` 검색 항목 동기화.
- 시각 확인은 dev 서버 HMR로 사용자가 수행(빌드·실행 금지 규칙).
