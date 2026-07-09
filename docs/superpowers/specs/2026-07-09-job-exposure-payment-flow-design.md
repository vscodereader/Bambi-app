# 공고 노출 옵션·결제·게시 흐름 설계

**작성일:** 2026-07-09
**선행:** 광고 카탈로그(adPlacement/adProduct/previewTemplate)는 이미 병합됨. 본 기능은 공고(jobPost) 등록 흐름에 노출 옵션·결제·게시 게이트를 추가한다.

## 목표
1. 공고 등록 폼(공고 이미지 아래)에 **노출 상품 옵션**과 **결제 방법**을 선택.
2. 등록 → **검수(있으면) + 운영자 결제완료** 둘 다 충족 시 공개 노출.
3. 운영자 페이지에서 공고별 **결제 상태 수동 관리**.
4. 구인자 "내 공고"를 shadcn **DataTable**로 전환하고 **노출 상품·결제 상태·남은 기간·만료 상태** 컬럼 추가.

## 확정된 결정(사용자)
- 노출 옵션은 **선택·흐름·표시까지만**. 실제 /seeker 노출 랭킹/배너 파이프라인 연동은 **후속**(본 범위 아님).
- 결제는 **PG 없음** — 운영자 수동 관리. 결제 방법은 **신용카드·무통장입금** 2종(기록용, 처리 없음).
- **모든 공고가 결제 게이트** 대상(일반 구인 포함). 게시 = 공고 상태 published AND 결제완료.
- 노출 옵션 원천은 **고정 7종 enum**(admin 카탈로그 연동은 후속).

## 비목표
- 실제 결제(PG)·주문/영수증. /seeker 실노출 엔진 개편(promotionTier 확장·배너 파이프라인). 카탈로그 adProduct ↔ 공고 바인딩.

---

## 데이터 모델 (신규 마이그레이션, 사용자가 db:generate)

`packages/db/src/schema/bambi.ts`:
- 신규 pgEnum:
  - `jobExposureType` "job_exposure_type": `["premium-banner","left-banner","right-banner","special","urgent","recommended","standard"]`
  - `jobPaymentMethod` "job_payment_method": `["card","bank_transfer"]`
  - `jobPaymentStatus` "job_payment_status": `["unpaid","paid"]`
- `jobPost` 테이블 컬럼 추가:
  - `exposureType` `jobExposureType("exposure_type").default("standard").notNull()`
  - `exposureDurationDays` `integer("exposure_duration_days")`(nullable; standard/무기한이면 null)
  - `paymentMethod` `jobPaymentMethod("payment_method")`(nullable)
  - `paymentStatus` `jobPaymentStatus("payment_status").default("unpaid").notNull()`
  - `exposureEndsAt` `timestamp("exposure_ends_at")`(nullable; 결제완료 시 `now + exposureDurationDays`로 설정)

표시명 매핑(웹 상수): premium-banner=프리미엄 배너 / left-banner=좌측 배너 / right-banner=우측 배너 / special=스페셜 채용 / urgent=급구 채용 / recommended=추천 채용 / standard=일반 구인. card=신용카드 / bank_transfer=무통장입금. unpaid=미결제 / paid=결제완료.

---

## 게시 게이트(상태 머신)
- **jobPostStatus는 기존 그대로**(draft/pending_review/published/rejected/hidden) — 검수 결과를 나타냄. `getInitialJobPostStatus`(bambi-policy.ts) 로직 불변(인증+무위험→published, 아니면 pending_review).
- **결제 상태는 독립 축**: 생성 시 항상 `paymentStatus="unpaid"`.
- **공개 노출 조건 = jobPostStatus="published" AND paymentStatus="paid".**
  - `jobs.list`(공개 목록, jobs.ts ~331) 필터에 `eq(jobPost.paymentStatus, "paid")` 추가.
  - `jobs.get`/상세 공개 접근의 `status==="published"` 체크에 결제완료 조건 병행(비공개면 소유자만 열람 유지).
- 이로써 "검수 통과 + 운영자 결제완료" 시에만 실제로 보인다. 인증 업체 자동 published도 결제완료 전엔 비공개.

---

## 공고 등록 폼
- `apps/web/src/lib/bambi-job-form.ts` `JobForm`에 필드 추가: `exposureType`(기본 "standard"), `exposureDurationDays`(number|null), `paymentMethod`("card"|"bank_transfer"|null). `createEmptyJobForm`/`validateJobForm`/`toJobInput`(있는 매퍼) 반영.
- `apps/web/src/app/employer/new/page.tsx`: `JobPostMediaUploader`(~795) **바로 아래** 새 `<section>` "노출 상품·결제":
  - 노출 상품 옵션: 7종 선택(shadcn `ToggleGroup` 또는 `RadioGroup`/`Select`; 기본 일반). 각 옵션 라벨 + 짧은 설명.
  - 이용 기간: 노출 옵션이 standard가 아닐 때만 노출(`Select`, 일수 옵션 예: 30/60/90). standard면 숨김·null.
  - 결제 방법: 신용카드/무통장입금(`ToggleGroup`), 필수(비-standard) 또는 항상. "결제는 운영자 확인 후 완료됩니다" 안내.
  - 기존 "검수 후 공개" Alert에 "결제 확인 후 게시" 문구 보강.
- 제출: `jobPostInput`(jobs.ts ~88) + create 핸들러에 신규 필드 반영해 저장. 미디어 업로드 흐름 유지.
- shadcn·토큰 규칙 준수(인라인 style·raw px·raw hex 금지, `ToggleGroup`는 2~7 선택지에 사용).

---

## 운영자 결제 관리
- API `packages/api/src/routers/bambi/moderation.ts`:
  - 신규 `setJobPostPayment`(admin): 입력 `{ jobPostId, paymentStatus }`. `paid`로 전환 시 `exposureEndsAt = now + (exposureDurationDays ?? 0)일`(durationDays null이면 null 유지), `unpaid`로 되돌리면 `exposureEndsAt=null`. 반환 갱신 레코드.
  - `listJobPosts`(admin, ~339) 반환에 `exposureType`·`paymentStatus`·`exposureDurationDays`·`exposureEndsAt` 포함.
- UI: 운영자 공고 상세/큐(`apps/web/src/app/moderator/queue/[id]/page.tsx` 및/또는 목록)에서 결제 상태 배지 + "결제완료 처리"/"미결제로 되돌리기" 버튼. 검수 승인/반려는 유지. (운영자가 검수와 결제를 각각 관리.)

---

## 구인자 내 공고 DataTable
- 인프라: `packages/ui`에 shadcn `table` 추가(`pnpm dlx shadcn@latest add table`) + `@tanstack/react-table` 의존성 추가. 재사용 `data-table` 컴포넌트(정렬·기본 툴바) 또는 컬럼 정의 + `Table` 조합.
- `apps/web/src/app/employer/page.tsx` "내 공고" 카드 섹션을 **DataTable로 교체**(모바일은 가로 스크롤 또는 핵심 컬럼 우선; 반응형 필수).
- 컬럼: 제목(수정 링크) · 직종·지역 · 급여 · **노출 상품**(exposureType 라벨/배지) · 공고 상태(배지) · **결제 상태**(미결제/결제완료 배지) · **남은 기간**(`exposureEndsAt`까지 일수; null이면 "-") · **만료 상태**(진행중/만료; `exposureEndsAt && now>ends`면 만료, null이면 "해당 없음") · 사업자 인증 · 수정일 · 관리(수정/삭제 — 기존 로직 재사용).
- `jobs.listMine`(jobs.ts ~579) select에 `exposureType`·`paymentStatus`·`exposureDurationDays`·`exposureEndsAt` 추가.

---

## 검증·운영
- 빌드/dev서버/스크린샷 금지 — 타입체크 + string-snapshot/실DB 없는 vitest + Biome. 시각 확인은 사용자.
- 마이그레이션은 사용자 실행: `db:generate`(신규 0011 등) → 검토 → 커밋 → `db:migrate`. `db:push` 금지.
- 커밋: 한국어 `type:` + 촘촘한 블릿. 작업 단위 분리 커밋.

## 미해결(스펙 리뷰 시 확정 가능)
- 일반(standard) 구인 결제 게이트 면제 여부(현 설계: 면제 안 함 — 전부 게이트).
- 이용 기간 일수 옵션 목록(현 설계: 30/60/90).
- DataTable 모바일 표현(가로 스크롤 vs 카드 병행).
