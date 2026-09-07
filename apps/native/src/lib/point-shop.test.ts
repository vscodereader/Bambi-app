import { describe, expect, it } from "vitest";

import {
	benefitNoticeMessage,
	canCancelOrder,
	pointText,
	purchaseBlockMessage,
	resolvePurchaseMode,
} from "./point-shop";

const base = {
	audience: "all" as const,
	balance: 1000,
	benefitType: "none" as const,
	isPhoneVerified: true,
	pricePoints: 500,
	role: "job_seeker",
	soldOut: false,
};

describe("resolvePurchaseMode", () => {
	it("구매 가능·잔액 부족·품절·자격·본인인증을 서버 판정 순서로 낸다", () => {
		expect(resolvePurchaseMode(base)).toBe("buy");
		expect(resolvePurchaseMode({ ...base, balance: 100 })).toBe("insufficient");
		expect(resolvePurchaseMode({ ...base, soldOut: true })).toBe("soldout");
		expect(resolvePurchaseMode({ ...base, audience: "employer" })).toBe(
			"audience"
		);
		expect(
			resolvePurchaseMode({ ...base, benefitType: "boost_manual_count" })
		).toBe("audience");
		expect(
			resolvePurchaseMode({
				...base,
				benefitType: "coupon",
				isPhoneVerified: false,
			})
		).toBe("identity");
	});

	it("잔액을 모르면(null) 부족 판정을 하지 않는다", () => {
		expect(resolvePurchaseMode({ ...base, balance: null })).toBe("buy");
	});
});

describe("messages", () => {
	it("차단 사유 문구", () => {
		expect(purchaseBlockMessage("buy", "all")).toBeNull();
		expect(purchaseBlockMessage("soldout", "all")).toBe(
			"지금은 품절된 아이템이에요."
		);
		expect(purchaseBlockMessage("audience", "employer")).toBe(
			"구인 회원 전용 혜택이에요."
		);
		expect(purchaseBlockMessage("audience", "all")).toBe(
			"구인 회원 전용 혜택이에요."
		);
		expect(purchaseBlockMessage("identity", "all")).toBe(
			"본인인증을 완료하면 구매할 수 있어요."
		);
		expect(purchaseBlockMessage("insufficient", "all")).toBe(
			"포인트가 부족해요."
		);
	});

	it("이행 고지는 유형별 한 줄", () => {
		expect(
			benefitNoticeMessage({ benefitType: "ad_extend", usageLimitDays: 7 })
		).toContain("7일 이내");
		expect(
			benefitNoticeMessage({
				benefitType: "boost_auto_period",
				usageLimitDays: null,
			})
		).toContain("기한 없이");
		expect(
			benefitNoticeMessage({ benefitType: "coupon", usageLimitDays: null })
		).toContain("휴대폰 번호로 발송");
		expect(
			benefitNoticeMessage({ benefitType: "none", usageLimitDays: null })
		).toContain("순서대로 지급");
	});

	it("pointText는 천단위 구분 + P", () => {
		expect(pointText(12_345)).toBe("12,345P");
	});
});

describe("canCancelOrder", () => {
	const now = new Date("2026-09-07T00:00:00Z");
	it("수동·쿠폰은 pending만, 보유형은 owned·미사용·미만료만", () => {
		expect(
			canCancelOrder(
				{
					benefitType: "none",
					status: "pending",
					usableUntil: null,
					usedAt: null,
				},
				now
			)
		).toBe(true);
		expect(
			canCancelOrder(
				{
					benefitType: "none",
					status: "completed",
					usableUntil: null,
					usedAt: null,
				},
				now
			)
		).toBe(false);
		expect(
			canCancelOrder(
				{
					benefitType: "ad_extend",
					status: "owned",
					usableUntil: new Date("2026-09-08T00:00:00Z"),
					usedAt: null,
				},
				now
			)
		).toBe(true);
		expect(
			canCancelOrder(
				{
					benefitType: "ad_extend",
					status: "owned",
					usableUntil: new Date("2026-09-06T00:00:00Z"),
					usedAt: null,
				},
				now
			)
		).toBe(false);
	});
});
