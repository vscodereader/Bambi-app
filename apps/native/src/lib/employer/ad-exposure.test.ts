import { describe, expect, it } from "vitest";

import { withSlotBackground } from "./ad-banner-layout";
import {
	describeAdSelection,
	formatAdPriceLabel,
	getMissingBannerUsages,
	getRequiredBannerUsages,
	resolveAdAmount,
	resolveDetailDesignSelection,
	resolvePayableAmount,
	resolveUsablePoints,
	validatePointsToUse,
} from "./ad-exposure";

describe("getRequiredBannerUsages", () => {
	it("프리미엄·레거시 사이드 상품은 가로형·세로형을 모두 요구한다", () => {
		expect(getRequiredBannerUsages("premium-top")).toEqual([
			"ad_horizontal",
			"ad_vertical",
		]);
		expect(getRequiredBannerUsages("side-vertical")).toEqual([
			"ad_horizontal",
			"ad_vertical",
		]);
	});

	it("리스팅 상품과 미선택은 배너를 요구하지 않는다", () => {
		expect(getRequiredBannerUsages("special-list")).toEqual([]);
		expect(getRequiredBannerUsages("none")).toEqual([]);
		expect(getRequiredBannerUsages(null)).toEqual([]);
	});
});

describe("getMissingBannerUsages", () => {
	const required = ["ad_horizontal", "ad_vertical"] as const;

	it("비어 있는 슬롯만 돌려준다", () => {
		expect(
			getMissingBannerUsages({ adHorizontal: { storageKey: "a" } }, required)
		).toEqual(["ad_vertical"]);
	});

	it("둘 다 채우면 빈 배열이다", () => {
		expect(
			getMissingBannerUsages(
				{ adHorizontal: { storageKey: "a" }, adVertical: { storageKey: "b" } },
				required
			)
		).toEqual([]);
	});

	it("요구 슬롯이 없으면 미디어가 비어도 통과다", () => {
		expect(getMissingBannerUsages({}, [])).toEqual([]);
	});

	it("단색 배경 슬롯은 이미지가 없어도 통과한다", () => {
		const layout = withSlotBackground(null, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});

		expect(
			getMissingBannerUsages(
				{ adVertical: { storageKey: "b" } },
				["ad_horizontal", "ad_vertical"],
				layout
			)
		).toEqual([]);
	});
});

describe("resolveDetailDesignSelection", () => {
	it("상품이 옵션을 팔면 선택을 유지한다", () => {
		expect(
			resolveDetailDesignSelection({
				detailDesignPrice: 50_000,
				requested: true,
			})
		).toEqual({ amount: 50_000, requested: true });
	});

	// 옵션을 안 파는 상품으로 바꾸면 선택이 남아 있으면 안 된다(서버도 스냅샷을 정리한다).
	it("옵션이 없으면 선택을 해제한다", () => {
		expect(
			resolveDetailDesignSelection({ detailDesignPrice: null, requested: true })
		).toEqual({ amount: null, requested: false });
	});
});

describe("금액 표기", () => {
	it("할인이 없으면 원가를 그대로 적는다", () => {
		expect(formatAdPriceLabel(330_000, 0)).toBe("330,000원");
		expect(resolveAdAmount(330_000, null)).toBe(330_000);
	});

	it("할인이 있으면 할인가와 할인율을 병기하고 금액도 할인가로 낮춘다", () => {
		expect(formatAdPriceLabel(100_000, 20)).toBe("80,000원 (20% 할인)");
		expect(resolveAdAmount(100_000, 20)).toBe(80_000);
	});
});

describe("describeAdSelection", () => {
	it("미선택은 무료 문구다", () => {
		expect(describeAdSelection(null)).toBe("일반 구인 (무료)");
	});

	it("선택하면 상품·기간·금액을 한 줄로 요약한다", () => {
		expect(
			describeAdSelection({
				adProductId: "p1",
				amount: 330_000,
				durationDays: 30,
				previewTemplate: "premium-top",
				productName: "프리미엄 광고",
			})
		).toBe("프리미엄 광고 · 30일 · 330,000원");
	});
});

describe("포인트", () => {
	it("보유·결제금액·운영자 상한 중 가장 작은 값이 상한이다", () => {
		expect(
			resolveUsablePoints({
				balance: 50_000,
				grossAmount: 330_000,
				maxPoints: 100_000,
			})
		).toBe(50_000);
		expect(
			resolveUsablePoints({
				balance: 500_000,
				grossAmount: 30_000,
				maxPoints: null,
			})
		).toBe(30_000);
	});

	it("0은 언제나 통과다", () => {
		expect(
			validatePointsToUse(0, { minPoints: 0, usablePoints: 0 })
		).toBeNull();
	});

	it("최소 단위 미만·상한 초과는 사유를 돌려준다", () => {
		expect(
			validatePointsToUse(500, { minPoints: 1000, usablePoints: 5000 })
		).toBe("최소 1,000P부터 사용할 수 있어요.");
		expect(
			validatePointsToUse(9000, { minPoints: 1000, usablePoints: 5000 })
		).toBe("이번 결제에는 최대 5,000P까지 사용할 수 있어요.");
	});

	it("쓸 수 있는 포인트가 최소 단위에 못 미치면 사용 자체를 막는다", () => {
		expect(
			validatePointsToUse(500, { minPoints: 1000, usablePoints: 800 })
		).toBe("지금은 포인트를 사용할 수 없어요.");
	});

	it("입금액은 포인트를 뺀 값이고 음수로 내려가지 않는다", () => {
		expect(resolvePayableAmount(30_000, 10_000)).toBe(20_000);
		expect(resolvePayableAmount(10_000, 30_000)).toBe(0);
	});
});
