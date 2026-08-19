# 포인트몰 아이템 혜택 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 포인트몰(수동 지급 전용) 아이템에 쿠폰 발송(본인인증 번호로 운영자 외부 발송)·끌어올리기(수동 기간제/횟수권·자동 기간제)·광고 기간 연장 혜택을 연결하고, 끌올·연장은 구매 후 보유함에서 사용하는 흐름과 지급완료/사용 전 취소·환불을 붙인다.

**Architecture:** 기존 `bambi_point_shop_item`·`bambi_point_shop_order`에 혜택 스펙·상태 컬럼을 더한다(신설 테이블 없음). 쿠폰형은 코드 풀 없이 수동 지급형과 동일한 `pending → completed|canceled` 흐름에 본인인증 게이트(`bambi_profile.is_phone_verified`)와 발송 안내만 얹는다. 끌올 혜택은 `job_boost_purchase`에 `purchase_source="point_shop"` paid 행을 그대로 만들어 기존 자격 판정 v2·자동 끌올 스케줄러가 **무수정**으로 인식한다(확인: `bambi-job-boost.ts`·`bambi-auto-boost.ts` 어떤 판정도 `purchaseSource`로 필터하지 않음). 포인트 원장은 develop 병합(PR #210)의 서비스(`bambi-point-ledger.ts` `adjustMemberPoints`/`awardMemberPoints`)를 경유해 구매(−)·환불(+)을 기록한다 — `external_key` 멱등·`balance_after`·상한 클램프를 재사용하고 기존 직접 insert를 리팩터한다. 동시성은 계정 advisory lock(**포인트몰 락 → 원장 락 순서 고정**) + 조건부 원자 재고 UPDATE + 주문 행 `FOR UPDATE` 전이 가드로 봉쇄한다. 마이페이지 "포인트 구매 내역" 페이지는 폐지되고 공용 "포인트 내역" 페이지(`AttendancePanel`)의 아코디언 카드(내 아이템 → 구매 내역)로 흡수된다. 만료 임박 알림은 기존 파기 배치와 같은 Fastify `setInterval` 플러그인 + 순수 선별 함수로 붙인다.

**Tech Stack:** Drizzle(pg) · oRPC · Next.js App Router(RSC) · shadcn(base-ui)+Tailwind · vitest · Fastify(server 플러그인)

**Spec:** `docs/superpowers/specs/2026-08-19-point-shop-item-benefits-design.md`

## Global Constraints

- `db:push` 절대 금지. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate`까지만 이 계획에 포함하고, dev/운영 `db:migrate` 적용은 **컨트롤러가 사용자 지시로** 실행한다(적용 검증 필수). 워크트리엔 `.env`가 없어 dev migrate는 **메인 리포에서**만 가능 — 서브에이전트는 migrate를 돌리지 않는다.
- 라우터 테스트 스위트 실행 금지(dev DB 파괴 함정, 특히 site-settings 스위트). 순수 함수·SQL 헬퍼만 `packages/api/test/services`에서 vitest(cwd=`packages/api`, `test/services`만). web 테스트는 `apps/web/test` 미러 구조·`@/` alias. **src 안 신규 테스트 금지.**
- 라이브러리 추가 금지. DataTable은 기존 `@/components/bambi/data-table` 재사용.
- UI는 shadcn(`@bambi-app/ui/components`)+Tailwind만. 인라인 `style` 금지, raw hex 금지, `space-*` 금지(`gap-*`), 임의 px(`[Npx]`) 금지, `rounded-none` 금지(반경 토큰). enum/status 원값 화면 노출 금지 — 라벨 맵 경유.
- base-ui: 커스텀 트리거는 `asChild`가 아니라 `render` prop. `render`가 `<Button>`이면 `nativeButton` 생략.
- 운영자 가드는 `adminProcedure`(`packages/api/src/index.ts`) — `moderatorProcedure`는 없다.
- **동시성(스펙 §5)이 최우선 검증 항목.** 관련 태스크(2·3·4·5·7)의 테스트 스텝에 경합 시나리오 단위 테스트를 명시적으로 포함한다: 재고 조건부 UPDATE의 `RETURNING` 행 유무 검사, 전이/취소 가드 멱등, 이중 환불 방지, 노출 원자 갱신 SQL 형태.
- 검증 명령: `pnpm dlx ultracite check <경로 인자 필수>`(인자 없이 실행하면 0파일 — 금지), 각 패키지 `pnpm --filter <pkg> check-types`, vitest는 워크트리 안에서 경로 지정.
- pnpm 필터명: db/api는 `@bambi-app/db`·`@bambi-app/api`, web은 스코프 없는 `web`, server는 `server`.
- 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(빈 줄 없음). **커밋은 컨트롤러가 순차 수행 — 서브에이전트는 git 조작 금지.** 파일 줄바꿈 LF.

---

### Task 1: DB 스키마 확장 + 마이그레이션 (0098)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (병합으로 라인 위치가 밀림 — 아래 앵커는 근사치, 이름으로 위치 확인)
  - `jobBoostPurchaseSource` enum에 `point_shop` 값 추가
  - `notificationTargetType` enum에 `point_shop_order` 값 추가 (develop이 이미 추가한 `point_transaction` **뒤에** 붙는다)
  - `bambiPointShopItem`(≈L1948)·`bambiPointShopOrder`(≈L1963) 컬럼 추가
  - 신규 pgEnum 2종(`pointShopBenefitType`·`pointShopAudience`)
- Create(generate): `packages/db/src/migrations/0098_*.sql` + meta 스냅샷 (병합 리넘버: 0096=develop·0097=포인트몰 선점)

**Interfaces:**
- Produces: `bambiPointShopItem`/`bambiPointShopOrder`의 신규 컬럼, `point_shop_benefit_type`·`point_shop_audience` enum, `job_boost_purchase_source`의 `point_shop`, `notification_target_type`의 `point_shop_order` — 모두 `@bambi-app/db/schema/bambi`에서 import
- **신설 테이블 없음**(쿠폰 코드 풀 폐지).

- [ ] **Step 1: 신규 pgEnum 2종 선언** — `bambiPointShopItem` 정의(≈L1948) 바로 위에 추가

```ts
// 포인트몰 아이템이 연결하는 혜택 종류. none=수동 지급(현행), coupon=쿠폰 발송(본인인증
// 번호로 운영자 외부 발송), boost_*=끌어올리기, ad_extend=광고 기간 연장.
export const pointShopBenefitType = pgEnum("point_shop_benefit_type", [
	"none",
	"coupon",
	"boost_manual_period",
	"boost_manual_count",
	"boost_auto_period",
	"ad_extend",
]);

// 아이템 구매 자격 대상. all=전원, employer=구인 회원, job_seeker=구직 회원.
// 혜택형(끌올·연장)은 공고 단위라 job_seeker 단독은 서버·폼이 거부한다.
export const pointShopAudience = pgEnum("point_shop_audience", [
	"all",
	"employer",
	"job_seeker",
]);
```

- [ ] **Step 2: 기존 enum 2종에 값 추가**

`jobBoostPurchaseSource`(파일에서 이름으로 검색)를 다음으로 교체:

```ts
export const jobBoostPurchaseSource = pgEnum("job_boost_purchase_source", [
	"job_registration",
	"standalone",
	// 포인트몰에서 보유 혜택을 사용해 만든 끌올 구매. born-paid이며 운영자 결제 큐에서 제외된다.
	"point_shop",
]);
```

`notificationTargetType` 배열의 **맨 끝**(develop이 추가한 `"point_transaction"` 뒤)에 추가 — 두 값 공존:

```ts
	// 포인트몰 보유 아이템 만료 임박 알림 등.
	"point_shop_order",
```

- [ ] **Step 3: `bambiPointShopItem` 컬럼 8개 추가** — `bambiPointShopItem`의 `isActive` 줄(≈L1955) 아래, `createdAt` 위에 삽입

```ts
	// 연결 혜택 유형. 기존 행은 none 폴백이라 백필 불필요.
	benefitType: pointShopBenefitType("benefit_type").notNull().default("none"),
	// 구매 자격 대상. 목록 노출은 전원, 구매만 자격 검사.
	audience: pointShopAudience("audience").notNull().default("all"),
	// 혜택 스펙 스냅샷 원본(유형별로 채우고 나머지는 null). 사용 시 주문·구매로 복사한다.
	boostsPerDay: integer("boosts_per_day"),
	durationDays: integer("duration_days"),
	boostCount: integer("boost_count"),
	extendDays: integer("extend_days"),
	// 보유·사용형(끌올·연장) 사용기한(구매 후 N일). null=무기한. 수동·쿠폰형은 미사용.
	usageLimitDays: integer("usage_limit_days"),
	// 전 유형 공통 선택 재고. null=무제한. 구매 시 조건부 원자 차감·품절 거부.
	stockQuantity: integer("stock_quantity"),
```

- [ ] **Step 4: `bambiPointShopOrder` 컬럼 9개 추가** — `bambiPointShopOrder` 컬럼 객체에서 `processedAt`(≈L1978) 아래에 삽입

```ts
		// 구매 시점 혜택 스냅샷.
		benefitType: pointShopBenefitType("benefit_type").notNull().default("none"),
		boostsPerDay: integer("boosts_per_day"),
		durationDays: integer("duration_days"),
		boostCount: integer("boost_count"),
		extendDays: integer("extend_days"),
		// 보유·사용형 사용기한 = 구매일 + usageLimitDays. null=무기한.
		usableUntil: timestamp("usable_until"),
		// 보유 건 실제 사용 시각(수동·쿠폰의 processed_at과 의미 분리).
		usedAt: timestamp("used_at"),
		// 사용 대상 공고. 공고 삭제돼도 주문 이력 보존.
		targetJobPostId: uuid("target_job_post_id").references(() => jobPost.id, {
			onDelete: "set null",
		}),
		// 만료 임박 알림 발송 시각(1회 멱등 가드). 끌올·연장 외 null.
		expiryNotifiedAt: timestamp("expiry_notified_at"),
```

`pgEnum`·`uuid`·`integer`·`timestamp`·`jobPost` import는 파일에 이미 있다(누락분만 L2-19 import 블록에 추가).

- [ ] **Step 5: 마이그레이션 생성**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: `0098_*.sql` 생성. 확인: `CREATE TYPE point_shop_benefit_type`·`point_shop_audience`, `ALTER TYPE job_boost_purchase_source ADD VALUE 'point_shop'`·`ALTER TYPE notification_target_type ADD VALUE 'point_shop_order'`, `bambi_point_shop_item`/`bambi_point_shop_order` `ADD COLUMN` 다수, **CREATE TABLE 없음**. develop 병합분(bambi_point_transaction 컬럼·site_settings·job_post 결제 컬럼)은 0096/0097에 이미 있어 **델타에 나오면 안 된다**(나오면 스키마 병합 누락 신호 — 확인). `ADD VALUE`가 컬럼 사용 statement와 분리되어 선행하는지 확인(Postgres 제약 — drizzle이 보통 분리한다).

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: PASS. (dev `db:migrate` 적용은 **컨트롤러**가 사용자 지시로 메인 리포에서 수행.)

- [ ] **Step 7: Commit** (컨트롤러) — `feat: 포인트몰 혜택 스키마·enum 확장 (0098)`

---

### Task 2: 순수 판정 로직 확장 (TDD)

**Files:**
- Modify: `packages/api/src/services/bambi-point-shop.ts`
- Modify: `packages/api/test/services/bambi-point-shop.test.ts` (기존 `resolvePurchase` 3개 테스트를 새 시그니처로 갱신 + 신규 describe 추가)

**Interfaces:**
- Produces:
  - `POINT_SHOP_BENEFIT_TYPES`, `type PointShopBenefitType`, `POINT_SHOP_AUDIENCES`, `type PointShopAudience`
  - `POINT_SHOP_ORDER_STATUSES`(확장: `owned`·`used` 추가), `type PointShopOrderStatus`
  - `audienceAllowsRole(audience, role): boolean`, `isUsableBenefit(benefitType): boolean`
  - `resolvePurchase({ audience, balance, benefitType, isActive, isPhoneVerified, pricePoints, role, soldOut }): { ok:true } | { ok:false; code: PurchaseDenial }` — `PurchaseDenial = "inactive"|"audience"|"identity"|"soldout"|"insufficient"`
  - `resolveOrderCancellation({ benefitType, status, usedAt, usableUntil, now }): { ok:true } | { ok:false; code: CancelDenial }` — `"not_cancelable"|"already_used"|"expired"`
  - `resolveOwnedUsage({ benefitType, status, usedAt, usableUntil, now }): { ok:true } | { ok:false; code: OwnedUsageDenial }` — `"not_usable_type"|"not_owned"|"already_used"|"expired"`
  - `validateItemBenefitSpec({ audience, benefitType, boostsPerDay, durationDays, boostCount, extendDays }): { ok:true } | { ok:false; code: ItemSpecError }` — `"missing_spec"|"unexpected_spec"|"audience_conflict"`
  - `isJobPostUsableForBenefit({ benefitType, status, paymentStatus, isBannerExposure, exposureEndsAt }): boolean`
  - `isItemSoldOut({ stockQuantity }): boolean`
  - `isExpiringSoon({ status, usableUntil, expiryNotifiedAt, now, windowDays? }): boolean`
  - `benefitTypeToBoostOptionType(benefitType): "manual_period"|"manual_count"|"auto_period"|null`
  - `buildBoostPurchaseValues({ benefitType, boostsPerDay, durationDays, boostCount, now }): { activatedAt; amount:0; boostCount; boostsPerDay; durationDays; expiresAt; optionType; paymentMethod:null; paymentStatus:"paid"; purchaseSource:"point_shop"; remainingCount }`
- 불변: 기존 `acquirePointShopUserLock`·`POINT_SHOP_LOCK_NAMESPACE`·`POINT_SHOP_PURCHASE_ROLES`·`resolveOrderTransition`(수동·쿠폰 `pending` 완료/취소 전용) 시그니처 유지.

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 `resolvePurchase` describe를 아래로 교체하고 신규 describe들을 추가

```ts
import { describe, expect, it } from "vitest";
import {
	audienceAllowsRole,
	buildBoostPurchaseValues,
	isExpiringSoon,
	isItemSoldOut,
	isJobPostUsableForBenefit,
	resolveOrderCancellation,
	resolveOwnedUsage,
	resolvePurchase,
	validateItemBenefitSpec,
} from "../../src/services/bambi-point-shop";

describe("resolvePurchase (audience·재고·본인인증 확장)", () => {
	const base = {
		audience: "all" as const,
		balance: 100,
		benefitType: "none" as const,
		isActive: true,
		isPhoneVerified: true,
		pricePoints: 100,
		role: "job_seeker",
		soldOut: false,
	};
	it("모든 조건 충족이면 허용", () => {
		expect(resolvePurchase(base)).toEqual({ ok: true });
	});
	it("비노출은 거부", () => {
		expect(resolvePurchase({ ...base, isActive: false })).toEqual({
			code: "inactive",
			ok: false,
		});
	});
	it("자격 대상 불일치는 audience 거부", () => {
		expect(
			resolvePurchase({ ...base, audience: "employer", role: "job_seeker" })
		).toEqual({ code: "audience", ok: false });
	});
	it("쿠폰형 + 본인인증 미완료는 identity 거부", () => {
		expect(
			resolvePurchase({ ...base, benefitType: "coupon", isPhoneVerified: false })
		).toEqual({ code: "identity", ok: false });
	});
	it("쿠폰형이라도 본인인증 완료면 허용", () => {
		expect(
			resolvePurchase({ ...base, benefitType: "coupon", isPhoneVerified: true })
		).toEqual({ ok: true });
	});
	it("비쿠폰형은 본인인증 미완료여도 통과(다른 조건 충족 시)", () => {
		expect(
			resolvePurchase({ ...base, benefitType: "none", isPhoneVerified: false })
		).toEqual({ ok: true });
	});
	it("품절은 거부", () => {
		expect(resolvePurchase({ ...base, balance: 999, soldOut: true })).toEqual({
			code: "soldout",
			ok: false,
		});
	});
	it("잔액 부족은 거부", () => {
		expect(resolvePurchase({ ...base, balance: 99 })).toEqual({
			code: "insufficient",
			ok: false,
		});
	});
	it("검사 순서: 비노출 > 자격 > 본인인증 > 품절 > 잔액", () => {
		expect(
			resolvePurchase({
				...base,
				audience: "employer",
				balance: 0,
				benefitType: "coupon",
				isActive: false,
				isPhoneVerified: false,
				soldOut: true,
			})
		).toEqual({ code: "inactive", ok: false });
	});
});

describe("audienceAllowsRole", () => {
	it("all은 전 역할 허용", () => {
		expect(audienceAllowsRole("all", "job_seeker")).toBe(true);
		expect(audienceAllowsRole("all", "employer")).toBe(true);
	});
	it("employer/job_seeker는 역할 일치만 허용", () => {
		expect(audienceAllowsRole("employer", "employer")).toBe(true);
		expect(audienceAllowsRole("employer", "job_seeker")).toBe(false);
		expect(audienceAllowsRole("job_seeker", "job_seeker")).toBe(true);
	});
});

describe("resolveOrderCancellation (취소 가드)", () => {
	const now = new Date("2026-08-19T00:00:00Z");
	it("수동·쿠폰은 pending이면 허용", () => {
		expect(
			resolveOrderCancellation({
				benefitType: "coupon",
				now,
				status: "pending",
				usableUntil: null,
				usedAt: null,
			})
		).toEqual({ ok: true });
		expect(
			resolveOrderCancellation({
				benefitType: "none",
				now,
				status: "pending",
				usableUntil: null,
				usedAt: null,
			})
		).toEqual({ ok: true });
	});
	it("수동·쿠폰이 completed면 거부(not_cancelable)", () => {
		expect(
			resolveOrderCancellation({
				benefitType: "coupon",
				now,
				status: "completed",
				usableUntil: null,
				usedAt: null,
			})
		).toEqual({ code: "not_cancelable", ok: false });
	});
	it("끌올·연장 owned·미사용·미만료면 허용", () => {
		expect(
			resolveOrderCancellation({
				benefitType: "boost_manual_count",
				now,
				status: "owned",
				usableUntil: new Date("2026-08-25T00:00:00Z"),
				usedAt: null,
			})
		).toEqual({ ok: true });
	});
	it("끌올·연장 만료면 거부(expired)", () => {
		expect(
			resolveOrderCancellation({
				benefitType: "ad_extend",
				now,
				status: "owned",
				usableUntil: new Date("2026-08-18T00:00:00Z"),
				usedAt: null,
			})
		).toEqual({ code: "expired", ok: false });
	});
	it("끌올·연장 사용됨(used)이면 거부", () => {
		expect(
			resolveOrderCancellation({
				benefitType: "ad_extend",
				now,
				status: "used",
				usableUntil: null,
				usedAt: now,
			})
		).toEqual({ code: "not_cancelable", ok: false });
	});
});

describe("resolveOwnedUsage (사용 가드)", () => {
	const now = new Date("2026-08-19T00:00:00Z");
	it("끌올 owned·미사용·미만료면 허용", () => {
		expect(
			resolveOwnedUsage({
				benefitType: "boost_auto_period",
				now,
				status: "owned",
				usableUntil: null,
				usedAt: null,
			})
		).toEqual({ ok: true });
	});
	it("수동·쿠폰은 사용 대상 아님(not_usable_type)", () => {
		expect(
			resolveOwnedUsage({
				benefitType: "coupon",
				now,
				status: "pending",
				usableUntil: null,
				usedAt: null,
			})
		).toEqual({ code: "not_usable_type", ok: false });
	});
	it("이미 사용됐으면 거부", () => {
		expect(
			resolveOwnedUsage({
				benefitType: "ad_extend",
				now,
				status: "used",
				usableUntil: null,
				usedAt: now,
			})
		).toEqual({ code: "already_used", ok: false });
	});
	it("만료면 거부", () => {
		expect(
			resolveOwnedUsage({
				benefitType: "ad_extend",
				now,
				status: "owned",
				usableUntil: new Date("2026-08-18T00:00:00Z"),
				usedAt: null,
			})
		).toEqual({ code: "expired", ok: false });
	});
});

describe("validateItemBenefitSpec", () => {
	const audience = "all" as const;
	it("기간제는 boostsPerDay·durationDays 필수", () => {
		expect(
			validateItemBenefitSpec({
				audience,
				benefitType: "boost_manual_period",
				boostCount: null,
				boostsPerDay: 3,
				durationDays: 7,
				extendDays: null,
			})
		).toEqual({ ok: true });
		expect(
			validateItemBenefitSpec({
				audience,
				benefitType: "boost_manual_period",
				boostCount: null,
				boostsPerDay: null,
				durationDays: 7,
				extendDays: null,
			})
		).toEqual({ code: "missing_spec", ok: false });
	});
	it("none·coupon은 스펙 필드가 있으면 거부(unexpected_spec)", () => {
		expect(
			validateItemBenefitSpec({
				audience,
				benefitType: "coupon",
				boostCount: null,
				boostsPerDay: 1,
				durationDays: null,
				extendDays: null,
			})
		).toEqual({ code: "unexpected_spec", ok: false });
	});
	it("혜택형 job_seeker 단독 audience는 거부(audience_conflict)", () => {
		expect(
			validateItemBenefitSpec({
				audience: "job_seeker",
				benefitType: "ad_extend",
				boostCount: null,
				boostsPerDay: null,
				durationDays: null,
				extendDays: 3,
			})
		).toEqual({ code: "audience_conflict", ok: false });
	});
});

describe("isJobPostUsableForBenefit", () => {
	it("게시 중·paid·비배너면 끌올 적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "boost_manual_period",
				exposureEndsAt: null,
				isBannerExposure: false,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(true);
	});
	it("광고 연장은 exposureEndsAt 없으면 부적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "ad_extend",
				exposureEndsAt: null,
				isBannerExposure: false,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(false);
	});
	it("배너형은 부적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "boost_auto_period",
				exposureEndsAt: null,
				isBannerExposure: true,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(false);
	});
});

describe("isItemSoldOut", () => {
	it("stock 0이면 품절, null은 무제한", () => {
		expect(isItemSoldOut({ stockQuantity: 0 })).toBe(true);
		expect(isItemSoldOut({ stockQuantity: 3 })).toBe(false);
		expect(isItemSoldOut({ stockQuantity: null })).toBe(false);
	});
});

describe("isExpiringSoon", () => {
	const now = new Date("2026-08-19T00:00:00Z");
	it("owned·미알림·3일 이내 미래면 true", () => {
		expect(
			isExpiringSoon({
				expiryNotifiedAt: null,
				now,
				status: "owned",
				usableUntil: new Date("2026-08-21T00:00:00Z"),
			})
		).toBe(true);
	});
	it("이미 알림/과거/무기한이면 false", () => {
		expect(
			isExpiringSoon({
				expiryNotifiedAt: now,
				now,
				status: "owned",
				usableUntil: new Date("2026-08-21T00:00:00Z"),
			})
		).toBe(false);
		expect(
			isExpiringSoon({
				expiryNotifiedAt: null,
				now,
				status: "owned",
				usableUntil: new Date("2026-08-18T00:00:00Z"),
			})
		).toBe(false);
		expect(
			isExpiringSoon({
				expiryNotifiedAt: null,
				now,
				status: "owned",
				usableUntil: null,
			})
		).toBe(false);
	});
});

describe("buildBoostPurchaseValues", () => {
	const now = new Date("2026-08-19T00:00:00Z");
	it("기간제는 expiresAt=now+durationDays, remainingCount=null", () => {
		const v = buildBoostPurchaseValues({
			benefitType: "boost_manual_period",
			boostCount: null,
			boostsPerDay: 3,
			durationDays: 7,
			now,
		});
		expect(v.optionType).toBe("manual_period");
		expect(v.paymentStatus).toBe("paid");
		expect(v.purchaseSource).toBe("point_shop");
		expect(v.paymentMethod).toBeNull();
		expect(v.amount).toBe(0);
		expect(v.remainingCount).toBeNull();
		expect(v.expiresAt?.getTime()).toBe(
			now.getTime() + 7 * 24 * 60 * 60 * 1000
		);
	});
	it("횟수권은 remainingCount=boostCount, expiresAt=null", () => {
		const v = buildBoostPurchaseValues({
			benefitType: "boost_manual_count",
			boostCount: 10,
			boostsPerDay: null,
			durationDays: null,
			now,
		});
		expect(v.optionType).toBe("manual_count");
		expect(v.remainingCount).toBe(10);
		expect(v.expiresAt).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts` → FAIL

- [ ] **Step 3: 구현** — `bambi-point-shop.ts`에 추가(기존 `resolvePurchase`는 새 시그니처로 교체, `POINT_SHOP_ORDER_STATUSES`는 `["pending","completed","canceled","owned","used"] as const`로 확장. 기존 `resolveOrderTransition`은 그대로 둔다)

```ts
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const POINT_SHOP_BENEFIT_TYPES = [
	"none",
	"coupon",
	"boost_manual_period",
	"boost_manual_count",
	"boost_auto_period",
	"ad_extend",
] as const;
export type PointShopBenefitType = (typeof POINT_SHOP_BENEFIT_TYPES)[number];

export const POINT_SHOP_AUDIENCES = ["all", "employer", "job_seeker"] as const;
export type PointShopAudience = (typeof POINT_SHOP_AUDIENCES)[number];

export function audienceAllowsRole(
	audience: PointShopAudience,
	role: string
): boolean {
	if (audience === "all") {
		return true;
	}
	return audience === role;
}

export function isUsableBenefit(benefitType: PointShopBenefitType): boolean {
	return (
		benefitType === "boost_manual_period" ||
		benefitType === "boost_manual_count" ||
		benefitType === "boost_auto_period" ||
		benefitType === "ad_extend"
	);
}

const isExpired = (usableUntil: Date | null, now: Date): boolean =>
	usableUntil !== null && usableUntil.getTime() <= now.getTime();

export type PurchaseDenial =
	| "audience"
	| "identity"
	| "inactive"
	| "insufficient"
	| "soldout";

// 순수: 노출>자격>본인인증(쿠폰)>품절>잔액 순으로 구매 가부 판정.
export function resolvePurchase(args: {
	audience: PointShopAudience;
	balance: number;
	benefitType: PointShopBenefitType;
	isActive: boolean;
	isPhoneVerified: boolean;
	pricePoints: number;
	role: string;
	soldOut: boolean;
}): { ok: true } | { code: PurchaseDenial; ok: false } {
	if (!args.isActive) {
		return { code: "inactive", ok: false };
	}
	if (!audienceAllowsRole(args.audience, args.role)) {
		return { code: "audience", ok: false };
	}
	if (args.benefitType === "coupon" && !args.isPhoneVerified) {
		return { code: "identity", ok: false };
	}
	if (args.soldOut) {
		return { code: "soldout", ok: false };
	}
	if (args.balance < args.pricePoints) {
		return { code: "insufficient", ok: false };
	}
	return { ok: true };
}

export type CancelDenial = "already_used" | "expired" | "not_cancelable";

// 순수: 취소·환불 가드. 수동·쿠폰은 pending, 끌올·연장은 owned ∧ 미사용 ∧ 미만료.
export function resolveOrderCancellation(args: {
	benefitType: PointShopBenefitType;
	now: Date;
	status: string;
	usableUntil: Date | null;
	usedAt: Date | null;
}): { ok: true } | { code: CancelDenial; ok: false } {
	if (isUsableBenefit(args.benefitType)) {
		if (args.status !== "owned") {
			return { code: "not_cancelable", ok: false };
		}
		if (args.usedAt !== null) {
			return { code: "already_used", ok: false };
		}
		if (isExpired(args.usableUntil, args.now)) {
			return { code: "expired", ok: false };
		}
		return { ok: true };
	}
	if (args.status !== "pending") {
		return { code: "not_cancelable", ok: false };
	}
	return { ok: true };
}

export type OwnedUsageDenial =
	| "already_used"
	| "expired"
	| "not_owned"
	| "not_usable_type";

// 순수: 사용 가드(끌올·연장 전용). 상태·유형·만료만 본다(대상 공고 적격은 별도 판정).
export function resolveOwnedUsage(args: {
	benefitType: PointShopBenefitType;
	now: Date;
	status: string;
	usableUntil: Date | null;
	usedAt: Date | null;
}): { ok: true } | { code: OwnedUsageDenial; ok: false } {
	if (!isUsableBenefit(args.benefitType)) {
		return { code: "not_usable_type", ok: false };
	}
	if (args.status !== "owned") {
		return { code: "not_owned", ok: false };
	}
	if (args.usedAt !== null) {
		return { code: "already_used", ok: false };
	}
	if (isExpired(args.usableUntil, args.now)) {
		return { code: "expired", ok: false };
	}
	return { ok: true };
}

export type ItemSpecError =
	| "audience_conflict"
	| "missing_spec"
	| "unexpected_spec";

// 순수: 유형별 스펙 필드 필수/금지 + 혜택형 job_seeker 단독 audience 금지.
export function validateItemBenefitSpec(args: {
	audience: PointShopAudience;
	benefitType: PointShopBenefitType;
	boostCount: number | null;
	boostsPerDay: number | null;
	durationDays: number | null;
	extendDays: number | null;
}): { ok: true } | { code: ItemSpecError; ok: false } {
	const { benefitType, boostsPerDay, durationDays, boostCount, extendDays } =
		args;
	const isPeriod =
		benefitType === "boost_manual_period" ||
		benefitType === "boost_auto_period";
	const isCount = benefitType === "boost_manual_count";
	const isExtend = benefitType === "ad_extend";

	if (isUsableBenefit(benefitType) && args.audience === "job_seeker") {
		return { code: "audience_conflict", ok: false };
	}
	if (isPeriod) {
		if (boostsPerDay === null || durationDays === null) {
			return { code: "missing_spec", ok: false };
		}
		if (boostCount !== null || extendDays !== null) {
			return { code: "unexpected_spec", ok: false };
		}
		return { ok: true };
	}
	if (isCount) {
		if (boostCount === null) {
			return { code: "missing_spec", ok: false };
		}
		if (boostsPerDay !== null || durationDays !== null || extendDays !== null) {
			return { code: "unexpected_spec", ok: false };
		}
		return { ok: true };
	}
	if (isExtend) {
		if (extendDays === null) {
			return { code: "missing_spec", ok: false };
		}
		if (boostsPerDay !== null || durationDays !== null || boostCount !== null) {
			return { code: "unexpected_spec", ok: false };
		}
		return { ok: true };
	}
	// none·coupon: 스펙 필드가 하나라도 있으면 거부.
	if (
		boostsPerDay !== null ||
		durationDays !== null ||
		boostCount !== null ||
		extendDays !== null
	) {
		return { code: "unexpected_spec", ok: false };
	}
	return { ok: true };
}

// 순수: 사용 대상 공고 적격(게시 중·paid·비배너, 광고 연장은 종료일 有).
export function isJobPostUsableForBenefit(args: {
	benefitType: PointShopBenefitType;
	exposureEndsAt: Date | null;
	isBannerExposure: boolean;
	paymentStatus: string;
	status: string;
}): boolean {
	if (args.status !== "published" || args.paymentStatus !== "paid") {
		return false;
	}
	if (args.isBannerExposure) {
		return false;
	}
	if (args.benefitType === "ad_extend" && args.exposureEndsAt === null) {
		return false;
	}
	return true;
}

// 순수: 품절 파생. stock 0이면 품절, 무제한(null)·미설정은 품절 없음(전 유형 동일).
export function isItemSoldOut(args: { stockQuantity: number | null }): boolean {
	return args.stockQuantity !== null && args.stockQuantity <= 0;
}

// 순수: 만료 임박 배치 대상 판정(기본 창 3일, 끌올·연장 owned).
export function isExpiringSoon(args: {
	expiryNotifiedAt: Date | null;
	now: Date;
	status: string;
	usableUntil: Date | null;
	windowDays?: number;
}): boolean {
	if (args.status !== "owned" || args.expiryNotifiedAt !== null) {
		return false;
	}
	if (args.usableUntil === null) {
		return false;
	}
	const remaining = args.usableUntil.getTime() - args.now.getTime();
	const windowMs = (args.windowDays ?? 3) * MS_PER_DAY;
	return remaining > 0 && remaining <= windowMs;
}

export function benefitTypeToBoostOptionType(
	benefitType: PointShopBenefitType
): "auto_period" | "manual_count" | "manual_period" | null {
	if (benefitType === "boost_manual_period") {
		return "manual_period";
	}
	if (benefitType === "boost_manual_count") {
		return "manual_count";
	}
	if (benefitType === "boost_auto_period") {
		return "auto_period";
	}
	return null;
}

// 순수: 주문 스냅샷 → job_boost_purchase insert 값(활성/paid). 끌올 옵션
// confirmPurchasePayment(boost-options.ts L496-512)와 같은 활성 형태.
export function buildBoostPurchaseValues(args: {
	benefitType: PointShopBenefitType;
	boostCount: number | null;
	boostsPerDay: number | null;
	durationDays: number | null;
	now: Date;
}): {
	activatedAt: Date;
	amount: 0;
	boostCount: number | null;
	boostsPerDay: number | null;
	durationDays: number | null;
	expiresAt: Date | null;
	optionType: "auto_period" | "manual_count" | "manual_period";
	paymentMethod: null;
	paymentStatus: "paid";
	purchaseSource: "point_shop";
	remainingCount: number | null;
} {
	const optionType = benefitTypeToBoostOptionType(args.benefitType);
	if (optionType === null) {
		throw new Error(`끌올 혜택이 아닌 유형입니다: ${args.benefitType}`);
	}
	const isCount = optionType === "manual_count";
	return {
		activatedAt: args.now,
		amount: 0,
		boostCount: args.boostCount,
		boostsPerDay: args.boostsPerDay,
		durationDays: args.durationDays,
		expiresAt: isCount
			? null
			: new Date(args.now.getTime() + (args.durationDays ?? 0) * MS_PER_DAY),
		optionType,
		paymentMethod: null,
		paymentStatus: "paid",
		purchaseSource: "point_shop",
		remainingCount: isCount ? args.boostCount : null,
	};
}
```

- [ ] **Step 4: 통과 확인** — Run: `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts` → PASS(기존 락·transition 테스트 + 신규 전부).

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 포인트몰 혜택 순수 판정 로직(구매 자격·본인인증·취소/사용 가드·스펙 검증·품절·만료 선별·스냅샷)`

---

### Task 3: 동시성 SQL 헬퍼 (TDD)

**Files:**
- Modify: `packages/api/src/services/bambi-point-shop.ts`
- Modify: `packages/api/test/services/bambi-point-shop.test.ts`

**Interfaces:**
- Consumes: 기존 `QueryExecutor`(`Pick<typeof db, "execute">`) 패턴(파일 상단에 이미 정의)
- Produces(모두 `executor: QueryExecutor` 첫 인자, 트랜잭션 안 호출 전제):
  - `decrementItemStock(tx, itemId): Promise<boolean>` — 조건부 원자 차감(`stock_quantity - 1 where stock_quantity > 0`), `RETURNING` 행 유무 반환(품절이면 false)
  - `restoreItemStock(tx, itemId): Promise<void>` — `stock_quantity + 1 where stock_quantity is not null`
  - `extendJobPostExposureAtomic(tx, jobPostId, days): Promise<Date | null>` — `exposure_ends_at + make_interval(days => $) where exposure_ends_at is not null`, 갱신값 반환(read-modify-write 금지)
  - `markOrderExpiryNotified(tx, orderId): Promise<boolean>` — `expiry_notified_at = now() where expiry_notified_at is null` 조건부, 갱신 행 유무

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 `acquirePointShopUserLock` 테스트와 동일하게 mock executor로 SQL 문자열을 검증(동시성 절 검사가 핵심)

```ts
import { vi } from "vitest";
import {
	decrementItemStock,
	extendJobPostExposureAtomic,
	markOrderExpiryNotified,
	restoreItemStock,
} from "../../src/services/bambi-point-shop";

const sqlTextOf = (execute: ReturnType<typeof vi.fn>): string =>
	JSON.stringify(execute.mock.calls[0]?.[0]).toLowerCase();

describe("동시성 SQL 헬퍼", () => {
	it("decrementItemStock은 stock_quantity > 0 조건부 차감 + RETURNING이다", async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [{ stock_quantity: 4 }] });
		const ok = await decrementItemStock({ execute }, "item-1");
		const text = sqlTextOf(execute);
		expect(text).toContain("stock_quantity - 1");
		expect(text).toContain("stock_quantity > 0");
		expect(text).toContain("returning");
		expect(ok).toBe(true);
	});
	it("decrementItemStock은 RETURNING 0행이면 false(품절)", async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [] });
		expect(await decrementItemStock({ execute }, "item-1")).toBe(false);
	});
	it("restoreItemStock은 stock_quantity is not null 가드로 +1", async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [] });
		await restoreItemStock({ execute }, "item-1");
		const text = sqlTextOf(execute);
		expect(text).toContain("stock_quantity + 1");
		expect(text).toContain("is not null");
	});
	it("extendJobPostExposureAtomic은 exposure_ends_at + make_interval, is not null 가드(원자)", async () => {
		const execute = vi
			.fn()
			.mockResolvedValue({ rows: [{ exposure_ends_at: new Date() }] });
		await extendJobPostExposureAtomic({ execute }, "job-1", 3);
		const text = sqlTextOf(execute);
		expect(text).toContain("exposure_ends_at");
		expect(text).toContain("make_interval");
		expect(text).toContain("is not null");
	});
	it("markOrderExpiryNotified는 expiry_notified_at is null 조건부 + RETURNING(멱등)", async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [{ id: "order-1" }] });
		const first = await markOrderExpiryNotified({ execute }, "order-1");
		const text = sqlTextOf(execute);
		expect(text).toContain("expiry_notified_at");
		expect(text).toContain("is null");
		expect(first).toBe(true);
	});
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts` → FAIL

- [ ] **Step 3: 구현** — `bambi-point-shop.ts`에 추가(파일 상단 `sql` import는 이미 있음)

```ts
// 조건부 원자 차감. RETURNING 행이 있으면 성공, 없으면 품절(잔여 0). read-then-write 금지.
export const decrementItemStock = async (
	executor: QueryExecutor,
	itemId: string
): Promise<boolean> => {
	const result = await executor.execute(
		sql`update bambi_point_shop_item
			set stock_quantity = stock_quantity - 1
			where id = ${itemId} and stock_quantity > 0
			returning stock_quantity`
	);
	return (result as { rows: unknown[] }).rows.length > 0;
};

// 취소·환불 시 복원. 무제한(null) 아이템엔 no-op.
export const restoreItemStock = async (
	executor: QueryExecutor,
	itemId: string
): Promise<void> => {
	await executor.execute(
		sql`update bambi_point_shop_item
			set stock_quantity = stock_quantity + 1
			where id = ${itemId} and stock_quantity is not null`
	);
};

// 광고 연장 원자 갱신 — read-modify-write 금지. exposure_ends_at 없는 공고는 갱신 안 함.
export const extendJobPostExposureAtomic = async (
	executor: QueryExecutor,
	jobPostId: string,
	days: number
): Promise<Date | null> => {
	const result = await executor.execute(
		sql`update job_post
			set exposure_ends_at = exposure_ends_at + make_interval(days => ${days})
			where id = ${jobPostId} and exposure_ends_at is not null
			returning exposure_ends_at`
	);
	const [row] = (result as { rows: { exposure_ends_at: Date }[] }).rows;
	return row ? row.exposure_ends_at : null;
};

// 만료 임박 알림 각인(멱등). 이미 발송됐으면 0행 → false.
export const markOrderExpiryNotified = async (
	executor: QueryExecutor,
	orderId: string
): Promise<boolean> => {
	const result = await executor.execute(
		sql`update bambi_point_shop_order
			set expiry_notified_at = now()
			where id = ${orderId} and expiry_notified_at is null
			returning id`
	);
	return (result as { rows: unknown[] }).rows.length > 0;
};
```

주의(구현 시 확인): 이 리포 drizzle 드라이버의 `execute` 반환이 `{ rows }` 형태인지 dev에서 확인. 다르면 `.rows` 접근부만 조정한다(기존 `acquirePointShopUserLock`은 반환값을 안 읽어 미검증이었음).

- [ ] **Step 4: 통과 확인** — Run: `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts` → PASS

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 포인트몰 동시성 SQL 헬퍼(재고 원자 차감/복원·노출 원자 연장·만료 각인)`

---

### Task 4: 라우터 회원 프로시저 확장

**Files:**
- Modify: `packages/api/src/routers/bambi/point-shop.ts`

**Interfaces:**
- Consumes: Task 2·3 서비스 export, `jobBoostPurchase`·`jobPost` 스키마, `AD_BANNER_EXPOSURE_TYPES`(`../../services/bambi-ad-exposure`), `requireActiveBambiProfile`·`requirePurchaseProfile`(이미 라우터에 정의), `BambiAccessProfile.isPhoneVerified`, **`adjustMemberPoints`·`awardMemberPoints`(`../../services/bambi-point-ledger`, develop 병합분)**, `POINT_SHOP_REASONS`(이미 import)
- **원장 통합(스펙 §3.6)**: 포인트몰 구매/환불의 원장 기록을 **직접 insert 대신 원장 서비스 경유**로 한다. 락 순서: `acquirePointShopUserLock`(포인트몰 락) **먼저** → 원장 서비스 내부 `lockMemberPoints`가 뒤. 기존 `point-shop.ts`의 직접 `bambiPointTransaction` insert(구매 −가격 L131·환불 L319)를 이 태스크에서 교체한다.
- Produces(`orpc.bambi.pointShop.*`):
  - `listItems()` public → `{ id, name, description, imageUrl, pricePoints, benefitType, audience, soldOut }[]`
  - `purchase({ itemId })` → `{ orderId, pointBalance }` (유형 분기·본인인증 게이트)
  - `myOrders()` → `{ id, itemName, pricePoints, status, benefitType, operatorMemo, createdAt, processedAt, usableUntil, usedAt, targetJobPostId }[]`
  - `useBenefit({ orderId, jobPostId })` → `{ id, status }`
  - `cancelMyOrder({ orderId })` → `{ id, status }`
  - `listUsableJobPosts({ orderId })` → `{ id, title }[]`

- [ ] **Step 1: listItems 품절·유형 확장** — 현재 `itemFields`(L51-57) select와 `listItems`(L69-78)를 교체. `stockQuantity`·`benefitType`·`audience`를 조회하고 `isItemSoldOut`으로 `soldOut` 파생(stock은 응답에서 제외해도 되고, 노출용 잔여는 불필요):

```ts
listItems: publicProcedure.handler(async () => {
	const items = await db
		.select({
			audience: bambiPointShopItem.audience,
			benefitType: bambiPointShopItem.benefitType,
			description: bambiPointShopItem.description,
			id: bambiPointShopItem.id,
			imageUrl: bambiPointShopItem.imageUrl,
			name: bambiPointShopItem.name,
			pricePoints: bambiPointShopItem.pricePoints,
			stockQuantity: bambiPointShopItem.stockQuantity,
		})
		.from(bambiPointShopItem)
		.where(eq(bambiPointShopItem.isActive, true))
		.orderBy(asc(bambiPointShopItem.sortOrder), asc(bambiPointShopItem.createdAt));
	return items.map(({ stockQuantity, ...rest }) => ({
		...rest,
		soldOut: isItemSoldOut({ stockQuantity }),
	}));
}),
```

- [ ] **Step 2: purchase 유형 분기 + 본인인증 게이트 + 원장 통합** — 현재 `purchase` 핸들러(병합본, 이름으로 위치 확인)를 교체. **`acquirePointShopUserLock(tx, userId)`(포인트몰 락) 먼저** → 아이템 조회 → 잔액 조회(UX용) → `resolvePurchase`(benefitType·`profile.isPhoneVerified`·audience·role·soldOut 포함, soldOut은 `isItemSoldOut(item.stockQuantity)`). 통과 후:
  - 재고 설정형(`stockQuantity !== null`)이면 `decrementItemStock`(false면 품절 에러 → 롤백) — **서버 정본 품절 판정**.
  - 상태: `isUsableBenefit(benefitType)`이면 `owned` + benefit 스냅샷 + `usableUntil`(= `usageLimitDays ? now + usageLimitDays*MS : null`), 아니면(none·coupon) `pending`. 주문 insert 후 `orderId` 확보.
  - **원장 차감(§3.6)**: 직접 insert 대신 `adjustMemberPoints`. 이 호출이 내부 `lockMemberPoints`(원장 락)를 잡으므로 포인트몰 락 뒤에 온다(락 순서 준수). 음수 경로가 잔액 음수를 최종 방어(throw → BAD_REQUEST 매핑):

```ts
await adjustMemberPoints(tx, {
	amount: -item.pricePoints,
	description: `포인트몰 구매: ${item.name}`,
	externalKey: `point_shop_purchase:${order.id}`,
	reason: POINT_SHOP_REASONS.purchase,
	userId: profile.userId,
});
```

  - 반환 `{ orderId: order.id, pointBalance: balance - item.pricePoints }`.
  - `PURCHASE_DENIAL_MESSAGES`에 `audience`·`identity`·`soldout` 문구 추가:

```ts
const PURCHASE_DENIAL_MESSAGES = {
	audience: "이 아이템은 구매 대상이 아니에요.",
	identity: "본인인증 후 구매할 수 있어요.",
	inactive: "판매가 종료된 아이템입니다.",
	insufficient: "보유 포인트가 부족합니다.",
	soldout: "품절된 아이템입니다.",
} as const;
```

주문 insert의 스냅샷 값은 아이템에서 복사(`benefitType`·`boostsPerDay`·`durationDays`·`boostCount`·`extendDays`), `usableUntil`은 위 규칙. 지역 헬퍼로 정리해도 됨(별도 export 불필요).

- [ ] **Step 3: myOrders 확장** — `myOrders`(L143-158) select에 `benefitType`·`usableUntil`·`usedAt`·`targetJobPostId` 추가(status·operatorMemo·createdAt·processedAt·itemName·pricePoints 유지). 쿠폰 코드 필드는 없다.

- [ ] **Step 4: cancelMyOrder(신규, protected) — 원장 환불 통합** — 트랜잭션에서 **포인트몰 락 먼저** → 주문 `FOR UPDATE` → 본인 확인 → `resolveOrderCancellation` 통과 → `status:"canceled"`·`processedAt` → 재고 복원(`restoreItemStock`) → **원장 환불 `awardMemberPoints`**(external_key 멱등 + 상한 클램프). 거부 코드별 한국어 메시지.

```ts
cancelMyOrder: protectedProcedure
	.input(z.object({ orderId: z.string().uuid() }))
	.handler(async ({ context, input }) => {
		const profile = await requireActiveBambiProfile(context.session);
		return db.transaction(async (tx) => {
			// 락 순서 고정: 포인트몰 락 → (원장 락은 awardMemberPoints 내부).
			await acquirePointShopUserLock(tx, profile.userId);
			const [order] = await tx
				.select()
				.from(bambiPointShopOrder)
				.where(eq(bambiPointShopOrder.id, input.orderId))
				.limit(1)
				.for("update");
			if (!order || order.userId !== profile.userId) {
				throw new ORPCError("NOT_FOUND", { message: "주문을 찾을 수 없습니다." });
			}
			const verdict = resolveOrderCancellation({
				benefitType: order.benefitType,
				now: new Date(),
				status: order.status,
				usableUntil: order.usableUntil,
				usedAt: order.usedAt,
			});
			if (!verdict.ok) {
				throw new ORPCError("CONFLICT", {
					message: "취소할 수 없는 주문입니다.",
				});
			}
			await tx
				.update(bambiPointShopOrder)
				.set({ processedAt: new Date(), status: "canceled" })
				.where(eq(bambiPointShopOrder.id, order.id));
			if (order.itemId) {
				await restoreItemStock(tx, order.itemId);
			}
			// 환불(+): external_key 유니크로 onConflictDoNothing 멱등, 상한 클램프 적용.
			await awardMemberPoints(tx, {
				amount: order.pricePoints,
				description: `포인트몰 취소·환불: ${order.itemName}`,
				externalKey: `point_shop_refund:${order.id}`,
				reason: POINT_SHOP_REASONS.refund,
				userId: order.userId,
			});
			return { id: order.id, status: "canceled" as const };
		});
	}),
```

- [ ] **Step 5: listUsableJobPosts(신규, protected)** — 입력 `orderId` → 주문의 `benefitType` 확인(끌올·연장 아니면 빈 배열/에러) → **자기 조직**의 공고 중 `isJobPostUsableForBenefit` 통과분만 `{ id, title }` 반환. 배너형 판정은 `AD_BANNER_EXPOSURE_TYPES.includes(post.exposureType)`, 연장은 `exposureEndsAt IS NOT NULL`. 조직 스코프는 **기존 공고 소유 판정 관례**를 따른다(구현 시 확인: 구인자 공고 목록이 조직을 어떻게 스코프하는지 — `promotions.ts`/`jobs.ts`의 employer 공고 쿼리와 `bambi-authz`의 조직 컨텍스트). 순수 적격 판정만 `isJobPostUsableForBenefit`로 태운다.

- [ ] **Step 6: useBenefit(신규, protected 구매 역할)** — 트랜잭션 주문 `FOR UPDATE` → 본인 확인 → `resolveOwnedUsage`(상태·유형·만료) 통과 → 대상 공고 조회(자기 조직 + `isJobPostUsableForBenefit`; 실패 시 자격/적격 에러 = **역할 전환·조직 이탈 재검사**) →
  - 끌올 3종: `buildBoostPurchaseValues(order, now)`로 `jobBoostPurchase` insert(+ `jobPostId`·`organizationId`(대상 공고 조직)·`buyerUserId=profile.userId`).
  - 광고 연장: `extendJobPostExposureAtomic(tx, jobPostId, order.extendDays)`(null 반환이면 부적격 에러).
  - 주문 `status:"used"`·`usedAt`·`targetJobPostId` 세팅. 반환 `{ id, status:"used" }`.

- [ ] **Step 7: typecheck** — `pnpm --filter @bambi-app/api check-types` → PASS

- [ ] **Step 8: Commit** (컨트롤러) — `feat: 포인트몰 회원 프로시저(구매 유형 분기·본인인증 게이트·본인 취소·사용·사용대상 공고)`

---

### Task 5: 라우터 운영자 프로시저 + benefit_type 잠금

**Files:**
- Modify: `packages/api/src/routers/bambi/point-shop.ts`

**Interfaces:**
- Consumes: `validateItemBenefitSpec`·`resolveOrderCancellation`·`restoreItemStock`(Task 2·3), `bambiProfile`(`@bambi-app/db/schema/bambi`), **`awardMemberPoints`·`acquirePointShopUserLock`**(원장 환불·락 순서)
- Produces:
  - `createItem`/`updateItem` 입력에 `benefitType, audience, boostsPerDay?, durationDays?, boostCount?, extendDays?, usageLimitDays?, stockQuantity?` 추가. `updateItem`은 판매 이력 존재 시 `benefitType` 변경 거부.
  - `adminListItems` 응답에 `benefitType`·`stockQuantity` 추가
  - `adminListOrders` 응답에 `benefitType`·`usableUntil`·`usedAt`·**쿠폰형 `buyerPhone`** 추가
  - `cancelOrder`가 수동·쿠폰 `pending`·끌올·연장 `owned`를 §3.4 가드로 취소·환불(원장 `awardMemberPoints` + 재고 복원)

- [ ] **Step 1: itemInput 확장 + 스펙 검증** — `itemInput`(L59-66)에 신규 필드 추가(`benefitType: z.enum(POINT_SHOP_BENEFIT_TYPES)`, `audience: z.enum(POINT_SHOP_AUDIENCES)`, 스펙 4개 `z.number().int().min(1).nullable().optional()`, `usageLimitDays`·`stockQuantity` 동형). `createItem`/`updateItem` 핸들러 앞에서 `validateItemBenefitSpec` 호출, 실패 시 한국어 `BAD_REQUEST`. insert/update `values`에 신규 컬럼 반영(비해당 스펙 필드는 `null`).

- [ ] **Step 2: benefit_type 변경 잠금** — `updateItem`(L185-207)에서 대상 아이템의 기존 `benefitType`과 입력이 다르면, 주문 존재 검사(`select ... from bambiPointShopOrder where itemId = $ limit 1`)해 하나라도 있으면 `CONFLICT`("판매 이력이 있어 유형을 바꿀 수 없어요."). 가격·이름 등은 그대로 허용.

- [ ] **Step 3: adminListItems 확장** — `adminListItems`(L160-168)는 `select()` 전체라 신규 컬럼이 자동 포함되지만, 운영자 목록에서 유형·재고를 쓰므로 명시 select로 바꿔 `benefitType`·`stockQuantity` 등 노출(운영자에겐 원값 허용).

- [ ] **Step 4: adminListOrders + 쿠폰 발송 번호** — `adminListOrders`(L226-250) select에 `benefitType`·`usableUntil`·`usedAt` 추가. **쿠폰형 발송 번호**: `bambiProfile`을 `bambiProfile.userId = order.userId`로 leftJoin해 `buyerPhone: bambiProfile.phoneNumber` 추가(UI는 쿠폰형 행에서만 노출). (`phoneNumber`는 `BambiAccessProfile`에 없어 별도 join 필요 — 확인: `bambi.ts:447`.)

- [ ] **Step 5: cancelOrder 확장 + 원장 통합** — 현재 `cancelOrder`(병합본)를 `resolveOrderCancellation` 기반으로 교체: **포인트몰 락 먼저** → 주문 `FOR UPDATE` → `resolveOrderCancellation`(benefitType·status·usedAt·usableUntil·now) 통과 시 `canceled`·`operatorMemo`·`processedAt` → 재고 복원(`restoreItemStock`) → **원장 환불 `awardMemberPoints`**(회원 `cancelMyOrder`와 동일한 external_key `point_shop_refund:{orderId}`·description·상한 클램프). 기존 직접 `bambiPointTransaction` insert(환불) 경로를 이 서비스로 교체한다. 수동·쿠폰 `pending`, 끌올·연장 `owned`·미사용·미만료만 통과. `completeOrder`(pending→completed, 수동·쿠폰 전용)는 그대로.

- [ ] **Step 6: typecheck** — `pnpm --filter @bambi-app/api check-types` → PASS

- [ ] **Step 7: Commit** (컨트롤러) — `feat: 포인트몰 운영자 프로시저(혜택·재고 폼·유형 잠금·쿠폰 발송 번호·통합 취소)`

---

### Task 6: 만료 임박 알림 배치

**Files:**
- Create: `packages/api/src/services/bambi-point-shop-expiry.ts`
- Test: `packages/api/test/services/bambi-point-shop-expiry.test.ts`
- Create: `apps/server/src/plugins/point-shop-expiry.ts`
- Modify: `apps/server/src/index.ts` (플러그인 import + `fastify.register`, 현재 `withdrawalPurgePlugin` 등록 L32 근처)
- Modify: `apps/web/src/lib/bambi/notification-labels.ts` (제목·본문·href)

**Interfaces:**
- Consumes: `isExpiringSoon`·`markOrderExpiryNotified`(Task 2·3), `notifyBambiNotification`(`../services/bambi-notifications`, L114), `bambiPointShopOrder`
- Produces: `selectExpiringCandidates(rows, now)`, `runPointShopExpiryNotifyTick(now = new Date()): Promise<{ notifiedCount: number }>`

- [ ] **Step 1: 선별 순수 테스트** — `bambi-point-shop-expiry.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { selectExpiringCandidates } from "../../src/services/bambi-point-shop-expiry";

const now = new Date("2026-08-19T00:00:00Z");
it("owned·미알림·3일 이내 미래만 남긴다", () => {
	const rows = [
		{ expiryNotifiedAt: null, id: "keep", itemName: "A", status: "owned", usableUntil: new Date("2026-08-21T00:00:00Z"), userId: "u1" },
		{ expiryNotifiedAt: now, id: "sent", itemName: "B", status: "owned", usableUntil: new Date("2026-08-21T00:00:00Z"), userId: "u1" },
		{ expiryNotifiedAt: null, id: "past", itemName: "C", status: "owned", usableUntil: new Date("2026-08-18T00:00:00Z"), userId: "u1" },
		{ expiryNotifiedAt: null, id: "used", itemName: "D", status: "used", usableUntil: new Date("2026-08-21T00:00:00Z"), userId: "u1" },
	];
	expect(selectExpiringCandidates(rows, now).map((r) => r.id)).toEqual(["keep"]);
});
```

- [ ] **Step 2: 실패 확인** — `cd packages/api && pnpm vitest run test/services/bambi-point-shop-expiry.test.ts` → FAIL

- [ ] **Step 3: 서비스 구현** — `bambi-point-shop-expiry.ts`

```ts
import { db } from "@bambi-app/db";
import { bambiPointShopOrder } from "@bambi-app/db/schema/bambi";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { notifyBambiNotification } from "./bambi-notifications";
import { isExpiringSoon, markOrderExpiryNotified } from "./bambi-point-shop";

type ExpiringRow = {
	expiryNotifiedAt: Date | null;
	id: string;
	itemName: string;
	status: string;
	usableUntil: Date | null;
	userId: string;
};

// 순수: 배치 대상 선별(테스트 대상).
export function selectExpiringCandidates(
	rows: ExpiringRow[],
	now: Date
): ExpiringRow[] {
	return rows.filter((row) =>
		isExpiringSoon({
			expiryNotifiedAt: row.expiryNotifiedAt,
			now,
			status: row.status,
			usableUntil: row.usableUntil,
		})
	);
}

// 틱 진입점. 후보를 뽑아 멱등 각인 성공분만 알림 발송(재실행 무해).
export async function runPointShopExpiryNotifyTick(
	now: Date = new Date()
): Promise<{ notifiedCount: number }> {
	const rows = await db
		.select({
			expiryNotifiedAt: bambiPointShopOrder.expiryNotifiedAt,
			id: bambiPointShopOrder.id,
			itemName: bambiPointShopOrder.itemName,
			status: bambiPointShopOrder.status,
			usableUntil: bambiPointShopOrder.usableUntil,
			userId: bambiPointShopOrder.userId,
		})
		.from(bambiPointShopOrder)
		.where(
			and(
				eq(bambiPointShopOrder.status, "owned"),
				isNull(bambiPointShopOrder.expiryNotifiedAt),
				isNotNull(bambiPointShopOrder.usableUntil)
			)
		);
	const candidates = selectExpiringCandidates(rows, now);
	let notifiedCount = 0;
	for (const order of candidates) {
		const claimed = await markOrderExpiryNotified(db, order.id);
		if (!claimed) {
			continue;
		}
		await notifyBambiNotification({
			metadata: { action: "expiry_soon", itemName: order.itemName },
			recipientUserId: order.userId,
			targetId: order.id,
			targetType: "point_shop_order",
		});
		notifiedCount += 1;
	}
	return { notifiedCount };
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS(선별 테스트).

- [ ] **Step 5: Fastify 플러그인** — `apps/server/src/plugins/point-shop-expiry.ts`를 `withdrawal-purge.ts` 구조(interval + `running` 가드 + `onClose` clearInterval) 그대로 복제. 틱 간격 6시간(멱등 각인이 정본).

```ts
import { runPointShopExpiryNotifyTick } from "@bambi-app/api/services/bambi-point-shop-expiry";
import type { FastifyPluginCallback } from "fastify";

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const pointShopExpiryPlugin: FastifyPluginCallback = (app, _opts, done) => {
	let running = false;
	const tick = () => {
		if (running) {
			return;
		}
		running = true;
		runPointShopExpiryNotifyTick(new Date())
			.then(({ notifiedCount }) => {
				if (notifiedCount > 0) {
					app.log.info({ notifiedCount }, "point-shop expiry notified");
				}
			})
			.catch((error) => app.log.error(error, "point-shop expiry tick failed"))
			.finally(() => {
				running = false;
			});
	};
	const timer = setInterval(tick, TICK_INTERVAL_MS);
	app.addHook("onClose", (_instance, hookDone) => {
		clearInterval(timer);
		hookDone();
	});
	done();
};
```

`@bambi-app/api/services/...` import 경로는 기존 `auto-boost.ts`의 `runAutoBoostTick` import 선례를 그대로 따른다(확인).

- [ ] **Step 6: 플러그인 등록** — `apps/server/src/index.ts`에서 `withdrawalPurgePlugin` 등록 줄(L32) 근처에 `import { pointShopExpiryPlugin } from "./plugins/point-shop-expiry";`와 `fastify.register(pointShopExpiryPlugin);` 추가.

- [ ] **Step 7: 알림 라벨** — `notification-labels.ts`에 `point_shop_order:expiry_soon` 제목("보유 아이템이 곧 만료돼요.")·본문(metadata.itemName 활용)·href(**`/seeker/attendance`** = 포인트 내역 페이지 내 아이템 카드; 옛 `/seeker/me/point-orders`는 폐지)를 각 맵(`TITLE_BY_TARGET_AND_ACTION`·`notificationBody`·`notificationHref` switch)에 추가.

- [ ] **Step 8: 검증** — `pnpm --filter @bambi-app/api check-types && pnpm --filter server check-types && pnpm --filter web check-types`. `pnpm dlx ultracite check packages/api/src/services/bambi-point-shop-expiry.ts apps/server/src/plugins/point-shop-expiry.ts apps/web/src/lib/bambi/notification-labels.ts packages/api/test/services/bambi-point-shop-expiry.test.ts`

- [ ] **Step 9: Commit** (컨트롤러) — `feat: 포인트몰 보유 아이템 만료 임박 알림 배치`

---

### Task 7: adjustJobPostExposure 원자화

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (`adjustJobPostExposure` 핸들러, 현재 L2705-2747)

**Interfaces:**
- Consumes: 인라인 원자 UPDATE(`coalesce + make_interval`). Task 3의 `extendJobPostExposureAtomic`은 `is not null` 가드가 있어 여기(무기한 공고에 종료일 부여 유지)엔 부적합 — 인라인으로 구현.

- [ ] **Step 1: read-modify-write 제거** — 현재 핸들러의 `existing` SELECT(L2711-2718)와 `new Date(existing ?? now + days)` 계산(L2724-2727)을 제거하고, `?? now` 동작을 유지하는 원자 UPDATE로 대체:

```ts
const [row] = await tx
	.update(jobPost)
	.set({
		exposureEndsAt: sql`coalesce(${jobPost.exposureEndsAt}, now()) + make_interval(days => ${input.days})`,
	})
	.where(eq(jobPost.id, input.jobPostId))
	.returning({
		exposureEndsAt: jobPost.exposureEndsAt,
		organizationId: jobPost.organizationId,
	});
if (!row) {
	throw new ORPCError("NOT_FOUND");
}
```

이후 감사 로그(`adminModerationAction`)·알림은 `row.organizationId`·`row.exposureEndsAt`를 그대로 사용. `sql` import가 파일에 있는지 확인(없으면 추가).

- [ ] **Step 2: typecheck** — `pnpm --filter @bambi-app/api check-types` → PASS

- [ ] **Step 3: 회귀 확인** — `adjustJobPostExposure`를 태우는 서비스 테스트가 `packages/api/test/services`에 있으면 실행(`cd packages/api && pnpm vitest run test/services`). 없으면 typecheck로 갈음(라우터 스위트 실행 금지).

- [ ] **Step 4: Commit** (컨트롤러) — `fix: adjustJobPostExposure 노출 종료일 원자 갱신(read-modify-write 제거)`

---

### Task 8: seeker 품절 카드·구매 다이얼로그 + 라벨 확장

**Files:**
- Modify: `apps/web/src/lib/bambi/point-shop-labels.ts` (라벨 확장 — 첫 UI 태스크에서 일괄)
- Modify: `apps/web/src/components/bambi/point-shop/point-shop-screen.tsx`

**Interfaces:**
- Consumes: 확장된 `listItems`(Task 4: `benefitType`·`audience`·`soldOut`), `useBambiAuth`(세션 역할·본인인증 여부)
- Produces(labels):
  - `pointShopOrderStatusLabel`(기존, 운영자용) 맵에 `owned: "보유 중"`, `used: "사용 완료"` 추가
  - `pointShopBuyerStatusLabel(status): string` (신설, 구매자용: pending="주문완료", completed="지급완료", canceled="취소·환불", owned="보유 중", used="사용 완료")
  - `pointShopBenefitTypeLabel(benefitType): string`

- [ ] **Step 1: 라벨 확장** — `point-shop-labels.ts`(현재 L1-11)에 추가:

```ts
POINT_SHOP_ORDER_STATUS_LABELS 에 owned·used 추가:
	owned: "보유 중",
	used: "사용 완료",

const POINT_SHOP_BUYER_STATUS_LABELS: Record<string, string> = {
	canceled: "취소·환불",
	completed: "지급완료",
	owned: "보유 중",
	pending: "주문완료",
	used: "사용 완료",
};
export function pointShopBuyerStatusLabel(status: string): string {
	return POINT_SHOP_BUYER_STATUS_LABELS[status] ?? "상태 확인 필요";
}

const POINT_SHOP_BENEFIT_TYPE_LABELS: Record<string, string> = {
	ad_extend: "광고 기간 연장",
	boost_auto_period: "자동 끌어올리기(기간)",
	boost_manual_count: "끌어올리기 횟수권",
	boost_manual_period: "끌어올리기(기간)",
	coupon: "쿠폰 발송",
	none: "직접 지급",
};
export function pointShopBenefitTypeLabel(benefitType: string): string {
	return POINT_SHOP_BENEFIT_TYPE_LABELS[benefitType] ?? "혜택 확인 필요";
}
```

- [ ] **Step 2: 품절 카드** — `point-shop-screen.tsx`의 `PointShopItem` 타입은 `listItems` 추론에서 오므로 자동으로 `soldOut`·`benefitType`·`audience`를 얻는다. `ItemCard`(L70-112)에 품절 표현: `item.soldOut`이면 이미지 칸(`<span class="relative ...">`)에 딤 오버레이(`absolute inset-0 bg-background/60`)와 "품절" `Badge`(중앙, `variant="secondary"`). 카드 클릭은 허용.

- [ ] **Step 3: 구매 다이얼로그 유형별 고지 + 본인인증 게이트** — `PurchaseDialogBody`(L114-187)에 유형별 안내(`Alert`/안내 문단):
  - 끌올·연장: "구매 후 보유함에서 사용하며, 사용 후에는 취소·환불이 불가합니다. 사용 전에는 취소·환불할 수 있어요."
  - 쿠폰(`benefitType==="coupon"`): "본인인증 시 등록된 휴대폰 번호로 발송됩니다. 지급완료 전에는 취소·환불할 수 있어요." + **본인인증 미완료면 구매 버튼 대신 "본인인증 후 구매할 수 있어요" + 인증 진입 경로**(기존 인증 유도 패턴 재사용). 본인인증 여부는 `useBambiAuth`/세션 프로필의 `isPhoneVerified`(웹에서 노출되는 필드 확인).
  - 품절이면 구매 버튼 비활성 + "품절된 아이템입니다.". 구직자가 `audience==="employer"` 아이템을 열면 구매 버튼 대신 "구인 회원 전용 혜택이에요.".
  - 표시는 UX 힌트일 뿐 서버 `purchase`가 정본임을 유지(에러 토스트는 기존 `localizedPurchaseError`).

- [ ] **Step 4: 검증** — `pnpm dlx ultracite check apps/web/src/lib/bambi/point-shop-labels.ts apps/web/src/components/bambi/point-shop/point-shop-screen.tsx` / `pnpm --filter web check-types`

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 포인트몰 품절 카드·구매 다이얼로그 유형 고지·본인인증 게이트·라벨`

---

### Task 9: 포인트 내역 페이지 카드 — 내 아이템(보유함) + 구매 내역 취소 (사용·취소)

> **주의(동시 작업):** 별도 페이지 `/seeker/me/point-orders`는 develop 병합으로 **폐지**되고 "포인트 내역" 페이지(`AttendancePanel`)의 아코디언 카드로 흡수됐다. `point-orders-card.tsx`(구매 내역 카드)는 흡수 에이전트가 워크트리에서 만드는 전제다. 이 태스크는 (a) **내 아이템(보유함) 카드 신규 생성**, (b) `attendance-panel.tsx`에 카드 배치, (c) 흡수분 `point-orders-card.tsx`에 취소·환불 버튼 확장을 다룬다. `apps/web`는 다른 에이전트와 겹치므로 실행 시 최신본을 다시 확인한다.

**Files:**
- Create: `apps/web/src/components/bambi/point-shop/my-benefits-card.tsx` (내 아이템 = `owned` 끌올·연장)
- Create: `apps/web/src/components/bambi/point-shop/use-benefit-dialog.tsx`
- Modify: `apps/web/src/components/bambi/attendance-panel.tsx` (`<PointHistoryCard />` 근처, 현재 L245 — 카드 순서 내 아이템 → 구매 내역 → 포인트 내역)
- Modify: `apps/web/src/components/bambi/point-orders-card.tsx` (흡수 에이전트 생성분 확장 — 수동·쿠폰 `pending` 취소·환불 버튼)

**Interfaces:**
- Consumes: 확장된 `myOrders`(Task 4), `useBenefit`·`cancelMyOrder`·`listUsableJobPosts`(Task 4), `pointShopBuyerStatusLabel`·`pointShopBenefitTypeLabel`(Task 8), `Accordion`/`Card`(`@bambi-app/ui/components/*`, `attendance-panel.tsx` 선례)

- [ ] **Step 1: MyBenefitsCard(신규)** — `my-benefits-card.tsx`(`"use client"`). `AttendancePanel`의 달력 카드처럼 `Card` + `Accordion`(AccordionItem "내 아이템") 골격을 따른다. `myOrders`에서 `status==="owned"` ∧ 끌올·연장(`isUsableBenefit`)만 필터. 각 항목: 아이템명·유형(`pointShopBenefitTypeLabel`)·남은 기한(`usableUntil` "~까지"/"무기한"/만료 뱃지). 미사용·미만료면 "사용하기"(→ `UseBenefitDialog`)와 "취소·환불"(→ `cancelMyOrder`, 확인 `AlertDialog`) 버튼. 보유 건 0이면 카드를 렌더하지 않거나 빈 상태.

- [ ] **Step 2: UseBenefitDialog** — `use-benefit-dialog.tsx`(`"use client"`): props `{ orderId, onDone }`. `listUsableJobPosts({ orderId })`로 후보 공고를 `Select`/라디오 목록 노출(빈 목록이면 "사용할 수 있는 공고가 없어요" — 역할 전환·조직 이탈·적격 없음). 공고 선택 → "사용하면 되돌릴 수 없습니다" 최종 확인 → `useBenefit({ orderId, jobPostId })` → 성공 `toast` + `orpc.bambi.pointShop.key()`·`orpc.bambi.attendance.getMine.key()` invalidate.

- [ ] **Step 3: attendance-panel 배치** — `attendance-panel.tsx`의 `<PointHistoryCard />`(L245) **앞에** `<MyBenefitsCard />`를 넣는다(순서: 내 아이템 → [구매 내역: 흡수분] → 포인트 내역). 구매 내역 카드가 이미 배치돼 있으면 그 앞에 둔다.

- [ ] **Step 4: 구매 내역 카드 취소 버튼(흡수분 확장)** — `point-orders-card.tsx`에서 수동·쿠폰형 주문 표시에 `status==="pending"`이면 "취소·환불" 버튼(`cancelMyOrder`, 확인 `AlertDialog`) 추가. 쿠폰형은 "본인인증 번호로 발송돼요" 안내 문구. 상태 라벨은 **`pointShopBuyerStatusLabel`**(주문완료/지급완료/취소·환불). 이 파일이 아직 없거나 스키마가 다르면 실행 시점의 흡수분에 맞춰 최소 변경.

- [ ] **Step 5: invalidate 배선** — 성공 뮤테이션은 `queryClient.invalidateQueries({ queryKey: orpc.bambi.pointShop.key() })`(잔액·목록·내역 동시 갱신).

- [ ] **Step 6: 검증** — `pnpm dlx ultracite check apps/web/src/components/bambi/point-shop/my-benefits-card.tsx apps/web/src/components/bambi/point-shop/use-benefit-dialog.tsx apps/web/src/components/bambi/attendance-panel.tsx apps/web/src/components/bambi/point-orders-card.tsx` / `pnpm --filter web check-types`

- [ ] **Step 7: Commit** (컨트롤러) — `feat: 포인트 내역 페이지 내 아이템(보유함) 카드·구매 내역 취소·환불`

---

### Task 10: 운영자 아이템 폼·주문 UI

**Files:**
- Modify: `apps/web/src/app/moderator/point-shop/page.tsx`

**Interfaces:**
- Consumes: 확장된 `createItem`/`updateItem`·`adminListItems`/`adminListOrders`/`cancelOrder`(Task 5), `pointShopBenefitTypeLabel`(Task 8)

- [ ] **Step 1: ItemForm 혜택 필드** — `ItemForm`(L360-566)에 추가: 혜택 유형 `Select`(`pointShopBenefitTypeLabel` 옵션) → 유형별 조건 필드(`boostsPerDay`+`durationDays` / `boostCount` / `extendDays`), 구매 대상 `audience` `Select`(혜택형+`job_seeker` 조합은 클라 사전 검증으로 막고 안내), 사용기한 `usageLimitDays`(`Input number`, 빈값=무기한, 끌올·연장에서만 노출), 재고 `stockQuantity`(`Input number`, **전 유형 공통·쿠폰형 예외 없음**). **benefit_type 잠금**: 수정 대상 아이템에 판매 이력이 있으면(서버가 거부하므로 폼도 유형 `Select disabled` + 안내; 판매 이력 유무는 `adminListItems` 응답에 플래그 추가하거나 서버 에러로 처리 — 실패 시 `localizedShopError` 토스트). `ItemFormValues`(L350-357)에 신규 필드 반영, `onSubmit` payload 확장. **쿠폰 코드 관리 UI는 만들지 않는다**(코드 풀 폐지).

- [ ] **Step 2: 아이템 목록 컬럼** — `getItemColumns`(L154-225)에 유형(`pointShopBenefitTypeLabel` Badge)·재고 컬럼 추가. 재고: `stockQuantity`(무제한이면 "무제한"), 잔여 0이면 "품절" `Badge`.

- [ ] **Step 3: 주문 탭 — 발송 번호·유형·취소 가드** — `getOrderColumns`(L255-348)에 유형(`pointShopBenefitTypeLabel`) 컬럼 추가, **쿠폰형 행에 구매자 `buyerPhone` 노출**(발송 대상, 다른 유형은 "—"). `OrderRowActions`(L229-253)/actions 컬럼(L327-346): 수동·쿠폰 `pending`은 완료/취소, 끌올·연장 `owned`는 취소만, 그 외 상태는 "처리 완료". `cancelOrder` 뮤테이션은 그대로(서버가 §3.4 가드). `ORDER_FILTERS`(L99)에 `owned`·`used` 추가 검토.

- [ ] **Step 4: 검증** — `pnpm dlx ultracite check apps/web/src/app/moderator/point-shop/page.tsx` / `pnpm --filter web check-types`

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 운영자 포인트몰 혜택 폼·주문 유형/발송 번호·통합 취소 UI`

---

### Task 11: 회원 탈퇴 경고 강화

**Files:**
- Modify: `apps/web/src/components/bambi/withdraw-account-section.tsx` (`DialogDescription`, 현재 L87-90)

**Interfaces:** 없음(카피 변경)

- [ ] **Step 1: 경고 문구 추가** — 확인 `Dialog`의 `DialogDescription`(현재 "탈퇴 즉시 모든 기기에서 로그아웃되고 계정은 스스로 되돌릴 수 없어요. 남긴 채팅·리뷰는 '탈퇴한 회원'으로 표시돼요.")에 이어 **"포인트로 구매한 보유 아이템도 함께 사라지며 복구되지 않아요."**를 추가한다. 근거: `bambi_point_shop_order.user_id`가 `user` cascade라 탈퇴 시 주문 실제 삭제. 신규 단계 없이 문구 강화(이미 2단계 확인 존재).

- [ ] **Step 2: 검증** — `pnpm dlx ultracite check apps/web/src/components/bambi/withdraw-account-section.tsx` / `pnpm --filter web check-types`

- [ ] **Step 3: Commit** (컨트롤러) — `feat: 탈퇴 확인 다이얼로그에 포인트몰 보유 아이템 소멸 경고 추가`

---

### Task 12: 매뉴얼 동기화

**Files:**
- Modify: `docs/manual/seeker-manual.md` (혜택 아이템 구매·보유함·사용하기·취소/환불·쿠폰 발송(본인인증 번호)·만료 임박 알림)
- Modify: `docs/manual/employer-manual.md` (끌올·광고 연장 혜택을 공고에 사용 — 게시 중·paid·비배너, 광고 연장은 종료일 있는 공고만)
- Modify: `docs/manual/moderator-manual.md` (혜택 유형별 아이템 등록·audience·사용기한·재고·유형 잠금, 쿠폰 발송(구매자 번호 확인 후 외부 발송)·지급완료, `owned`/`pending` 취소·환불 가드)

- [ ] **Step 1: 세 매뉴얼 섹션 추가/갱신** — 각 문서의 기존 목차·헤딩 레벨·문체를 따른다(파일명이 다르면 `docs/manual/` 실제 목록 확인).

- [ ] **Step 2: Commit** (컨트롤러) — `docs: 포인트몰 혜택 연동 매뉴얼 반영`

---

### Task 13: 통합 검증

- [ ] **Step 1: lint** — `pnpm dlx ultracite check` 뒤에 이번 브랜치에서 생성/수정한 모든 경로를 인자로 나열(경로 인자 없이 실행 금지): `packages/db/src/schema/bambi.ts packages/api/src/services/bambi-point-shop.ts packages/api/src/services/bambi-point-shop-expiry.ts packages/api/src/routers/bambi/point-shop.ts packages/api/src/routers/bambi/moderation.ts apps/server/src/plugins/point-shop-expiry.ts apps/server/src/index.ts apps/web/src/lib/bambi/point-shop-labels.ts apps/web/src/lib/bambi/notification-labels.ts apps/web/src/components/bambi/point-shop apps/web/src/components/bambi/attendance-panel.tsx apps/web/src/components/bambi/point-orders-card.tsx apps/web/src/app/moderator/point-shop/page.tsx apps/web/src/components/bambi/withdraw-account-section.tsx` + 신규 테스트 파일.
- [ ] **Step 2: typecheck 전체** — `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter server check-types && pnpm --filter web check-types`
- [ ] **Step 3: 대상 유닛 테스트** — `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts test/services/bambi-point-shop-expiry.test.ts`. (라우터 스위트·site-settings 스위트 실행 금지.)
- [ ] **Step 4: 결과 보고** — 실패가 있으면 수정 후 재실행. 성공 출력을 눈으로 확인하기 전에는 완료 선언 금지(evidence-before-assertions). 마이그레이션 **0098** 적용은 컨트롤러가 사용자 지시로 별도 수행함을 보고에 명시.

---

## Self-Review 기록

**1. 스펙 커버리지 (§ → 태스크)**

| 스펙 섹션 | 커버 태스크 |
| --- | --- |
| §1 혜택 유형·스펙 필드 | T1(컬럼)·T2(`validateItemBenefitSpec`·`buildBoostPurchaseValues`) |
| §2.1 신규 enum 2 + `point_shop`·`point_shop_order` 값 | T1 |
| §2.2 item 컬럼 8 + benefit_type 잠금 | T1·T5(잠금)·T10(폼) |
| §2.3 order 컬럼 9 + 상태 owned/used | T1·T2(`POINT_SHOP_ORDER_STATUSES`) |
| §3.1 수동·쿠폰 pending 흐름 + 재고 복원 | T3(`restoreItemStock`)·T4·T5 |
| §3.2 쿠폰 본인인증 게이트·발송 안내·발송 번호 | T2(`resolvePurchase` identity)·T4(purchase)·T5(buyerPhone)·T8(다이얼로그)·T10(운영자 번호) |
| §3.3 끌올·연장 보유·사용·자격 재검사·원자 연장 | T2·T3·T4(useBenefit)·T9(UI) |
| §3.4 취소·환불 통합(본인+운영자) | T2(`resolveOrderCancellation`)·T4(cancelMyOrder)·T5(cancelOrder) |
| §3.5 만료 임박 알림 배치(끌올·연장 전용) | T2(`isExpiringSoon`)·T3(`markOrderExpiryNotified`)·T6 |
| §3.6 포인트 원장 통합(external_key·description·락 순서) | T4(purchase `adjustMemberPoints`·cancelMyOrder `awardMemberPoints`)·T5(cancelOrder `awardMemberPoints`)·§5.1 락 순서 |
| §4 API 회원/운영자/순수 함수 | T4·T5·T2·T3 |
| §5 동시성(구매 재고·사용 vs 취소·연장 원자·락 순서) | T3(SQL 형태)·T4·T5(락 순서·원장 멱등)·T7·T2(가드 멱등) |
| §6 화면(품절 카드·구매 다이얼로그·**포인트 내역 페이지 카드**·사용 다이얼로그·운영자 폼·주문 번호·탈퇴·라벨 분리) | T8·T9(포인트 내역 카드)·T10·T11 |
| §7 마이그레이션(0098)·배치·adjustJobPostExposure·원장 리팩터·매뉴얼 | T1·T4·T5·T6·T7·T12 |
| §8 스코프 밖 | 계획에서 제외(코드 풀·선물·부분 환불·기타 알림·발송 이력) |

빠진 스펙 요구사항 없음. (develop 병합 반영: 마이그레이션 0098, 원장 서비스 경유,
포인트 내역 페이지 아코디언 카드 흡수.)

**2. 플레이스홀더 스캔:** 순수 함수·SQL 헬퍼·배치·enum/스키마·`cancelMyOrder` 핸들러는 실제 코드로 기재. UI 태스크(T8-T11)는 현행 파일의 실제 라인 앵커(`ItemForm` L360-566, `getOrderColumns` L255-348, `ItemCard` L70-112, `PurchaseDialogBody` L114-187, `adjustJobPostExposure` L2705-2747, 탈퇴 `DialogDescription` L87-90 등)와 재사용 대상 컴포넌트를 지정 — "적절히 처리" 류 금지 표현 없음. 결정 로직(구매 자격·취소/사용 가드·품절·스냅샷·만료 선별)은 전부 검증 가능한 순수 함수로 분리해 테스트 코드까지 포함.

**3. 타입 일관성:** `PointShopBenefitType`·`PointShopAudience`·`resolvePurchase`(신규 8-인자, `benefitType`·`isPhoneVerified` 포함)·`resolveOrderCancellation`·`resolveOwnedUsage`·`buildBoostPurchaseValues`·`isItemSoldOut`·`isExpiringSoon`·`decrementItemStock`/`restoreItemStock`/`extendJobPostExposureAtomic`/`markOrderExpiryNotified`·`pointShopBuyerStatusLabel`/`pointShopBenefitTypeLabel` 명칭이 정의 태스크(T2·T3·T8)와 소비 태스크(T4·T5·T6·T9·T10)에서 동일. 기존 `resolvePurchase` 3-인자 호출부는 라우터(T4)에서 새 시그니처로 갱신되고, 기존 테스트 3건은 T2 Step 1에서 새 시그니처로 교체됨을 명시. `resolveOrderTransition`(수동·쿠폰 `pending` 완료/취소 전용)은 시그니처 불변 유지 — `completeOrder`가 계속 사용하고, 신규 취소는 `resolveOrderCancellation`이 담당해 충돌 없음.

**4. develop 병합 정합성:** 원장 서비스 시그니처(`adjustMemberPoints`/`awardMemberPoints` 인자 `{ actorUserId?, amount, description?, externalKey?, reason, userId }`)는 실제 `bambi-point-ledger.ts`(병합본)와 일치 확인. 구매는 음수→`adjustMemberPoints`(내부 잔액 검증), 환불은 양수→`awardMemberPoints`(external_key `onConflictDoNothing` 멱등 + 상한 클램프). 락 순서(포인트몰 락 → 원장 락)는 `attendance.ts` `adminAdjustPoints`(병합본)가 확립한 순서와 동일. `POINT_SHOP_REASONS`(purchase/refund)는 병합본이 이미 `GRADE_EXCLUDED_REASONS`로 등급 산식에서 제외 중이라 그대로 재사용. `notification_target_type`은 병합본에 `point_transaction`이 이미 있어 우리 `point_shop_order`가 그 뒤에 공존.
