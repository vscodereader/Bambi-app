# 노출 섹션 운영자 제어 + 스페셜/추천 정원·대기열 + 베스트글 아이콘

- 작성일: 2026-08-11
- 브랜치: `feat/exposure-section-config` (develop 기준)
- 상태: 설계 확정, 구현 대기

## 목적 / 배경

메인(구직자 마켓플레이스) 노출 섹션과 커뮤니티 베스트글에 대한 운영자 제어를 추가한다.

1. **급구 채용 섹션 숨김** — 코드에서 제거하지 않고 운영자가 켜고 끌 수 있는 토글로 뺀다.
2. **스페셜·추천 정원·대기열** — 지금은 스페셜/추천 리스팅 광고가 상한 없이 전부 노출된다
   (`buildExposureJobSections`: "슬롯 상한 없이 ... 전부 노출, 그리드가 다음 행으로 확장").
   이를 **광고 배너처럼 정원제**로 바꾼다: 스페셜 12자리·추천 20자리 고정 인벤토리, 자리가 차면
   신규 신청은 **대기열**로. 이미 프리미엄 배너에 있는 파생 대기열 모델(`bambi-premium-capacity`)을
   스페셜/추천으로 확장한다.
3. **(곁다리) 베스트글 게시판 아이콘** — 운영자 아이콘 지정 시스템(`communityBoardIcon`)은 이미
   있으나 베스트글은 가상 게시판(DB 행 없음)이라 빠져 있다. 운영자가 아이콘을 지정할 수 있게 한다.

## 확정된 결정

| 질문 | 결정 |
|---|---|
| 급구 숨김 방식 | 운영자 사이트 설정 토글 (배포 없이 on/off), 효과적 기본값 = 숨김 |
| 스페셜/추천 슬롯 표시 | 고정 인벤토리 (12/20 항상 노출, 빈칸 "광고 모집중") |
| 슬롯 개수 관리 | 운영자 설정으로 조정 (기본 12/20) |
| 정원 초과 신청 | **로테이션 아님** — 프리미엄식 파생 대기열에 넣기 |
| 정원 통일 범위 | 스페셜·추천만 추가 (프리미엄 정원 10은 현행 코드 고정 유지) |
| 급구 정원/대기열 | 제외 (섹션 자체를 숨기므로 불필요) |
| 베스트글 아이콘 | 운영자 지정 |

## 핵심 통찰

- 광고 배너는 **두 층이 분리**돼 있다: 노출(`groupAdBannerJobs`)은 시간 버킷 **로테이션**,
  신청/정원(`bambi-premium-capacity`)은 **파생 대기열**(별도 테이블 없이 jobPost 컬럼에서 파생).
  프리미엄은 정원(10) ≠ 렌더 링 칸(9)이라 로테이션이 필요하다.
- 스페셜/추천은 **정원 = 렌더 슬롯 수**로 두면 active 공고가 슬롯을 초과할 수 없어 **로테이션이
  불필요**하다. 초과분은 정원 게이트가 막아 대기열(pending)로 흘러간다. "자리 없으면 대기열"이
  자연스럽게 성립한다.
- 스페셜/추천은 이미 판매되는 리스팅 광고 상품(`special-list`·`recommended-list`, `kind: listing`)이고
  구매/승인 흐름(jobPost `adProductId`+`exposureType`+`paymentStatus` unpaid→paid)이 배너와 같다.
  단지 정원 게이트가 배너에만 걸려 있을 뿐 → 게이트를 리스팅으로 일반화하는 작업이다.

---

## Part 1 — 급구 섹션 숨김 토글

### 데이터
- `bambi_site_settings.urgent_section_hidden` `boolean not null default true`
  - 마이그레이션 시 기존 단일 행에 `true`가 채워져 급구가 즉시 숨겨진다(요구사항 충족).
  - 운영자가 끄면(`false`) 다시 노출.

### API (`packages/api/src/routers/bambi/site-settings.ts`)
- Part 2의 정원값과 함께 **한 쌍의 프로시저**로 묶는다(클라가 숨김+슬롯수를 함께 필요로 함):
  - `getExposureSectionConfig` (**publicProcedure**) → `{ urgentHidden, specialSlots, recommendedSlots }`
    (특정 컬럼만 select, null 정원은 코드 기본값으로 폴백해 내려준다)
  - `updateExposureSectionConfig` (**adminProcedure**) → 위 세 값 upsert. 정원은 트러스트
    바운더리라 서버에서 정수·범위 검증(예: 1~60).

### Web 렌더 (`apps/web/src/components/bambi/visual-job-exposure-sections.tsx`)
- `VisualJobExposureSections`가 `getExposureSectionConfig`를 구독(또는 상위에서 주입).
- `urgentHidden`이면 급구 `ExposureSection`을 렌더하지 않는다(스켈레톤 `LOADING_SECTIONS`도 동일 규칙 반영 검토).

### 운영자 UI (`apps/web/src/app/moderator/site-settings/page.tsx`)
- 기존 카드 나열에 **"노출 섹션 관리"** `Card` 추가(Part 2와 동일 카드에서 함께 편집):
  - 급구 숨김 스위치(shadcn `Switch` — 없으면 add)
  - 스페셜/추천 슬롯 수 입력(Part 2)

---

## Part 2 — 스페셜/추천 정원 + 대기열 (핵심)

### 데이터
- `bambi_site_settings.special_capacity` `integer` (nullable, null→코드 기본값 12)
- `bambi_site_settings.recommended_capacity` `integer` (nullable, null→코드 기본값 20)
- 코드 기본값 상수: `DEFAULT_SPECIAL_CAPACITY = 12`, `DEFAULT_RECOMMENDED_CAPACITY = 20`.

### 서비스 — 정원/대기열 일반화 (`packages/api/src/services/bambi-premium-capacity.ts`)
프리미엄 전용 로직을 파라미터화해 스페셜/추천에 재사용한다(중복 구현 금지).

- 순수 로직 `computePremiumQueue(activeCount, pendingIds)`를 정원 파라미터를 받도록 일반화
  (`computeCapacityQueue(capacity, activeCount, pendingIds)`), 프리미엄은 `PREMIUM_AD_CAPACITY`로 호출.
- 리스팅 섹션용 파생/게이트 추가(배너 조건을 단일 exposureType로 치환):
  - `activeListingWhere(type, now)` = published + paid + `exposureType=type` + 미만료
  - `pendingListingWhere(type)` = pending_review/published + unpaid + `exposureType=type` + `adProductId` 존재
  - `deriveListingQueue(executor, type, capacity, now)` → `{ activeCount, pendingCount, remaining, capacity, ranksByJobId }`
  - `assertListingApprovalWithinCapacity({ executor, exposureType, capacity, existing…, new…, now })` —
    승인(unpaid→paid)일 때 **exposureType별 고유 advisory lock 키**로 직렬화 후 active 재카운트,
    정원 초과면 `CONFLICT`. (프리미엄과 별개 락 키 → 섹션 간 승인이 서로 막지 않음)
- 정원=슬롯 수 불변식: 스페셜/추천은 정원과 렌더 슬롯 수가 같은 값(운영자 설정 하나)에서 나온다.

### 승인 게이트 배선 (`packages/api/src/routers/bambi/moderation.ts`)
- 현재 승인 경로에서 `assertPremiumApprovalWithinCapacity`(배너)만 호출.
- 스페셜/추천 공고 승인 시 `assertListingApprovalWithinCapacity`도 호출(정원은 설정에서 조회).

### 신청자 노출
- `ad-products.ts` `premiumCapacity` → 섹션별 정원 조회 확장(또는 `listingCapacity` 신설):
  광고 안내 페이지의 "N/12·N/20" 표시·만석 안내.
- `promotions.ts` `listMyAds` → 스페셜/추천 공고에도 큐 순번(`queuePosition`) 부여
  (현재 `premiumQueue`만 있음). 구인자 "광고 관리"에서 대기 순번 노출.

### 렌더링 — 고정 인벤토리
- 서버 `buildExposureJobSections`(`packages/api/src/routers/bambi/jobs.ts:1422`) 호출부:
  스페셜/추천을 정원(슬롯 수)으로 **방어적 slice**(게이트가 있어 보통 초과 안 하지만, 운영자가
  정원을 낮춘 직후 등 전이 상태 방어). 순서는 기존 정렬(부스트/게시 순) 유지.
- 클라 `visual-job-exposure-sections.tsx`:
  - `ExposureSection`의 채움 로직을 **섹션별 고정 슬롯 수**로 패딩(스페셜=`specialSlots`,
    추천=`recommendedSlots`). 공고로 채우고 나머지는 `AdSlotPlaceholder`("광고 모집중").
  - 현재 `cardPlaceholderCount`(마지막 줄만 채움)·`cardPlaceholderClass`(빈 섹션에서 여분 자리표시
    breakpoint 숨김)를 고정 인벤토리에 맞게 대체 — 스페셜/추천은 항상 슬롯 전부 렌더.
  - organic(전체)·급구(숨김)는 이 규칙에서 제외.
  - 엣지: active > 슬롯(정원 하향 직후)이면 렌더는 슬롯 수에서 컷, 초과분은 만료로 자연 배출,
    신규 승인은 게이트가 차단.

---

## Part 3 (곁다리) — 베스트글 게시판 아이콘

### 데이터
- `bambi_site_settings.best_board_icon` `text` (nullable, lucide 아이콘 이름).
  베스트는 가상 게시판이라 `community_board` 행이 없어 사이트 설정에 저장한다.

### 서버 (`packages/api/src/routers/bambi/community.ts`)
- 베스트 가상 게시판을 조립하는 자리(overview 및 보드 목록 경로)에서 `best_board_icon`을 읽어
  best 메타의 `icon`에 주입한다.
- 아이콘 이름은 `COMMUNITY_BOARD_ICONS` enum(zod)으로 검증(기존 게시판 아이콘과 동일 정본).

### Web
- 서버가 best.icon을 실어주면 기존 `BoardTitleMark`(`community-board-preview.tsx`)가 그대로 렌더.
  베스트글이 다른 게시판처럼 지정 아이콘을 보인다. 미지정이면 기존 코럴 액센트 바 유지.
- `lib/bambi/community.ts`의 best 메타 경유 경로(`toBoardMetas`/`getBoardByKey("best")`)가 아이콘을
  서버 값에서 받도록 배선.

### 운영자 UI (`apps/web/src/app/moderator/community-boards/page.tsx`)
- 베스트 전용 행(삭제 불가, 아이콘만) 추가 — 기존 게시판 아이콘 선택 UI 재사용.
- 저장 프로시저 `updateBestBoardIcon`(site-settings 또는 community-boards 라우터, adminProcedure).

---

## 마이그레이션
- `bambi_site_settings`에 컬럼 4개 추가: `urgent_section_hidden`, `special_capacity`,
  `recommended_capacity`, `best_board_icon`.
- drizzle `generate`로 SQL 생성 → 적용은 **사용자 명시 지시 시에만**(자동 `db:push` 금지).
- 배포 전 운영 `migrate` 필요.

## 테스트 전략
- **순수 로직 우선**: `computeCapacityQueue`(정원 일반화) 단위 테스트를 기존
  premium-capacity 테스트에 확장(정원 값·pending 순번·progressable 경계).
- 고정 슬롯 패딩/컷 로직을 순수 헬퍼로 뽑아 단위 테스트(슬롯보다 공고 많음/적음/같음, 정원 하향 전이).
- **주의**: 라우터 테스트가 dev DB를 지우는 사례(site-settings 삭제)로 운영 설정이 날아간 이력
  → site-settings 라우터 통합 테스트는 지양, 서비스/순수 로직 위주. api 테스트는 `packages/api`의
  `test/services`에서.
- 린트: `pnpm dlx ultracite fix <경로>`(경로 인자 필수), `check-types` 통과.

## 완료 기준
- 운영자 사이트 설정에서 급구 섹션 숨김/노출 토글, 스페셜/추천 슬롯 수 조정이 저장·반영된다.
- 메인에서 급구 섹션이 (기본) 숨겨지고, 스페셜 12·추천 20 고정 슬롯이 공고+"광고 모집중"으로 채워진다.
- 스페셜/추천 정원이 차면 신규 승인이 정원 게이트에서 차단되고, 신청은 대기열 순번을 받는다.
  자리가 나면(만료) 대기 1순위가 파생적으로 진행 가능으로 전환된다.
- 베스트글 게시판에 운영자가 지정한 아이콘이 표시된다.
- `check-types`·lint(ultracite) 통과, 정원/대기열·슬롯 로직 단위 테스트 추가.

## 범위 밖 / 후속
- 프리미엄 배너 정원(10)의 운영자 설정화 — 이번엔 코드 고정 유지.
- 급구 섹션 정원/대기열 — 섹션 숨김으로 불필요, 재노출 시 후속.
- 스페셜/추천 렌더 로테이션 — 정원=슬롯 불변식으로 불필요.

## 이슈 분할 (구현 트래킹)
- **이슈 A**: 급구 섹션 숨김 토글 (Part 1)
- **이슈 B**: 스페셜/추천 정원·대기열·고정 슬롯 (Part 2) — 대부분의 작업량
- **이슈 C**: 베스트글 게시판 아이콘 (Part 3)

세 이슈는 한 브랜치(`feat/exposure-section-config`)에서 순차 구현하며, 공통 마이그레이션은 한 번에 생성한다.
