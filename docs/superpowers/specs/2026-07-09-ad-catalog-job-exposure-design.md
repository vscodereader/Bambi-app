# 광고 카탈로그 · 공고 노출상품 개편 설계 (2026-07-09)

## 배경 / 문제

- `job_post.exposure_type`(7개 enum)은 **seeker 노출 영역 결정에 사용되지 않음**. seeker 영역은 `job_promotion_campaign.tier`(premium/recommended) 기반. exposure_type은 **라벨 표시용**으로만 소비됨(`EXPOSURE_TYPE_LABELS`).
- 광고 상품 카탈로그(`ad_placement` → `ad_product`, `price_options` 포함)와 공고 노출/결제 흐름이 **분리**돼 있음. 실제 가격은 `ad_product.price_options`에만 존재하고 job_post·결제에 연결 안 됨.
- 결제는 순수 `payment_status` unpaid↔paid 토글. 금액 컬럼/계산 없음.
- `preview_template`은 현재 `ad_placement`에 있으나, 운영자가 **상품 추가 시** 설정하는 것이 요구사항.

## 목표(요구사항 6)

1. `preview_template`을 위치 → **상품** 설정으로 이동.
2. 광고안내 "서비스내용"을 **표(grid)** 형태로 개선.
3. 공고 등록 노출상품 카드 **텍스트 오버플로우** 수정.
4. 공고 등록 노출상품을 **운영자 등록 광고 상품만** 표시(하드코딩 제거).
5. 이용기간 Select에 **기간별 가격** 표시.
6. **결제 예정 총액**을 구인자에게 표시.

## 스키마 (마이그레이션 0013, drizzle generate)

- `ad_placement.preview_template` 제거, `ad_product.preview_template`(`ad_preview_template`, default `none`) 추가.
- `job_post` 추가:
  - `ad_product_id` uuid nullable FK → `ad_product`(onDelete set null).
  - `exposure_amount` integer nullable — 결제 예정 총액 스냅샷.
- `exposure_type` 유지. 공고 생성 시 선택 상품의 `preview_template`에서 **서버가 도출**해 저장.

### preview_template → exposure_type 매핑 (서버 단일 소스, `packages/api`)

| preview_template | exposure_type |
|---|---|
| premium-top | premium-banner |
| special-list | special |
| urgent-list | urgent |
| recommended-list | recommended |
| side-vertical | right-banner |
| side-horizontal | left-banner |
| none | standard |

무료 "일반 구인" 선택(상품 없음) → exposure_type `standard`, amount/duration/paymentMethod null.

## API

- `ad-products.ts`: `createProductInput`/`updateProductInput`에 `previewTemplate` 추가, placement input에서 제거. `getCatalog` 반환은 스키마 기반으로 자동으로 상품에 previewTemplate 포함.
- `jobs.ts`: create/update input에 `adProductId`(nullish)·`exposureAmount`(nullish) 추가. 서버에서 선택 상품 조회 → `preview_template`로 exposure_type 도출, 선택 `days`로 price_options에서 amount 검증·확정 후 저장. standard(상품없음)는 기존과 동일.
- `moderation.ts`: `listJobsForPayment` select에 `exposureAmount` 추가(운영자 금액 확인).

## UI

- **운영자 관리**: `ad-product-form.tsx`에 previewTemplate Select 추가(옵션은 `PREVIEW_TEMPLATE_OPTIONS`), `ad-placement-form.tsx`에서 제거. 상품 new/edit·위치 new/edit 페이지 전달값 조정.
- **광고안내**(`employer-ad-guide.tsx`): "서비스내용"을 표로. 컬럼 = 광고 위치(상품 preview) · 서비스 내용(상품명/한줄소개/혜택) · 비용 및 기간 · 신청. preview는 상품별로 렌더. 모바일 세로 스택 유지.
- **공고 노출상품**(`job-exposure-fields.tsx` + new/edit 페이지 + `bambi-job-form.ts`): 하드코딩 제거, `getCatalog`로 운영자 상품 표시 + "일반 구인(무료)" 옵션. 상품 선택 시 그 상품 `price_options`로 이용기간 Select 구성(각 옵션 "N일 · 금액"). 결제 예정 총액 표시. 카드 텍스트 줄바꿈(`whitespace-normal`+`min-w-0`).
- **검수 결제**(`moderator-payment-panel.tsx`, `moderator/payments/page.tsx`): `exposure_amount` 표시.

## 스코프 밖

seeker 실제 노출 영역(promotion_tier)·하드코딩 샘플 배너·프로모션 캠페인 시스템은 변경하지 않음.

## 마이그레이션 절차(사용자 직접 실행)

1. `pnpm --filter @bambi-app/db db:generate` → `0013_*.sql` 생성 확인(preview_template 이동 = placement DROP COLUMN + product ADD COLUMN, job_post ADD ad_product_id/exposure_amount).
2. 생성 SQL 검토 후 `db:migrate`.
- 주의: 기존 placement의 preview_template 값은 사라짐(현 시드는 전부 `none`이라 실질 영향 없음).
