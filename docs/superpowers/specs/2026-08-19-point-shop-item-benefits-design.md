# 포인트몰 아이템 혜택 연동 설계 (2026-08-19)

포인트몰(→ `2026-08-19-point-shop-design.md`)의 아이템을 실제 서비스 혜택과
연결해 세세하게 커스텀 등록할 수 있게 확장한다. 현행 "수동 지급"만 있던 아이템에
쿠폰 코드 자동 배정·끌어올리기(수동 기간제/수동 횟수권/자동 기간제)·광고 기간
연장을 얹는다. 끌어올리기 혜택은 끌올 옵션 스펙(→
`2026-08-10-job-boost-options-design.md`)의 `job_boost_purchase` 구매 단위를
그대로 재사용해 기존 끌올 자격 판정 v2·자동 끌올 스케줄러를 **무수정**으로 태운다.
작업 브랜치: `feat/point-shop`.

## 확정 결정 사항 (브레인스토밍 Q&A)

| 질문 | 결정 |
| --- | --- |
| 혜택 범위 | 6종: **수동 지급(현행 유지)·쿠폰 코드·수동 끌올 기간제·수동 끌올 횟수권·자동 끌올 기간제·광고 기간 연장** |
| 끌올·연장 이행 모델 | **보유·사용 2단계** — 구매 시 주문이 `owned`(보유함) → 마이페이지에서 대상 공고 선택 후 `used`. 즉시 자동 적용 아님 |
| 끌올 혜택 구현 근거 | 구매 시 `job_boost_purchase`에 paid 구매 행 스냅샷 생성 → 기존 자격 판정 v2·자동 끌올 스케줄러가 그대로 인식, **끌올 로직 무수정** |
| 쿠폰 코드 이행 | **구매 트랜잭션에서 미배정 코드 1개 자동 배정 → 주문 `owned`(코드 마스킹)** — 수동 처리 없음. 코드는 "번호 보기" 열람 게이트 뒤에 노출 |
| 취소·환불 | **사용(또는 쿠폰 번호 열람) 전에는 취소·환불 가능** — 포인트 전액 환불(`point_shop_refund` 원장 행) + 재고 복원. 사용/열람 후에는 불가. 수동 지급형은 현행대로 pending을 운영자 취소 시 환불 |
| 취소 주체 | 혜택형(쿠폰·끌올·연장)의 `owned` 건은 **구매자 본인이 보유함에서 취소** 가능 + 운영자도 주문 탭에서 **동일 서버 가드**로 취소 가능 |
| 쿠폰 열람 게이트 | 구매 시 코드 배정·`owned`이되 **코드 마스킹**. "쿠폰 번호 보기" 최초 클릭에 `revealed_at` 기록 후 노출 — **`revealed_at`이 찍히면 환불 불가**. 환불 시 코드 배정 해제(구입 대기 복귀, 재고 자동 복원) |
| 구매 대상(audience) | 아이템별 `all`/`employer`/`job_seeker` 지정 — **목록엔 모두 노출**, 구매 버튼·서버가 자격 검사. 혜택형(끌올·연장)은 공고 단위라 `job_seeker` 단독 지정 **금지**(폼+서버 검증) |
| 사용기한 | 보유·사용형(끌올·연장) 전용 `usage_limit_days`(구매 후 N일, null=무기한). **쿠폰 코드형은 외부 유효기간이라 미적용**(설명란 안내로 충분) |
| 대량 코드 등록 | textarea 줄 단위 + **CSV 파일 업로드만**(Excel 미지원 확정) — 브라우저에서 파싱해 서버엔 코드 배열 전달(의존성 추가 없음) |
| 쿠폰형 재고 | **`stock_quantity` 미적용(폼 disabled·서버 무시)** — 재고 = 미배정 코드 수 자동 산출. 수동 지급형·혜택형만 선택 재고 |
| 쿠폰 코드 상태 | **별도 상태 컬럼 없이 3단계 파생**: 구입 대기(`order_id` null) → 미사용(배정, `used_marked_at` null) → 사용 완료(`used_marked_at` 有, 구매자 자가 토글·해제 가능) |
| 동시성 | **최우선 검토 항목** — 동시 구매·코드 이중 배정·사용 이중 적용·운영자 노출 경합을 락/원자 연산으로 봉쇄(§5 별도 섹션) |
| 품절 | **파생 상태**(정본 판정) — 쿠폰형=미배정 코드 0, 재고 설정형=`stock_quantity` 소진, 무제한·미설정은 품절 없음. 표시 계층(품절 카드 UI)과 서버 정본 거부를 분리(§5·§6) |
| 재고 복원 | 취소·환불 시(수동 지급형·혜택형 공통) **재고 +1 복원**(같은 트랜잭션·조건부 원자 UPDATE). 쿠폰형은 코드 배정 해제로 미배정 코드 수가 자동 회복 |
| benefit_type 변경 잠금 | 판매 이력(주문 존재) 또는 등록 코드가 있는 아이템은 **benefit_type 변경 금지**(폼 비활성+서버 거부). 가격·이름·이미지 등은 자유 |
| 만료 포인트 소멸 | 만료된 보유(`owned`) 아이템은 **환불 불가**(만료 = 소멸, 의도된 정책). 기한 명시 고지 + 만료 임박 알림으로 갈음 |
| 만료 임박 알림 | 매일 1회 배치가 `usable_until`이 3일 이내(미래)인 `owned` 건 구매자에게 알림. 주문 `expiry_notified_at`로 1회만(멱등) |
| 역할 전환·조직 이탈 | 사용 시점 **자격 재검사로 거부** + 안내(회수·환불 없음). 단 이 경우 아직 미사용이므로 취소·환불은 가능 |
| 탈퇴 경고 | 회원 탈퇴 확인 다이얼로그에 **보유 아이템·쿠폰 소멸(복구 불가)** 경고 추가(주문이 `user` FK cascade라 실제 삭제됨) |
| 끌올 구매 출처 | 포인트몰발 끌올 구매는 `job_boost_purchase.purchase_source`에 **신규 `point_shop` 값**으로 기록 — `payment_method=null`·`amount=0`·`paid`, 운영자 결제 큐·목록에서 제외(포인트몰 주문 탭이 정본) |

## 1. 혜택 유형(benefit_type)과 스펙 필드

`benefit_type`별로 채우는 스펙 필드가 다르고 나머지는 null이다(끌올 옵션의 스냅샷
철학 동일 — 운영자가 아이템을 바꿔도 기존 주문·구매는 비소급).

| benefit_type | 의미 | 채우는 스펙 필드 | 이행 | 재고(`stock_quantity`) | `usage_limit_days` |
| --- | --- | --- | --- | --- | --- |
| `none` | 수동 지급(현행) | — | 운영자 수동(완료/취소·환불) | 선택 | 미적용 |
| `coupon_code` | 쿠폰 코드 풀 자동 배정 | — | 구매 시 코드 1개 배정·`owned`(마스킹) → 번호 열람 | **비활성(코드 수 종속)** | 미적용(외부 유효기간) |
| `boost_manual_period` | 수동 끌올 기간제 | `boosts_per_day`·`duration_days` | 보유 → 공고에 사용 | 선택 | 선택 |
| `boost_manual_count` | 수동 끌올 횟수권 | `boost_count` | 보유 → 공고에 사용 | 선택 | 선택 |
| `boost_auto_period` | 자동 끌올 기간제 | `boosts_per_day`·`duration_days` | 보유 → 공고에 사용 | 선택 | 선택 |
| `ad_extend` | 광고 기간 연장 | `extend_days` | 보유 → 공고에 사용 | 선택 | 선택 |

- 끌올 3종의 스펙 필드는 `job_boost_option`/`job_boost_purchase`와 같은 이름·의미
  (`boosts_per_day`·`duration_days`·`boost_count`)를 쓴다 — 사용 시 그대로 스냅샷
  복사할 수 있게 하기 위함.
- `audience`가 `job_seeker` 단독인 혜택형은 논리적으로 불가(공고를 가진 주체는
  구인자·조직) — 폼과 서버 양쪽에서 거부한다.

## 2. 데이터 모델 (`packages/db/src/schema/bambi.ts` + 마이그레이션 1건)

### 2.1 신설 pgEnum 2종

| enum | 값 |
| --- | --- |
| `point_shop_benefit_type` | `none` \| `coupon_code` \| `boost_manual_period` \| `boost_manual_count` \| `boost_auto_period` \| `ad_extend` |
| `point_shop_audience` | `all` \| `employer` \| `job_seeker` |

주문 상태는 **pgEnum이 아니다**(§2.3 참고) — 신설 enum은 이 둘뿐이다. 이와 별개로
기존 `job_boost_purchase_source` enum에 **`point_shop` 값을 추가**한다(포인트몰발
끌올 구매 출처 구분, §3.3·§7 — `ALTER TYPE ... ADD VALUE` 1건).

### 2.2 `bambi_point_shop_item` — 확장 컬럼

현행(확인함): `id`·`name`·`description`·`image_url`·`price_points`·`sort_order`·
`is_active`·`created_at`·`updated_at`. 아래를 추가한다(전부 nullable/기본값 → 기존 행
안전).

| 추가 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `benefit_type` | `point_shop_benefit_type` NOT NULL default `none` | 기존 행은 `none` 폴백 |
| `audience` | `point_shop_audience` NOT NULL default `all` | 목록 노출은 전원, 구매만 자격 검사 |
| `boosts_per_day` | integer null | 기간제(수동/자동) 전용 |
| `duration_days` | integer null | 기간제(수동/자동) 전용 |
| `boost_count` | integer null | 횟수권 전용 |
| `extend_days` | integer null | 광고 연장 전용 |
| `usage_limit_days` | integer null | 보유·사용형 사용기한(구매 후 N일). null=무기한. 쿠폰형은 미사용 |
| `stock_quantity` | integer null | null=무제한. 구매 시 조건부 원자 차감. **쿠폰형은 서버 무시** |

- `stock_quantity`는 수동 지급형·혜택형(끌올·연장)에서만 의미가 있다. 쿠폰형은
  폼에서 비활성·서버에서 무시하고, 노출·품절 판정은 **미배정 코드 수**로 대신한다.
- 스펙 필드 정합(유형별 필수/금지 조합)은 서버 순수 함수(`validateItemBenefitSpec`
  가칭)로 검증한다 — DB 제약이 아닌 애플리케이션 검증(끌올 옵션과 동일 관례).
- **benefit_type 변경 잠금**: 해당 아이템에 주문이 하나라도 있거나(판매 이력) 등록된
  쿠폰 코드가 있으면 `benefit_type` 변경을 금지한다(폼 비활성 + 서버 거부). 스냅샷
  정합이 깨지는 것을 막기 위함 — 가격·이름·이미지·노출·정렬·재고는 자유롭게 수정
  가능. 유형을 바꾸려면 새 아이템을 만든다.

### 2.3 `bambi_point_shop_order` — 확장 컬럼

현행(확인함): `id`·`user_id`(→`user.id` cascade)·`item_id`(→item set null)·
`item_name`·`price_points`·`status`(**`text` NOT NULL default `pending`**)·
`operator_memo`·`created_at`·`processed_at`. 인덱스 `user_id`·`status`.

**중요: `status`는 pgEnum이 아니라 `text` 컬럼이다.** 따라서 `owned`·`used` 추가는
`ALTER TYPE`이 아니라 코드 상수 배열(`POINT_SHOP_ORDER_STATUSES`)에 값을 더하는
것으로 끝난다 — 이 부분엔 DB 마이그레이션이 없다(§7).

| 추가 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `benefit_type` | `point_shop_benefit_type` NOT NULL default `none` | 구매 시점 스냅샷. 기존 행 `none` 폴백 |
| `boosts_per_day` | integer null | 혜택 스펙 스냅샷(끌올 기간제/자동) |
| `duration_days` | integer null | 혜택 스펙 스냅샷(끌올 기간제/자동) |
| `boost_count` | integer null | 혜택 스펙 스냅샷(끌올 횟수권) |
| `extend_days` | integer null | 혜택 스펙 스냅샷(광고 연장) |
| `usable_until` | timestamp null | 보유·사용형 사용기한 = 구매일 + `usage_limit_days`. null=무기한 |
| `used_at` | timestamp null | 보유 건을 실제 사용한 시각(≠ `processed_at`) |
| `target_job_post_id` | uuid null → `job_post.id` (**set null**) | 사용 대상 공고. 공고 삭제돼도 주문 이력 보존 |
| `revealed_at` | timestamp null | 쿠폰형 "쿠폰 번호 보기" 최초 클릭 시각. 세팅되면 환불 불가(코드 노출됨). 쿠폰형 외 null |
| `expiry_notified_at` | timestamp null | 만료 임박 알림 발송 시각(1회 멱등 가드). 미발송이면 null |

주문에 `revealed_at`을 두는 이유(설계 판단): 쿠폰형 주문은 배정 코드와 1:1이라
주문 행 하나가 취소·열람 경합의 단일 락 앵커가 된다(끌올·연장의 주문 `FOR UPDATE`
가드와 동일 패턴). 코드 행 대신 주문에 두어 잠금 대상을 일원화한다.

- 상태값(모두 `text`): `pending`·`completed`·`canceled`(현행) + `owned`·`used`(신규).
  - 수동 지급형: `pending → completed | canceled`(현행 그대로).
  - 쿠폰형: 구매 시 `owned`(코드 배정+마스킹) → 번호 열람 후에도 `owned` 유지
    (`revealed_at`로 열람만 구분) → 열람 전 취소 시 `canceled`. 별도 `used` 없음.
  - 끌올·연장형: 구매 시 `owned` → 사용 시 `used`, 사용 전 취소 시 `canceled`.
  - 취소(환불) 공통: `owned` ∧ 미사용/미열람 ∧ 미만료 → `canceled`(환불 원장 +
    재고/코드 복원). 만료·사용·열람 후에는 취소 불가(§3.4).
- `processed_at`은 수동 지급형의 완료/취소 처리 시각으로 남기고, 사용 시각은
  `used_at`으로 분리한다(의미 충돌 방지).
- 기존 행은 `benefit_type` `none` 폴백이라 **백필 불필요**.

### 2.4 `bambi_point_shop_item_coupon_code` — 쿠폰 코드 풀 (신설)

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | uuid PK defaultRandom | |
| `item_id` | uuid NOT NULL → `bambi_point_shop_item.id` (**cascade**) | 아이템 삭제 시 코드도 삭제 |
| `code` | text NOT NULL | 코드 원문 |
| `order_id` | uuid null → `bambi_point_shop_order.id` (**set null**) | 배정 시 세팅. null=구입 대기 |
| `assigned_at` | timestamp null | 배정 시각 |
| `used_marked_at` | timestamp null | 구매자 자가 "사용 완료" 표시 시각(해제 시 null 복귀) |
| `created_at` | timestamp NOT NULL defaultNow | |

- 인덱스: `(item_id, order_id)` — 미배정 코드 선점(§5)과 아이템별 재고 산출을 함께
  탄다. 상태 필터/관리 목록을 위해 `(item_id)` 단독도 커버된다.
- 아이템 내 코드 중복 방지: `unique(item_id, code)`로 DB 레벨에서도 막는다(입력 시
  중복 제거와 이중 방어).
- **코드 상태 3단계(파생, 별도 컬럼 없음)**:

  | 상태 | 판정 | 삭제 가능 | 화면 |
  | --- | --- | --- | --- |
  | 구입 대기 | `order_id IS NULL` | O(운영자) | 재고로 집계 |
  | 미사용 | `order_id` 有, `used_marked_at IS NULL` | X | 구매자에게 코드·복사·"사용 완료" 토글 |
  | 사용 완료 | `used_marked_at IS NOT NULL` | X | 사용 완료 뱃지, 구매자가 해제(→미사용) 가능 |

- 상태 라벨 맵(`POINT_SHOP_COUPON_CODE_STATUS_LABELS` 가칭)을 `lib/bambi`에 신설해
  운영자 관리 목록·구매자 화면에서 enum 원값 노출 금지 규칙을 지킨다.

## 3. 구매·보유·사용 흐름

### 3.1 수동 지급형(`none`) — 현행 유지

`pending` 주문 접수 → 운영자 완료/취소(취소 시 같은 트랜잭션 `point_shop_refund`
환불). `stock_quantity`가 설정돼 있으면 구매 시 원자 차감(§5). **취소·환불 시 재고
`+1` 복원**(같은 트랜잭션, 조건부 원자 UPDATE — `stock_quantity IS NOT NULL`인
아이템만). 그 외 흐름은 현행 그대로.

### 3.2 쿠폰 코드형(`coupon_code`)

1. 구매 트랜잭션에서 계정 락 획득 후 **미배정 코드 1행 선점**(`FOR UPDATE SKIP
   LOCKED`, §5) → 없으면 품절 에러.
2. 주문 insert(`status = owned`, benefit 스냅샷) → 코드 행에 `order_id`·
   `assigned_at` 세팅 → 원장 `point_shop_purchase` −가격.
3. **코드는 마스킹 표시**(보유함에서 "쿠폰 번호 보기" 전까지 노출 안 함).
4. **번호 열람 게이트**: "쿠폰 번호 보기" 최초 클릭 → 주문 행 `FOR UPDATE` 후
   `revealed_at` 세팅(멱등, 이미 있으면 유지) → 이후 코드 원문·복사 버튼·"사용 완료"
   토글(양방향, `markCouponUsed`) 노출.
5. **취소·환불**: `revealed_at`이 **없을 때만** 구매자/운영자가 취소 가능 →
   `point_shop_refund` +가격 환불 + **코드 배정 해제**(`order_id`·`assigned_at` null로
   되돌려 구입 대기 복귀 → 미배정 코드 수 자동 회복). `revealed_at`이 찍힌 뒤에는
   불가(코드가 이미 노출됨). 상세 정책·가드는 §3.4·§5.
6. 재고·품절: 미배정 코드 수로 노출/품절 표시. 운영자가 언제든 추가 충전.

### 3.3 끌올·광고 연장형(`boost_*`·`ad_extend`) — 보유·사용 2단계

**구매:**

- 계정 락 + (재고 있으면) 조건부 원자 차감 → 주문 insert
  `status = owned`, benefit 스냅샷, `usable_until = 구매일 + usage_limit_days`
  (null이면 무기한) → 원장 `point_shop_purchase` −가격.
- 구매 확인 다이얼로그: "구매 후 보유함에서 사용하며, **사용(쿠폰은 번호 확인)
  후에는 취소·환불이 불가**합니다" 명시(사용 전에는 취소 가능함도 함께 안내).

**사용(마이페이지 보유함 → "사용하기"):**

1. 대상 공고 선택 — 후보는 **자기 조직의 게시 중(`status=published` ∧
   `paymentStatus=paid`)·배너형 제외**(`AD_BANNER_EXPOSURE_TYPES`) 공고.
   광고 연장(`ad_extend`)은 추가로 **`exposure_ends_at`이 있는 공고만**(무기한 공고가
   기한부로 바뀌는 함정 차단 — 운영자 `adjustJobPostExposure`의 `?? now` 함정과 동일
   위험을 후보 단계에서 제거).
2. "사용하면 되돌릴 수 없습니다" 최종 확인.
3. **사용 시점 자격 재검사**: 구매 후 역할 전환(구인→구직)·조직 이탈로 대상 공고를
   가질 수 없게 된 경우 서버가 **사용을 거부**하고 안내 문구를 반환한다(적용된 것이
   없으니 회수 없음). 단 이때는 아직 미사용이므로 **보유함에서 취소·환불은 가능**
   (§3.4). 대상 공고 소유(자기 조직)·게시 중·배너형 제외·연장 종료일 조건도 이 시점에
   다시 확인한다.
4. 서버 트랜잭션(주문 행 `FOR UPDATE`, `owned` 전용 전이 가드):

   | 혜택 | 트랜잭션 동작 |
   | --- | --- |
   | 끌올 3종 | `job_boost_purchase`에 구매 행 생성 — `payment_status=paid`, `activated_at=now`, 기간제는 `expires_at = now + duration_days`, 횟수권은 `remaining_count = boost_count`, `boosts_per_day`·`duration_days`·`boost_count`는 주문 스냅샷 복사, **`purchase_source=point_shop`**(신규 값), `payment_method=null`, `amount=0`(포인트 결제라 원화 청구 없음). 기존 끌올 자격 v2·`runAutoBoostTick`이 그대로 인식 |
   | 광고 연장 | `UPDATE job_post SET exposure_ends_at = exposure_ends_at + make_interval(days => extend_days) WHERE id = $target AND exposure_ends_at IS NOT NULL` **원자 갱신**(read-modify-write 금지, §5). 후보 단계에서 `exposure_ends_at` 없는 공고는 걸러졌고, `IS NOT NULL` 가드로 트랜잭션 내에서도 재확인 |

5. 주문 `owned → used`, `target_job_post_id`·`used_at` 기록.

**만료:** `usable_until < now`인 보유 건은 서버가 사용 거부, 화면에 만료 표시.
사용 가부는 읽기 시 파생 판정(별도 cron 없음). **만료된 `owned` 건은 환불도 불가**
(만료 = 소멸, §3.4) — 만료 임박 알림(§3.5)으로 사전 고지.

**끌올 구매 출처 분리:** 포인트몰발 `job_boost_purchase`는 `purchase_source=
point_shop`·born-paid(`payment_status=paid`)라, 운영자 결제 관리의 **미결제 확인
큐·결제 목록에서 제외**한다(기존 목록은 `unpaid` 또는 `standalone`/`job_registration`
출처를 훑으므로 `point_shop` 출처를 필터에서 배제). 이 구매의 정본 관리 지점은
포인트몰 주문 탭(보유·사용 이력)이다.

### 3.4 취소·환불 (통합 정책)

**원칙: 사용(또는 쿠폰 번호 열람) 전에는 취소·환불 가능, 이후에는 불가.** 취소는
포인트 전액 환불(`point_shop_refund` +가격 원장 행) + 재고/코드 복원을 같은
트랜잭션에서 수행한다.

| 유형 | 취소 가능 조건 | 환불 시 동작 |
| --- | --- | --- |
| 수동 지급형(`none`) | `pending`(운영자만) | 환불 + 재고 `+1`(설정형) |
| 쿠폰형(`coupon_code`) | `owned` ∧ `revealed_at IS NULL`(본인·운영자) | 환불 + 코드 배정 해제(`order_id`·`assigned_at` null → 구입 대기, 재고 자동 회복) |
| 끌올·연장형 | `owned` ∧ 미사용(`used_at IS NULL`) ∧ 미만료(`usable_until`)(본인·운영자) | 환불 + 재고 `+1`(설정형) |

- **취소 주체**: 혜택형(쿠폰·끌올·연장)의 `owned` 건은 **구매자 본인이 보유함에서**
  취소 가능하고, **운영자도 주문 탭에서 동일 서버 가드**로 취소 가능(서버 로직 공유).
- **만료 건**: `usable_until < now`인 `owned` 건은 취소·환불 불가(만료 = 소멸 정책).
  즉 취소 가드는 쿠폰형 `revealed_at IS NULL`, 끌올·연장형 `used_at IS NULL AND
  (usable_until IS NULL OR usable_until > now)`.
- 주문 상태 전이는 `owned → canceled`(멱등 — 이미 `used`·`canceled`·열람·만료면
  거부, §5).

### 3.5 만료 임박 알림

- **매일 1회 배치**(기존 cron 인프라 재사용 — 개인정보 파기 배치와 같은 패턴)가
  `usable_until`이 **3일 이내이며 미래**인 `owned` 건을 구매자에게 알림 발송.
- **1회 멱등**: 주문 `expiry_notified_at`이 null인 건만 발송하고, 발송 후 해당 컬럼에
  발송 시각을 기록한다(재실행 시 재발송 금지).
- 기존 notification 패턴·라벨 맵을 준수한다(enum 원값 노출 금지). 만료 자체는 사용
  거부·환불 불가로 이어지므로(§3.4) 알림은 "곧 만료됨" 사전 고지 목적이다.

## 4. API (기존 `pointShop` 라우터 확장)

### 회원(protected)

| 프로시저 | 동작 |
| --- | --- |
| `listItems` | 노출 아이템 + benefit 유형·재고·**품절 여부(또는 잔여 수량)**·audience 자격 표시. **쿠폰 코드 값 미노출** |
| `purchase({ itemId })` | benefit_type 분기: 수동=`pending`, 쿠폰=코드 배정·`owned`(마스킹), 끌올·연장=`owned`. 자격·재고·품절·잔액 검증 |
| `myOrders` | 구매 내역 + **보유함(owned)** 포함으로 확장. 쿠폰 열람 상태(마스킹/코드)·남은 기한·사용 대상·취소 가능 여부 표시. **미열람 쿠폰 코드 값은 미노출** |
| `revealCoupon({ orderId })` | 쿠폰 "번호 보기" — 주문 `FOR UPDATE` 후 `revealed_at` 세팅(멱등)하고 코드 원문 반환. 이후 환불 불가 |
| `useBenefit({ orderId, jobPostId })` | 보유 건 사용(끌올 구매 행 생성 또는 노출 연장, `owned→used`) |
| `cancelMyOrder({ orderId })` | 본인 `owned` 건 취소·환불 — §3.4 가드(쿠폰 미열람·끌올/연장 미사용·미만료). 코드형은 배정 해제 |
| `markCouponUsed({ codeId, used })` | 쿠폰 "사용 완료" 양방향 토글(열람 후에만) |
| `listUsableJobPosts({ orderId })` | 사용 대상 후보 공고(적격만: 게시 중·paid·배너형 제외, 연장은 종료일 有) |

### 운영자(moderator)

| 프로시저 | 동작 |
| --- | --- |
| `createItem`/`updateItem` | benefit_type·스펙 필드·audience·`usage_limit_days`·`stock_quantity` 확장(쿠폰형 재고 무시). **판매 이력·등록 코드 있는 아이템은 benefit_type 변경 거부**(가격·이름 등은 허용) |
| `addCouponCodes({ itemId, codes[] })` | 대량 추가 — 공백 제거·요청 내 중복 제거·기존 중복 건너뛰기, 결과 요약(추가 N·중복 제외 M) |
| `listCouponCodes({ itemId, status? })` | 코드별 상태·구매자·배정일, 상태 필터 |
| `removeCouponCode({ codeId })` | **구입 대기 코드만** 삭제(`order_id IS NULL` 조건부 DELETE) |
| `listOrders`/`cancelOrder` 확장 | 혜택형 주문 표시 + `cancelOrder`가 `owned` 혜택형도 **§3.4 동일 서버 가드**로 취소·환불(수동 지급형 `pending` 취소는 현행). 만료·사용·열람 건은 취소 버튼 미노출·서버 거부 |

### 서비스 순수 함수(`test/services` 단위 테스트 대상)

- `resolvePurchase` 확장: audience 자격·재고·품절 판정 추가.
- `resolveOrderTransition` 확장: `owned → used`(사용)·`owned → canceled`(취소) 전이 +
  가드(쿠폰 `revealed_at`·끌올/연장 `used_at`·만료 `usable_until`).
- 취소 가부 판정(`resolveOrderCancellation` 가칭): 유형별 취소 조건(§3.4)을 순수
  함수로 — 쿠폰 미열람·끌올/연장 미사용·공통 미만료.
- 사용 적격 판정: 주문 상태(`owned`)·만료·대상 공고 적격(게시 중·paid·배너형 제외·
  연장은 종료일 有).
- 만료 임박 대상 선별(`selectExpiringOwnedOrders` 가칭): `usable_until`이 3일 이내·
  미래·`expiry_notified_at IS NULL`인 `owned` 건(배치용, §3.5).
- 쿠폰 코드 파싱·중복 처리(줄/ CSV 파싱 결과 배열 정규화·중복 제거·요약).
- 혜택 스냅샷 구성(아이템 → 주문/`job_boost_purchase` 스냅샷 매핑).
- `validateItemBenefitSpec`: 유형별 스펙 필드 필수/금지 + `job_seeker` 단독 audience
  금지.

라우터 스위트는 실행 금지 원칙 유지(dev DB 보호). CSV 파싱은 **브라우저**에서
수행하므로 서버 API는 `codes: string[]`만 받는다(의존성 추가 없음).

## 5. ★ 동시성 (최우선 검토 항목)

사용자가 최우선으로 강조. 구현·리뷰 단계에서 아래 4개 경합 시나리오를 **가장 먼저**
검증한다.

### 5.1 구매 경합

- 기존 계정 단위 advisory lock 유지: `acquirePointShopUserLock`(=
  `pg_advisory_xact_lock(918_273_648, hashtext(user_id))`) — 동시 구매로 잔액이
  음수가 되는 레이스 차단. 반드시 트랜잭션 안(xact 스코프).
- **쿠폰 코드 배정**: 미배정 코드 1행을 `FOR UPDATE SKIP LOCKED`로 선점
  (`... WHERE item_id = $1 AND order_id IS NULL ... FOR UPDATE SKIP LOCKED LIMIT 1`).
  동시 구매가 같은 코드를 이중 배정하지 못하게 하고, 선점 실패(0행)면 품절 에러.
- **재고 차감**: 조건부 원자 UPDATE(`SET stock_quantity = stock_quantity - 1
  WHERE id = $1 AND stock_quantity > 0`, `RETURNING`). 0행이면 품절 에러.
  read-then-write 금지.
- **재고 복원**(수동 지급형 취소·환불): 같은 트랜잭션에서 조건부 원자 UPDATE
  (`SET stock_quantity = stock_quantity + 1 WHERE id = $1 AND stock_quantity IS
  NOT NULL`) — 무제한(null) 아이템엔 no-op.
- 품절 판정은 **서버가 정본**이다 — 카드/다이얼로그 표시(§6)는 힌트일 뿐, 위 락·
  조건부 연산이 실제 구매 가부를 재판정한다.

### 5.2 사용·취소 경합(이중 적용/이중 환불 방지)

- 사용: 주문 행 `FOR UPDATE` + `owned` 전용 전이 가드(멱등) — `used`·`canceled`·
  만료면 거부. 같은 트랜잭션에서 `job_boost_purchase` 생성 또는 노출 연장과 주문
  상태 전이를 함께 커밋.
- 취소(본인·운영자 공통): 주문 행 `FOR UPDATE` + `owned` ∧ 미사용/미열람 ∧ 미만료
  재확인 → `canceled` 전이 + `point_shop_refund` 환불 + 재고/코드 복원을 **한
  트랜잭션**에서. 사용과 취소가 동시에 들어와도 행 잠금으로 한쪽만 성립(다른 쪽은
  상태 불일치로 거부) — **이중 환불·사용 후 환불 방지**.

### 5.3 운영자 노출 경합(광고 연장)

- 광고 연장의 `exposure_ends_at` 갱신은 운영자 `adjustJobPostExposure`(
  `packages/api/src/routers/bambi/moderation.ts`)와 **동시 실행 가능**하다.
  현재 운영자 코드는 `SELECT exposure_ends_at → 계산 → UPDATE`의 read-modify-write라
  두 경로가 같은 기준값을 읽으면 한쪽 갱신이 유실될 수 있다(latent lost update).
- 포인트몰 사용 경로는 **원자 갱신**(`UPDATE ... SET exposure_ends_at =
  exposure_ends_at + interval`)으로 구현해 read-modify-write를 피한다.
- **이번 구현 범위**: 운영자 `adjustJobPostExposure`의 read-modify-write도 동일 원자
  UPDATE(또는 대상 행 `FOR UPDATE`)로 정정해 두 경로 간 갱신 유실을 원천 차단한다.
  (기존 `?? now` 함정 — 무기한 공고에 적용 시 기한부 전환 — 동작은 유지하되 갱신
  방식만 원자화; 포인트몰 광고 연장은 후보 단계에서 무기한 공고를 이미 배제.)

### 5.4 쿠폰 번호 열람 vs 취소 경합

- "번호 보기"와 "취소"가 동시에 들어오면 둘 다 주문 행 `FOR UPDATE`로 직렬화한다.
  - 번호 보기: `owned` ∧ `revealed_at IS NULL`이면 `revealed_at` 세팅 후 코드 반환
    (이미 있으면 그대로 반환 — 멱등).
  - 취소: `owned` ∧ `revealed_at IS NULL`을 재확인해야만 진행 → 환불 + **코드 배정
    해제**(`UPDATE ... SET order_id = NULL, assigned_at = NULL WHERE order_id =
    $orderId` 조건부 원자). 한쪽이 먼저 커밋하면 다른 쪽은 조건 불일치로 거부되어,
    **열람된 코드가 환불되거나 환불된 코드가 다시 노출되는 일이 없다.**

### 5.5 토글·코드 삭제 경합

- 쿠폰 "사용 완료" 토글: `used_marked_at`을 조건부 UPDATE(현재 상태와 요청이
  일치하지 않을 때만 세팅)해 멱등.
- 운영자 코드 삭제: `DELETE ... WHERE id = $1 AND order_id IS NULL` — 그 사이 배정된
  코드는 삭제되지 않는다(0행이면 "이미 배정됨" 안내).

## 6. 화면

### 운영자 아이템 폼

- 혜택 유형 선택 → 유형별 스펙 필드 조건 노출(`boosts_per_day`·`duration_days` /
  `boost_count` / `extend_days`).
- 구매 대상(audience), 사용기한(`usage_limit_days`), 재고(`stock_quantity` —
  **쿠폰형이면 비활성**).
- 쿠폰 코드 관리(쿠폰형에서만): textarea 줄 단위 입력 + **CSV 업로드**(첫 열 또는
  "code" 헤더 컬럼 파싱) + 코드 목록(상태·구매자·배정일, 상태 필터, 구입 대기 삭제,
  추가 충전). 추가 결과 요약("추가 N건 · 중복 제외 M건").

### 운영자 아이템 목록

- 유형(benefit_type 라벨)·재고 컬럼 추가. 쿠폰형 재고는 미배정 코드 수.
- 재고 컬럼에 **품절 뱃지**(잔여 0). 무제한·미설정은 뱃지 없음.

### seeker 아이템 카드 — 품절 표현

- **품절은 파생 상태**: 쿠폰형=미배정 코드 0, 재고 설정형=`stock_quantity` 소진,
  무제한·수동형 미설정은 품절 없음(§5의 정본 판정과 동일 규칙).
- 품절 카드는 **한눈에 보이게** 표현: 이미지 위 반투명 딤 + "품절" 오버레이 뱃지.
  카드 클릭은 허용하되 구매 다이얼로그에서 구매 버튼 비활성 + 품절 안내(또는 카드
  자체 비활성 — 구현 시 기존 카드 스타일에 맞추되 품절 가시성이 요구사항).
- `listItems` 응답에 **품절 여부(또는 잔여 수량)** 포함. **쿠폰 코드 값 자체는 절대
  미노출**(재고는 미배정 코드 개수만 노출).

### 구매 다이얼로그

- 유형별 안내(공통 고지): "구매 후 보유함에서 사용하며, **사용(쿠폰은 번호 확인)
  후에는 취소·환불이 불가**합니다." 사용 전에는 보유함에서 취소·환불 가능함도 안내.
- 품절 시 구매 버튼 비활성·품절 표시. 구직자에게 혜택형은 구매 버튼 대신 자격 안내
  문구(예: "구인 회원 전용 혜택").
- **표시 계층 ≠ 정본**: 카드/다이얼로그의 품절 표시는 UX 힌트일 뿐이고, 실제 구매
  가부는 서버 `purchase`가 락·원자 연산으로 재판정한다(§5). 표시가 최신이 아니어도
  서버가 품절 구매를 거부한다.

### 마이페이지 "내 아이템·구매 내역"(기존 구매 내역 확장)

- 보유 중(`owned`) 끌올·연장: "사용하기" 버튼 + 남은 기한(`usable_until`) 또는 무기한
  표시, 만료 건은 만료 뱃지(사용·취소 불가). 미사용·미만료면 **"취소·환불" 버튼**
  (`cancelMyOrder`).
- 보유 중(`owned`) 쿠폰: 기본 **코드 마스킹** + **"쿠폰 번호 보기" 버튼**
  (`revealCoupon`, "확인 후에는 환불 불가" 경고). 열람 전이면 "취소·환불" 버튼 노출,
  열람 후에는 코드 + 복사 버튼 + "사용 완료" 토글로 전환(취소 버튼 사라짐).
- 이력: 사용 완료(`used`)·취소(`canceled`)·완료(`completed`) 등 상태 라벨 맵으로
  렌더. 취소 건은 환불 표시.

### 사용하기 다이얼로그

- 대상 공고 선택(`listUsableJobPosts` 후보) → 최종 확인("사용하면 되돌릴 수
  없습니다" 경고) → `useBenefit`.

### 회원 탈퇴 경고 (기존 탈퇴 다이얼로그 강화)

- 대상: `apps/web/src/components/bambi/withdraw-account-section.tsx`
  (`WithdrawAccountSection`, 계정 설정 화면 하단). 이미 확인 `Dialog`("정말
  탈퇴하시겠어요?")가 있고 `onboarding.withdrawMyAccount`를 호출한다.
- 이 다이얼로그 설명(`DialogDescription`)에 **"포인트로 구매한 보유 아이템·쿠폰도
  함께 사라지며 복구되지 않습니다"** 경고 문구를 추가한다(기존 채팅·리뷰 표시 안내에
  이어서). 별도 신규 단계보다 **기존 확인 다이얼로그 문구 강화**로 처리(이미 2단계
  확인 존재).
- 근거: `bambi_point_shop_order.user_id`가 `user.id` **cascade**라 탈퇴 시 주문이
  실제 삭제되고, `bambi_point_shop_item_coupon_code.order_id`는 set null이라 배정
  코드는 구입 대기로 회수된다(구매자에겐 소멸). 즉 경고 문구가 실제 동작과 일치한다.

## 7. 테스트·마이그레이션

- **마이그레이션 1건**(끌올 옵션 0080·프리미엄 정원 등과 같은 관례):
  - pgEnum 신설 2: `point_shop_benefit_type`·`point_shop_audience`.
  - 기존 `job_boost_purchase_source` enum에 `point_shop` 값 추가
    (`ALTER TYPE ... ADD VALUE`). ※ Postgres에서 `ADD VALUE`는 같은 트랜잭션 내에서
    곧바로 사용할 수 없으니, drizzle이 이 문을 별도 statement로 분리·선행하는지
    생성 결과에서 확인한다.
  - `bambi_point_shop_item` 컬럼 8개 추가.
  - `bambi_point_shop_order` 컬럼 10개 추가(§2.3 — `benefit_type`·스펙 4·
    `usable_until`·`used_at`·`target_job_post_id`·`revealed_at`·`expiry_notified_at`).
  - `bambi_point_shop_item_coupon_code` 테이블 신설(+ 인덱스·unique).
  - **주문 `status`에 `owned`·`used`는 DB 변경 없음**(`text` 컬럼이라 코드 상수만
    확장). `db:generate`는 이 값들을 마이그레이션에 담지 않는다.
  - `db:generate`는 구현 시 생성, 적용은 사용자 지시 시(적용 검증 필수, `db:push`
    금지). **배포 전 운영 DB migrate 필수** — 미적용 시 아이템 등록·구매 insert 실패.
- **만료 임박 알림 배치**(§3.5): 기존 cron 인프라(개인정보 파기 배치 패턴)에 매일
  1회 잡 추가 — 대상 선별은 순수 함수, 알림 발송·`expiry_notified_at` 기록은 트랜잭션.
- 순수 함수만 `packages/api/test/services/bambi-point-shop.test.ts`에서 단위 테스트
  (라우터 스위트 실행 금지 원칙 유지): 취소 가부·사용 전이·만료 임박 선별 포함.
- **운영자 `adjustJobPostExposure` 원자 UPDATE 정정**(§5.3)도 이번 구현에 포함 —
  기존 끌올/노출 서비스 테스트가 있으면 회귀 확인.
- 검증: ultracite lint + typecheck. 개발 서버·스크린샷 없음(시각 확인은 사용자).
- 매뉴얼 동기화(구직자·구인자·운영자): 혜택 아이템 구매·보유함·사용하기·취소/환불,
  쿠폰 번호 보기·사용 완료, 만료 임박 알림, 운영자 혜택 아이템·코드·주문 관리.

## 8. 스코프 밖(이연)

- Excel(.xlsx) 코드 업로드 — CSV만.
- 쿠폰 코드 만료일 관리(코드별 유효기간) — 설명란 안내로 대체.
- 혜택 선물하기(타인에게 보유 혜택 양도).
- 코드 CSV 내보내기.
- 부분 환불·포인트 외 결제수단 — 전액 환불만.
- 만료 임박 외 알림(사용 완료·취소 등 상태 변경 알림).

---

**구현 유의(최우선):** 이 기능의 핵심 위험은 상태·자원 경합이다. 구현·리뷰 단계에서
**동시성 시나리오(§5)를 가장 먼저 검증 항목으로 삼는다** — ① 동시 구매(잔액 음수·재고
초과 차감), ② 쿠폰 코드 이중 배정, ③ 보유 혜택 이중 사용, ④ 광고 연장과 운영자
노출 조정의 갱신 유실, ⑤ 쿠폰 번호 열람과 취소의 경합(열람된 코드 환불·환불된 코드
재노출·이중 환불). 각각 계정 advisory lock, `FOR UPDATE SKIP LOCKED` 코드 선점,
주문 행 `FOR UPDATE` + `owned` 멱등 전이, `exposure_ends_at` 원자 갱신, 주문 행
`FOR UPDATE` + `revealed_at`/상태 재확인 + 조건부 코드 배정 해제로 봉쇄하며, 단위
테스트와 코드 리뷰 체크리스트의 최상단에 둔다.
