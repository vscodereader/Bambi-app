# GA4 프로모션·핵심 클릭 이벤트 확장 설계

2026-08-10 · 대상 브랜치: `feat/ga4-promotion-click-tracking` · 기준: 최신 `develop` `916e6efa`

## 목적

현재 자체 결제 프리미엄 배너에만 연결된 GA4 프로모션 계측을 자체 등록·결제된 스페셜 채용과 추천 채용까지 확장한다. 동시에 사용자가 채용정보 첫 화면에서 어떤 공고와 탐색 기능을 선택하고, 상세 화면에서 어떤 문의 행동으로 이어지는지 확인할 수 있도록 핵심 행동 이벤트를 추가한다.

모든 DOM 클릭을 수집하지 않는다. 광고 성과, 공고 탐색, 상세 조회, 문의 의도, 회원 전환처럼 실제 제품 판단에 쓰이는 행동만 명시적으로 계측한다. 기존 서버의 `job_performance_event` 통계는 광고주용 운영 지표로 유지하고 GA4는 익명화된 사용자 행동 분석 축으로 분리한다.

## 확정 정책

- 외부 수집 공고(`crawled === true`)는 프로모션·목록·선택·상세·문의 의도를 포함한 모든 신규 GA 이벤트에서 완전히 제외한다.
- 스페셜·추천 프로모션은 자체 등록·결제 공고만 집계한다.
- 급구 채용은 곧 제거할 기능이므로 이번에 추가하는 모든 GA 이벤트에서 완전히 제외한다.
- 프리미엄 배너의 기존 자체 결제 공고 전용 정책과 50% 가시성 기준은 유지한다.
- GA 이벤트에 사용자 ID, 이메일, 전화번호, 채팅방 ID, 원문 검색어, 자유 입력값을 보내지 않는다.
- GA 스크립트는 기존과 동일하게 Vercel production에서만 로드하고 로컬·프리뷰·광고 차단 환경에서는 계측 헬퍼가 조용히 no-op 한다.
- DB 마이그레이션과 GTM 도입은 없다.

## 조사 결과

### 기존 프로모션 구현

- `apps/web/src/app/layout.tsx`가 production에서 측정 ID `G-HNVZKKB0NX`의 gtag를 로드한다.
- `apps/web/src/lib/bambi/ga-promotion.ts`는 프리미엄 배너용 `view_promotion`·`select_promotion` 파라미터를 조립한다.
- `apps/web/src/lib/bambi/use-promotion-impression.ts`는 카드가 뷰포트에 50% 이상 들어오면 마운트당 한 번 노출을 발화한다.
- `AdBannerFrame`이 자체 결제 프리미엄 배너만 계측하고 크롤링 채움 배너와 빈 슬롯은 제외한다.

### 스페셜·추천 렌더링 구조

- `/seeker`의 스페셜·급구·추천·전체 공고는 `VisualJobExposureSections`와 `VisualJobCard`를 공유한다.
- 카드에는 `tone`(`special | urgent | recommended | organic`)이 이미 전달되므로 급구 제외와 리스트 식별을 별도 서버 변경 없이 처리할 수 있다.
- 서버 응답은 자체 공고 뒤에 외부 수집 공고를 붙이므로 스페셜·추천 프로모션 판정에는 `job.crawled !== true` 조건이 반드시 필요하다.
- 검색창은 헤더와 채용정보 본문이 `JobSearchCommand`를 공유한다.
- 공고 상세의 `1:1 채팅 시작`은 사전 확인 화면으로 이동하고, 실제 채팅방 생성은 `/seeker/jobs/[id]/chat`의 mutation 성공 시점에 일어난다.

## 이벤트 체계

### 1. 광고 프로모션

GA4 권장 이벤트 `view_promotion`·`select_promotion`을 사용한다. 기존 프리미엄을 포함해 프로모션 식별자를 다음과 같이 고정한다.

| 노출 상품 | `promotion_id` | `promotion_name` | 대상 |
|---|---|---|---|
| 프리미엄 배너 | `premium-banner` | `프리미엄 배너` | 기존 자체 결제 배너 |
| 스페셜 채용 | `special-list` | `스페셜 채용` | 자체 등록·결제 공고만 |
| 추천 채용 | `recommended-list` | `추천 채용` | 자체 등록·결제 공고만 |

공통 item 파라미터:

- `item_id`: 공고 ID
- `item_name`: 공고 제목
- `item_brand`: 업소명
- `creative_slot`: `seeker_special_<1-base 순번>` 또는 `seeker_recommended_<1-base 순번>`
- `index`: 섹션 안 0-base 순번
- `promotion_id`·`promotion_name`: item 레벨에도 함께 넣어 GA4 item-scoped 프로모션 차원의 `(not set)`을 방지

노출 규칙:

- 각 카드가 50% 이상 보인 순간 `view_promotion` 한 번 전송한다.
- 같은 카드가 스페셜과 추천에 동시에 들어오면 지면이 다르므로 각 지면에서 한 번씩 집계한다.
- 필터 변경으로 컴포넌트가 교체된 뒤 다시 노출되면 새 노출로 집계한다.
- 급구, 외부 수집 공고, 빈 광고 모집 슬롯, 로딩 스켈레톤은 프로모션 이벤트를 보내지 않는다.

클릭 규칙:

- 실제 공고 카드 클릭 직전에 `select_promotion`을 보내고 기존 상세 이동은 지연하지 않는다.
- 게스트가 클릭해 회원가입 화면으로 이동하더라도 광고를 선택한 사실은 유효하므로 클릭으로 집계한다.

### 2. 공고 목록 노출·선택

가장 많이 선택된 공고와 목록별 CTR을 보기 위해 GA4 권장 이벤트 `view_item_list`·`select_item`을 사용한다.

| 목록 | `item_list_id` | `item_list_name` | 포함 대상 |
|---|---|---|---|
| 스페셜 채용 | `seeker_special` | `스페셜 채용` | 자체 공고, 단 급구 제외 |
| 추천 채용 | `seeker_recommended` | `추천 채용` | 자체 공고 |
| 전체 공고 | `seeker_all_jobs` | `전체 공고` | 자체 공고 |
| 검색 결과 | `job_search_results` | `공고 검색 결과` | 검색 결과 중 자체 공고 |

item 공통 파라미터:

- `item_id`, `item_name`, `item_brand`, `index`
- `item_category`: `special | recommended | organic | search`
- `item_variant`: `native` (외부 수집 공고는 이벤트 자체를 보내지 않음)
- 목록과 카드 item 양쪽에 동일한 `item_list_id`·`item_list_name`
- 가격은 급여 단위와 자유 텍스트가 혼재해 전자상거래 금액으로 오해될 수 있으므로 `price`·`currency`는 보내지 않는다.

노출 규칙:

- 스페셜·추천·전체 카드가 뷰포트에 50% 이상 진입할 때 해당 카드 한 건을 `view_item_list`로 보낸다. 화면 아래의 아직 보지 않은 카드는 집계하지 않는다.
- 급구 섹션은 옵저버와 이벤트 배선을 모두 생략한다.
- `공고 더보기`로 전체 공고가 추가되면 새로 추가된 item만 별도의 `view_item_list`로 보낸다.
- 검색 결과는 결과 패널에 실제 결과가 표시됐을 때 전송하되 원문 검색어는 포함하지 않는다.

선택 규칙:

- 카드 또는 검색 결과를 선택하면 상세 이동 직전에 해당 목록의 `select_item`을 보낸다.
- 자체 결제 스페셜·추천 카드는 같은 클릭에서 `select_promotion`과 `select_item`을 각각 한 번 보낸다. 두 이벤트는 광고 성과와 공고 탐색이라는 서로 다른 보고서 목적이다.
- 외부 수집 카드는 목록과 위치에 관계없이 어떤 GA 이벤트도 보내지 않는다.
- 급구 카드는 어떤 신규 GA 이벤트도 보내지 않는다.

### 3. 공고 상세 조회

공고 상세이 실제로 렌더된 시점에 GA4 권장 이벤트 `view_item`을 마운트당 한 번 보낸다.

- 자체 공고만 대상이다. 외부 수집 공고 상세는 이벤트를 보내지 않는다.
- `item_id`, `item_name`, `item_brand`, `item_variant(native)`를 보낸다.
- 급구 경유 여부를 상세 라우트에서 신뢰성 있게 복원할 수 없으므로 상세 이벤트에는 노출 등급을 억지로 넣지 않는다. 급구 목록 클릭은 앞 단계에서 이미 제외한다.
- 로딩·404·API 오류 화면에서는 보내지 않는다.

### 4. 탐색·더보기·콘텐츠 클릭

GA4 기본 보고서에 없는 UI 행동은 소수의 커스텀 이벤트로 통일한다.

#### `filter_change`

- 대상: 전체·지역별·업종별 탐색 탭, 지역·업종 칩, 검증 완료·당일면접·초보 가능 퀵 필터, 상세 필터 시트 값 변경
- 파라미터: `surface: seeker_marketplace`, `filter_name`, `filter_value`, `enabled`
- `filter_value`는 코드나 고정 옵션만 보내며 사용자가 입력한 최소 시급 원문은 보내지 않는다. 최소 시급은 `has_min_pay: true|false`처럼 존재 여부만 보낸다.

#### `load_more`

- 대상: `공고 더보기`
- 파라미터: `surface: seeker_marketplace`, `content_type: job`, `visible_count`
- 클릭 즉시 한 번 보내며 로딩 중 비활성 클릭은 집계하지 않는다.

#### `navigation_click`

- 대상: 채용정보 첫 화면 수다방 섹션의 최상위 `더보기`, 게시판 카드별 `더보기`, 미리보기 글 선택
- 파라미터: `surface: seeker_home_community`, `link_type: section_more | board_more | post`, `content_id`
- `content_id`는 게시판 key 또는 게시글 ID만 사용하고 제목·작성자·목적지 전체 URL은 보내지 않는다.
- 자격 게이트에 막혀 인증 다이얼로그나 안내 토스트가 뜨더라도 클릭 의도는 집계한다.

### 5. 문의 의도

#### `contact_intent`

- 공고 상세의 `1:1 채팅 시작` 클릭과 `tel:` 연락처 클릭을 집계한다.
- 파라미터: `job_id`, `method: chat | phone`, `item_variant: native`, `surface: job_detail`
- 외부 수집 공고의 전화 문의는 이벤트를 보내지 않는다.
- 전화번호 자체와 채팅방 ID는 절대 보내지 않는다.
- 데스크톱·모바일에 같은 CTA가 중복 렌더되므로 공용 핸들러에서 한 번만 발화하게 한다.

이번 PR에서는 문의 버튼 클릭 의도까지만 집계한다. 실제 신규 채팅방 생성 성공을 GA4 `generate_lead`로 세려면 `startFromJobPost`가 기존 방 반환과 새 방 생성을 구분하는 `created` 값을 내려야 한다. 현재 API는 둘을 같은 room 응답으로 반환하므로 반복 입장을 신규 리드로 잘못 세지 않도록 성공 전환 이벤트는 후속 작업으로 남긴다.

### 6. 인증 성공

GA4 권장 이벤트를 성공 콜백에서만 보낸다.

- 로그인 성공: `login`, `method: email | username`
- 회원가입 성공: `sign_up`, `method: email`
- 실패·검증 오류·모드 전환 클릭은 집계하지 않는다.
- 이메일, 로그인 아이디, 닉네임, 인증 결과값은 보내지 않는다.

## 구현 구조

### 공통 전송 계층

`apps/web/src/lib/bambi/ga.ts`

- `window.gtag` 조회와 try/catch no-op 처리를 공통화한다.
- 이벤트 이름과 파라미터만 받는 `sendGaEvent`를 제공한다.
- 서버 렌더링, 로컬·프리뷰, GA 차단 환경에서 예외를 전파하지 않는다.
- 기존 `ga-promotion.ts`의 중복 gtag 조회 코드는 이 계층을 사용하도록 이동한다.

### 프로모션 계층

`apps/web/src/lib/bambi/ga-promotion.ts`

- 프리미엄 하드코딩을 `PromotionDefinition`(`id`, `name`) 기반으로 일반화한다.
- 프리미엄 기존 payload는 바꾸지 않는다.
- `special-list`, `recommended-list` 정의와 자체 공고 판정 함수를 추가한다.

`apps/web/src/components/bambi/visual-job-card.tsx`

- 카드가 자신의 목록·순번·프로모션 정의를 알 수 있도록 선택적 analytics context를 받는다.
- 하나의 클릭 핸들러에서 필요한 `select_promotion`·`select_item`을 먼저 보내고 기존 `onOpen`을 호출한다.
- 급구에는 analytics context를 넘기지 않는다.

`apps/web/src/components/bambi/visual-job-exposure-sections.tsx`

- 스페셜·추천·전체 섹션에 고정 `item_list_id`와 순번을 내려준다.
- 스페셜·추천 자체 공고에만 프로모션 정의를 내려준다.
- 급구 섹션은 UI는 유지하되 analytics prop을 넘기지 않는다.
- 전체 공고 추가 페이지의 신규 item 범위를 구분해 노출 이벤트 중복을 막는다.

### 목록·상세·상호작용 계층

`apps/web/src/lib/bambi/ga-job.ts`

- Job을 GA item으로 변환하는 순수 함수와 `view_item_list`·`select_item`·`view_item` 전송 함수를 둔다.
- 급구 제외는 호출부와 헬퍼 양쪽에서 방어한다.

`apps/web/src/lib/bambi/use-promotion-impression.ts`

- 기존 50% 옵저버를 스페셜·추천 프로모션과 공고 목록 노출이 함께 사용한다.
- 카드 컴포넌트 마운트당 한 번만 발화하며, 필터 변경으로 카드가 교체되어 다시 실제 노출되면 새 노출로 집계한다.

`apps/web/src/lib/bambi/ga-interaction.ts`

- `filter_change`, `load_more`, `navigation_click`, `contact_intent`, `login`, `sign_up`의 허용 파라미터를 타입으로 고정한다.
- 임의 문자열과 PII가 호출부에서 섞이지 않도록 이벤트별 전용 함수를 제공한다.

### 주요 와이어링 대상

- `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`
- `apps/web/src/components/bambi/visual-job-card.tsx`
- `apps/web/src/components/bambi/job-search-command.tsx`
- `apps/web/src/components/bambi/marketplace.tsx`
- `apps/web/src/components/bambi/home-community-section.tsx`
- `apps/web/src/components/bambi/community-board-preview.tsx`
- `apps/web/src/app/seeker/jobs/[id]/page.tsx`
- `apps/web/src/app/seeker/jobs/crawled/[id]/page.tsx`
- `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- `apps/web/src/components/bambi/screens/seeker-crawled-job-detail.tsx`
- `apps/web/src/components/bambi/auth/auth-panel.tsx`

## GA4 보고서·관리 설정

코드 배포 후 다음을 확인한다.

- 프로모션 보고서의 상품 프로모션 이름에 `프리미엄 배너`, `스페셜 채용`, `추천 채용` 3행이 나타나는지 확인한다.
- 상품 이름 또는 상품 ID 차원으로 `select_item`을 조회해 가장 많이 선택된 공고를 확인한다.
- 상품 목록 이름 차원으로 스페셜·추천·전체·검색 결과별 노출과 선택을 비교한다.
- 커스텀 이벤트 파라미터를 세부 보고서에서 사용하려면 GA 관리 화면에 이벤트 범위 맞춤 측정기준을 등록한다:
  - `surface`
  - `filter_name`
  - `filter_value`
  - `link_type`
  - `content_type`
  - `method`
- 배포 직후 DebugView 또는 실시간 보고서에서 이벤트 이름과 payload를 먼저 검증한 뒤 탐색 보고서를 만든다.

## 개인정보·데이터 품질 원칙

- 사용자 계정 식별자와 연락처를 GA에 보내지 않는다.
- 검색창 원문, 최소 급여 원문, 게시글 제목, 업소 전화번호처럼 자유 입력 또는 개인정보가 될 수 있는 값은 제외한다.
- 공고 ID·게시글 ID는 공개 콘텐츠 식별자로만 사용하며 사용자 ID와 결합하지 않는다.
- 같은 클릭에 의미가 다른 두 권장 이벤트가 필요할 수 있지만 같은 이벤트를 중복 발화하지 않는다.
- 이벤트 전송 실패는 렌더링, 필터 변경, 상세 이동, 인증 성공을 막지 않는다.
- 기존 개인정보 처리방침의 서비스 이용 기록(공고 노출·조회·클릭 등 통계 목적) 범위 안에서 동작하며 광고 개인화 신호는 계속 비활성 상태로 유지한다.

## 제외 범위

- 급구 채용 관련 모든 신규 이벤트
- 운영자·구인자 콘솔 클릭 분석
- 신고·차단·알림 확인처럼 민감하거나 운영 목적이 불명확한 클릭
- 모든 버튼을 자동 수집하는 전역 click listener
- 원문 검색어·전화번호·사용자 ID·이메일·닉네임 전송
- 실제 채팅방 신규 생성 성공(`generate_lead`) — API가 신규/기존 방을 구분할 때 후속
- 광고 구매·결제 전환과 구직자 클릭의 직접 attribution
- GA 측정 ID 환경변수 이관, GTM, Consent Mode 개편
- DB·Drizzle migration

## 테스트 계획

### 순수 단위 테스트

- 프리미엄 기존 payload 회귀 방지
- 스페셜·추천 promotion definition과 item-level promotion 파라미터
- 자체 공고는 프로모션 대상, 외부 수집·급구·빈 슬롯은 제외
- Job → GA item 변환 및 목록별 `item_list_id`·index
- 검색 결과에서 원문 검색어가 payload에 포함되지 않음
- contact 이벤트에 전화번호·채팅방 ID가 포함되지 않음
- gtag·window 부재 및 gtag 예외 시 no-op

### 옵저버 테스트

- 50% 진입 전 미발화, 진입 후 한 번 발화
- 재렌더·ref 재부착에서 동일 카드의 중복 발화 방지
- 더보기로 추가된 카드가 실제로 보일 때만 새 `view_item_list` 발화
- 급구 섹션은 observer를 만들지 않음

### 와이어링 테스트

- 스페셜·추천에 promotion/list context가 연결되고 급구에는 연결되지 않음
- 공고 카드·검색 결과·상세·더보기·필터·수다방 링크·문의 CTA·인증 성공 연결 확인
- 프리미엄 좌·중앙·우 기존 14개 지면 문자열 유지

### 정적·수동 검증

- web TypeScript, 관련 vitest, Ultracite/Biome 통과
- production 배포 후 GA4 DebugView에서 각 이벤트 payload 확인
- GA4 프로모션 보고서에서 스페셜·추천 행 생성과 급구 행 부재 확인
- 자체 공고에서는 대상 이벤트가 발생하고 외부 수집 공고에서는 어떤 신규 GA 이벤트도 발생하지 않는지 확인
- 모바일·데스크톱에서 이벤트 추가가 클릭·내비게이션을 지연시키지 않는지 확인

## 구현 순서

1. 공통 `sendGaEvent`와 기존 프리미엄 회귀 테스트
2. 프로모션 정의 일반화 및 스페셜·추천 노출·클릭 연결
3. 공고 item list·선택·상세 이벤트와 검색 결과 연결
4. 더보기·필터·수다방·문의 의도 이벤트 연결
5. 로그인·회원가입 성공 이벤트 연결
6. 단위·옵저버·와이어링 테스트 및 문서 검증 결과 갱신
7. PR 직전 최신 `develop` 재반영 후 전체 검사

## 완료 기준

- GA4 프로모션 보고서에서 프리미엄·스페셜·추천을 구분할 수 있고 급구는 나타나지 않는다.
- 스페셜·추천 프로모션은 자체 등록·결제 공고만 집계된다.
- 가장 많이 선택된 공고와 스페셜·추천·전체·검색 목록별 선택 차이를 확인할 수 있다.
- 공고 상세 조회, 더보기, 필터, 수다방 진입, 채팅·전화 문의 의도, 로그인·회원가입 성공을 PII 없이 분석할 수 있다.
- 기존 프리미엄 이벤트 payload와 사용자 내비게이션 동작이 유지된다.
- DB 변경 없이 웹 중심으로 구현되고 TypeScript·테스트·lint를 통과한다.

## 구현 및 검증 결과

- 공통 GA 전송 헬퍼와 프로모션·공고·상호작용 이벤트 헬퍼를 구현했다.
- `/seeker`의 스페셜·추천·전체 공고, 검색, 탐색 필터, 더보기, 커뮤니티 링크에 이벤트를 연결했다.
- 자체 공고인 스페셜·추천 카드에만 프로모션 이벤트를 연결하고 외부 수집 공고와 급구를 제외했다.
- 자체 공고 상세 조회·전화·채팅 진입 의도만 연결하고 외부 수집 공고와 급구는 제외했다.
- 로그인과 프로필 생성까지 끝난 회원가입 성공 이벤트를 연결했다.
- `pnpm --filter web check-types`: 통과
- `pnpm --filter web exec vitest run`: 83개 파일, 599개 테스트 통과
- `pnpm check`: 통과. 이번 작업과 무관한 기존 seed 스크립트 suppression 경고 2개만 남아 있다.
- `git diff --check`: 통과
- 실제 GA 수신 여부는 production 배포 후 DebugView/실시간 보고서에서 최종 확인한다.
