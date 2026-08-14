# 공고 끌어올리기 추가 옵션 (수동 기간제·수동 횟수권·자동 기간제)

2026-08-10 · 브레인스토밍 확정 스펙

## 목적

현재 끌어올리기(수동·자동)는 유료 광고 상품의 번들로만 제공된다(`ad_product.manual_boosts_per_day`·`auto_boosts_per_day` → 구매 시 공고 스냅샷). 이를 광고 상품과 독립적인 **추가 구매 옵션**으로 열어, 일반 구인(무료 공고)을 포함한 모든 공고가 끌어올리기를 구매할 수 있게 한다. 결제는 기존 광고 결제와 동일하게 앱 밖 무통장입금 + 운영자 수동 확인이다.

## 확정 결정

- 판매 옵션 3종, **전역 단일 관리**(광고 상품 무관): ① 수동 기간제(하루 N회 × M일) ② 수동 횟수권(N회 충전, 기간 무관) ③ 자동 기간제(하루 N회 × M일). 각각 가격·스펙을 운영자가 관리하고, 가격 null = 미판매(화면 미노출).
- 횟수권은 단일 상품(수량 다중 선택 없음). 잔여가 있어도 재구매 가능(잔여 합산), 같은 유형의 **unpaid 구매가 있으면 중복 구매 차단**. 기간제는 활성(paid·미만료) 중 동일 유형 재구매 차단(연장은 비범위).
- 공고 게시와 독립: 무료 공고는 검수 후 즉시 게시되고(기존 `paymentStatus: "paid"` 저장 확인), **옵션만 입금 확인 후 활성화**된다.
- 유료 상품 번들과 **합산**: 하루 한도 = 번들 스냅샷 + 활성 기간제 옵션.
- 구매 진입점: 공고 등록·수정 폼 체크(디자인 제작과 같은 자리) + 광고 관리(`/employer/promotions`)에서 게시 중 공고에 추가 구매.
- 기간제 적용 기간은 옵션 스펙의 M일 — 활성화(입금 확인) 시점부터 M일. 무료·유료 공고 동일 규칙.

## 데이터 모델

기존 검증 사실: 일반 목록(organic)도 `GREATEST(boosted_at, published_at)` 정렬을 타므로(jobs.ts `exposureRankSql`) 무료 공고 끌올이 실제로 순위를 올린다. 배너형(`AD_BANNER_EXPOSURE_TYPES`)은 정렬과 무관하므로 옵션 구매 대상에서 제외한다.

### `job_boost_option` — 전역 옵션 정의 (3행)

| 컬럼 | 설명 |
|---|---|
| `option_type` | 신규 pgEnum `job_boost_option_type`: `manual_period` \| `manual_count` \| `auto_period`, **unique** |
| `price` | int, null = 미판매 (디자인 제작 `detail_design_price`와 동일 관용) |
| `boosts_per_day` | int, 기간제 전용(횟수권 null) |
| `duration_days` | int, 기간제 전용(횟수권 null) |
| `boost_count` | int, 횟수권 전용(기간제 null) |
| `updated_at` | timestamp |

운영자 화면에서 유형별 upsert(행이 없으면 생성) — 시드 마이그레이션 불필요.

### `job_boost_purchase` — 구매 단위 (공고당 다건)

디자인 제작처럼 `job_post` 컬럼 스냅샷으로는 안 된다: 공고당 여러 구매, 결제 상태 독립, 만료·잔여 관리가 필요하다.

| 컬럼 | 설명 |
|---|---|
| `id`, `job_post_id`(FK cascade), `organization_id`, `buyer_user_id` | 소속·구매자 |
| `option_type` | 같은 enum |
| `amount`, `boosts_per_day`, `duration_days`, `boost_count` | **구매 시점 스펙 스냅샷** — 운영자가 옵션을 바꿔도 기존 구매 비소급(노출·번들 스냅샷 철학 동일) |
| `payment_method` | 기존 결제수단 enum 재사용(card/bank_transfer) |
| `payment_status` | 기존 unpaid/paid enum 재사용 |
| `activated_at` | 입금 확인 시각(활성 기점) |
| `expires_at` | 기간제: `activated_at + duration_days`. 횟수권 null |
| `remaining_count` | 횟수권 잔여(차감), 기간제 null |
| `created_at` | |

인덱스: `(job_post_id)`, `(payment_status)`.

### `job_boost_event.purchase_id` (nullable FK 추가)

횟수권 차감으로 발동한 수동 끌올 이벤트에만 세팅한다. **일일 한도 판정은 `purchase_id IS NULL`인 manual 이벤트만 센다** — 횟수권 사용분이 기간제·번들의 하루 한도를 잠식하지 않는다.

## 자격 판정 개편 (`resolveBoostEligibility` v2)

현재는 광고 공고 하드 게이트(`not_ad_job`·`product_without_boost`)가 있다. v2:

1. 공개 게이트 유지: `status === "published" && paymentStatus === "paid"`(무료 공고도 paid로 저장되므로 그대로 성립), 광고 공고는 노출 미만료 조건 유지.
2. 배너형 제외 유지(옵션 구매 자체도 서버에서 거부·UI 미노출).
3. **하루 한도** = 번들 `manualBoostsPerDay` + Σ(활성 수동 기간제 구매 `boosts_per_day`). 활성 = paid ∧ `expires_at > now`.
4. `usedToday`(purchase_id IS NULL manual 이벤트) < 하루 한도 → 일반 발동(이벤트만 기록).
5. 한도 소진 시 횟수권 잔여가 있으면 **오래된 paid 구매부터 차감** — 같은 트랜잭션에서 `remaining_count - 1` + `purchase_id` 세팅한 이벤트 기록. 잔여도 없으면 기존 `daily_limit_reached` 계열 사유.
6. `not_ad_job`·`product_without_boost` 사유는 "끌어올릴 수단 없음"(번들도 옵션도 없음)으로 통합·문구 조정.

판정·차감 순서 로직은 순수 함수로 `bambi-job-boost.ts`에 두고 `test/services`에서 검증한다(라우터 스위트는 실행 금지 제약 유지).

## 자동 끌올 스케줄러 확장 (`runAutoBoostTick`)

- 유효 자동 횟수 = 번들 `autoBoostsPerDay` + Σ(활성 auto_period 구매 `boosts_per_day`).
- 후보 쿼리: 기존(번들>0, 리스팅형) OR (활성 auto_period 구매 보유 공고 — standard 포함, 배너형 제외). 공개·노출 게이트는 기존 그대로.
- 슬롯 분배(`countDueAutoBoostSlots`·오프셋)는 유효 횟수로 그대로 재사용. 잠금 내 재확인도 유효 횟수 기준으로 일치시킨다.

## 결제·운영자 흐름

- 구매 생성(등록·수정 폼 체크 또는 promotions 다이얼로그) → `unpaid` 행 + 무통장입금 안내(공고 결제와 별도 건이되, 등록 폼에서 유료 공고와 동시 구매 시 안내 총액은 합산 표시).
- 결제수단: 유료 공고와 동시 구매 시 공고 결제수단을 그대로 따른다. 무료 공고 등록 폼·promotions 다이얼로그에서는 기존과 동일한 card/bank_transfer 선택 UI를 노출한다(어느 쪽이든 운영자 수동 확인).
- 등록·수정 폼 시멘틱: 체크 = 신규 구매 신청, 해제 = 본인 unpaid 구매 취소(paid·활성 건은 해제 불가 — 표시만). 수정 폼에서 기구매 건은 상태 뱃지로 노출.
- 운영자 `/moderator/payments`: 옵션 구매 건 목록(공고·옵션·금액·상태·구매일) + **입금 확인** → paid + `activated_at`(기간제는 `expires_at` 계산) — 감사 로그(`adminModerationAction`) tx 내 기록, 커밋 후 구매자 알림(기존 notification 패턴 + 라벨 맵).
- 운영자도 unpaid 구매 취소 가능(오입금·오신청 정리). paid 취소/환불은 비범위.

## 화면

- **운영자 옵션 관리**: `/moderator/ad-products`에 "끌어올리기 옵션" 섹션(3종 가격·스펙 입력, 빈 가격 = 미판매).
- **공고 등록·수정 폼**: 디자인 제작 체크박스 아래 판매 중 옵션 체크 목록(가격 표시), 결제 예정 총액·무통장 안내 합산. 배너형 상품 선택 시 미노출.
- **광고 관리(`/employer/promotions`)**: 행에 활성 옵션 요약(수동 +N/일 · 자동 +N/일 · 횟수권 잔여 N회)과 "끌올 옵션 구매" 버튼(배너형 제외) → 옵션 선택·무통장 안내 다이얼로그. 무료 공고도 이 목록에 떠야 한다 — 현재 `listMyAds`가 광고 공고만 준다면 무료 공고 포함으로 확장(구매·잔여 표시 목적).
- **광고 안내(`/employer/ad-guide`)**: 옵션 3종 전역가 안내 섹션.
- enum 원값 노출 금지: 옵션 유형 라벨 맵(`JOB_BOOST_OPTION_TYPE_LABELS`)을 `lib/bambi`에 추가.

## 마이그레이션·배포

- 신규: enum 1(`job_boost_option_type`), 테이블 2, `job_boost_event.purchase_id` 컬럼 1. `db:generate`로 생성(번호 0080 예상), 적용은 사용자 지시 시(적용 검증 필수, `db:push` 금지).
- 마이그레이션 적용 전에는 옵션 관리·구매 insert가 실패한다 — 배포 순서 주의(디자인 제작 0078·0079와 동일).

## 테스트 전략

- pure 로직(`bambi-job-boost.ts` 확장: 자격 v2·한도 합산·횟수권 차감 순서 선택, `bambi-auto-boost` 슬롯 로직 불변 확인)은 `packages/api/test/services`에서 단위 테스트.
- 라우터·화면은 `check-types` + ultracite(라우터 테스트 스위트는 dev DB 보호로 미실행, 픽스처만 갱신).

## 스코프 밖

- 환불·paid 취소, 기간제 연장/이어붙이기, 횟수권 수량 다중 선택, PG 연동, 옵션별 커스텀 발동 창, 크롤링 공고.
