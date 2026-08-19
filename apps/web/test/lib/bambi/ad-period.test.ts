import { describe, expect, it } from "vitest";
import {
	AD_PERIOD_TIERS,
	adPeriodTier,
	formatAdPeriod,
	formatAdPeriodTierRange,
} from "@/lib/bambi/ad-period";

const TAILWIND_TEXT_CLASS = /^text-/;

describe("adPeriodTier", () => {
	it("0일·경계값을 올바른 티어로 매핑한다", () => {
		expect(adPeriodTier(0).label).toBe(AD_PERIOD_TIERS[0].label);
		expect(adPeriodTier(90).label).toBe(AD_PERIOD_TIERS[0].label);
		expect(adPeriodTier(91).label).toBe(AD_PERIOD_TIERS[1].label);
		expect(adPeriodTier(360).label).toBe(AD_PERIOD_TIERS[2].label);
		expect(adPeriodTier(361).label).toBe(AD_PERIOD_TIERS[3].label);
		expect(adPeriodTier(9999).label).toBe(AD_PERIOD_TIERS[4].label);
	});

	it("최상위 티어만 상한이 없다(crown·gold)", () => {
		expect(AD_PERIOD_TIERS.at(-1)?.maxDays).toBeNull();
		expect(adPeriodTier(721)).toMatchObject({
			icon: "crown",
			colorClass: "text-amber-500",
		});
	});

	it("색 토큰은 raw hex가 아니라 Tailwind 유틸이다", () => {
		for (const tier of AD_PERIOD_TIERS) {
			expect(tier.colorClass).toMatch(TAILWIND_TEXT_CLASS);
		}
	});
});

describe("formatAdPeriod", () => {
	it("N회 N일 포맷", () => {
		expect(formatAdPeriod({ count: 22, totalDays: 900 })).toBe("22회 900일");
	});

	it("totalDays 0이어도 포맷을 그대로 노출한다", () => {
		expect(formatAdPeriod({ count: 1, totalDays: 0 })).toBe("1회 0일");
	});
});

describe("formatAdPeriodTierRange", () => {
	it("범위·상한 없는 최상위를 문구로 만든다", () => {
		expect(formatAdPeriodTierRange(AD_PERIOD_TIERS[1])).toBe("누적 91~180일");
		expect(formatAdPeriodTierRange(AD_PERIOD_TIERS[4])).toBe("누적 721일 이상");
	});
});
