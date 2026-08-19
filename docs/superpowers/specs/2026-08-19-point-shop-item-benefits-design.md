# 포인트몰 아이템 혜택 연동 설계 (2026-08-19)

포인트몰(→ `2026-08-19-point-shop-design.md`)의 아이템을 실제 서비스 혜택과
연결해 세세하게 커스텀 등록할 수 있게 확장한다. 현행 "수동 지급"만 있던 아이템에
쿠폰 발송(본인인증 번호로 운영자 외부 발송)·끌어올리기(수동 기간제/수동 횟수권/자동
기간제)·광고 기간 연장을 얹는다. 끌어올리기 혜택은 끌올 옵션 스펙(→
`2026-08-10-job-boost-options-design.md`)의 `job_boost_purchase` 구매 단위를
그대로 재사용해 기존 끌올 자격 판정 v2·자동 끌올 스케줄러를 **무수정**으로 태운다.
작업 브랜치: `feat/point-shop`.

## 확정 결정 사항 (브레인스토밍 Q&A)

| 질문 | 결정 |
| --- | --- |
| 혜택 범위 | 6종: **수동 지급(현행 유지)·쿠폰 발송·수동 끌올 기간제·수동 끌올 횟수권·자동 끌올 기간제·광고 기간 연장** |
| 끌올·연장 이행 모델 | **보유·사용 2단계** — 구매 시 주문이 `owned`(보유함) → 마이페이지에서 대상 공고 선택 후 `used`. 즉시 자동 적용 아님 |
| 끌올 혜택 구현 근거 | 구매 시 `job_boost_purchase`에 paid 구매 행 스냅샷 생성 → 기존 자격 판정 v2·자동 끌올 스케줄러가 그대로 인식, **끌올 로직 무수정** |
| 쿠폰 발송 이행 | **수동 지급형과 동일 흐름**(`pending` → 운영자 처리 완료/취소). 코드 풀·자동 배정 **없음**. 구매 다이얼로그에 "본인인증 시 등록된 휴대폰 번호로 발송됩니다" 자동 안내 → 운영자가 그 번호로 외부 발송 후 `지급완료` 처리 |
| 본인인증 게이트 | 쿠폰형 구매는 **본인인증 완료 회원만**(`bambi_profile.is_phone_verified`). 미완료면 구매 버튼이 인증 유도 + **서버도 거부**. 발송 대상 번호는 `bambi_profile.phone_number`(운영자 주문 화면에 노출) |
| 취소·환불 | **사용(끌올·연장) 또는 지급완료(수동·쿠폰) 전에는 취소·환불 가능** — 포인트 전액 환불(`point_shop_refund` 원장 행) + 재고 복원. 그 이후에는 불가 |
| 취소 주체 | `owned` 혜택형(끌올·연장)과 `pending` 지급형(수동·쿠폰) 모두 **구매자 본인 + 운영자**가 취소 가능(§3.4 동일 서버 가드) |
| 구매 대상(audience) | 아이템별 `all`/`employer`/`job_seeker` 지정 — **목록엔 모두 노출**, 구매 버튼·서버가 자격 검사. 혜택형(끌올·연장)은 공고 단위라 `job_seeker` 단독 지정 **금지**(폼+서버 검증) |
| 사용기한 | 보유·사용형(끌올·연장) 전용 `usage_limit_days`(구매 후 N일, null=무기한). **수동·쿠폰형은 미적용**(즉시 지급 흐름) |
| 재고 | 모든 유형 공통 `stock_quantity`(운영자 수동 설정, null=무제한). 쿠폰형도 다른 유형과 **동일 규칙**(별도 코드 수 종속 없음) |
| 동시성 | **최우선 검토 항목** — 동시 구매(잔액·재고)·사용 이중 적용·이중 환불·운영자 노출 경합을 락/원자 연산으로 봉쇄(§5 별도 섹션) |
| 품절 | **파생 상태**(정본 판정) — `stock_quantity` 소진 시 품절, 무제한(null)·미설정은 품절 없음. 표시 계층(품절 카드 UI)과 서버 정본 거부를 분리(§5·§6) |
| 재고 복원 | 취소·환불 시(전 유형 공통) **재고 +1 복원**(같은 트랜잭션·조건부 원자 UPDATE, `stock_quantity IS NOT NULL`인 아이템만) |
| benefit_type 변경 잠금 | **판매 이력(주문 존재)이 있는 아이템은 benefit_type 변경 금지**(폼 비활성+서버 거부). 가격·이름·이미지 등은 자유 |
| 만료 포인트 소멸 | 만료된 보유(`owned`) 아이템은 **환불 불가**(만료 = 소멸, 의도된 정책). 기한 명시 고지 + 만료 임박 알림으로 갈음 |
| 만료 임박 알림 | 매일 1회 배치가 `usable_until`이 3일 이내(미래)인 `owned` 건 구매자에게 알림. 주문 `expiry_notified_at`로 1회만(멱등). **끌올·연장 전용**(수동·쿠폰은 `usable_until` 없음) |
| 구매자용 상태 라벨 분리 | 구매자 화면(보유함·구매 내역)은 쿠폰형도 **코드 UI 없이 주문 상태만** — "주문완료"(pending)·"지급완료"(completed)·"취소·환불"(canceled). 운영자 라벨(처리 대기 등)은 별도 유지 |
| 역할 전환·조직 이탈 | 사용 시점 **자격 재검사로 거부** + 안내(회수·환불 없음). 단 이 경우 아직 미사용이므로 취소·환불은 가능 |
| 탈퇴 경고 | 회원 탈퇴 확인 다이얼로그에 **보유 아이템·쿠폰 소멸(복구 불가)** 경고 추가(주문이 `user` FK cascade라 실제 삭제됨) |
| 끌올 구매 출처 | 포인트몰발 끌올 구매는 `job_boost_purchase.purchase_source`에 **신규 `point_shop` 값**으로 기록 — `payment_method=null`·`amount=0`·`paid`, 운영자 결제 큐·목록에서 제외(포인트몰 주문 탭이 정본) |

## 1. 혜택 유형(benefit_type)과 스펙 필드

`benefit_type`별로 채우는 스펙 필드가 다르고 나머지는 null이다(끌올 옵션의 스냅샷
철학 동일 — 운영자가 아이템을 바꿔도 기존 주문·구매는 비소급).

| benefit_type | 의미 | 채우는 스펙 필드 | 이행 | 재고(`stock_quantity`) | `usage_limit_days` |
| --- | --- | --- | --- | --- | --- |
| `none` | 수동 지급(현행) | — | 운영자 수동(완료/취소·환불) | 선택 | 미적용 |
| `coupon` | 쿠폰 발송(휴대폰 문자 등) | — | **수동 지급과 동일**(`pending`→운영자 발송 후 완료). 본인인증 게이트·발송 안내만 추가 | 선택 | 미적용 |
| `boost_manual_period` | 수동 끌올 기간제 | `boosts_per_day`·`duration_days` | 보유 → 공고에 사용 | 선택 | 선택 |
| `boost_manual_count` | 수동 끌올 횟수권 | `boost_count` | 보유 → 공고에 사용 | 선택 | 선택 |
| `boost_auto_period` | 자동 끌올 기간제 | `boosts_per_day`·`duration_days` | 보유 → 공고에 사용 | 선택 | 선택 |
| `ad_extend` | 광고 기간 연장 | `extend_days` | 보유 → 공고에 사용 | 선택 | 선택 |

- `none`·`coupon`은 스펙 필드가 없고, 이행 흐름이 동일하다(`pending` 접수 → 운영자
  처리). `coupon`은 여기에 **본인인증 게이트**(§3.2)와 **발송 안내 문구**만 얹은
  변형이다 — 코드 풀·자동 배정은 없다.
- 끌올 3종의 스펙 필드는 `job_boost_option`/`job_boost_purchase`와 같은 이름·의미
  (`boosts_per_day`·`duration_days`·`boost_count`)를 쓴다 — 사용 시 그대로 스냅샷
  복사할 수 있게 하기 위함.
- `audience`가 `job_seeker` 단독인 혜택형은 논리적으로 불가(공고를 가진 주체는
  구인자·조직) — 폼과 서버 양쪽에서 거부한다.

## 2. 데이터 모델 (`packages/db/src/schema/bambi.ts` + 마이그레이션 1건)

### 2.1 신설 pgEnum 2종

| enum | 값 |
| --- | --- |
| `point_shop_benefit_type` | `none` \| `coupon` \| `boost_manual_period` \| `boost_manual_count` \| `boost_auto_period` \| `ad_extend` |
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
| `usage_limit_days` | integer null | 보유·사용형(끌올·연장) 사용기한(구매 후 N일). null=무기한. 수동·쿠폰형은 미사용 |
| `stock_quantity` | integer null | 전 유형 공통 선택 재고. null=무제한. 구매 시 조건부 원자 차감·품절 거부 |

- `stock_quantity`는 **모든 유형**에서 동일하게 쓴다(쿠폰형 예외 없음). 품절 판정은
  `stock_quantity` 소진(0)으로 파생한다.
- 스펙 필드 정합(유형별 필수/금지 조합)은 서버 순수 함수(`validateItemBenefitSpec`
  가칭)로 검증한다 — DB 제약이 아닌 애플리케이션 검증(끌올 옵션과 동일 관례).
- **benefit_type 변경 잠금**: 해당 아이템에 **주문이 하나라도 있으면(판매 이력)**
  `benefit_type` 변경을 금지한다(폼 비활성 + 서버 거부). 스냅샷 정합이 깨지는 것을
  막기 위함 — 가격·이름·이미지·노출·정렬·재고는 자유롭게 수정 가능. 유형을 바꾸려면
  새 아이템을 만든다.

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
| `expiry_notified_at` | timestamp null | 만료 임박 알림 발송 시각(1회 멱등 가드). 끌올·연장 외 null |

- 상태값(모두 `text`): `pending`·`completed`·`canceled`(현행) + `owned`·`used`(신규).
  - 수동 지급형(`none`)·쿠폰형(`coupon`): `pending → completed | canceled`(현행 흐름).
    두 유형은 상태 전이가 동일하고, 쿠폰형은 본인인증 게이트·발송 안내만 다르다.
  - 끌올·연장형: 구매 시 `owned` → 사용 시 `used`, 사용 전 취소 시 `canceled`.
  - 취소(환불) 공통: 수동·쿠폰은 `pending`, 끌올·연장은 `owned` ∧ 미사용 ∧ 미만료일
    때만 `canceled`(환불 원장 + 재고 복원). 완료·사용·만료 후에는 취소 불가(§3.4).
- `processed_at`은 수동·쿠폰형의 완료/취소 처리 시각으로 남기고, 사용 시각(끌올·연장)은
  `used_at`으로 분리한다(의미 충돌 방지).
- 기존 행은 `benefit_type` `none` 폴백이라 **백필 불필요**.

> **폐기된 대안:** 초안에는 쿠폰 코드 풀 테이블(`bambi_point_shop_item_coupon_code`)에
> 코드를 대량 등록(textarea/CSV)해 구매 시 자동 배정하고 "번호 보기"(`revealed_at`)
> 열람 게이트를 두는 방식이 있었다. **폐기됐다** — 쿠폰형은 코드 자산을 앱이 보관하지
> 않고 운영자가 본인인증 번호로 **외부 발송**하는 수동 흐름으로 확정(§3.2). 코드 테이블·
> 코드 상태·`revealed_at`·마스킹·CSV 등록은 전부 없다(§8 재확인).

## 3. 구매·보유·사용 흐름

### 3.1 수동 지급형(`none`)·쿠폰 발송형(`coupon`) — 수동 처리 흐름

두 유형은 상태 전이가 같다: `pending` 주문 접수 → 운영자 완료(`completed`)/취소
(`canceled`). 취소 시 같은 트랜잭션에서 원장 서비스로 환불(§3.6) + 재고 `+1` 복원
(조건부 원자 UPDATE — `stock_quantity IS NOT NULL`인 아이템만).

- **수동 지급형(`none`)**: 현행 그대로.
- **쿠폰 발송형(`coupon`)**: 아래 §3.2의 본인인증 게이트·발송 안내만 추가된다.

`stock_quantity`가 설정돼 있으면 구매 시 원자 차감(§5, 잔여 0이면 품절 거부).

### 3.2 쿠폰 발송형(`coupon`) — 본인인증 게이트 + 외부 발송

이행은 §3.1과 동일한 수동 흐름(`pending → completed | canceled`)이고, 아래 두 가지만
얹는다.

**본인인증 게이트(구매 차단):**

- 쿠폰형은 **본인인증 완료 회원만** 구매할 수 있다. 판정 근거는 회원 프로필의
  `bambi_profile.is_phone_verified`(= `BambiAccessProfile.isPhoneVerified`, 서버가 이미
  로드) — `true`가 아니면 거부.
- 미완료 회원: 구매 버튼이 구매 대신 **본인인증 유도**(안내 + 인증 진입 경로). 서버
  `purchase`도 쿠폰형 + `isPhoneVerified=false`면 명시 에러로 거부(표시 계층과 별개로
  서버가 정본).
- **발송 대상 번호**는 `bambi_profile.phone_number`(본인인증 시 기록). 운영자 주문
  화면(§6)이 이 번호를 노출해, 운영자가 그 번호로 외부(문자 등) 발송한다.

**발송 안내 문구:** 구매 확인 다이얼로그에 **"본인인증 시 등록된 휴대폰 번호로
발송됩니다"**를 자동 표기(운영자가 그 번호로 쿠폰을 발송함을 구매자에게 고지).

**이행:** 구매 시 `pending` 주문 + 원장 서비스로 −가격 반영(§3.6, 재고 설정 시 원자
차감). 운영자가 외부 발송 후 `지급완료`(`completed`) 처리. 취소·환불은 §3.4(수동
지급형과 동일 가드 — `pending`에서만).

### 3.3 끌올·광고 연장형(`boost_*`·`ad_extend`) — 보유·사용 2단계

**구매:**

- 계정 락 + (재고 있으면) 조건부 원자 차감 → 주문 insert
  `status = owned`, benefit 스냅샷, `usable_until = 구매일 + usage_limit_days`
  (null이면 무기한) → 원장 서비스로 −가격 반영(§3.6).
- 구매 확인 다이얼로그: "구매 후 보유함에서 사용하며, **사용 후에는 취소·환불이
  불가**합니다" 명시(사용 전에는 보유함에서 취소 가능함도 함께 안내).

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

**원칙: 지급완료(수동·쿠폰) 또는 사용(끌올·연장) 전에는 취소·환불 가능, 이후에는
불가.** 취소는 포인트 환불(원장 서비스, §3.6) + 재고 복원을 같은 트랜잭션에서
수행한다.

| 유형 | 취소 가능 조건 | 환불 시 동작 |
| --- | --- | --- |
| 수동 지급형(`none`) | `pending`(본인·운영자) | 환불 + 재고 `+1`(설정형) |
| 쿠폰 발송형(`coupon`) | `pending`(본인·운영자) | 환불 + 재고 `+1`(설정형) |
| 끌올·연장형 | `owned` ∧ 미사용(`used_at IS NULL`) ∧ 미만료(`usable_until`)(본인·운영자) | 환불 + 재고 `+1`(설정형) |

- **취소 주체**: 수동·쿠폰의 `pending` 건과 끌올·연장의 `owned` 건 모두 **구매자
  본인 + 운영자**가 취소할 수 있다(§4·§6, 서버 로직 공유). 수동 지급형도 이제 구매자
  본인 취소를 허용한다(쿠폰형과 동일 가드).
- **만료 건**: `usable_until < now`인 끌올·연장 `owned` 건은 취소·환불 불가(만료 =
  소멸 정책). 취소 가드는 끌올·연장형 `used_at IS NULL AND (usable_until IS NULL OR
  usable_until > now)`, 수동·쿠폰형 `status = pending`.
- 상태 전이는 수동·쿠폰 `pending → canceled`, 끌올·연장 `owned → canceled`(멱등 —
  이미 완료·사용·취소·만료면 거부, §5).

### 3.5 만료 임박 알림 (끌올·연장 전용)

- `usable_until`은 끌올·연장형에만 설정되므로(수동·쿠폰은 null), 이 배치는 **끌올·연장
  `owned` 건 전용**이다.
- **매일 1회 배치**(기존 cron 인프라 재사용 — 개인정보 파기 배치와 같은 패턴)가
  `usable_until`이 **3일 이내이며 미래**인 `owned` 건을 구매자에게 알림 발송.
- **1회 멱등**: 주문 `expiry_notified_at`이 null인 건만 발송하고, 발송 후 해당 컬럼에
  발송 시각을 기록한다(재실행 시 재발송 금지).
- 기존 notification 패턴·라벨 맵을 준수한다(enum 원값 노출 금지). 만료 자체는 사용
  거부·환불 불가로 이어지므로(§3.4) 알림은 "곧 만료됨" 사전 고지 목적이다.

### 3.6 포인트 원장 통합 (develop 병합 반영)

develop 병합(PR #210)으로 포인트 원장이 서비스화됐다
(`packages/api/src/services/bambi-point-ledger.ts`: `adjustMemberPoints`·
`awardMemberPoints`, `bambi_point_transaction`에 `actor_user_id`·`balance_after`·
`description`·`external_key`(유니크) 컬럼 추가). 포인트몰 구매·환불도 **직접 insert
대신 이 서비스 경유**로 통합한다.

- **구매(−)**: `adjustMemberPoints(tx, { amount: -price, reason:
  POINT_SHOP_REASONS.purchase, externalKey: "point_shop_purchase:{orderId}",
  description: "포인트몰 구매: {itemName}", userId })`. 음수 경로가 자체 잔액 검증
  ("잔액보다 많이 차감할 수 없습니다")으로 정본 방어하고 `balance_after`를 채운다.
- **환불(+)**: `awardMemberPoints(tx, { amount: price, reason:
  POINT_SHOP_REASONS.refund, externalKey: "point_shop_refund:{orderId}",
  description: "포인트몰 취소·환불: {itemName}", userId })`. 양수 경로가
  `external_key` 유니크로 `onConflictDoNothing` 멱등(이중 환불 이중 방어) + 보유 상한
  (`max_member_points`) 클램프를 적용한다. 상한에 걸려 일부만 환불되면 공고 취소 환급
  선례(`jobs.ts` L2636·L2644)처럼 잔여를 소멸로 본다(정책: 상한은 잔액 기준).
- `external_key`는 주문당 유일(`{reason}:{orderId}`)이라 재시도·경합에도 중복 원장이
  생기지 않는다. `POINT_SHOP_REASONS`(`point_shop_purchase`·`point_shop_refund`)는
  기존 등급 산식 제외 규칙(`GRADE_EXCLUDED_REASONS`)과 그대로 호환된다.
- `description`을 채우므로 통합 "포인트 내역"(`getMineHistory`)에서 `description ??
  라벨`로 아이템명이 그대로 보인다(원값 노출 없음).
- **기존 `point-shop.ts`의 직접 `bambiPointTransaction` insert(구매 −가격·환불 +가격)를
  이 서비스 경유로 리팩터하는 것도 이번 구현 범위**다(§7). 락 순서는 §5.1.

## 4. API (기존 `pointShop` 라우터 확장)

### 회원(protected)

| 프로시저 | 동작 |
| --- | --- |
| `listItems` | 노출 아이템 + benefit 유형·**품절 여부**·audience 자격 표시 |
| `purchase({ itemId })` | benefit_type 분기: 수동·쿠폰=`pending`, 끌올·연장=`owned`. 자격(audience·쿠폰형 본인인증)·재고·품절·잔액 검증 |
| `myOrders` | 구매 내역 + **보유함(owned)** 포함으로 확장. 끌올·연장은 남은 기한·사용 대상·취소 가능 여부, 수동·쿠폰은 상태만(코드 UI 없음) |
| `useBenefit({ orderId, jobPostId })` | 보유 건 사용(끌올 구매 행 생성 또는 노출 연장, `owned→used`) |
| `cancelMyOrder({ orderId })` | 본인 주문 취소·환불 — §3.4 가드(수동·쿠폰 `pending`, 끌올/연장 `owned`·미사용·미만료) + 재고 복원 |
| `listUsableJobPosts({ orderId })` | 사용 대상 후보 공고(적격만: 게시 중·paid·배너형 제외, 연장은 종료일 有) |

쿠폰형 전용 프로시저(reveal·코드 토글)는 **없다**. 발송 안내·본인인증 게이트는
`purchase`(서버 거부)와 구매 다이얼로그(안내·유도)로 처리한다.

### 운영자(moderator)

| 프로시저 | 동작 |
| --- | --- |
| `createItem`/`updateItem` | benefit_type·스펙 필드·audience·`usage_limit_days`·`stock_quantity` 확장(전 유형 동일 재고). **판매 이력(주문 존재)이 있으면 benefit_type 변경 거부**(가격·이름 등은 허용) |
| `listOrders`/`cancelOrder`/`completeOrder` 확장 | 유형·상태 표시 + **쿠폰형 주문에 구매자 `phone_number` 노출**(발송용). `cancelOrder`는 수동·쿠폰 `pending`·끌올·연장 `owned`를 §3.4 동일 서버 가드로 취소·환불. 완료·사용·만료 건은 취소 버튼 미노출·서버 거부 |

### 서비스 순수 함수(`test/services` 단위 테스트 대상)

- `resolvePurchase` 확장: audience 자격·재고·품절·**쿠폰형 본인인증** 판정 추가.
- 취소 가부 판정(`resolveOrderCancellation` 가칭): 유형별 취소 조건(§3.4) — 수동·쿠폰
  `pending`, 끌올/연장 `owned`·미사용·미만료.
- 사용 가부·전이 판정: `owned → used` 전이 가드(상태·유형·만료) + 대상 공고 적격
  (게시 중·paid·배너형 제외·연장은 종료일 有).
- 만료 임박 대상 선별(`selectExpiringOwnedOrders` 가칭): `usable_until`이 3일 이내·
  미래·`expiry_notified_at IS NULL`인 끌올·연장 `owned` 건(배치용, §3.5).
- 혜택 스냅샷 구성(아이템 → 주문/`job_boost_purchase` 스냅샷 매핑).
- `validateItemBenefitSpec`: 유형별 스펙 필드 필수/금지 + `job_seeker` 단독 audience
  금지.

라우터 스위트는 실행 금지 원칙 유지(dev DB 보호).

## 5. ★ 동시성 (최우선 검토 항목)

사용자가 최우선으로 강조. 구현·리뷰 단계에서 아래 3개 경합 시나리오를 **가장 먼저**
검증한다.

### 5.1 구매 경합

- 기존 계정 단위 advisory lock 유지: `acquirePointShopUserLock`(=
  `pg_advisory_xact_lock(918_273_648, hashtext(user_id))`) — 동시 구매로 잔액이
  음수가 되는 레이스 차단. 반드시 트랜잭션 안(xact 스코프).
- **락 취득 순서(고정)**: 포인트몰 계정 락(`acquirePointShopUserLock`)을 **먼저** 잡고,
  그다음 원장 서비스(§3.6)가 내부에서 잡는 원장 락(`lockMemberPoints`,
  `pg_advisory_xact_lock(hashtextextended(user_id, 0))`)이 걸린다. 두 락은 키가 달라
  공존하며, 구매·취소(환불) 등 **원장을 건드리는 모든** 포인트몰 트랜잭션이 이 순서를
  지켜 교착을 막는다(attendance.ts `adminAdjustPoints`가 확립한 통합 순서와 동일 —
  포인트몰 락 → `adjustMemberPoints`). 취소 핸들러(회원 `cancelMyOrder`·운영자
  `cancelOrder`)도 `awardMemberPoints` 호출 전에 `acquirePointShopUserLock`을 먼저
  잡는다.
- **재고 차감**: 조건부 원자 UPDATE(`SET stock_quantity = stock_quantity - 1
  WHERE id = $1 AND stock_quantity > 0`, `RETURNING`). 0행이면 품절 에러.
  read-then-write 금지.
- **재고 복원**(전 유형 취소·환불): 같은 트랜잭션에서 조건부 원자 UPDATE
  (`SET stock_quantity = stock_quantity + 1 WHERE id = $1 AND stock_quantity IS
  NOT NULL`) — 무제한(null) 아이템엔 no-op.
- 품절 판정은 **서버가 정본**이다 — 카드/다이얼로그 표시(§6)는 힌트일 뿐, 위 락·
  조건부 연산이 실제 구매 가부를 재판정한다.

### 5.2 사용·취소 경합(이중 적용/이중 환불 방지)

- 사용(끌올·연장): 주문 행 `FOR UPDATE` + `owned` 전용 전이 가드(멱등) — `used`·
  `canceled`·만료면 거부. 같은 트랜잭션에서 `job_boost_purchase` 생성 또는 노출
  연장과 주문 상태 전이를 함께 커밋.
- 취소(본인·운영자 공통): 포인트몰 락 → 주문 행 `FOR UPDATE` + 취소 가드 재확인(수동·
  쿠폰 `pending`, 끌올·연장 `owned`·미사용·미만료) → `canceled` 전이 + 원장 환불(§3.6,
  `awardMemberPoints`) + 재고 복원을 **한 트랜잭션**에서. 사용/완료와 취소가 동시에
  들어와도 행 잠금으로 한쪽만 성립(다른 쪽은 상태 불일치로 거부)하고, 환불은
  `external_key` 유니크로 한 번만 기록된다 — **이중 환불·사용/완료 후 환불 방지**.

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

## 6. 화면

### 운영자 아이템 폼

- 혜택 유형 선택 → 유형별 스펙 필드 조건 노출(`boosts_per_day`·`duration_days` /
  `boost_count` / `extend_days`). 수동·쿠폰형은 스펙 필드 없음.
- 구매 대상(audience), 사용기한(`usage_limit_days` — 끌올·연장에서만 의미),
  재고(`stock_quantity` — **전 유형 공통, 쿠폰형 예외 없음**).
- 쿠폰 코드 관리 UI는 **없다**(코드 풀 폐지). 쿠폰형은 다른 유형과 동일한 폼이다.

### 운영자 아이템 목록

- 유형(benefit_type 라벨)·재고 컬럼 추가. 재고는 전 유형 `stock_quantity`(무제한이면
  "무제한").
- 재고 컬럼에 **품절 뱃지**(잔여 0). 무제한·미설정은 뱃지 없음.

### seeker 아이템 카드 — 품절 표현

- **품절은 파생 상태**: `stock_quantity` 소진(0)이면 품절, 무제한(null)·미설정은 품절
  없음(§5의 정본 판정과 동일 규칙, 전 유형 동일).
- 품절 카드는 **한눈에 보이게** 표현: 이미지 위 반투명 딤 + "품절" 오버레이 뱃지.
  카드 클릭은 허용하되 구매 다이얼로그에서 구매 버튼 비활성 + 품절 안내(또는 카드
  자체 비활성 — 구현 시 기존 카드 스타일에 맞추되 품절 가시성이 요구사항).
- `listItems` 응답에 **품절 여부** 포함.

### 구매 다이얼로그

- 끌올·연장 고지: "구매 후 보유함에서 사용하며, **사용 후에는 취소·환불이 불가**
  합니다. 사용 전에는 보유함에서 취소·환불할 수 있어요."
- **쿠폰형 고지**: "본인인증 시 등록된 휴대폰 번호로 발송됩니다. 지급완료 전에는
  취소·환불할 수 있어요." + **본인인증 미완료면 구매 버튼 대신 인증 유도**("본인인증
  후 구매할 수 있어요" + 인증 진입 경로). 판정은 세션 프로필 `isPhoneVerified`.
- 수동 지급형 고지: 현행(운영자 확인 후 지급, 지급완료 전 취소 가능).
- 품절 시 구매 버튼 비활성·품절 표시. 구직자에게 혜택형은 구매 버튼 대신 자격 안내
  문구(예: "구인 회원 전용 혜택").
- **표시 계층 ≠ 정본**: 카드/다이얼로그의 품절·자격·본인인증 표시는 UX 힌트일 뿐이고,
  실제 구매 가부는 서버 `purchase`가 락·원자 연산·`isPhoneVerified`로 재판정한다(§5).

### 포인트 내역 페이지 — 아코디언 카드 (마이페이지 재배치, develop 병합 반영)

별도 "포인트 구매 내역" 페이지(`/seeker/me/point-orders`)는 **폐지**되고, 통합
"포인트 내역" 페이지(`/seeker/attendance`·`/employer/attendance` 공용
`AttendancePanel`, `apps/web/src/components/bambi/attendance-panel.tsx`)의 아코디언
카드로 흡수된다. 카드 순서: **내 아이템(보유함) → 구매 내역 → 포인트 내역**. 두 카드
모두 `employer`에도 그대로 노출된다(패널이 두 라우트 공용).

- **내 아이템(보유함) 카드**(신규): `owned` 끌올·연장 주문만. "사용하기" 버튼(→ 사용
  다이얼로그) + 남은 기한(`usable_until`)/무기한/만료 표시, 만료 건은 사용·취소 불가.
  미사용·미만료면 **"취소·환불" 버튼**(`cancelMyOrder`). 보유 건이 없으면 카드를
  숨기거나 빈 상태.
- **구매 내역 카드**(develop 흡수분 `point-orders-card.tsx` 확장): 수동·쿠폰형 주문
  목록 + `pending`이면 "취소·환불" 버튼(`cancelMyOrder`). 쿠폰은 "본인인증 번호로
  발송돼요" 안내 문구만(코드 UI 없음). 상태는 **구매자용 라벨**(주문완료/지급완료/
  취소·환불).
- **포인트 내역 카드**(기존 `PointHistoryCard`): 원장 이력. 포인트몰 구매·환불 행은
  §3.6의 `description`으로 아이템명이 그대로 보인다(별도 작업 불필요).

### 사용하기 다이얼로그(끌올·연장)

- 대상 공고 선택(`listUsableJobPosts` 후보) → 최종 확인("사용하면 되돌릴 수
  없습니다" 경고) → `useBenefit`.

### 운영자 주문 관리(쿠폰 발송)

- 쿠폰형 `pending` 주문 행에 **구매자 `phone_number` 노출**(발송 대상). 운영자가 그
  번호로 외부 발송 후 "지급완료" 처리. 취소·환불은 §3.4 가드(`pending`만).

### 회원 탈퇴 경고 (기존 탈퇴 다이얼로그 강화)

- 대상: `apps/web/src/components/bambi/withdraw-account-section.tsx`
  (`WithdrawAccountSection`, 계정 설정 화면 하단). 이미 확인 `Dialog`("정말
  탈퇴하시겠어요?")가 있고 `onboarding.withdrawMyAccount`를 호출한다.
- 이 다이얼로그 설명(`DialogDescription`)에 **"포인트로 구매한 보유 아이템도 함께
  사라지며 복구되지 않습니다"** 경고 문구를 추가한다(기존 채팅·리뷰 표시 안내에
  이어서). 별도 신규 단계보다 **기존 확인 다이얼로그 문구 강화**로 처리(이미 2단계
  확인 존재).
- 근거: `bambi_point_shop_order.user_id`가 `user.id` **cascade**라 탈퇴 시 주문이
  실제 삭제된다. 즉 경고 문구가 실제 동작과 일치한다.

### 라벨 맵 — 구매자용/운영자용 분리

- **운영자용**(기존 `pointShopOrderStatusLabel` 유지·확장): `pending`="처리 대기",
  `completed`="지급 완료", `canceled`="취소·환불", `owned`="보유 중", `used`="사용
  완료".
- **구매자용**(신설, 마이페이지·구매 내역): `pending`="주문완료", `completed`="지급
  완료", `canceled`="취소·환불", `owned`="보유 중", `used`="사용 완료".
- 혜택 유형 라벨(`pointShopBenefitTypeLabel`)은 공용. 전부 `lib/bambi`의 라벨 맵 경유
  (enum 원값 노출 금지).

## 7. 테스트·마이그레이션

- **마이그레이션 1건(0098 예상)** — develop 병합 리넘버로 0096=`robust_dormammu`
  (develop)·0097=`freezing_prism`(포인트몰)이 선점됐으므로 이번 혜택 마이그레이션은
  **0098**이다.
  - pgEnum 신설 2: `point_shop_benefit_type`·`point_shop_audience`.
  - 기존 `job_boost_purchase_source` enum에 `point_shop` 값 추가
    (`ALTER TYPE ... ADD VALUE`). ※ Postgres에서 `ADD VALUE`는 같은 트랜잭션 내에서
    곧바로 사용할 수 없으니, drizzle이 이 문을 별도 statement로 분리·선행하는지
    생성 결과에서 확인한다.
  - 기존 `notification_target_type` enum에 `point_shop_order` 값 추가
    (`ALTER TYPE ... ADD VALUE`, 만료 임박 알림용). develop이 이미 추가한
    `point_transaction` 값과 **공존**한다(우리 값은 그 뒤에 붙는다). 같은 분리·선행 주의.
  - `bambi_point_shop_item` 컬럼 8개 추가(`benefit_type`·`audience`·스펙 4·
    `usage_limit_days`·`stock_quantity`). 병합으로 정의 위치가 밀렸다(≈ L1948).
  - `bambi_point_shop_order` 컬럼 9개 추가(§2.3 — `benefit_type`·스펙 4·
    `usable_until`·`used_at`·`target_job_post_id`·`expiry_notified_at`, ≈ L1963).
  - **코드 풀 테이블은 없다**(폐기). 신설 테이블 0건. develop이 추가한
    `bambi_point_transaction` 컬럼(`actor_user_id`·`balance_after`·`description`·
    `external_key`)·site_settings·job_post 포인트 결제 컬럼은 **이미 0096/0097에
    포함**돼 있어 우리 마이그레이션 대상이 아니다.
  - **주문 `status`에 `owned`·`used`는 DB 변경 없음**(`text` 컬럼이라 코드 상수만
    확장). `db:generate`는 이 값들을 마이그레이션에 담지 않는다.
  - `db:generate`는 구현 시 생성, 적용은 사용자 지시 시(적용 검증 필수, `db:push`
    금지). **배포 전 운영 DB migrate 필수** — 미적용 시 아이템 등록·구매 insert 실패.
- **포인트 원장 통합(§3.6)**: 포인트몰 구매/환불의 직접 원장 insert를
  `adjustMemberPoints`/`awardMemberPoints` 경유로 리팩터(external_key·description·락
  순서 포함). 순수 함수가 아니라 라우터 통합이라 typecheck + 코드 리뷰로 검증(라우터
  스위트 실행 금지).
- **만료 임박 알림 배치**(§3.5): 기존 cron 인프라(개인정보 파기 배치 패턴)에 매일
  1회 잡 추가 — 대상 선별은 순수 함수, 알림 발송·`expiry_notified_at` 기록은 트랜잭션.
- 순수 함수만 `packages/api/test/services/bambi-point-shop.test.ts`에서 단위 테스트
  (라우터 스위트 실행 금지 원칙 유지): 구매 자격(본인인증 포함)·취소 가부·사용 전이·
  만료 임박 선별 포함.
- **운영자 `adjustJobPostExposure` 원자 UPDATE 정정**(§5.3)도 이번 구현에 포함 —
  기존 끌올/노출 서비스 테스트가 있으면 회귀 확인.
- 검증: ultracite lint + typecheck. 개발 서버·스크린샷 없음(시각 확인은 사용자).
- 매뉴얼 동기화(구직자·구인자·운영자): 혜택 아이템 구매·보유함·사용하기·취소/환불,
  쿠폰 발송(본인인증 번호)·만료 임박 알림, 운영자 혜택 아이템·주문 관리(쿠폰 발송).

## 8. 스코프 밖(이연)

- **쿠폰 코드 풀 방식(앱이 코드 자산 보관·자동 배정·열람 게이트)** — 폐기된 대안.
  재론 금지. 쿠폰형은 운영자가 본인인증 번호로 외부 발송하는 수동 흐름으로 확정(§3.2).
  코드 발송 자동화(문자 API 연동 등)가 필요해지면 별도 스펙으로 다룬다.
- 혜택 선물하기(타인에게 보유 혜택 양도).
- 부분 환불·포인트 외 결제수단 — 전액 환불만.
- 만료 임박 외 알림(사용 완료·취소 등 상태 변경 알림).
- 쿠폰 발송 이력·발송 완료 별도 상태(현재는 `지급완료` 단일 상태로 갈음).

---

**구현 유의(최우선):** 이 기능의 핵심 위험은 상태·자원 경합이다. 구현·리뷰 단계에서
**동시성 시나리오(§5)를 가장 먼저 검증 항목으로 삼는다** — ① 동시 구매(잔액 음수·재고
초과 차감), ② 보유 혜택 이중 사용, ③ 광고 연장과 운영자 노출 조정의 갱신 유실,
④ 사용/완료와 취소의 경합(이중 환불·사후 환불). 각각 계정 advisory lock, 조건부 원자
재고 UPDATE(`RETURNING` 검사), 주문 행 `FOR UPDATE` + 상태 전용 멱등 전이,
`exposure_ends_at` 원자 갱신으로 봉쇄하며, 단위 테스트와 코드 리뷰 체크리스트의
최상단에 둔다.
