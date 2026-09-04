import { describe, expect, it } from "vitest";

import type {
	AnalyticsSummaryMetrics,
	AnalyticsSummaryPlacement,
} from "./ad-analytics";
import {
	formatRate,
	getPlacementMetrics,
	sumAnalyticsTotals,
} from "./ad-analytics";

type SectionMetrics = AnalyticsSummaryPlacement["sectionMetrics"];
type Metrics = AnalyticsSummaryMetrics["metrics"];

const sections = (overrides: Partial<SectionMetrics> = {}): SectionMetrics => ({
	leftBannerImpressions: 0,
	organicImpressions: 0,
	premiumBannerImpressions: 0,
	recommendedImpressions: 0,
	rightBannerImpressions: 0,
	specialImpressions: 0,
	urgentImpressions: 0,
	...overrides,
});

const metrics = (overrides: Partial<Metrics> = {}): Metrics => ({
	autoBoostFires: 0,
	chatStarts: 0,
	contactReveals: 0,
	detailViews: 0,
	impressions: 0,
	...overrides,
});

const keysOf = (summary: AnalyticsSummaryPlacement) =>
	getPlacementMetrics(summary).map((item) => item.key);

describe("formatRate", () => {
	it("분모가 0이면 NaN 대신 0.0%다", () => {
		expect(formatRate(0, 0)).toBe("0.0%");
		expect(formatRate(5, 0)).toBe("0.0%");
	});

	it("소수 첫째 자리까지 반올림한다", () => {
		expect(formatRate(1, 3)).toBe("33.3%");
		expect(formatRate(25, 100)).toBe("25.0%");
		expect(formatRate(3, 3)).toBe("100.0%");
	});
});

describe("sumAnalyticsTotals", () => {
	it("공고가 없으면 모두 0이다", () => {
		expect(sumAnalyticsTotals([])).toEqual({
			autoBoostFires: 0,
			chatStarts: 0,
			detailViews: 0,
			impressions: 0,
			leftBannerImpressions: 0,
			organicImpressions: 0,
			premiumBannerImpressions: 0,
			recommendedImpressions: 0,
			rightBannerImpressions: 0,
			specialImpressions: 0,
			urgentImpressions: 0,
		});
	});

	it("공고별 누적·섹션 지표를 모두 더한다", () => {
		const totals = sumAnalyticsTotals([
			{
				metrics: metrics({ chatStarts: 1, detailViews: 4, impressions: 10 }),
				sectionMetrics: sections({
					organicImpressions: 6,
					specialImpressions: 4,
				}),
			},
			{
				metrics: metrics({
					autoBoostFires: 3,
					chatStarts: 2,
					detailViews: 6,
					impressions: 20,
				}),
				sectionMetrics: sections({
					organicImpressions: 5,
					premiumBannerImpressions: 15,
				}),
			},
		]);

		expect(totals.impressions).toBe(30);
		expect(totals.detailViews).toBe(10);
		expect(totals.chatStarts).toBe(3);
		expect(totals.autoBoostFires).toBe(3);
		expect(totals.organicImpressions).toBe(11);
		expect(totals.specialImpressions).toBe(4);
		expect(totals.premiumBannerImpressions).toBe(15);
	});
});

describe("getPlacementMetrics", () => {
	it("일반 공고는 노출이 없어도 일반 배지만 남는다", () => {
		expect(
			keysOf({ exposureType: "standard", sectionMetrics: sections() })
		).toEqual(["organic"]);
	});

	it("구매한 리스팅 섹션은 아직 0이어도 보여 준다", () => {
		expect(
			keysOf({ exposureType: "urgent", sectionMetrics: sections() })
		).toEqual(["urgent", "organic"]);
	});

	it("배너 상품은 상단·좌측·우측 세 슬롯을 함께 켠다", () => {
		expect(
			keysOf({ exposureType: "premium-banner", sectionMetrics: sections() })
		).toEqual(["organic", "premiumBanner", "leftBanner", "rightBanner"]);
		// 레거시 left-banner 구매도 같은 프리미엄 풀이라 결과가 같아야 한다.
		expect(
			keysOf({ exposureType: "left-banner", sectionMetrics: sections() })
		).toEqual(["organic", "premiumBanner", "leftBanner", "rightBanner"]);
	});

	it("사지 않은 섹션도 실제 노출이 있으면 보여 준다", () => {
		expect(
			keysOf({
				exposureType: "standard",
				sectionMetrics: sections({ recommendedImpressions: 7 }),
			})
		).toEqual(["recommended", "organic"]);
	});

	it("값과 라벨은 섹션 지표와 서버 라벨 맵을 따른다", () => {
		expect(
			getPlacementMetrics({
				exposureType: "special",
				sectionMetrics: sections({ specialImpressions: 12 }),
			})
		).toEqual([
			{ key: "special", label: "스페셜 채용", value: 12 },
			{ key: "organic", label: "일반 구인", value: 0 },
		]);
	});
});
