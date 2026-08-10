import { describe, expect, it } from "vitest";

import { discountedAdAmount } from "@/services/bambi-ad-pricing";

describe("discountedAdAmount", () => {
	it("0% 할인이면 원값을 그대로 반환한다(10원 단위가 아니어도)", () => {
		expect(discountedAdAmount(50_000, 0)).toBe(50_000);
		expect(discountedAdAmount(12_345, 0)).toBe(12_345);
	});

	it("10% 할인을 적용한다", () => {
		expect(discountedAdAmount(50_000, 10)).toBe(45_000);
	});

	it("100% 할인이면 0원이다", () => {
		expect(discountedAdAmount(50_000, 100)).toBe(0);
	});

	it("10원 단위로 내림한다", () => {
		// 12_345 * 0.9 = 11_110.5 → 11_110
		expect(discountedAdAmount(12_345, 10)).toBe(11_110);
		// 999 * 0.85 = 849.15 → 840
		expect(discountedAdAmount(999, 15)).toBe(840);
	});
});
