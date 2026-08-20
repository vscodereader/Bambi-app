# 공고 카드 광고기간·누적 광고일수 배지 — 설계

- 날짜: 2026-08-19
- 브랜치: claude/job-posting-ad-period-ui-868602 (develop 기반 워크트리)
- 참고: 퀸알바 카드의 "N회 N일" 배지 + 누적광고일수 등급표 이미지

## 목표

구직자 마켓플레이스의 채용공고 카드에, 해당 업소(조직)가 지금까지 광고를 몇 번·며칠
구매했는지를 "아이콘 + N회 N일" 배지로 표시한다. 누적 일수 구간에 따라 아이콘
등급이 올라간다(신뢰도 시그널). 배지 의미는 구인자 광고등록 안내 페이지의 등급표로
설명한다.

## 확정된 결정 (사용자 답변)

| 결정 | 선택 |
|---|---|
| 집계 단위 | **조직(업소) 단위** — 같은 업소의 모든 공고 광고 결제 합산 |
| 데이터 원천 | **새 이력 테이블 + 백필** — 근사 합산 기각 |
| 노출 대상 | **유료 광고 카드만** (`adProductId` 있는 paid 공고) |
| 안내 UI | **카드 배지 + 간단 안내** (광고등록 안내 페이지 등급표 + 배지 툴팁), 사이드 상시 위젯은 안 함 |

## 현재 구조 (조사 결과)

- 카드: `apps/web/src/components/bambi/visual-job-card.tsx`의 `VisualJobCard` 하나가
  스페셜/추천/급구/전체 섹션 전부를 렌더한다(`tone` prop만 다름).
- 카드 높이 118px이 `visual-job-exposure-sections.tsx`의 스켈레톤·`min-h-29` 자리표시
  2곳과 `ad-banner.tsx:341` 배너 레일에 하드코딩 미러링돼 있다.
- **공고 광고 결제는 이력 테이블이 없다.** `job_post` 행의
  `exposure_duration_days`/`payment_status`/`exposure_ends_at` 컬럼이 재결제·기간 변경
  시 덮어써진다. 행 단위 이력은 끌올 부가옵션(`job_boost_purchase`)과 운영자 감사
  로그(`admin_moderation_action`)뿐.
- paid 전환 경로: 광고 상품이 붙은 공고는 생성(`jobs.ts:2299` 부근)·수정(`jobs.ts:1133`)
  시 항상 `unpaid`로 시작하고, **unpaid→paid 전환은 운영자 결제 확정 두 곳뿐**이다 —
  `moderation.ts` `setJobPostPayment`(개별, ~L2408) + 벌크 결제(~L3107). 두 곳 모두
  "상태가 같으면 스킵" 가드가 있어 전환 시점만 정확히 잡힌다. 무료 공고는 즉시
  `paid`지만 `adProductId`가 null이다.
- 피드: `jobs.list`(`packages/api/src/routers/bambi/jobs.ts` L1372) →
  `exposureSelection` 투영 → `toListItem` → web `api-job-mapper.ts` `toMarketplaceJob`
  → `types.ts` `Job` → `VisualJobExposureSections` → `VisualJobCard`.

## 설계

### 1. DB — `job_ad_purchase` 테이블 신설 (마이그레이션 1건)

`packages/db/src/schema/bambi.ts`에 추가:

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | 기존 테이블 id 컨벤션 동일 | PK |
| `organization_id` | FK → organization | **인덱스** (집계 키) |
| `job_post_id` | FK → job_post | |
| `ad_product_id` | FK → ad_product | 구매 시점 상품 |
| `duration_days` | integer not null | 구매한 광고 기간 |
| `amount` | integer not null | 결제 금액 스냅샷 |
| `source` | text | `moderation_single` / `moderation_bulk` / `backfill` |
| `created_at` | timestamp | 결제 확정 시각 |

- **적재 시점**: `setJobPostPayment` 개별·벌크의 unpaid→paid 전환 분기 안(같은
  트랜잭션). "상태가 같으면 스킵" 가드가 이미 있어 자연 멱등 — 같은 전환이 두 번
  적재되지 않는다. paid→unpaid 되돌림은 원장을 지우지 않는다(이미 결제됐던 사실은
  유지; 운영자 실수 취소 시의 과대집계는 허용 오차로 한다).
- **적재 제외**: 대기열 승격(노출 시작, 결제 아님), 무료 공고(`adProductId` null),
  끌올 부가옵션(`job_boost_purchase` — 별도 축), 운영자 기간 조정(+N일) — 후속 후보.
- **백필**(마이그레이션 내 SQL): `payment_status='paid' and ad_product_id is not null`인
  기존 공고를 1행씩 적재. `duration_days = exposure_duration_days`(null이면 0),
  `created_at = coalesce(listing_paid_at, published_at, created_at)`, `source='backfill'`.

### 2. API — `jobs.list` 응답에 `adPeriod` 부착

- `jobs.list`에서 섹션 구성 후, 유료 광고 아이템들의 `organizationId`를 모아
  `select organization_id, count(*), sum(duration_days) from job_ad_purchase where
  organization_id in (...) group by organization_id` 1회.
- `toListItem` 결과에 `adPeriod: { count: number; totalDays: number } | null` 부착.
  null 조건: 유료 광고 카드가 아니거나 원장이 비어 있을 때.
- **범위 제외**: `jobs.search`/`legacyList`(UNION ALL 피드 투영 — 키 순서 결합)와
  네이티브 앱, 상세 페이지. 배지는 웹 마켓플레이스 피드 카드에만.

### 3. 웹 — 등급 lib + 카드 배지

- `apps/web/src/lib/bambi/ad-period.ts` 신설 (`job-hit.ts` 선례):
  - 티어 5구간: `≤90` / `91–180` / `181–360` / `361–720` / `≥721` (일수 기준, 고정
    하드코딩 — 운영자 설정화는 YAGNI).
  - 티어별 lucide 아이콘 + Tailwind 토큰 색(고정, 시각 QA에서 사용자 피드백으로만
    조정): Medal `text-amber-700`(브론즈) → Medal `text-slate-400`(실버) →
    Medal `text-amber-500`(골드) → Crown `text-slate-500`(실버 왕관) →
    Crown `text-amber-500`(골드 왕관). raw hex/oklch 금지.
  - `formatAdPeriod({count, totalDays})` → `"22회 900일"`.
- `VisualJobCard`: 급여 행(기존 `mt-auto` flex 행) **오른쪽 끝**에
  `아이콘 + "N회 N일"`(text-[11px] 급 소형)을 배치. 새 행을 추가하지 않으므로 카드
  높이 118px 결합 3곳을 건드리지 않는다. `adPeriod`가 null이면 렌더하지 않음
  (`GradeBadge` 선례). 배지에 `title` 툴팁("광고 22회 · 누적 900일").
- 아이콘은 `icons.tsx`의 `fill()` 래퍼 컨벤션으로 추가.
- `Job` 타입(`types.ts`)·`ApiMarketplaceJob`·`toMarketplaceJob`에 `adPeriod` 필드 추가.

### 4. 안내(범례)

- 구인자 광고등록 안내 페이지(광고 상품 안내)에 "누적 광고일수 등급" 섹션 추가:
  5구간 아이콘 + 구간 텍스트 표. `ad-period.ts`의 같은 티어 정의를 재사용해
  구간·아이콘이 카드와 어긋나지 않게 한다.

### 5. 에러 처리·엣지

- 집계 쿼리 실패는 피드 전체를 죽이지 않는다 — 같은 트랜잭션/쿼리 흐름에 자연
  포함되므로 별도 fallback은 두지 않되, `adPeriod` null 허용 스키마로 프론트가 항상
  안전하게 생략 렌더.
- `totalDays = 0`(백필 시 기간 null이던 행뿐)이어도 count ≥ 1이면 "N회 0일" 대신
  최저 티어로 표시 — 포맷은 그대로 노출(데이터 정직성).
- 수집(크롤) 공고는 조직·결제가 없으므로 자연히 null.

### 6. 테스트·검증

- `ad-period.ts` 티어 산정·포맷 단위 테스트 (`apps/web/test/lib/bambi/` 미러).
- 원장 적재·집계는 서비스 함수로 분리해 `packages/api/test/services/`에 단위 테스트
  (라우터 테스트 스위트는 dev DB를 지우므로 실행 금지 — 기존 규칙).
- 카드 렌더 분기는 `visual-job-components.test.ts`에 케이스 추가.
- 검증은 린트+타입체크만(빌드·dev 서버 금지 규칙). 시각 확인은 사용자.

### 7. 매뉴얼·배포

- 사용자 매뉴얼(구인자 광고 관련 섹션)에 배지·등급표 설명 동기화.
- 배포 체크리스트: 신규 마이그레이션 1건(테이블+백필) 운영 migrate 필요.

## 이번 범위에서 뺀 것 (후속 후보)

- 운영자 기간 조정(+N일)의 누적 반영, 끌올 구매의 누적 합산
- `jobs.search`/`legacyList`/네이티브 앱/상세 페이지 배지
- 사이드 상시 범례 위젯, 등급 구간 운영자 설정화
- organization 비정규화 카운터(트래픽 커지면)
