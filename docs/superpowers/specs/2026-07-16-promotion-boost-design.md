# 구인자 프로모션 UI 개편 + 끌어올리기(점프) 설계

- 날짜: 2026-07-16
- 브랜치: `feat/promotion-boost` (base: `feat/ad-placement-exposure` tip 7aa0b91)
- 상태: 사용자 승인 완료 (브레인스토밍 세션에서 섹션별 승인)

## 목적

타사의 "점프"에 해당하는 **끌어올리기** 기능을 광고 상품 체계와 통합하고, 죽어 있는 구
프로모션 화면(`/employer/promotions`)을 **광고 관리** 화면으로 재구축한다. 광고 상품을
구매(결제 완료)한 공고가 하루 N회 목록 최상단으로 올라갈 수 있게 하여 광고 상품의 실효
가치를 높인다.

## 확정 결정 사항

| # | 항목 | 결정 |
|---|------|------|
| 1 | 점프 효과 범위 | 리스팅 섹션(스페셜·급구·추천) + 전체 공고 목록(organic). 배너(프리미엄/좌/우)는 제외 |
| 2 | 자동 점프 | 1단계 제외. 수동 점프만 구현, 스키마(`boost_type`)만 대비 |
| 3 | 횟수 모델 | 상품별 **일일 N회**(`ad_product.manual_boosts_per_day`), 매일 자정(Asia/Seoul) 리셋 |
| 4 | 대상 공고 | 광고 상품 구매 공고 전용(무료 공고 점프 불가, 단품 판매 없음) |
| 5 | 구 시스템 | `/employer/promotions` 페이지 재구축 + 구 promotions 라우터·서비스·테스트 제거. DB 테이블(`job_promotion_campaign`, `job_promotion_boost_event`)은 데이터 보존차 유지 |
| 6 | 수다방 광고 자격 | 구 캠페인 축 → 광고 상품 축(결제 완료 + published + 노출 유효 + `adProductId` 보유 공고 1건 이상)으로 전환 |
| 7 | 끌어올리기 버튼 위치 | 새 광고 관리 페이지 전용(내 공고 목록에는 추가하지 않음) |
| 8 | 아키텍처 | A안: `job_post.boosted_at` + 신규 `job_boost_event` 테이블, 일일 횟수는 이벤트 카운트로 판정 |

## 1. 데이터 모델 & 마이그레이션 (packages/db)

### 스키마 변경 (`packages/db/src/schema/bambi.ts`)

- `job_post` + `boosted_at timestamp`(nullable): 마지막 끌어올림 시각. null = 점프 이력 없음.
- `ad_product` + `manual_boosts_per_day integer default 0 not null`: 0 = 점프 미제공 상품.
- 신규 테이블 `job_boost_event`:
  - `id uuid pk`, `job_post_id uuid` FK(cascade), `organization_id text` FK(cascade),
    `actor_user_id text` FK(user), `boost_type text not null`(1단계는 `'manual'`만),
    `created_at timestamp defaultNow`
  - 인덱스: `(job_post_id, created_at)`(일일 카운트), `organization_id`
- 구 테이블(`job_promotion_campaign`, `job_promotion_boost_event`)은 스키마에 그대로 보존
  (드롭 마이그레이션은 후속 별도 작업).

### 정렬 키 변경

노출 정렬을 `publishedAt DESC` → **`GREATEST(boosted_at, published_at) DESC`** 로 변경.
적용 대상은 리스팅 섹션 쿼리 + 전체 공고 목록(organic) 쿼리만이며, 배너 쿼리
(`listAdBanners`)는 기존 `publishedAt DESC` 유지.

Postgres `GREATEST`는 null을 무시하므로:
- `boosted_at`이 null이면 `published_at` 그대로 (기존 동작 불변)
- 점프 이후 재검수·재게시로 `published_at`이 더 최신이 되면 자동으로 최신 쪽 채택
  (단순 `COALESCE`의 "오래된 boosted_at이 재게시 시각을 가리는" 엣지 차단)

### 마이그레이션

- 사용자가 `pnpm db:generate` 실행(Claude는 db:* 스크립트 직접 실행 금지, `db:push` 절대 금지).
- 이 브랜치 기준 0016번이 되나 **PR #24가 0016을 선점 중** — 병합 순서에 따라 번호
  재조정(재생성) 필요할 수 있음.

## 2. API (packages/api)

### 신규 서비스 `bambi-job-boost.ts` (순수 로직 분리)

- `getKstDayStart(now: Date): Date` — Asia/Seoul 자정 경계(UTC+9 고정, DST 없음, 라이브러리 추가 없음)
- `resolveBoostEligibility({ status, paymentStatus, exposureEndsAt, adProductId, manualBoostsPerDay, usedToday, now })`
  → `{ eligible: boolean, reason?: string }` — 단위 테스트 대상

자격 조건(모두 충족):
- `adProductId` not null (광고 공고)
- `status === "published"` && `paymentStatus === "paid"`
- 노출 유효(`exposureEndsAt` null이거나 미래 — 기존 `isExposureActive`와 동일 판정)
- `manualBoostsPerDay > 0` && `usedToday < manualBoostsPerDay`

### `bambi.promotions` 라우터 재작성 (라우터 키·URL 유지, 구현 교체)

- `listMyAds` (protected, 구인자 조직 스코프): 내 조직의 `adProductId IS NOT NULL` 공고 목록.
  응답 필드: `jobPostId`, `title`, `status`, `paymentStatus`, `exposureType`, 상품명,
  `exposureEndsAt`, `boostedAt`, `manualBoostsPerDay`, `boostsUsedToday`(KST 자정 이후
  `job_boost_event` 카운트), `publishedAt`.
- `boost({ jobPostId })`: 조직 권한 확인 → 자격 검증(위 조건) → 트랜잭션으로
  `job_boost_event` insert + `job_post.boosted_at = now` update.
  jobPost 행 update가 트랜잭션 직렬화 지점이 되어 동시 클릭 초과 사용 방지.
- **제거**: 구 프로시저(listMine/boost/pause/activateForManualPayment/createDraft),
  `bambi-promotions.ts` 서비스와 그 테스트.

### 수다방 광고 자격 전환

- `bambi-advertiser.ts`의 구 캠페인 판정(`hasActiveAdvertiserCampaign`)을
  "결제 완료 + published + 노출 유효 + `adProductId` 보유 공고 1건 이상" 판정으로 교체,
  함수명도 실체에 맞게 리네임(예: `hasActiveAdExposure`).
- 소비처 `onboarding.ts`(isAdvertiser) 갱신, 관련 테스트 신규 기준으로 재작성.

### 운영자 광고 상품 CRUD

- ad product create/update 입력에 `manualBoostsPerDay` 추가(음이 아닌 정수, 기본 0).

### 변경 없음

- 배너 `listAdBanners`, 결제 확인 `markJobPaid`, 성과 집계(임프레션) 파이프라인.

## 3. 웹 UI (apps/web)

### 광고 관리 페이지 재구축 (`/employer/promotions` 경로 유지)

- PageShell 제목 "광고 관리", 구인자 네비게이션의 "프로모션 관리" 라벨도 "광고 관리"로 갱신.
- 데이터: `promotions.listMyAds`. shadcn Card 목록(기존 프로모션 카드 레이아웃 계승)으로
  광고 공고별 행 표시:
  - 상태 배지: `getJobDisplayStatus` 재사용(published+미결제 = "미공개") + 상품명·노출 위치
    라벨(`EXPOSURE_TYPE_LABELS`)
  - 노출 만료일(`formatDate`), 오늘 끌어올리기 "남은 N / 일일 M회", 마지막 끌어올림
    시각(`formatDateTime`, 없으면 "없음")
  - **[끌어올리기] 버튼**: published + 결제 완료 + 노출 유효 + 남은 횟수 > 0일 때만 활성.
    클릭 → boost mutation → 성공 토스트 + `listMyAds`·`jobs.listMine` 무효화.
    `manualBoostsPerDay === 0` 상품이면 버튼 대신 "이 상품은 끌어올리기 미포함" 안내.
  - 탭 필터: 전체 / 진행 중(공개+노출 유효) / 결제 대기(미결제) / 만료(노출 만료) — 기존
    Tabs 패턴 계승. 그 외 상태(검수 대기·반려·숨김·임시 저장)는 "전체" 탭에서만 표시.
- 모바일 반응형 필수(기존 카드 그리드 패턴 준수).

### 운영자 광고 상품 폼 (`ad-product-form.tsx`)

- "일일 끌어올리기 횟수" 숫자 입력 추가. 0 = 미제공. 입력 중 빈 값 허용, 제출 시 0 정규화
  (기존 zero-clear 패턴 준수).

### 광고 안내 (`employer-ad-guide.tsx`)

- 상품 카드에 `manualBoostsPerDay > 0`이면 "일일 끌어올리기 N회" 표시 추가.

## 4. 에러 처리 & 엣지 케이스

- 한도 초과·미결제·만료·무료 공고 boost 시도 → `ORPCError`(BAD_REQUEST) + 사유별 한국어
  메시지(예: "오늘 끌어올리기 횟수를 모두 사용했습니다."). 클라이언트는 토스트 표기.
  버튼 비활성으로 1차 차단하되 서버가 최종 검증.
- KST 자정 경계: UTC+9 고정 오프셋 계산(한국 DST 없음), 외부 라이브러리 추가 금지.
- 동시 클릭 레이스: 트랜잭션 내 카운트 → insert → jobPost update 순서로 직렬화.
- 재검수·재게시(publishedAt 갱신): `GREATEST` 정렬 키가 자동 처리.
- 광고 상품이 삭제(soft/hard)된 공고: `adProductId`가 set null 되면 자격 조건에서 자연
  탈락 — 별도 처리 없음.

## 5. 테스트 전략

- **단위**: `bambi-job-boost.ts` 순수 로직(자정 경계, 자격 판정 조합 — 미결제/만료/한도/
  무료 공고/미포함 상품), advertiser 신규 판정.
- **통합(real DB, `apps/server/.env` 필요)**: boost 성공/한도 초과/미결제 거부/무료 공고
  거부, `listMyAds` 응답 형태, 점프 후 `jobs.list` 정렬 상승 확인, 구 promotions 프로시저
  제거 확인(라우터 표면).
- **web**: 광고 관리 페이지 버튼 활성 조건·라벨 테스트, `ad-product-form` 입력 테스트 확장.
- web/api 타입체크. 빌드·dev 서버 실행 금지(시각 확인은 사용자, HMR).

## 후속(이번 범위 제외)

- 자동 점프(2단계): Cloud Scheduler 등 주기 실행 인프라 도입 시. `boost_type` 스키마로 대비됨.
- 구 테이블(`job_promotion_campaign`, `job_promotion_boost_event`) 드롭 마이그레이션.
- apps/native 대응(native 스택 재개 시).
