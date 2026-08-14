# 구직자 전체공고 48건 배치와 끌어올리기 정렬 보강 계획

> **For agentic workers:** 체크박스는 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다. 사용자가 직접 커밋·푸시하므로 임의로 커밋하거나 푸시하지 않는다.

**Goal:** 구직자 전체공고를 데스크톱 4열 × 12줄인 48건 단위로 노출하고, 구인자가 끌어올리기를 사용할 때 같은 인증업체 우선 그룹 안에서 가장 최근에 끌어올린 공고가 전체공고 첫 칸에 오며 이전 끌어올림은 시간순으로 뒤 칸에 밀리는 동작을 보장한다.

**Architecture:** 최신 `origin/develop`에서 생성한 통합 브랜치 `fix/seeker-job-grid-boost-order`를 사용한다. 클라이언트의 첫 조회와 더보기 조회 크기를 단일 상수 48로 통일하고, 서버의 기존 `greatest(boosted_at, published_at)` 정렬과 `boostedAt` 갱신 경로는 유지한다. 정렬 정책은 기존 서비스 정책인 `인증업체 우선 → greatest(boosted_at, published_at) DESC → id DESC`를 보존한다. 이미 구현된 동작은 중복 구현하지 않고 순차 끌어올리기 회귀 테스트를 강화한다.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack React Query, oRPC, Drizzle ORM, PostgreSQL, Vitest, Tailwind CSS v4.

## 확정 요구사항

- 전체공고는 데스크톱 `xl` 구간에서 한 줄에 4개를 유지한다.
- 최초 전체공고 조회는 48건이다. 따라서 충분한 공고가 있으면 4열 × 12줄 뒤에 `공고 더보기`가 표시된다.
- `공고 더보기`를 누를 때마다 다음 48건을 요청한다.
- 모바일·태블릿의 기존 반응형 열 수(`1열 → lg 3열 → xl 4열`)는 유지한다. 데이터 요청량만 48건으로 통일한다.
- 구인자가 끌어올리기를 사용하면 `job_post.boosted_at`이 현재 시각으로 갱신된다.
- 인증 완료 업체 공고 그룹 안에서는 가장 최근 끌어올린 공고가 전체공고 첫 번째가 된다.
- 이후 다른 공고가 끌어올려지면 새 공고가 첫 번째가 되고 기존 공고들은 1행 2열, 1행 3열, 1행 4열, 2행 1열 순서로 자연스럽게 밀린다.
- 기존 인증업체 우선 정책은 유지한다. 정상적인 공고 등록 흐름은 미인증 업체의 공고 등록을 차단한다.
- 스페셜·급구·추천 섹션은 기존처럼 첫 페이지 응답에만 포함하고, 더보기는 전체공고만 이어받는다.
- 크롤링 이미지 워터마크 제거와 기타 모바일 오류 수정은 이번 브랜치 범위에서 제외한다.
- DB 스키마와 마이그레이션 변경은 없다.

## 현재 코드 확인 결과

1. `apps/web/src/lib/bambi/api-jobs.ts`
   - 최초 요청은 `FIRST_PAGE_SIZE = 30`이다.
   - 더보기 요청은 `MORE_PAGE_SIZE = 50`이다.
   - 서버가 반환한 `nextOrganicOffset`을 그대로 다음 요청에 사용한다.
2. `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`
   - 카드 그리드는 `grid-cols-1 lg:grid-cols-3 xl:grid-cols-4`로 이미 데스크톱 4열이다.
   - `hasMore`일 때 전체공고 아래에 `공고 더보기`를 표시한다.
3. `packages/api/src/routers/bambi/promotions.ts`
   - 수동 끌어올리기 성공 시 트랜잭션 안에서 `jobPost.boostedAt = now`로 갱신한다.
4. `packages/api/src/routers/bambi/jobs.ts`
   - 전체공고 정렬은 인증업체 우선 후 `greatest(boostedAt, publishedAt)` 내림차순, 마지막으로 ID 내림차순이다.
   - 서버 `limit` 상한은 50이므로 48건 요청은 API 계약 안에 있다.
5. `packages/api/test/routers/bambi/jobs-list-boost-order.test.ts`
   - 게시 시각 정렬과 한 공고의 끌어올림 우선 정렬은 이미 검증한다.
   - 여러 공고를 차례로 끌어올렸을 때 최신 끌어올림부터 누적 정렬되는 사례는 아직 없다.

## 변경 대상

- Modify: `apps/web/src/lib/bambi/api-jobs.ts`
- Modify: `apps/web/test/lib/bambi/api-jobs.test.ts`
- Modify: `packages/api/test/routers/bambi/jobs-list-boost-order.test.ts`
- Modify: `docs/test-flows/seeker-test-flow.md`
- Modify: `docs/manual/seeker-manual.md`
- Modify: `docs/superpowers/plans/2026-08-11-seeker-job-grid-boost-order.md`

## Task 1: 전체공고 페이지 크기를 48건으로 통일

**설계:**

- `FIRST_PAGE_SIZE`와 `MORE_PAGE_SIZE`처럼 서로 다른 값을 제거하고 의미가 분명한 단일 상수 `MARKETPLACE_PAGE_SIZE = 48`을 사용한다.
- `useMarketplaceJobs`의 첫 요청과 `organicOffset`이 있는 후속 요청 모두 같은 48을 `limit`으로 전달한다.
- 서버 입력 상한 50과 offset 커서 구조는 변경하지 않는다.
- 유료 섹션 공고 보강으로 응답의 `sections.organic` 배열이 48을 초과할 수 있는 기존 구조는 유지한다. `organicWindowSize`와 `nextOrganicOffset`은 실제 정렬 창 소비량만 세므로 누락 없이 다음 페이지로 진행한다.
- 로컬 전용 필터가 적용됐을 때 화면에 실제로 보이는 수가 48보다 적을 수 있는 기존 동작도 유지한다.

**테스트:**

- 페이지 크기 상수를 테스트에서 직접 확인할 수 있도록 필요한 최소 범위로 export한다.
- `apps/web/test/lib/bambi/api-jobs.test.ts`에 전체공고 페이지 크기가 48이라는 계약 테스트를 추가한다.
- 첫 요청과 더보기 요청이 동일 상수를 사용하는지 정적 코드 검증이 아닌 실제 입력 생성 단위로 검증할 수 있으면 입력 생성 로직을 작은 순수 함수로 분리한다. 단순 상수 검증만으로 충분하면 불필요한 추상화는 추가하지 않는다.

- [x] 실패하는 48건 페이지 크기 계약 테스트를 먼저 추가한다.
- [x] 첫 조회와 더보기 조회를 모두 48건으로 통일한다.
- [x] 테스트를 통과시키고 중복 페이지 크기 상수와 오래된 30/50 설명을 제거한다.

## Task 2: 순차 끌어올리기 정렬 회귀 테스트 보강

**설계:**

- 기존 `jobs-list-boost-order.test.ts` 픽스처를 재사용해 동일한 인증 완료 조직의 복수 공고를 순차적으로 끌어올린다.
- 시각 동률로 인한 불안정성을 피하도록 두 `boostedAt` 값에 명시적인 시간 차이를 둔다.
- 첫 번째 공고를 끌어올린 뒤 해당 공고가 맨 앞인지 확인한다.
- 두 번째 공고를 더 최신 시각으로 끌어올린 뒤 `두 번째 공고 → 첫 번째 공고 → 미끌어올림 공고` 순서인지 확인한다.
- 이 테스트는 카드 배열의 순서를 검증한다. 4열 CSS Grid는 배열 순서대로 row-major 배치하므로 배열 인덱스 0~3이 1행 1~4열, 인덱스 4가 2행 1열이 된다.
- 기존 서버 정렬이 테스트를 만족하므로 `jobs.ts` 정렬 쿼리는 원칙적으로 수정하지 않는다. 테스트가 실제 환경 조건에서 실패할 때만 원인을 확인한 뒤 최소 변경한다.
- `promotions-boost.test.ts`가 끌어올리기 API의 `boostedAt` 갱신을 이미 검증하므로 동일한 통합 픽스처를 중복 구축하지 않는다.

- [x] 최신 끌어올림이 기존 끌어올림 앞에 누적되는 회귀 테스트를 추가한다.
- [x] 인증업체 우선 정책과 게시 시각 폴백 테스트가 그대로 유지되는지 코드·타입 수준에서 확인한다. 통합 실행은 로컬 테스트 DB 마이그레이션 미적용으로 픽스처 삽입 전에 중단됐다.
- [x] 기존 정렬 쿼리가 요구 순서를 이미 구현하므로 수정하지 않는다.

## Task 3: 사용자 문서와 테스트 흐름 동기화

**설계:**

- `docs/test-flows/seeker-test-flow.md`의 `첫 페이지 limit=30`, `더보기 limit=50` 설명을 모두 48건으로 수정한다.
- 데스크톱 전체공고가 4열 × 12줄 뒤에 더보기 버튼을 표시한다는 QA 절차를 추가한다.
- 순차 끌어올리기 QA를 추가한다: 공고 A 끌어올림 → A 첫 칸, 공고 B 끌어올림 → B 첫 칸·A 둘째 칸.
- `docs/manual/seeker-manual.md`의 한 번에 불러오는 공고 수와 더보기 설명을 48건 단위로 갱신한다.
- 모바일에서는 48건을 받아도 기존 반응형 1열 배치를 유지한다는 점을 테스트 흐름에 명시한다.

- [x] 구직자 테스트 흐름을 48건·순차 끌어올리기 기준으로 갱신한다.
- [x] 구직자 매뉴얼의 페이지 크기 설명을 갱신한다.
- [x] 구현 완료 후 검증 결과와 실제 변경 파일을 이 계획서에 기록한다.

## Task 4: 광고 관리 끌어올리기 현황 뱃지화

**설계:**

- 광고 관리의 데스크톱 표와 모바일 카드가 동일한 수동·자동 끌어올리기 뱃지 컴포넌트를 사용한다.
- `오늘 끌어올리기`는 모바일 2열에서 옆 칸을 침범하지 않도록 `남은 N회 / 일일 M회`와 `횟수권 K회`를 각각의 강조 뱃지로 나누고 세로로 배치한다.
- 수동 끌어올리기가 전혀 없으면 회색 `미포함`, 배너 광고면 회색 `대상 아님` 뱃지를 표시한다.
- `자동 끌어올리기`는 설정되어 있으면 `오늘 M/N회 실행` 강조 뱃지, 없으면 회색 `미설정`, 배너 광고면 회색 `대상 아님` 뱃지를 표시한다.
- 횟수 계산과 끌어올리기 자격 판정은 변경하지 않는다.

- [x] 공통 수동·자동 끌어올리기 뱃지 렌더러를 추가한다.
- [x] 데스크톱 표와 모바일 카드에 동일 렌더러를 적용한다.
- [x] 표시 계약 테스트와 타입·lint 검증을 통과시킨다.

## 검증 계획

1. `pnpm --filter web test -- api-jobs.test.ts`
2. `pnpm --filter @bambi-app/api test -- jobs-list-boost-order.test.ts`
3. `pnpm --filter web check-types`
4. `pnpm --filter @bambi-app/api check-types`
5. 변경 파일 대상 `pnpm exec ultracite check <files>` 또는 저장소 표준 `pnpm check`
6. `git diff --check`
7. 로컬 `/seeker` 데스크톱 QA
   - 전체공고가 4열로 표시되는지 확인
   - 충분한 데이터에서 최초 48건 뒤 `공고 더보기`가 표시되는지 확인
   - 더보기 후 다음 48건이 중복·누락 없이 추가되는지 확인
8. 구인자 `/employer/promotions` 연동 QA
   - 공고 A 끌어올림 후 구직자 전체공고 첫 칸 확인
   - 공고 B 끌어올림 후 B가 첫 칸, A가 다음 칸으로 밀리는지 확인
9. 모바일 QA
   - 48건 요청 후에도 기존 1열 카드와 더보기 버튼이 깨지지 않는지 확인

## 커밋 구분안

사용자가 직접 커밋하며, 구현 완료 후 실제 변경 내용에 맞춰 아래처럼 나눈다.

1. `fix: 전체공고 조회 단위를 48건으로 통일`
   - 본문에 첫 조회·더보기 48건 통일, 관련 테스트와 문서 갱신 내용을 기록한다.
2. `test: 순차 끌어올리기 정렬 회귀 검증 추가`
   - 본문에 최신 끌어올림 우선과 기존 끌어올림 밀림 순서, 인증업체 우선 정책 유지 내용을 기록한다.

두 변경이 작고 강하게 연관되면 하나의 커밋으로 합칠 수 있지만, 제목과 상세 본문을 함께 작성한다. 커밋·푸시 명령은 구현과 검증이 끝난 뒤 사용자에게 복사 가능한 형태로 제공한다.

## PR 준비 규칙

- 구현 전 이 계획서를 먼저 확정한다.
- PR 전 최신 `origin/develop`을 다시 반영하고 충돌 여부를 확인한다.
- CMU02의 최근 이슈·PR 형식처럼 `개요/주요 변경/테스트` 구조와 구체적인 검증 결과를 사용한다.
- 관련 이슈를 만든 뒤 PR 본문에 `Closes #이슈번호`를 추가한다.
- 사용자가 직접 커밋하고 푸시한다.
- 최종 머지는 동기가 수행한다.

## 구현 완료 기록

- 상태: 구현 완료, 사용자 검토 및 커밋 대기
- 기준 develop: `2692346463b22fe100644ca6f1f1057d34598cd9`
- 브랜치: `fix/seeker-job-grid-boost-order`
- DB 변경: 없음
- 커밋/푸시: 수행하지 않음
- 실제 변경 파일:
  - `apps/web/src/lib/bambi/api-jobs.ts`
  - `apps/web/src/app/employer/promotions/page.tsx`
  - `apps/web/test/lib/bambi/api-jobs.test.ts`
  - `apps/web/test/app/employer/promotions/page.test.ts`
  - `packages/api/test/routers/bambi/jobs-list-boost-order.test.ts`
  - `docs/test-flows/seeker-test-flow.md`
  - `docs/manual/seeker-manual.md`
  - `docs/superpowers/plans/2026-08-11-seeker-job-grid-boost-order.md`
- 검증 결과:
  - web Vitest: `api-jobs.test.ts` 8/8 통과
  - web `tsc --noEmit`: 통과
  - api `tsc --noEmit`: 통과
  - Ultracite 변경 TypeScript 파일 3개: 통과
  - PR 직전 web Vitest: `api-jobs.test.ts` + 광고 관리 `page.test.ts` 합계 19/19 통과
  - 광고 관리 모바일 QA(390×844): 수동 현황 강조 뱃지, 자동 미설정 회색 뱃지, 배너 대상 아님 뱃지 렌더 확인
  - API 정렬 통합 테스트: `jobs-list-boost-order.test.ts` 2/2 통과. 전체공고에 유료 섹션 공고도 중복 포함되는 정책에 맞춰 테스트 헬퍼가 일반 공고 ID만 추출하도록 교정
