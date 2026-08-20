import { describe, expect, it } from "vitest";
import { isAdPeriodTierRangeValid } from "@/services/bambi-ad-period-tiers";

describe("isAdPeriodTierRangeValid", () => {
	it("상한 없음(null)은 항상 유효(최상위 등급)", () => {
		expect(isAdPeriodTierRangeValid(721, null)).toBe(true);
	});
	it("최소 ≤ 최대면 유효(경계 포함)", () => {
		expect(isAdPeriodTierRangeValid(91, 180)).toBe(true);
		expect(isAdPeriodTierRangeValid(100, 100)).toBe(true);
	});
	it("최소 > 최대면 무효", () => {
		expect(isAdPeriodTierRangeValid(200, 180)).toBe(false);
	});
});
