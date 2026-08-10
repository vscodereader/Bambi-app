# 공고 상세이미지 디자인 제작 애드온 — 설계 (2026-08-10)

## 배경 / 문제

퀸알바·여우알바는 광고 구매 시 디자이너가 공고 상세페이지 이미지를 제작해주는 유료 옵션을
판다. 밤비에도 같은 상품을 붙인다. 현재 밤비의 광고 구매는 별도 주문 테이블 없이
**공고(job_post)에 상품·금액을 스냅샷**하고 운영자가 `/moderator/payments`에서 수동으로
입금을 확인하는 구조다. 디자인 제작 옵션도 같은 결로 붙인다.

## 확정 사항 (브레인스토밍 결론)

- 앱은 **주문·결제까지만** 다룬다. 실제 제작 소통(요청사항·참고자료·시안)은 채팅 등 기존
  채널에서 운영자가 진행한다. 시안 워크플로우는 스코프 밖.
- **애드온 방식**: 유료 광고 상품 구매 플로우에 "상세이미지 디자인 제작 +N원" 체크박스로
  붙는다. 독립 상품 아님. 무료(standard) 공고에는 제공하지 않는다.
- **가격은 광고 상품별**로 admin이 관리한다. 미설정(null) 상품은 옵션 비노출.
- **완성본은 운영자가 직접** 해당 공고의 상세이미지로 등록하고 완료 처리한다.
- 접근 방식: **job_post 스냅샷 확장** (별도 요청 테이블 없음). 한계로 1공고 1회 주문이며
  재주문·주문 이력은 없다 — 필요해지면 그때 별도 테이블로 승격한다.

## DB (packages/db/src/schema/bambi.ts)

- `ad_product.detail_design_price` — `integer`, nullable. null = 이 상품엔 옵션 미제공.
- 신규 enum `job_detail_design_status` = `requested` | `completed`.
- `job_post.detail_design_amount` — `integer`, nullable. 구매 시점 가격 스냅샷
  (기존 `exposure_amount`와 동일 철학). null = 미신청.
- `job_post.detail_design_status` — 위 enum, nullable. 신청 시 `requested`로 시작.
- 마이그레이션: drizzle generate로 생성 (`db:push` 금지). 적용은 기존 워크플로우대로
  사용자 지시 하에 migrate.

## API (packages/api)

### admin 카탈로그 (`routers/bambi/ad-products.ts`)

- `createProduct` / `updateProduct` 입력에 `detailDesignPrice`(0 이상 정수 | null) 추가.
- `listCatalogAdmin` / `getCatalog` 응답에 `detailDesignPrice` 포함.

### 구매 (`routers/bambi/jobs.ts`)

- `jobs.create` / `jobs.update` 입력에 `detailDesignRequested: boolean` 추가.
- 서버 검증: 선택한 상품에 `detailDesignPrice`가 설정된 경우에만 신청 허용. 옵션 없는
  상품·무료 공고에 신청하면 BAD_REQUEST.
- 신청 시 상품의 현재 가격을 `detail_design_amount`에 스냅샷하고
  `detail_design_status = requested`. 클라이언트가 본 가격과 서버 가격이 다르면 기존
  "가격이 X원에서 Y원으로 변경되었습니다" 재확인 에러 패턴을 그대로 적용.
- `jobs.update`에서 옵션을 켜거나 끄면 결제 총액이 바뀌므로, 기존 노출 변경과 동일하게
  `paymentStatus`를 unpaid로 리셋한다. 옵션 해제 시 `detail_design_amount`·
  `detail_design_status`를 null로 되돌린다. 단, `detail_design_status = completed`인
  공고는 옵션 해제 불가(이미 제작 완료된 작업의 흔적 보존).
- 금액 합산(노출 금액 + 옵션 금액) 로직은 pure 헬퍼로 분리해 단위 테스트 가능하게 한다.

### 운영자 (`routers/bambi/moderation.ts`)

- `setJobPostDesignStatus` — `requested` ↔ `completed` 토글.
- `createJobPostDesignMediaUpload` — 운영자가 **대상 공고의 조직 prefix**로 GCS 서명
  업로드 URL을 발급받는 procedure. 기존 `createJobPostMediaUploadIntent`·
  `isOwnedJobPostMediaKey`(bambi-storage.ts)를 재사용하되 조직 스코프를 대상 공고에서
  가져온다. 등록 procedure는 업로드된 키를 해당 공고의 `job_post_media`(usage=detail)에
  추가한다. 상세이미지 5장 제한(`DETAIL_IMAGE_MAX_COUNT`)은 그대로 적용하고, 꽉 찬
  경우 운영자가 기존 이미지를 삭제하고 등록할 수 있게 삭제 procedure도 함께 제공한다
  (삭제 시 `deletePublicObjects`로 GCS 실객체 삭제 — 기존 패턴).
- `listJobsForPayment` 응답에 디자인 신청 여부·옵션 금액·제작 상태 포함.

## Web (apps/web)

- **admin 상품 폼** (`/moderator/ad-products/[placementId]/new`, `.../edit`):
  "상세이미지 디자인 제작 가격" 숫자 필드 1개 추가. 비우면 미제공.
- **광고 안내** (`/employer/ad-guide`, `employer-ad-guide.tsx`): 상품 카드에 가격이
  설정된 경우 "상세이미지 디자인 제작 +N원" 안내 라인 표시.
- **공고 폼** (`job-exposure-fields.tsx`): 유료 상품 선택 시 그 상품에 옵션이 있으면
  체크박스 노출. 결제 예정 총액 = 노출 금액 + 옵션 금액으로 합산 표시.
- **운영자 결제 화면** (`/moderator/payments`): 총액에 옵션 금액 합산 표시, "디자인
  제작" 뱃지와 신청 건 필터 추가. 행에서 "디자인 제작 관리" 다이얼로그를 열어 완성본
  업로드(기존 `job-post-media-uploader` 재사용)와 완료 토글을 제공한다. **별도 큐
  화면은 만들지 않는다** (신청 건 필터로 충분).
- **employer 공고 관리**: 신청한 공고 카드에 제작 상태 뱃지 표시. enum 원값 노출 금지
  규칙에 따라 `lib/bambi`에 `JOB_DETAIL_DESIGN_STATUS_LABELS` 라벨 맵을 추가하고 이를
  경유한다 (requested=제작 대기, completed=제작 완료).
- shadcn 컴포넌트 재사용, 모바일 반응형 유지, primary 버튼 위계·px 금지 등 기존 UI
  컨벤션 준수.

## 에러 처리 · 경계

- 옵션 없는 상품/무료 공고에 신청 → 서버 BAD_REQUEST.
- 상세이미지 5장 초과 업로드 → 기존 정책 그대로 거부.
- `completed` 상태의 공고는 옵션 해제 불가.
- 크롤링 공고(`crawled_job_post`)는 스코프 밖 — 별도 이미지 경로를 쓰며 애드온 판매
  대상이 아니다.
- 환불·취소 플로우 없음 (현 결제 체계에 원래 없음, 운영자 재량으로 처리).

## 테스트

- 금액 합산 pure 헬퍼: `packages/api/test/services/` 단위 테스트 (routers 스위트는
  dev DB 파괴 위험으로 실행 금지 — 순수 로직을 분리하는 이유).
- 웹 폼·화면 배선: `apps/web/test/` 컨벤션 (src 미러링, `@/` alias).
- 테스트 실행: web은 `pnpm vitest run --config apps/web/vitest.config.ts`, api는
  cwd=packages/api에서 `pnpm vitest run test/services`.

## 문서

- `docs/manual/` employer·moderator 매뉴얼의 광고 상품·결제 절에 옵션 안내 추가.

## 스코프 밖 (YAGNI)

- 시안 교환·수정 요청 워크플로우, 제작 요청서 양식.
- 재주문·주문 이력·별도 주문 테이블.
- PG 결제 연동, 환불 플로우.
- 크롤링 공고 대응, 단독 상품 판매.
