# 포인트몰(포인트 상점) 설계 (2026-08-19)

사용자가 출석체크·게시판 글/댓글 등으로 적립한 포인트로 아이템을 구매하는 포인트몰.
seeker 메인 nav(수다방·고객센터 사이)에 진입점을 만들고, 메인과 같은 3컬럼 배너
골격 아래 정사각 카드 그리드로 아이템을 노출한다. 아이템·주문은 운영자 콘솔에서
관리한다. 작업 브랜치: `feat/point-shop`.

## 확정 결정 사항 (브레인스토밍 Q&A)

| 질문 | 결정 |
| --- | --- |
| 구매(차감) 시 회원 등급 | **등급은 누적 적립 기준으로 분리** — 포인트몰 구매·환불은 등급에 중립 |
| 구매 이행 방식 | **주문 접수 → 운영자 수동 처리** (완료/취소, 취소 시 자동 환불) |
| 포인트몰 페이지 배너 | **seeker 메인과 동일 광고 인벤토리 재사용** + 우측 세로 배너 밑 1:1 상담 버튼 |
| 접근 범위 | **목록 공개, 구매만 로그인** (비로그인·게스트는 로그인 유도) |
| 운영자 nav 위치 | **광고·결제 그룹** (광고 상품·결제 관리 옆) |
| 구매 내역 위치 | **마이페이지 메뉴 추가** (`/seeker/me` 하위 페이지 신설) |
| 잔액 표시 위치 | **헤더 검색 버튼 왼쪽에 보유 포인트 칩** (포인트몰 페이지 진입 시) |

## 접근 방식

기존 포인트 원장(`bambi_point_transaction`)을 확장한다. 전용 지갑 테이블은 만들지
않는다 — 적립 경로(출석 `attendance`, 글/댓글 `community_*`, 운영자 지급/차감)가
전부 이 원장에 쌓이고 잔액은 행 합산으로 언제나 재계산 가능하므로, 구매(−)·환불(+)
reason 두 개만 추가하면 정합성 문제가 없다. 재고·배송지·다단계 상태 등 커머스식
파이프라인은 수동 이행 선택에 따라 도입하지 않는다(YAGNI, 후속 목록 참조).

## 1. DB 스키마 (`packages/db/src/schema/bambi.ts` + 마이그레이션 1건)

### bambi_point_shop_item — 판매 아이템

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| id | uuid PK defaultRandom | |
| name | text NOT NULL | 아이템명 |
| description | text | 선택 설명 |
| image_url | text | 공개 버킷 업로드 결과 URL(선택) |
| price_points | integer NOT NULL | 구매 포인트(양수) |
| sort_order | integer NOT NULL default 0 | 노출 정렬(오름차순) |
| is_active | boolean NOT NULL default true | 노출 토글 |
| created_at / updated_at | timestamp | |

재고 수량 컬럼은 두지 않는다 — 수동 이행이라 품절 시 운영자가 노출을 끄거나 주문을
취소하면 되고, 필요해지면 후속으로 추가한다.

### bambi_point_shop_order — 주문

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| id | uuid PK defaultRandom | |
| user_id | text NOT NULL → user.id (cascade) | 구매자 |
| item_id | uuid → item.id (**set null**) | 아이템 삭제 후에도 주문 보존 |
| item_name | text NOT NULL | 구매 시점 스냅샷 |
| price_points | integer NOT NULL | 구매 시점 스냅샷(차감액) |
| status | text NOT NULL default 'pending' | `pending` / `completed` / `canceled` |
| operator_memo | text | 운영자 처리 메모(취소 사유 등) |
| created_at | timestamp NOT NULL defaultNow | |
| processed_at | timestamp | 완료/취소 처리 시각 |

인덱스: `user_id`(내 구매 내역), `status`(운영자 pending 필터).
status는 기존 관행대로 text + 코드 상수로 두고, UI는 라벨 맵으로만 렌더한다.

### 마이그레이션

drizzle-kit generate로 1건 생성(테이블 2개). 실행은 사용자 지시 시 워크플로우
메모(적용 검증 필수)를 따른다. **배포 전 운영 DB migrate 필수.**

## 2. 포인트 규칙 — 등급 산식 분리

- `POINT_REASONS`(`packages/api/src/services/bambi-member-points.ts`)에
  `shop: { purchase: "point_shop_purchase", refund: "point_shop_refund" }` 추가.
- **등급 기준 포인트 = 포인트몰 reason 두 개를 제외한 원장 합계.**
  - 구매(−)·환불(+)이 등급에 중립이 된다.
  - 글/댓글 삭제 회수(`*_revoke`, 음수)는 기존대로 등급에서 빠진다 — "양수만 합산"
    방식이었다면 회수가 등급에 반영되지 않는 함정이 있었다.
  - 구현: `getPointBalances`류 합산 쿼리에 `reason NOT IN (...)` 조건을 건
    `getGradeBasisPoints`(가칭)를 추가하고, 등급 조회 지점(`loadGradeBadges`,
    출석·마이페이지 등급 표시, 게시판 뱃지)을 이 함수로 교체한다.
- **잔액(구매 가능 포인트) = 전체 행 합산** 그대로 유지. 화면의 "보유 포인트"는
  잔액이다.
- **보유 상한(cap, `site_settings.max_member_points`)은 잔액 기준 유지.** 구매로
  잔액이 줄면 다시 적립할 수 있다 — "보유 상한"의 자연스러운 의미. 이에 따라 등급
  기준 포인트는 cap을 넘어 계속 자랄 수 있다(의도된 동작, `isPointsCapAllowed`
  가드는 그대로 유효).

## 3. API (`packages/api/src/routers/bambi/point-shop.ts` 신설)

### 공개

- `listItems`: `is_active`만, `sort_order` 오름차순. 이미지·이름·설명·가격.

### 회원(protected)

- `purchase({ itemId })`: 트랜잭션 안에서
  1. `pg_advisory_xact_lock`(사용자 키) — 동시 구매로 잔액이 음수가 되는 레이스
     차단(리스팅 정원 락에서 검증된 패턴 재사용).
  2. 아이템 존재·active 확인, 잔액 ≥ 가격 검증(부족 시 명시 에러).
  3. 주문 insert(스냅샷 포함) + 원장에 `point_shop_purchase` −가격 행.
- `myOrders`: 내 주문 목록(최신순, 상태 포함).

### 운영자(moderator)

- 아이템: `listItemsAdmin`(비노출 포함) / `createItem` / `updateItem` /
  `deleteItem` / 정렬·노출 토글(update로 흡수).
- 주문: `listOrders({ status? })`, `completeOrder({ orderId })`,
  `cancelOrder({ orderId, memo })` — 취소 시 같은 트랜잭션에서
  `point_shop_refund` +가격 행으로 환불. **pending에서만 전이 허용**(멱등 가드,
  완료↔취소 재전이 금지).
- 이미지 업로드: 기존 공개 버킷 signed upload(`bambi-storage` 서비스) 재사용.

### 서비스 분리·테스트

잔액 검증(`canPurchase`)·상태 전이 가드(`canTransitionOrder`) 등 순수 함수를
`packages/api/src/services/bambi-point-shop.ts`로 분리하고
`packages/api/test/services/bambi-point-shop.test.ts`에서 유닛 테스트한다.
라우터 테스트는 만들지 않는다(dev DB를 지우는 기존 함정).

라우터는 `routers/bambi/index.ts`에 `pointShop`으로 등록한다.

## 4. seeker 웹 — `/point-shop`

### 라우트 (계획 단계 조정 — 2026-08-19)

당초 `/seeker/point-shop`으로 잡았으나 조사 결과 **`/seeker/*` 하위는 목록 공개가
불가능**하다: edge 미들웨어 게이트(`resolve-gate.ts`)가 anon을 `/seeker` 루트 외
전부 로그인으로 리다이렉트하고, `seeker/layout.tsx`가 anon의 children을
`SeekerAuthGateScreen`으로 대체하는데 layout은 pathname을 알 수 없어 예외를 못
둔다. 따라서 `/support`·`/board`·`/jobs` 선례대로 **최상위 라우트 `/point-shop`**
+ 자체 layout(`ResponsiveAppShell variant="seeker"` — `/support`와 동일 패턴) +
`resolve-gate.ts`의 `PUBLIC_PREFIXES`에 `"/point-shop"` 추가로 연다.

### nav

`DEFAULT_NAV_ITEMS`(`responsive-shell.tsx`)의 수다방·고객센터 사이에
`{ href: "/point-shop", label: "포인트몰" }` 삽입. 목록 공개이므로
비로그인(public) 셸에도 그대로 노출된다(의도).

### 헤더 — 보유 포인트 칩

- 포인트몰 layout이 `ResponsiveAppShell`의 headerSlot/mobileHeaderSlot에
  **보유 포인트 칩 + 검색창**을 넘긴다. 칩은 검색창 **왼쪽**, 회원에게만
  표시(비로그인·게스트 미표시).
- 헤더 검색은 메인과 같은 공고 검색(`SeekerHeaderSearch`) 재사용 — 현재는
  마켓플레이스 전용인데 포인트몰에도 함께 켠다. ※ "검색 버튼 왼쪽" 요청을
  충족하기 위한 기본값 결정 — 검색창 없이 칩만 원하면 분기에서 검색만 빼면 된다.
- 칩: `Badge`/칩 형태로 "1,234 P"식 표기, 잔액 쿼리는 구매 후 invalidate로 갱신.

### 페이지 골격 (메인 `SeekerMarketplaceScreen`과 동일 3컬럼)

- 좌 259px aside: `HorizontalAdBannerRail` — 메인과 같은 인벤토리,
  promotionSurface `point_shop_left`. (메인의 "빠른 탐색" 필터 카드는 없음)
- 중앙 `SEEKER_CONTENT_WIDTH`: `PremiumAdBannerSection`(`point_shop_center`) →
  아래 아이템 그리드.
- 우 259px aside: `AdBannerRail`(`point_shop_right`) + **바로 밑 "1:1 상담"
  버튼**. 기존 `SupportChatWidget`의 열림 상태가 컴포넌트 내부 `useState`라,
  커스텀 이벤트(예: `bambi:open-support-chat`) 리스너를 위젯에 추가하는 소규모
  리팩터 후 버튼이 이벤트를 쏴서 위젯을 연다.
- 양쪽 aside는 기존 규칙대로 `min-[1720px]`에서만 노출, sticky.

### 아이템 그리드

- 섹션 헤더: "포인트 아이템" 제목만 — 잔액은 헤더 칩으로 일원화(중복 표시 없음).
- 스페셜/추천과 같은 `grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4`.
  카드는 `aspect-square`(이미지 + 이름 + 가격 뱃지) — 고정폭 컨테이너에서 xl
  4열이면 자연히 약 259×259가 된다(임의 px 하드코딩 없음, 데스크톱 최소 3열
  규칙 충족). 아이템이 4개를 넘으면 행이 늘어난다.
- 빈 상태: `Empty`(아이템 없음 안내). 로딩: `Skeleton` 카드 한 행.

### 구매 플로우

- 카드 클릭 → 확인 `Dialog`(이미지·이름·설명·가격·내 잔액) → 구매 버튼 →
  `purchase` 호출 → `toast` + 잔액·목록 invalidate.
- 비로그인·게스트가 구매 버튼을 누르면 기존 로그인 게이트(`?auth=login`)로 유도.
- 잔액 부족: 구매 버튼 비활성 + 부족분 안내.

### 모바일

카드 1열(기본 grid-cols-1), 배너 aside는 기존과 동일하게 초광폭 전용이라 자동
비노출. **하단 탭바는 켠다** — `/support` layout 선례처럼 포인트몰 layout이
`MobileTabBar homeHref="/seeker"`를 직접 붙인다(탭바 없이 진입하면 모바일에서
되돌아갈 길이 없는 막다른 길 함정 방지). `mobile-tab-bar.tsx`의 어느 탭에도 속하지
않는 경로 분기(`value = "none"`)에 `/point-shop`을 추가해 "탐색" 탭이 잘못
활성화되지 않게 한다.

## 5. 마이페이지 — 구매 내역

- `/seeker/me` 메뉴에 "포인트 구매 내역" 항목 추가(기존 신고 내역·차단 목록과
  같은 하위 페이지 패턴), 라우트 `/seeker/me/point-orders`.
- `myOrders` 목록: 아이템명·차감 포인트·상태(라벨 맵)·주문일·처리일. 취소 건은
  환불 표시.
- 회원 전용(마이페이지 기존 게이트 그대로).

## 6. 운영자 웹 — `/moderator/point-shop`

- `MODERATOR_NAV_ITEMS` **광고·결제 그룹**에 `{ href: "/moderator/point-shop",
  label: "포인트몰" }` 추가(결제 관리 아래).
- 페이지는 탭 2개:
  - **아이템 관리**: shadcn Table — 이미지 썸네일·이름·가격·노출 여부·정렬.
    추가/수정 Dialog(이름·설명·이미지 업로드·가격·노출·정렬), 삭제는 확인
    다이얼로그(주문은 스냅샷으로 보존됨을 안내).
  - **주문 관리**: 기본 `pending` 필터(전체/완료/취소 전환). 행 액션
    완료 처리 / 취소 처리(메모 입력 → 자동 환불). 구매자 표시는 기존 운영자
    화면의 사용자 표기 관행을 따른다.
- 주문 status는 `PointShopOrderStatus` 라벨 맵(`*_LABELS`)으로만 렌더
  (enum 원값 화면 노출 금지 규칙).

## 7. 검증·부수 작업

- 검증은 ultracite lint + typecheck. 개발 서버 기동·스크린샷 없음(시각 확인은
  사용자).
- 순수 로직 유닛 테스트: `packages/api/test/services/bambi-point-shop.test.ts`.
  web 테스트가 필요하면 `apps/web/test` 미러 구조.
- 등급 산식 변경이 닿는 기존 화면(출석 패널, 마이페이지, 게시판 등급 뱃지) 표기
  일관성 확인.
- 매뉴얼 동기화: 구직자 매뉴얼(포인트몰 이용·구매 내역), 운영자 매뉴얼(아이템·
  주문 관리).

## 8. 이연(후속) 목록

- 아이템 재고 수량·품절 표시.
- 구매 즉시 자동 지급(쿠폰 코드 등 디지털 상품).
- 주문 상태 변경 알림(완료/취소 시 사용자 알림).
- 포인트몰 전용 배너 인벤토리(현재는 메인 재사용).
- 구매 확인 외 상세 페이지(현재는 Dialog로 충분).

## 9. 배포 체크리스트

- [ ] 운영 DB migrate(신규 테이블 2개) — journal 순서·워터마크 확인.
- [ ] 운영자 아이템 등록 전까지 포인트몰 페이지는 빈 상태 노출(정상).
