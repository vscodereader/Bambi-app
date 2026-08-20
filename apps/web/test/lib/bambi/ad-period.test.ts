import { describe, expect, it } from "vitest";
import {
	AD_PERIOD_TIER_COLOR_PRESETS,
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

	it("주입한 티어 배열로 매핑한다(운영자 설정값)", () => {
		const custom = [
			{
				icon: "medal",
				colorClass: "text-sky-500",
				label: "A",
				minDays: 0,
				maxDays: 10,
			},
			{
				icon: "crown",
				colorClass: "text-violet-500",
				label: "B",
				minDays: 11,
				maxDays: null,
			},
		] as const;
		expect(adPeriodTier(5, custom).label).toBe("A");
		expect(adPeriodTier(10, custom).label).toBe("A");
		expect(adPeriodTier(11, custom).label).toBe("B");
		expect(adPeriodTier(9999, custom).label).toBe("B");
	});

	it("상한 없는 최상위가 없으면 초과 일수를 최상위로 올린다", () => {
		const bounded = [
			{
				icon: "medal",
				colorClass: "text-sky-500",
				label: "A",
				minDays: 0,
				maxDays: 10,
			},
			{
				icon: "crown",
				colorClass: "text-violet-500",
				label: "B",
				minDays: 11,
				maxDays: 20,
			},
		] as const;
		expect(adPeriodTier(9999, bounded).label).toBe("B");
	});

	it("빈 배열을 주입하면 상수로 폴백한다", () => {
		expect(adPeriodTier(50, []).label).toBe(AD_PERIOD_TIERS[0].label);
		expect(adPeriodTier(9999, []).label).toBe(AD_PERIOD_TIERS[4].label);
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

describe("ad-period tier presets", () => {
	it("색 프리셋 첫 항목이 브랜드 primary", () => {
		expect(AD_PERIOD_TIER_COLOR_PRESETS[0].className).toBe("text-primary");
	});
});
