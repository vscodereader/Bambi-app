import { describe, expect, it } from "vitest";

import {
	formatAdDuration,
	formatAdPrice,
	formatAdPriceLabel,
	resolveAdPrice,
} from "./ad-catalog";

describe("ad-catalog format helpers", () => {
	it("formats KRW amount with thousands separator and 원", () => {
		expect(formatAdPrice(330_000)).toBe("330,000원");
	});
	it("formats duration days", () => {
		expect(formatAdDuration(30)).toBe("30일");
	});
});

describe("ad-catalog discount helpers", () => {
	it("floors the discounted amount to the nearest 10원 and flags a discount", () => {
		// 333,333 * 90% = 299,999.7 → 10원 단위 내림 = 299,990
		const price = resolveAdPrice(333_333, 10);
		expect(price.discountedAmount).toBe(299_990);
		expect(price.hasDiscount).toBe(true);
		expect(price.discountPercent).toBe(10);
	});

	it("treats 0(및 음수) percent as no discount", () => {
		const price = resolveAdPrice(330_000, 0);
		expect(price.discountedAmount).toBe(330_000);
		expect(price.hasDiscount).toBe(false);
	});

	it("labels discounted prices with the 할인가 + N% 할인 form, plain otherwise", () => {
		expect(formatAdPriceLabel(300_000, 10)).toBe("270,000원 (10% 할인)");
		expect(formatAdPriceLabel(300_000, 0)).toBe("300,000원");
	});

	it("resolves each price option's own discount independently", () => {
		// 같은 상품이라도 기간 옵션마다 할인율이 다르다: 7일 10% · 30일 20%
		const options = [
			{ amount: 100_000, days: 7, discountPercent: 10 },
			{ amount: 300_000, days: 30, discountPercent: 20 },
		];
		const priced = options.map((option) =>
			resolveAdPrice(option.amount, option.discountPercent ?? 0)
		);
		expect(priced[0].discountedAmount).toBe(90_000);
		expect(priced[0].discountPercent).toBe(10);
		expect(priced[1].discountedAmount).toBe(240_000);
		expect(priced[1].discountPercent).toBe(20);
	});
});
