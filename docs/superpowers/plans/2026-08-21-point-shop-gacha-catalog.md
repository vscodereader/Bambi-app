# 포인트몰 동적 진열·랜덤 뽑기·아이템 보상 통합 설계 및 구현 계획

> 작성일: 2026-08-21
> 작업 브랜치: `feat/point-shop-gacha-catalog`
> 관련 이슈: #234
> 기준: PR #233 (`ff03265c`)이 `develop`에 병합된 직후의 코드와 DB migration `0108`까지
> 실제 PR 전 필수: 최신 `origin/develop` 재반영, migration 번호 및 충돌 재확인
> 커밋·푸시·머지: 사용자가 직접 수행하며 구현자는 임의로 실행하지 않는다.

## 1. 목표

현재 포인트몰과 출석·후기·끌어올리기 구조를 재사용해 다음 기능을 하나의 통합 브랜치와 PR로 제공한다.

1. 출석 화면의 등급 아이콘을 원본 비율과 전체 형상을 유지한 채 잘리지 않게 표시한다.
2. 구직자·구인자가 보유 뽑기권으로 100% 포인트 당첨 랜덤 뽑기를 이용한다.
3. 구직자는 실제 달력일 기준 7일 연속 출석마다 뽑기권 1장을 받는다.
4. 구인자는 완료 면접을 가진 구직자 후기가 72시간 동안 삭제·숨김되지 않으면 공고 최초 작성자 계정으로 뽑기권 1장을 받는다.
5. 포인트몰에서 추가 뽑기권과 출석 복구권, 기존 끌어올리기 혜택을 상품으로 판매한다.
6. 운영자가 포인트몰 분류·행 순서·상품·인기상품 순서·뽑기 당첨표를 코드 배포 없이 관리한다.
7. 보유한 사용형 아이템, 포인트몰 구매 내역, 아이템 획득·사용 내역을 사용자 화면에서 확인한다.

## 2. 확정 정책

### 2.1 공통

- 대상 회원은 `job_seeker`, `employer`다. 운영자·법률자문·게스트는 뽑기와 아이템 보유 대상이 아니다.
- 서버의 한국 시간(KST) 달력일과 서버 시각만 신뢰한다. 클라이언트 시각으로 출석·72시간·지급 여부를 판정하지 않는다.
- 하드코딩된 상품·가격·이미지·당첨 포인트·당첨 확률을 두지 않는다. 운영자 DB 설정이 정본이다.
- 기존 포인트 원장 `bambi_point_transaction`, 포인트 상한, 알림, 공개 스토리지 업로드, 포인트몰 주문, 끌어올리기 혜택을 재사용한다.
- 모든 지급·차감·사용은 DB 트랜잭션과 계정 단위 advisory lock, 고유 `external_key`로 동시 요청과 재시도 중복을 막는다.
- `db:push`는 사용하지 않는다. Drizzle schema와 generate된 migration만 사용한다.

### 2.2 등급 아이콘

- 아이콘 원본 파일과 원본 종횡비를 유지한다.
- 아이콘 자체 크기를 줄여 문제를 숨기지 않는다.
- `GradeIcon`의 렌더 박스와 상위 `Badge`의 line-height/padding/overflow를 조정해 위·아래가 잘리지 않게 한다.
- `object-contain`, `shrink-0`, 명시적 정사각 렌더 박스를 유지한다. 강제 crop, 음수 margin, `overflow-hidden`으로 자르지 않는다.
- 출석 요약뿐 아니라 동일 `GradeBadge`를 쓰는 게시글·댓글·프로필에서도 회귀가 없어야 한다.

### 2.3 연속 출석 뽑기권

- 달력 주간이나 가입일 기준이 아니라 실제 출석 날짜가 끊기지 않은 연속 횟수로 센다.
- 예: 12·13·14·15·16·17·18일에 출석하면 18일 체크인 완료 시 1장을 지급한다.
- 연속 출석이 이어지면 7·14·21·28일째마다 각각 1장을 지급한다.
- 하루라도 비면 그 연속 구간은 끊기고 다음 출석일부터 새로 센다.
- 이 보상은 `job_seeker` 전용이다. 기존 출석 기능을 이용하는 `employer`에게는 연속 출석 뽑기권을 지급하지 않는다.
- 같은 7일 달력 구간은 일반 체크인 재시도, 복구, 배치 재실행으로 중복 보상하지 않는다.
- 출석 일반 포인트는 기존대로 실제 당일 체크인에만 지급한다.
- 기능 배포 이전의 현재 연속 출석 횟수는 0으로 초기화한다. 배포 당시 10일 연속 출석 중이어도 배포 후 실제 체크인을 7일 더 연속으로 해야 첫 장을 받는다.
- 기능 배포 이전의 출석 행은 migration에서 `streak_reward_eligible=false`로 표시해 보상 계산에서 제외한다. 배포 후 생성되는 실제 체크인·복구 출석만 true이며, 이 eligible 날짜끼리 7일 연속일 때 지급한다.
- 배포 후 복구권을 실제 소비해 과거 날짜를 새로 복구한 경우는 배포 후 행동이므로 `streak_reward_eligible=true`다. 복구한 eligible 날짜 7개가 달력상 연속되면 과거 날짜여도 지급하지만, 배포 전 기존 출석일을 섞어 7일을 채우지는 않는다.

### 2.4 출석 복구권

- 구직자 전용 사용형 아이템이다. 포인트몰에서 운영자가 등록한 가격·이미지로 반복 구매할 수 있다.
- 유효기간은 없다.
- 과거의 미출석일이라면 기간 제한 없이 선택 가능하다. 실제 출석 기록이 전혀 없는 과거 날짜도 복구할 수 있다.
- 오늘과 미래 날짜는 복구할 수 없다. 이미 출석한 날짜도 선택할 수 없다.
- 한 번 사용할 때 복구권 1개를 차감하고 날짜 1개만 선택할 수 있다. 복수 선택 UI와 복수 날짜 API 입력을 만들지 않는다.
- 복구권이 여러 개면 같은 주 또는 다른 기간에 절차를 여러 번 반복할 수 있다.
- 복구 출석은 `bambi_attendance` 기록에는 포함되지만 해당 날짜의 일반 출석 포인트는 지급하지 않는다.
- 복구로 연속 7일 단위가 새로 완성되면 그 즉시 뽑기권 1장을 지급하고 알림을 보낸다.
- 복구권 여러 장으로 과거의 빈 7일을 모두 채우는 것도 허용하며, 일곱 번째 날짜를 채운 순간 보상한다.

### 2.5 후기 유지 뽑기권

- 기존 후기 작성 조건을 재사용한다. 구직자만 작성하며, 해당 채팅방에 `completed` 면접 일정이 하나 이상 있어야 한다.
- 기존 `(job_post_id, reviewer_user_id)` unique index를 유지하므로 구직자는 공고 1개당 후기 1개만 작성한다.
- 같은 채팅방에서 면접 일정을 여러 번 보내거나 여러 일정을 완료해도 후기 한 건당 보상은 최대 1장이다.
- 후기 작성 즉시 보상하지 않는다. `created_at + 72시간`이 지난 뒤 상태가 계속 공개 상태일 때 지급한다.
- 단순 신고 접수만으로는 지급을 막지 않는다. 72시간 안에 후기가 삭제되거나 숨김·비공개 상태가 된 경우 지급하지 않는다.
- 72시간 안에 삭제·숨김된 후 나중에 복구·재공개되어도 보상하지 않는다. 최초 72시간 유지 조건은 다시 시작하지 않는다.
- 72시간을 통과해 지급된 뒤 후기 상태가 바뀌어도 뽑기권은 회수하지 않는다.
- 수령자는 조직 전체나 면접 처리자가 아니라 해당 공고의 최초 작성자 구인자 계정이다.
- 공고 작성자가 탈퇴·정지되었거나 더 이상 활성 구인자 계정이 아니면 지급하지 않고 실패 사유를 감사 이력에 남긴다. 계정 복귀 후 지연 지급하지 않으며 다른 조직원에게도 대체 지급하지 않는다.
- 기능 배포 전에 작성된 기존 후기에는 소급 지급하지 않는다. 배포 이후 생성되는 후기부터 reward 대상 행을 만든다.

### 2.6 뽑기

- 구직자·구인자 모두 이용할 수 있다.
- 유효기간 없는 공통 뽑기권 잔액에서 1회당 정확히 1장을 차감한다.
- 뽑기권이 없거나 활성 당첨 설정이 없으면 서버와 UI 모두 뽑기를 거부한다.
- 모든 활성 당첨 항목은 포인트가 1 이상이고 가중치가 1 이상이어야 한다.
- 운영자는 당첨 포인트와 가중치를 여러 개 추가·수정·삭제·활성화할 수 있다. 확률은 활성 가중치 합계 대비 비율로 계산한다.
- 당첨 설정이 없으면 “운영자가 뽑기 보상을 준비 중입니다”를 표시하고 버튼을 비활성화한다.
- 포인트 상한은 PR #233 이후의 기존 `awardMemberPoints` 규칙을 그대로 적용한다. 상한에 도달했거나 당첨액 전체를 받을 공간이 없어도 뽑기는 허용하고 뽑기권 1장을 소비한다. 결과 화면과 알림에는 설정상 당첨액이 아니라 상한 범위 안에서 실제 적립된 금액을 표시한다.
- 1회 요청의 결과는 서버가 먼저 원자적으로 확정한다. 브라우저 애니메이션이나 새로고침이 결과를 바꾸지 않는다.
- 클라이언트가 생성한 요청 ID를 멱등키로 사용한다. 응답 유실 후 같은 요청 ID로 재시도하면 이미 확정된 동일 결과를 반환한다.
- 당첨 결과와 당첨 설정 스냅샷, 실제 적립 포인트, 사용한 뽑기권, 결과 시각을 감사 이력으로 보존한다.

### 2.7 포인트몰 분류와 상품

- 초기 분류는 위에서부터 `인기상품`, `상품권`, `기타 아이템`이다.
- `인기상품`은 시스템 고정 분류로 항상 1행에 위치하며 삭제하거나 다른 행으로 옮길 수 없다.
- 인기상품 한 분류가 첫 번째 행 전체를 사용한다. “1열 고정”은 인기상품 카드 한 개만 표시한다는 뜻이 아니라 분류 행을 다른 분류와 나누지 않는다는 뜻이다.
- 운영자는 공개 상품 중 인기상품 대상을 복수 선택하고 인기상품 내부 순서를 드래그로 직접 관리한다.
- 인기상품 외 분류는 운영자가 생성·이름 수정·삭제·드래그 재정렬할 수 있다.
- `행 추가`는 마지막에 빈 배치 행을 만든다. `분류 만들기`는 새 분류를 만들고 선택한 행 또는 마지막 행에 배치한다.
- 분류를 특정 위치 앞에 놓으면 그 위치부터 뒤 분류가 한 행씩 밀린다. 뒤에 놓으면 앞 분류는 유지되고 뒤쪽만 밀린다.
- 한 분류는 항상 한 행 전체를 사용하며 한 행에 여러 분류를 병렬 배치하지 않는다.
- 사용자 화면에서 인기상품 외 각 분류 내부 상품은 공개 상품만 가격 오름차순, 같은 가격이면 안정적인 생성 순서와 ID 순으로 표시한다.
- 상품은 하나의 기본 분류에 속한다. 인기상품 선정은 기본 분류를 바꾸지 않는 별도 관계다.
- 상품 가격은 0 이상이다. 공개된 0P 상품도 제한 없이 반복 구매할 수 있다.
- 상품 공개 토글을 끄면 가격과 관계없이 사용자 포인트몰에서 상품 전체를 숨긴다. 다시 켜면 원래 분류에 재노출한다.
- 상품 삭제 시 기존 주문·구매 스냅샷·아이템 이력은 보존하고 관계의 FK만 `set null` 처리한다.
- `상품권`은 표시 분류일 뿐이며 쿠폰 코드 자동 발급 시스템을 추가하지 않는다.
- 저장소에 기존 상품 행이 실제로 존재하면 `기타 아이템`으로 이관한다. 행이 없으면 이관하지 않는다.

### 2.8 상품 이미지

- 기존 포인트몰 signed upload와 공개 스토리지를 재사용한다.
- JPG, PNG, WebP의 기존 허용 규칙과 서버 검증을 재사용한다.
- 사용자 상품 카드와 운영자 편집 미리보기는 동일한 `PointShopProductImage` 컴포넌트를 사용한다.
- 기본은 원본 종횡비 유지, `object-contain`, 잘림·왜곡 없음이다.
- 카드가 정한 반응형 이미지 영역 안에서만 축소되며 업로드 원본 픽셀 크기를 그대로 레이아웃 크기로 사용하지 않는다.
- 극단적인 종횡비에서는 작은 가장자리 crop을 허용할 수 있도록 컴포넌트의 표시 모드를 확장 가능하게 설계하되, 이번 기본값은 `contain`이다.
- 임의 픽셀 크기를 상품 데이터에 하드코딩하지 않는다. 기존 Tailwind spacing/aspect/grid 토큰과 컨테이너 크기로 반응형 표시한다.

### 2.9 내 아이템과 이력

- `내 아이템`에는 포인트몰에서 구매했거나 행동 보상으로 얻은 모든 현재 사용 가능 기능성 아이템을 표시한다. 뽑기권·출석 복구권·수동 끌어올리기 1회·수동 끌어올리기 횟수권·기간제 수동 끌어올리기·기간제 자동 끌어올리기·광고 연장 혜택이 포함된다.
- 이미 사용·취소·만료된 기능성 아이템은 현재 `내 아이템`에서는 빠지고 구매 내역 또는 아이템 획득·사용 내역에 남는다. 운영자 수동 지급이 필요한 일반 상품은 사용형 아이템이 아니므로 구매 내역에서 처리한다.
- `구매 내역`에는 포인트몰에서 구매한 모든 상품을 가격 0P 포함해 표시한다.
- `아이템 획득·사용 내역`을 별도로 제공한다.
  - 출석·후기 보상 뽑기권: 획득 내역에만 표시
  - 포인트몰 구매 뽑기권·복구권: 구매 내역과 획득 내역 모두 표시
  - 뽑기·출석 복구 사용: 사용 내역에 표시
- 뽑기권과 출석 복구권은 수량형 아이템 원장 합계로 잔액을 계산한다. 별도 mutable balance 컬럼을 두지 않는다.
- 기존 끌어올리기 혜택 주문은 기존 `owned/used` 주문 모델을 유지하고 통합 조회에서 함께 조합한다.

## 3. 기존 코드 재사용 지도

| 기능 | 재사용 대상 | 확장 내용 |
| --- | --- | --- |
| 등급 아이콘 | `apps/web/src/components/bambi/grade-badge.tsx` | 공용 `GradeIcon`의 렌더 박스/상위 배지 overflow 수정 |
| 출석 기록 | `bambi_attendance`, `attendanceRouter.checkIn/getMine` | 출석 출처, 과거 복구, 7일 보상 reconcile 추가 |
| 연속 날짜 계산 | `packages/api/src/services/bambi-attendance.ts` | 연속 구간·7일 보상 entitlement 순수 함수 확장 |
| 포인트 적립 | `awardMemberPoints`, `bambi_point_transaction` | 뽑기 실제 적립과 멱등키 추가 |
| 포인트 상한 | PR #233 반영 `bambi-point-ledger` | 실제 적립액 반환 규칙 그대로 사용 |
| 알림 | `notifyBambiNotification`, notification label/deep-link | 출석 7일 완성, 후기 72시간 보상, 뽑기 결과 추가 |
| 후기 조건 | `reviewsRouter.create`, review unique index | 72시간 보상 대상 생성과 배치 판정 |
| 주기 작업 | `apps/server/src/plugins/point-shop-expiry.ts` 패턴 | 후기 보상 만기 tick/plugin 추가 |
| 포인트몰 | `bambi_point_shop_item/order`, `pointShopRouter` | 분류, 인기상품, 신규 혜택 유형, 0P 자동 지급 확장 |
| 끌어올리기 | 기존 `boost_*` benefit와 `UseBenefitDialog` | 그대로 유지하고 새 관리 UI에 노출 |
| 상품 이미지 | 운영자 포인트몰 signed upload | 공용 반응형 미리보기 컴포넌트로 통합 |
| 행 배치 | 수다방 홈 `community-boards` 행 배치 UI/API | 드래그 삽입·뒤 행 밀기·Accordion 구조 재사용 |
| 사용자 이력 | `PointOrdersCard`, `MyBenefitsCard` | 수량형 아이템 원장/이력 결합 |

## 4. 데이터 모델

실제 migration 번호는 PR #233 병합 후 최신 `develop`을 fetch한 다음 `packages/db/src/migrations`와 journal을 확인하여 결정한다. 현재 가정상 다음 번호는 `0109`지만 파일명은 `drizzle-kit generate` 결과만 사용한다.

### 4.1 `bambi_attendance` 확장

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `source` | text 또는 enum, NOT NULL default `check_in` | `check_in` / `restore_ticket` |
| `restored_by_item_transaction_id` | uuid nullable | 복구 사용 원장과 감사 연결 |
| `streak_reward_eligible` | boolean NOT NULL default true | 배포 전 기존 행은 false, 배포 후 체크인·복구는 true |

- 기존 행은 `check_in`, `streak_reward_eligible=false`로 이관한다. 컬럼 추가 migration은 기존 행 false backfill 후 새 행 default true가 되도록 SQL 순서를 직접 검토한다.
- 복합 PK `(user_id, attended_on)`를 유지해 실제·복구 출석 중복을 DB가 막는다.
- 복구 행에는 일반 출석 포인트 원장을 만들지 않는다.

### 4.2 `bambi_member_item_transaction` 신규

수량형 아이템의 변경 불가능한 원장이다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | defaultRandom |
| `user_id` | text FK user | cascade |
| `item_type` | enum | `draw_ticket`, `attendance_restore_ticket` |
| `quantity` | integer | 획득 양수, 사용 음수, 0 금지 |
| `reason` | enum/text | `attendance_streak`, `employer_review_retained`, `point_shop_purchase`, `draw_use`, `attendance_restore_use`, `admin_adjustment` |
| `external_key` | text unique | 지급·사용 멱등키 |
| `point_shop_order_id` | uuid nullable FK | 구매 연결, 주문 삭제 시 set null |
| `reference_type` | text nullable | `attendance_streak_claim`, `review`, `draw`, `attendance` 등 |
| `reference_id` | text nullable | 원본 식별자 |
| `description` | text nullable | 사용자 표시 스냅샷 |
| `balance_after` | integer | 거래 직후 해당 아이템 잔액 |
| `created_at` | timestamp | defaultNow |

인덱스:

- `(user_id, item_type, created_at)` — 잔액·이력
- `external_key UNIQUE` — 중복 지급/사용 방지
- `point_shop_order_id` — 구매 연결

잔액은 원장 합계가 정본이며, 트랜잭션 안에서 계정·아이템 advisory lock 후 음수 방지 검증을 한다.

### 4.3 `bambi_attendance_streak_claim` 신규

이미 지급한 7일 블록을 보존한다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | text FK | cascade |
| `run_start_on` | date | 지급 계산 당시 연결된 연속 구간 시작 |
| `run_end_on` | date | 지급 계산 당시 연결된 연속 구간 끝 |
| `trigger_attended_on` | date | 보상을 새로 완성시킨 실제/복구 날짜 |
| `item_transaction_id` | uuid unique FK | 지급된 뽑기권 원장 |
| `created_at` | timestamp | |

- eligible 날짜 하나가 추가될 때 그 날짜를 포함하는 현재 eligible 연속 구간을 계산한다. `streak_reward_eligible=false`인 기존 출석은 구간 계산에서 제외한다.
- `entitled = floor(연속 구간 날짜 수 / 7)`.
- 해당 구간 안에서 이미 존재하는 claim 수를 빼고 부족한 수만 지급한다.
- attendance 사용자 advisory lock 안에서 계산해 동시 실제 체크인·복구가 겹쳐도 중복 지급하지 않는다.
- 출석 기록은 삭제하지 않으므로 지급 claim도 회수하지 않는다.

### 4.4 `bambi_review_draw_reward` 신규

후기 72시간 보상의 대상과 최종 판정 감사 이력이다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `review_id` | uuid PK/FK review | 후기당 1회 |
| `recipient_user_id` | text FK user | 공고 최초 작성자 스냅샷 |
| `eligible_at` | timestamp | review.createdAt + 72시간 |
| `status` | text/enum | `pending`, `awarded`, `disqualified` |
| `disqualified_reason` | text nullable | 삭제·숨김·수령자 비활성 등 |
| `item_transaction_id` | uuid nullable unique FK | 실제 뽑기권 지급 |
| `processed_at` | timestamp nullable | |
| `created_at` | timestamp | |

- 후기 생성 트랜잭션에서 대상 행을 함께 만든다.
- 생성 시점의 `job_post.created_by_user_id`를 수령자로 스냅샷한다. 실제 컬럼명이 다르면 기존 공고 최초 작성자 필드를 사용하며 새 중복 소유자 컬럼을 만들지 않는다.
- 후기 상태가 72시간 전에 삭제·숨김되면 `disqualified`로 영구 확정한다.
- 배치 시점에도 상태와 수령자 활성 역할을 다시 확인한다.
- `review_id` PK와 아이템 원장 external key `review_draw_ticket:<reviewId>`가 이중 멱등 가드다.

### 4.5 `bambi_point_draw_prize` 신규

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | |
| `points` | integer | 1 이상 |
| `weight` | integer | 1 이상 |
| `is_active` | boolean | default true |
| `sort_order` | integer | 운영자 목록용 |
| `created_at`, `updated_at` | timestamp | |

- 초기 당첨 행을 하드코딩하거나 migration으로 임의 생성하지 않는다.
- 활성 행이 없으면 뽑기 기능은 준비 중 상태다.
- 운영자 화면에는 가중치 합계로 계산한 예상 확률을 표시하되 서버 선택은 저장된 정수 가중치를 사용한다.

### 4.6 `bambi_point_draw` 신규

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | |
| `request_id` | uuid | 클라이언트 멱등 요청 ID |
| `user_id` | text FK | |
| `prize_id` | uuid nullable FK | 설정 삭제 후 이력 보존을 위해 set null |
| `prize_points_snapshot` | integer | 당첨 설정 스냅샷 |
| `prize_weight_snapshot` | integer | 감사용 |
| `awarded_points` | integer | 상한 적용 후 실제 적립액 |
| `ticket_transaction_id` | uuid unique FK | -1 사용 원장 |
| `point_transaction_id` | uuid nullable unique FK | 실제 포인트 원장 |
| `created_at` | timestamp | |

제약:

- `(user_id, request_id) UNIQUE`.
- 결과는 insert 후 변경하지 않는다.

### 4.7 포인트몰 분류

`bambi_point_shop_layout_row`:

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | 빈 행도 독립적으로 식별 |
| `position` | integer unique | 0부터 조밀한 행 순서 |
| `category_id` | uuid nullable unique FK category | null이면 운영자가 추가한 빈 행 |
| `created_at`, `updated_at` | timestamp | |

- `행 추가`는 `category_id=null`인 마지막 layout row를 실제 DB에 저장한다.
- 분류를 빈 행에 놓으면 그 row의 `category_id`만 채운다.
- 분류를 기존 분류 앞·뒤에 삽입하면 대상 위치부터 layout row의 position을 한 칸씩 민다.
- 빈 행 삭제와 분류 제거는 별개다. 분류를 행에서 빼면 행은 빈 상태로 남길 수 있다.
- 인기상품용 layout row는 position 0이며 삭제·이동·비우기를 서버가 거부한다.

`bambi_point_shop_category`:

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | uuid PK | |
| `key` | text unique | 시스템 식별자, 사용자 화면 직접 노출 금지 |
| `name` | text | 운영자 표시/사용자 제목 |
| `kind` | enum | `featured`, `standard` |
| `is_active` | boolean | 분류 공개 여부 |
| `created_at`, `updated_at` | timestamp | |

- migration에서 `featured`/`인기상품`, `gift-card`/`상품권`, `other`/`기타 아이템` 세 분류를 idempotent하게 생성한다.
- `featured` kind는 정확히 하나이며 position 0의 고정 layout row가 참조하도록 서버가 강제한다.
- standard 분류 삽입/이동/삭제 시 layout row position을 한 트랜잭션에서 0부터 조밀하게 재번호화한다.
- 분류 삭제는 소속 상품이 있으면 거부하고 이동할 분류를 선택하도록 안내한다. 상품을 암묵적으로 삭제하지 않는다.

`bambi_point_shop_item` 확장:

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `category_id` | uuid FK category | 기본 분류, featured 이외 필수 |

- 기존 `sort_order`는 일반 분류 사용자 정렬에 사용하지 않는다. 가격 오름차순이 정본이다.
- 기존 행은 `other` category로 backfill한 뒤 NOT NULL 적용한다.
- `price_points` 입력/API 검증을 양수에서 0 이상으로 변경한다.
- benefit enum에 `draw_ticket`, `attendance_restore_ticket`을 추가한다.
- 두 수량형 benefit은 구매 즉시 주문을 `completed`로 만들고 아이템 원장 +1을 같은 트랜잭션에서 기록한다.
- `attendance_restore_ticket`은 audience가 반드시 `job_seeker`; `draw_ticket`은 `all`, `job_seeker`, `employer` 모두 허용한다.

`bambi_point_shop_featured_item`:

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `item_id` | uuid PK/FK item | cascade |
| `position` | integer unique | 0부터 조밀한 순서 |
| `created_at` | timestamp | |

- 비공개·삭제 상품은 사용자 인기상품 조회에서 제외한다.
- 운영자 설정 관계는 보존하거나 삭제 시 cascade하며, 재공개만으로 임의 인기상품 복원은 하지 않는다.

## 5. 서버 도메인 로직

### 5.1 아이템 원장 서비스

신규 `packages/api/src/services/bambi-member-items.ts`에 다음을 둔다.

- `ITEM_TYPES`, `ITEM_TRANSACTION_REASONS`, 화면 라벨 매핑용 공용 타입
- `acquireMemberItemLock(tx, userId, itemType)`
- `getMemberItemBalances(userId)`
- `adjustMemberItem(tx, { userId, itemType, quantity, reason, externalKey, ... })`
- `resolveItemBalance` 순수 함수
- 음수 잔액 거부, 0 수량 거부, external key conflict 시 기존 결과 반환

포인트몰 구매, 출석, 후기 배치, 뽑기, 복구는 이 서비스만 통해 수량을 변경한다.

### 5.2 출석 보상 reconcile

신규/확장 순수 함수:

- 정렬된 `YYYY-MM-DD` 목록을 연속 구간으로 분리
- 새 날짜를 포함하는 연속 구간 찾기
- `floor(runLength / 7)` entitlement 계산
- 기존 claim 수 대비 신규 claim 필요 여부 계산
- KST 날짜 비교와 과거 날짜 검증

`checkIn` 트랜잭션 순서:

1. 기존 계정 출석 lock 획득.
2. 오늘 출석 insert `onConflictDoNothing`.
3. 실제 신규 출석이면 기존 attendance 포인트 지급.
4. 출석 날짜 목록과 claim 조회 후 streak reward reconcile.
5. 새 7일 claim이 있으면 뽑기권 +1과 claim insert.
6. 트랜잭션 완료 후 출석 성공/7일 완성 알림 발송.

복구 mutation 순서:

1. 입력은 단일 `attendedOn`만 허용.
2. KST 오늘보다 과거인지 검증.
3. 계정·attendance·restore item lock 획득.
4. 복구권 잔액 확인 및 -1 원장 기록.
5. `bambi_attendance`에 `restore_ticket` source로 insert. 이미 출석이면 전체 rollback.
6. 일반 포인트 지급 없이 streak reward reconcile.
7. 새 claim이면 뽑기권 +1.
8. commit 후 복구 완료와 7일 완성 알림.

### 5.3 후기 72시간 배치

- 후기 생성 시 즉시 공개되는 기존 정책과 `policyResult.status`를 유지한다.
- 생성 트랜잭션에서 완료 면접 검증 뒤 reward pending 행을 함께 만든다.
- 작성자 삭제와 운영자 숨김·삭제 등 review가 `published`를 벗어나는 모든 기존 상태 변경 경로에서, 아직 `pending`인 reward 행을 같은 트랜잭션으로 즉시 `disqualified` 처리한다. 단순 신고 생성 경로에는 이 처리를 넣지 않는다.
- 이 상태 전이 훅이 72시간 안의 일시적인 숨김도 영구 기록하므로, 만기 전에 다시 published로 복구돼도 지급 대상이 되지 않는다.
- 서버 plugin이 짧은 주기로 `eligible_at <= now`, `status=pending`을 제한된 batch 크기로 처리한다.
- `FOR UPDATE SKIP LOCKED` 또는 기존 배치의 안전한 claim 패턴을 사용해 다중 서버 중복 처리를 막는다.
- 72시간 전에 review가 published를 벗어난 상태가 확인되면 영구 `disqualified`.
- 72시간 시점 published이며 공고 최초 작성자가 활성 employer면 아이템 원장 +1 후 `awarded`.
- mere report row 존재 여부는 판정에 포함하지 않는다.
- 지급 후 후기 상태 변경은 원장과 reward 행을 수정하지 않는다.

### 5.4 weighted draw

- 활성 prize를 안정적인 ID 순서로 읽는다.
- 누적 정수 가중치 선택 순수 함수는 경계값 테스트가 가능하도록 RNG 값을 인자로 받는다.
- 실제 API에서는 암호학적으로 안전한 서버 난수원을 사용한다. `Math.random()`을 결과 판정에 사용하지 않는다.
- 사용자·draw lock → 기존 `(user, requestId)` 결과 확인 → 뽑기권 잔액 확인 → prize 선택 → 뽑기권 -1 → 포인트 지급 → draw insert 순으로 한 트랜잭션에서 수행한다.
- 포인트 상한으로 실제 적립액이 0이어도 유효한 뽑기 결과이며 티켓은 소비된다. UI에는 “보유 한도로 인해 실제 적립 0P”를 명확히 표시한다.
- commit 후 결과 알림을 보내며 알림 실패가 draw transaction을 되돌리지 않는다.

### 5.5 포인트몰 구매

- 기존 계정 advisory lock과 포인트 잔액 검증을 유지한다.
- 가격 0은 잔액 원장에 의미 없는 0원 차감 행을 만들지 않되 주문은 항상 생성한다.
- 가격 양수는 기존 `point_shop_purchase` 원장과 등급 중립 규칙을 유지한다.
- 수량형 benefit은 주문 생성과 동시에 `completed`, `processedAt`을 설정하고 item transaction +1을 만든다.
- 기존 `none`, `coupon`은 수동 `pending`; 기존 boost/ad benefit은 `owned` 흐름을 유지한다.
- 무료 반복 구매를 서버에서 막는 계정당 제한을 추가하지 않는다. 설정된 재고가 있으면 기존 재고 제한만 적용한다.

## 6. API 계약

### 6.1 `pointShop`

기존 라우터를 확장한다.

사용자/공개:

- `listCatalog`: 공개 분류와 상품을 반환. featured는 운영자 순서, standard는 가격 오름차순.
- `purchase`: category와 무관하게 기존 item ID 구매. 수량형 혜택 자동 지급 결과 포함.
- `myInventory`: 수량형 잔액 + 기존 owned benefit을 통합 반환.
- `myItemTransactions`: 획득/사용 이력 cursor pagination.
- `myOrders`: 기존 구매 내역 유지.

운영자:

- category `adminListCategories/createCategory/updateCategory/removeCategory/saveCategoryRows`
- featured `adminGetFeatured/saveFeaturedOrder`
- item CRUD에 `categoryId`, 0P, 신규 benefit type 추가
- prize `adminListDrawPrizes/createDrawPrize/updateDrawPrize/removeDrawPrize`

모든 입력은 Zod로 ID, 이름 길이, 정수 범위, 중복, 관계, 역할을 서버에서 재검증한다.

### 6.2 `attendance`

- `getMine`: 현재 월 출석일에 실제/복구 source, 보유 복구권, 보유 뽑기권, 현재 연속일, 다음 보상까지 남은 연속일을 반환.
- `restoreDate({ attendedOn })`: 단일 날짜만 받는다.
- `checkIn`: 신규 뽑기권 지급 여부와 현재 뽑기권 잔액을 반환.

### 6.3 `pointDraw`

- `getState`: 보유 뽑기권, 활성 prize 존재 여부, 홍보 문구용 최대 활성 당첨 포인트, 최근 미표시 결과(optional recovery)를 반환.
- `draw({ requestId })`: 확정 결과, 실제 적립액, 남은 티켓, draw ID를 반환.
- 결과 조회는 본인 draw만 허용한다.

## 7. 사용자 웹 UI

### 7.1 등급 아이콘

- 출석 요약 카드의 현재 행 높이를 아이콘 원본이 잘리지 않는 방향으로 조정한다.
- 텍스트 baseline과 아이콘 중앙 정렬을 유지한다.
- 모바일 좁은 폭에서는 포인트/등급/다음 등급이 자연스럽게 wrap되며 아이콘을 축소하지 않는다.

### 7.2 포인트몰 카탈로그

- `/point-shop`의 기존 배너 레일·잔액 칩·구매 Dialog를 유지한다.
- 중앙 카탈로그는 `인기상품` → 운영자 standard 분류 행 순서로 렌더한다.
- 분류별 제목과 상품 grid를 사용하며 한 분류가 전체 행을 차지한다.
- standard 상품은 가격 오름차순, featured는 운영자 순서다.
- 비공개 분류·비공개 상품은 렌더하지 않는다.
- 0P는 `0P`로 표시하고 정상 구매 가능하다.
- 상품 카드 이미지는 공용 반응형 이미지 컴포넌트를 사용한다.

### 7.3 뽑기 진입

- 데스크톱: 포인트몰 중앙 상단에 `포인트 랜덤 뽑기` 버튼을 제공한다.
- 모바일: 참고 이미지는 정보 구조 예시로만 사용한다. 새 햄버거 메뉴를 만들지 않고 포인트몰 화면 중앙 콘텐츠 최상단에 `포인트 랜덤 뽑기` 메뉴 카드와 `100% 포인트 당첨` 보조 문구를 제공한다.
- 둘 다 `/point-shop/draw`로 이동하며 별도 하드코딩된 외부 메뉴를 만들지 않는다.

### 7.4 뽑기 페이지

- 문구:
  - `100% 포인트 당첨!`
  - `포인트 랜덤 뽑기`
  - 말풍선 `행운의 {최대 활성 당첨 포인트} 포인트 주인공이 되어보세요`
- 말풍선은 제목의 `포` 부근에서 연결되는 시각적 배치로 만들되 좁은 화면에서 제목을 가리면 자연스럽게 아래로 흐른다.
- 최대 포인트는 활성 prize DB 값으로 계산한다. 설정이 없으면 금액 문구 대신 준비 중 안내를 쓴다.
- 뽑기 기계는 repo-native React/CSS/SVG 구성으로 만든다. 참고 이미지 자체나 Npay 상표를 복제하지 않는다.
- 투명한 볼 영역 안에 여러 가챠볼이 계속 움직인다. CSS keyframes의 시작 지연·이동 경로는 데이터 배열로 구성하되 당첨 판정과 무관한 장식이다.
- 남은 뽑기권 표시 아래에 뽑기 버튼을 둔다.
- 상태 머신: `idle → requesting → shaking → dispensing → opening → revealed`.
- 서버 결과를 받은 뒤 기계가 위아래로 들썩이고, 선택된 볼 하나가 검은 출구로 이동해 열리며 실제 적립 포인트를 표시한다.
- 애니메이션 중 중복 클릭과 페이지 이탈 경고를 처리한다. API 멱등키로 실제 중복 차감은 서버가 막는다.
- `prefers-reduced-motion`이면 흔들림·이동을 짧은 fade/scale로 대체하되 결과와 단계 안내는 동일하다.
- 화면 낭독기에 진행 상태와 결과를 `aria-live`로 알리고 장식 볼은 접근성 트리에서 제외한다.

### 7.5 출석 복구 UI

- 기존 출석 달력과 `buildMonthGrid`, 월 이동 UI를 재사용한다.
- 출석한 날짜는 기존 회색 톤, 미출석 과거 날짜는 선명한 전경색으로 표시한다.
- 복구권 사용 Dialog에서 미출석 과거 날짜 하나만 radio-like 단일 선택한다.
- 이미 출석한 날짜, 오늘, 미래 날짜는 선택할 수 없다.
- 선택 전 저장 비활성, 저장 중 재클릭 비활성.
- 성공 후 달력·연속일·아이템 잔액·알림 쿼리를 갱신한다.

### 7.6 내 아이템/이력

- 구직자·구인자의 기존 포인트 내역 화면에서 `내 아이템`, `구매 내역`, `아이템 획득·사용 내역`을 Accordion/Card로 제공한다.
- 수량형 아이템은 아이콘/상품 이미지, 이름, 보유 수량, 사용 버튼을 표시한다.
- 복구권 사용은 구직자에게만 보인다.
- 뽑기권 사용은 뽑기 페이지 진입으로 연결한다.
- 기존 boost benefit 사용 Dialog와 주문 취소 흐름은 그대로 재사용한다.

## 8. 운영자 UI

운영자 내비게이션의 포인트 관리 아래 `포인트몰 설정` 진입점을 추가한다. 기존 `/moderator/point-shop`을 확장하고 중복 관리 페이지를 만들지 않는다.

### 8.1 포인트몰 위치 설정

- 상위 Accordion `포인트몰 위치 설정`.
- 수다방 홈 행 배치의 drag/drop, drop target, 뒤 항목 밀기, 저장 패턴을 재사용한다.
- 인기상품 1행은 고정·잠금 표시한다.
- standard 분류마다 독립된 한 행 카드와 drag handle을 표시한다.
- `행 추가`, `분류 만들기`, 분류 이름 수정, 공개 토글, 삭제를 제공한다.
- 저장 전 클라이언트 미리보기와 서버 검증 결과가 같은 배열 계약을 사용한다.
- 키보드 사용자에게 위/아래 이동 버튼을 함께 제공해 HTML5 drag만 강제하지 않는다.

### 8.2 인기상품 설정

- 공개 상품 목록에서 인기상품 포함 여부를 선택한다.
- 선택된 상품 목록을 drag로 재정렬한다.
- 비공개 상품은 선택할 수 없고 기존 선택 상품을 비공개로 바꾸면 사용자 화면에서 즉시 제외한다.
- 저장 시 position을 0부터 조밀하게 재작성한다.

### 8.3 포인트 상품 추가

- `포인트 상품 추가` 버튼.
- 사진 업로드, 이름, 설명, 기본 분류, 가격, 대상 역할, 혜택 유형, 혜택별 설정, 재고, 공개 토글을 입력한다.
- 뽑기권은 1회 충전, 출석 복구권은 1회 충전이라는 기능 단위를 서버 benefit type으로 연결한다. 상품명·이미지·가격은 운영자 입력값이다.
- 수동 끌어올리기 1회는 기존 `boost_manual_count`에 `boostCount=1`을 저장한다.
- 수동 횟수권, 기간제 수동, 기간제 자동은 기존 benefit spec 필드를 그대로 사용한다.

### 8.4 포인트 상품 관리

- 데스크톱과 모바일 모두 상위 상품 관리 Accordion 안에서 목록을 보여준다.
- 각 상품 행도 Accordion이며 펼치면 실제 사용자 카드와 동일한 이미지 미리보기, 분류, 이름, 설명, 가격, 대상, 혜택, 재고, 공개 토글을 표시한다.
- 수정 전 저장 버튼은 비활성, 실제 값이 달라졌을 때만 활성화한다.
- 저장 성공 후 목록·사용자 카탈로그 캐시를 갱신하고 수정값을 즉시 표시한다.
- 상품 삭제는 확인 Dialog를 거치며 과거 주문/이력 보존을 안내한다.
- 목록의 공개 열 옆에 즉시 토글을 제공한다. 편집 Accordion의 공개 값과 같은 서버 필드를 사용한다.
- 사용자와 운영자 화면이 같은 이미지 컴포넌트를 사용하므로 화면 폭에 따른 실제 표시 크기가 일치한다.

### 8.5 뽑기 설정

- 상위 Accordion `포인트 랜덤 뽑기 설정`.
- 당첨 행 추가/수정/삭제/활성 토글/운영자 목록 순서 변경.
- 각 행에 당첨 포인트, 가중치, 현재 활성 합계 기준 예상 확률을 표시한다.
- 활성 당첨이 0개이면 사용자 뽑기가 비활성화된다는 경고를 표시한다.
- 설정 변경은 이미 확정된 draw 결과에 영향을 주지 않는다.

## 9. 알림과 라벨

기존 notification target enum을 무분별하게 늘리지 않고 현재 `point_transaction` 및 `point_shop_order` 소비처를 우선 재사용한다. 아이템 원장 딥링크가 필요하면 migration에서 `member_item_transaction` target을 추가한다.

필요 알림:

- 구직자: `7일 연속 출석을 완료해 뽑기권 1장을 받았어요.`
- 구직자: `출석을 복구했어요.`
- 구직자: 복구로 7일 완성 시 위 두 결과를 중복 토스트로 난사하지 않고 하나의 통합 메시지로 표시.
- 구인자: `후기가 3일 동안 유지되어 뽑기권 1장을 받았어요.`
- 뽑기 사용자: `{실제 적립액}P에 당첨됐어요.`
- 포인트 상한으로 0P 적립이면 제한 사유를 별도 문구로 표시.

알림 label/deep-link 테스트를 갱신하고 구직자·구인자 모두 포인트/아이템 내역으로 이동할 수 있게 한다.

## 10. 보안·정합성·실패 처리

- 역할과 소유권은 서버에서 판정하며 UI 숨김을 권한으로 사용하지 않는다.
- draw 결과, 후기 72시간, 출석 날짜는 클라이언트 입력을 신뢰하지 않는다.
- 포인트와 아이템 lock 획득 순서를 모든 경로에서 동일하게 정해 교착을 피한다.
- 포인트몰 구매에서 포인트 lock → 아이템 lock 순서를 공통 규칙으로 사용하고 draw/restore도 필요한 lock을 같은 순서로 획득한다.
- 외부 알림은 DB commit 뒤 실행하며 실패해도 지급을 rollback하지 않는다. 기존 outbox가 없다면 로그와 재시도 가능한 멱등 metadata를 남긴다.
- 이미지 MIME/크기/스토리지 키는 기존 signed upload 검증을 통과해야 한다.
- 운영자 분류 재정렬은 제출된 모든 category ID의 존재·중복·featured 위치를 서버가 검증한다.
- 공개 0P 반복 구매는 확정 정책이므로 횟수 제한을 추가하지 않는다. 단, 동시 요청마다 별도 주문과 아이템 지급이 일어나는 것이 정상이다.
- prize weight 합계 overflow를 막도록 입력 상한과 안전 정수 합계를 검증한다.

## 11. 구현 태스크와 커밋 단위

각 태스크 완료 후 관련 설계 체크와 검증 결과를 이 문서에 갱신한다. 커밋은 사용자가 직접 수행한다.

### Task 1 — 등급 아이콘 잘림 수정

예상 파일:

- `apps/web/src/components/bambi/grade-badge.tsx`
- `apps/web/src/components/bambi/attendance-panel.tsx`
- 관련 web test

완료 조건:

- 원본 크기 축소 없이 전체 아이콘 표시
- 공용 소비처 회귀 없음
- 모바일 wrap 정상

커밋 메시지 예시:

`fix: 등급 아이콘 원본 비율과 전체 영역 표시`

### Task 2 — 아이템·출석 claim·후기 보상·뽑기·분류 DB

예상 파일:

- `packages/db/src/schema/bambi.ts`
- generate된 `packages/db/src/migrations/0109_*.sql` 및 meta (실제 번호 재확인)

완료 조건:

- schema/SQL/snapshot/journal 일치
- 기존 상품 other backfill 안전
- PR #233의 0107/0108 이후 번호
- `db:push` 미사용

커밋 메시지 예시:

`feat: 포인트몰 분류·아이템 원장·랜덤 뽑기 데이터 모델 추가`

### Task 3 — 아이템 원장과 연속 출석/복구 서비스

예상 파일:

- `packages/api/src/services/bambi-member-items.ts`
- `packages/api/src/services/bambi-attendance.ts`
- service tests

완료 조건:

- 7·14·21일 반복 지급
- 중간 결석 reset
- 과거 임의 날짜 복구와 7일 완성
- 복구 일반 포인트 미지급
- 동시 요청·재시도 멱등

커밋 메시지 예시:

`feat: 연속 출석 뽑기권과 과거 출석 복구 처리 추가`

### Task 4 — 후기 72시간 보상 배치

예상 파일:

- review router/service
- 신규 review reward service
- `apps/server/src/plugins/*`
- server 등록과 tests

완료 조건:

- 후기당 1회
- completed 면접 필수
- 공고 최초 작성자에게만 지급
- 72시간 전 삭제/숨김 영구 제외
- 신고만 존재하면 지급
- 72시간 후 상태 변경 시 회수 없음

커밋 메시지 예시:

`feat: 후기 3일 유지 시 공고 작성자 뽑기권 지급`

### Task 5 — 랜덤 뽑기 서버

예상 파일:

- `packages/api/src/services/bambi-point-draw.ts`
- `packages/api/src/routers/bambi/point-draw.ts`
- router index
- service tests

완료 조건:

- 운영자 가중치 설정
- 안전한 난수 선택
- 티켓 차감·포인트 적립·draw 기록 원자성
- request ID 멱등
- 실제 적립액 반환

커밋 메시지 예시:

`feat: 뽑기권 기반 포인트 랜덤 당첨 처리 추가`

### Task 6 — 포인트몰 동적 분류·상품·인기상품 API

예상 파일:

- point shop router/service/tests
- labels

완료 조건:

- featured 1행 고정
- standard drag 삽입과 조밀 순서
- 상품 category 지정
- 가격 0 반복 구매
- 인기상품 수동 순서
- 신규 티켓 benefit 자동 지급
- 기존 boost 혜택 회귀 없음

커밋 메시지 예시:

`feat: 포인트몰 동적 분류와 수량형 상품 구매 확장`

### Task 7 — 운영자 포인트몰 설정 UI

예상 파일:

- `apps/web/src/app/moderator/point-shop/page.tsx`의 책임별 컴포넌트 분리
- moderator navigation
- 공용 상품 이미지
- web tests

완료 조건:

- 위치 설정 Accordion
- 분류 drag/키보드 재정렬
- 상품 추가/목록 Accordion 편집/삭제/공개 토글
- 인기상품 선택과 drag 순서
- prize 관리와 예상 확률
- 반응형 실제 이미지 미리보기

커밋 메시지 예시:

`feat: 운영자 포인트몰 배치·상품·뽑기 설정 화면 추가`

### Task 8 — 사용자 카탈로그·내 아이템·복구 UI

예상 파일:

- point shop screen/components
- attendance panel/calendar
- my benefits/orders/item history
- seeker/employer page consumers
- web tests

완료 조건:

- 분류별 카탈로그와 가격 순서
- 인기상품 수동 순서
- 0P 구매
- 보유 수량/구매/획득·사용 이력
- 하루 단일 선택 복구
- 구직자·구인자 접근 차이

커밋 메시지 예시:

`feat: 포인트몰 카탈로그와 내 아이템·출석 복구 화면 추가`

### Task 9 — 뽑기 페이지와 애니메이션

예상 파일:

- `/point-shop/draw` route
- gacha machine React/CSS/SVG components
- 데스크톱 진입 버튼/모바일 상단 메뉴 카드
- animation/state tests

완료 조건:

- 지정 문구와 동적 최대 포인트 말풍선
- 움직이는 볼
- 흔들림 → 배출 → 개봉 → 결과
- 뽑기권 없을 때 거부
- reduced-motion·aria-live
- 새로고침/재시도 결과 보존

커밋 메시지 예시:

`feat: 반응형 포인트 랜덤 뽑기 화면과 애니메이션 추가`

### Task 10 — 알림·매뉴얼·통합 검증

예상 파일:

- notification labels/tests
- seeker/employer/moderator manuals
- 본 설계서 검증 체크

커밋 메시지 예시:

`docs: 포인트몰 뽑기·아이템 운영과 검증 결과 정리`

## 12. 테스트 계획

### 12.1 순수/서비스 테스트

- 연속 날짜 6/7/13/14/21 경계
- 결석 후 reset
- 복구로 7일 완성
- 빈 과거 7일을 복구권 7개로 채워 1장 지급
- 한 날짜 중복 복구 거부와 티켓 rollback
- 복구 일반 포인트 0
- claim 재실행 중복 없음
- 후기 71:59:59 미지급 / 72:00:00 지급
- 후기 신고만 존재 시 지급
- 후기 숨김/삭제 상태 전이와 reward disqualified가 같은 트랜잭션인지 검증, 복구 후에도 미지급
- 여러 completed schedule + 후기 1건 = 티켓 1장
- 같은 공고 후기 작성자 2명 = 공고 최초 작성자에게 총 2장
- 공고 7명 면접, 6명 completed, 후기 2명 = 2장
- weighted selector 경계, 비활성 prize 제외, 설정 없음 거부
- draw 동시 요청/동일 request ID 중복 차감 없음
- 포인트 상한 도달 시 actual award 0과 결과 보존
- 0P 상품 반복 구매마다 주문/아이템 +1
- featured 수동 순서, standard 가격 순서
- category 삽입 시 뒤 행 밀기와 featured 고정

### 12.2 타입·정적 검사

- `pnpm --filter @bambi-app/db check-types`
- `pnpm --filter @bambi-app/api check-types`
- `pnpm --filter server check-types`
- `pnpm --filter web check-types`
- 변경 파일 경로를 명시한 `pnpm dlx ultracite check ...`
- `git diff --check`

### 12.3 Drizzle

- 최신 migration 번호 재확인
- `pnpm --filter @bambi-app/db db:generate`
- 생성 SQL 직접 검토
- `pnpm --filter @bambi-app/db exec drizzle-kit check`
- 사용자가 허용한 dev DB에서만 `db:migrate`
- 적용 후 재 generate가 `No schema changes`
- 기존 상품이 0개인 DB와 기존 상품이 있는 DB 모두 backfill 검증
- 기존 출석 행이 `streak_reward_eligible=false`, 배포 후 신규 행이 true이고 기존 연속 기록과 무관하게 새 7일부터 지급하는지 검증
- 기존 후기에서 reward 행을 만들지 않는지 검증

### 12.4 수동 UI 검증

- 모바일/데스크톱 등급 아이콘 전체 표시
- 모바일 포인트몰 최상단 메뉴 카드와 데스크톱 버튼에서 뽑기 진입
- 뽑기 볼 상시 이동, 흔들림, 한 볼 배출, 개봉, 결과
- reduced-motion
- 운영자 분류 drag와 키보드 이동
- 분류 앞/뒤 삽입 시 뒤 행 밀기
- 상품 이미지 세로/가로/정사각 원본 contain
- 상품 저장 버튼 dirty 상태
- 공개 토글 즉시 반영
- 사용자 분류/상품 정렬
- 복구 달력 단일 선택과 여러 장 반복 사용
- 구직자/구인자 내 아이템·구매·아이템 이력

## 13. PR 전 체크리스트

- [ ] PR #233이 실제 `develop`에 병합됐는지 확인
- [ ] 최신 `origin/develop`을 브랜치에 반영
- [ ] 충돌 해결 후 `develop...HEAD`에 추가 반영 필요 커밋 0개 확인
- [ ] migration 번호·journal·snapshot 충돌 없음
- [ ] 본 문서의 구현·검증 체크박스 최신화
- [ ] worktree clean 및 로컬 HEAD/원격 head 확인
- [ ] 동기 CMU02의 최신 이슈·PR·커밋 형식 재확인
- [ ] PR 본문에 목적·작업 내용·DB 변경·검증 결과·배포 전 확인 작성
- [ ] `Closes #<issue>` 포함
- [ ] 사용자에게 커밋 단위별 PowerShell 명령과 제목+상세 본문 제공
- [ ] `--force` 없는 push 명령만 제공
- [ ] 구현자가 직접 커밋·푸시·머지하지 않음

## 14. 요구사항 추적표

| 사용자 요구 | 설계 위치 |
| --- | --- |
| 등급 아이콘 원본 크기 유지·잘림 제거 | 2.2, 7.1, Task 1 |
| 모바일/데스크톱 뽑기 진입 | 7.3 |
| 움직이는 볼·기계 흔들림·배출·개봉·포인트 결과 | 7.4, Task 9 |
| 뽑기권 없으면 불가 | 2.6, 5.4 |
| 구직자 7일 연속 출석 반복 보상 | 2.3, 5.2 |
| 구인자 completed 면접+후기 72시간 유지 | 2.5, 5.3 |
| 공고 1개 후기 작성자 수만큼 최초 작성자 지급 | 2.5, 12.1 |
| 당첨 문구와 1,000P 주인공 말풍선 | 7.4 (금액 DB 동적) |
| 인기상품/상품권/기타 아이템 | 2.7, 4.7 |
| 분류 추가·행 추가·드래그 삽입/밀기 | 2.7, 8.1 |
| 상품 사진·이름·분류·가격·저장 | 8.3 |
| 상품 Accordion 편집·삭제·공개 토글 | 8.4 |
| 반응형 원본 비율 이미지 | 2.8, 8.4 |
| standard 가격 오름차순 | 2.7, 7.2 |
| 인기상품 운영자 선택·수동 순서 | 2.7, 8.2 |
| 포인트 구매 뽑기권 | 4.7, 5.5 |
| 출석 복구권, 하루 단일 선택, 반복 사용 | 2.4, 5.2, 7.5 |
| 복구 일반 포인트 미지급 | 2.4, 5.2 |
| 과거 제한 없는 복구·빈 7일 생성 허용 | 2.4, 12.1 |
| 기존 끌어올리기 4종 판매 | 8.3 |
| 모든 아이템·구매·획득/사용 내역 | 2.9, 7.6 |
| 하드코딩 금지·기존 코드 재사용 | 2.1, 3, 전 섹션 |

## 15. 구현 및 검증 기록

### 구현 완료

- [x] Task 1 등급 아이콘 원본 비율·크기 유지와 배지 잘림 제거
- [x] Task 2 아이템 원장·출석 claim·후기 보상·뽑기·동적 분류 DB 모델
- [x] Task 3 구직자 배포 후 7일 연속 출석, 반복 지급, 과거 단일 날짜 복구
- [x] Task 4 후기 공개 72시간 유지 후 공고 최초 작성자 지급 배치와 상태 경합 잠금
- [x] Task 5 운영자 가중치 기반 랜덤 뽑기 서버, 멱등 요청, 실제 적립액 기록
- [x] Task 6 분류·빈 행·인기상품·0P·수량형 상품 구매 API
- [x] Task 7 운영자 위치·분류·인기상품·상품 Accordion·공개 토글·당첨 설정 UI
- [x] Task 8 사용자 분류 카탈로그·내 아이템·구매·획득/사용·복구 달력 UI
- [x] Task 9 뽑기 상단 진입 카드와 흔들림·배출·개봉·결과·reduced-motion
- [x] Task 10 알림 라벨·딥링크, 사용자 역할별 매뉴얼, 자동 검증

### DB 결과

- `0109_steep_drax`: 핵심 테이블·enum·분류 seed·기존 상품 other 이관·배포 전 출석 보상 제외
- `0110_dark_carnage`: `member_item_transaction` 알림 target 추가
- `db:push` 미사용
- `drizzle-kit check`: `Everything's fine`
- 재 `drizzle-kit generate`: `No schema changes`
- dev DB `db:migrate`: 사용자 허용 전이므로 미실행

### 자동 검증 결과

- DB/API/Server/Web TypeScript 검사 통과
- 변경 TS/TSX/JSON Ultracite 오류 0
- 뽑기 CSS Biome 오류 0
- API: 뽑기·출석·후기 72시간·기존 포인트몰 서비스 테스트 통과
- Web: 알림 라벨 및 뽑기 애니메이션·등급 배지 소스 회귀 테스트 통과
- Next.js production build 통과, `/point-shop/draw` 정적 경로 생성 확인
- 별도 dev 서버에서 데스크톱·390×844 모바일 실제 렌더 확인
- 뽑기 페이지 브라우저 console error/warning 0
- `git diff --check` 통과

### PR 직전 남은 절차

- PR #233 실제 merge 후 최신 `origin/develop` 재반영
- migration 번호·snapshot·journal 충돌 재확인
- 허용된 dev DB에서 migration 적용 후 실제 DB/API 동작 검증
- migration 적용 후 로그인된 구직자·구인자·운영자 계정으로 구매·복구·뽑기·운영자 저장 동작 검수
- 이 검증 결과를 본 문서와 PR 본문에 다시 기록
