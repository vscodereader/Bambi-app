import { describe, expect, it, vi } from "vitest";
import {
	acquirePointShopUserLock,
	audienceAllowsRole,
	buildBoostPurchaseValues,
	decrementItemStock,
	extendJobPostExposureAtomic,
	isExpiringSoon,
	isItemSoldOut,
	isJobPostUsableForBenefit,
	markOrderExpiryNotified,
	POINT_SHOP_LOCK_NAMESPACE,
	resolveOrderCancellation,
	resolveOrderTransition,
	resolveOwnedUsage,
	resolvePurchase,
	restoreItemStock,
	shouldRestoreItemStock,
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
			resolvePurchase({
				...base,
				benefitType: "coupon",
				isPhoneVerified: false,
			})
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
	it("혜택형(끌올·연장)은 audience=all이라도 구직 회원 구매를 audience로 거부", () => {
		expect(
			resolvePurchase({
				...base,
				audience: "all",
				benefitType: "ad_extend",
				role: "job_seeker",
			})
		).toEqual({ code: "audience", ok: false });
	});
	it("혜택형이라도 구인 회원은 통과(다른 조건 충족 시)", () => {
		expect(
			resolvePurchase({
				...base,
				audience: "all",
				benefitType: "ad_extend",
				role: "employer",
			})
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

describe("resolveOrderTransition", () => {
	it("pending → complete는 환불 없이 completed", () => {
		expect(resolveOrderTransition("pending", "complete")).toEqual({
			next: "completed",
			refund: false,
		});
	});
	it("pending → cancel은 환불 동반 canceled", () => {
		expect(resolveOrderTransition("pending", "cancel")).toEqual({
			next: "canceled",
			refund: true,
		});
	});
	it("이미 처리된 주문은 재전이를 거부한다(멱등 가드)", () => {
		expect(resolveOrderTransition("completed", "cancel")).toBeNull();
		expect(resolveOrderTransition("canceled", "complete")).toBeNull();
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
	const now = new Date("2026-08-19T00:00:00Z");
	it("게시 중·paid·비배너면 끌올 적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "boost_manual_period",
				exposureEndsAt: null,
				isBannerExposure: false,
				now,
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
				now,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(false);
	});
	it("광고 연장은 만료(과거 종료일)면 부적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "ad_extend",
				exposureEndsAt: new Date("2026-08-18T00:00:00Z"),
				isBannerExposure: false,
				now,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(false);
	});
	it("광고 연장은 미만료(미래 종료일)면 적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "ad_extend",
				exposureEndsAt: new Date("2026-08-25T00:00:00Z"),
				isBannerExposure: false,
				now,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(true);
	});
	it("배너형은 부적격", () => {
		expect(
			isJobPostUsableForBenefit({
				benefitType: "boost_auto_period",
				exposureEndsAt: null,
				isBannerExposure: true,
				now,
				paymentStatus: "paid",
				status: "published",
			})
		).toBe(false);
	});
});

describe("shouldRestoreItemStock (취소 시 재고 복원 판정)", () => {
	it("구매 시 실제 차감된 주문만 복원한다", () => {
		expect(
			shouldRestoreItemStock({ itemId: "item-1", stockDecremented: true })
		).toBe(true);
	});
	it("무제한 시점 구매(미차감)는 이후 유한 재고 전환에도 복원하지 않는다", () => {
		expect(
			shouldRestoreItemStock({ itemId: "item-1", stockDecremented: false })
		).toBe(false);
	});
	it("아이템이 삭제된 주문(itemId null)은 복원하지 않는다", () => {
		expect(
			shouldRestoreItemStock({ itemId: null, stockDecremented: true })
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

describe("acquirePointShopUserLock", () => {
	it("네임스페이스+사용자 해시 2-인자 advisory lock SQL을 실행한다", async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		await acquirePointShopUserLock({ execute }, "user-1");
		expect(execute).toHaveBeenCalledTimes(1);
		const [call] = execute.mock.calls;
		const sqlText = JSON.stringify(call?.[0]);
		expect(sqlText).toContain("pg_advisory_xact_lock");
		expect(sqlText).toContain("hashtext");
		expect(sqlText).toContain(String(POINT_SHOP_LOCK_NAMESPACE));
	});
});

const sqlTextOf = (execute: ReturnType<typeof vi.fn>): string =>
	JSON.stringify(execute.mock.calls[0]?.[0]).toLowerCase();

describe("동시성 SQL 헬퍼", () => {
	it("decrementItemStock은 stock_quantity > 0 조건부 차감 + RETURNING이다", async () => {
		const execute = vi
			.fn()
			.mockResolvedValue({ rows: [{ stock_quantity: 4 }] });
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
