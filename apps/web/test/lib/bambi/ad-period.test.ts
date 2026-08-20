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
			colorClass: "text-amber-800",
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
	it("색 프리셋 첫 항목이 브랜드(코럴)", () => {
		expect(AD_PERIOD_TIER_COLOR_PRESETS[0].className).toBe("text-coral-700");
		expect(AD_PERIOD_TIER_COLOR_PRESETS[0].label).toBe("브랜드(코럴)");
	});
});

// Tailwind v4 기본 팔레트 + @theme coral 토큰 hex. WCAG 대비를 계산하려면 원 hex가 필요하다.
// 운영자가 프리셋/폴백 등급에 새 색을 추가할 때 흰 카드 배경 대비 미달을 CI에서 잡는다.
const TEXT_CLASS_HEX: Record<string, string> = {
	"text-coral-700": "#c11f39",
	"text-amber-700": "#b45309",
	"text-amber-800": "#92400e",
	"text-slate-500": "#64748b",
	"text-slate-600": "#475569",
	"text-sky-700": "#0369a1",
	"text-violet-600": "#7c3aed",
};

// WCAG 상대휘도·대비비.
const channelLuminance = (channel: number): number => {
	const v = channel / 255;
	return v <= 0.039_28 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex: string): number => {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return (
		0.2126 * channelLuminance(r) +
		0.7152 * channelLuminance(g) +
		0.0722 * channelLuminance(b)
	);
};

// 흰 배경(#fff, L=1) 대비.
const contrastOnWhite = (hex: string): number =>
	(1 + 0.05) / (relativeLuminance(hex) + 0.05);

describe("ad-period tier 색 대비(WCAG AA)", () => {
	const classes = [
		...AD_PERIOD_TIER_COLOR_PRESETS.map((preset) => preset.className),
		...AD_PERIOD_TIERS.map((tier) => tier.colorClass),
	];

	it.each([
		...new Set(classes),
	])("%s 는 흰 배경 대비 4.5:1 이상", (className) => {
		const hex = TEXT_CLASS_HEX[className];
		// 색을 추가/교체했는데 hex 매핑을 안 넣으면 여기서 먼저 걸린다.
		expect(hex, `${className} hex 매핑 누락`).toBeDefined();
		expect(contrastOnWhite(hex)).toBeGreaterThanOrEqual(4.5);
	});
});
