import { describe, expect, it } from "vitest";
import {
	isAdPeriodTierColorClassValid,
	isAdPeriodTierRangeValid,
} from "@/services/bambi-ad-period-tiers";

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

describe("isAdPeriodTierColorClassValid", () => {
	it("브랜드색 text-primary(숫자 없음) 통과", () => {
		expect(isAdPeriodTierColorClassValid("text-primary")).toBe(true);
	});
	it("팔레트 색 text-amber-500(숫자 있음) 통과", () => {
		expect(isAdPeriodTierColorClassValid("text-amber-500")).toBe(true);
	});
	it("raw hex·비-text 유틸은 거부", () => {
		expect(isAdPeriodTierColorClassValid("text-#fff")).toBe(false);
		expect(isAdPeriodTierColorClassValid("bg-red-500")).toBe(false);
	});
});
