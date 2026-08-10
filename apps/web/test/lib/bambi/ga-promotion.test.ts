import { afterEach, describe, expect, it, vi } from "vitest";

import {
	buildPromotionParams,
	shouldTrackPromotion,
	trackPromotionSelect,
	trackPromotionView,
} from "@/lib/bambi/ga-promotion";

const paidBanner = { crawled: false, id: "job-1", title: "강남 라운지 급구" };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("shouldTrackPromotion", () => {
	it("자체 결제 배너는 계측 대상이다", () => {
		expect(shouldTrackPromotion(paidBanner)).toBe(true);
	});

	it("크롤링 채움 배너는 제외한다", () => {
		expect(shouldTrackPromotion({ ...paidBanner, crawled: true })).toBe(false);
	});

	it("빈 슬롯(null)은 제외한다", () => {
		expect(shouldTrackPromotion(null)).toBe(false);
	});
});

describe("buildPromotionParams", () => {
	it("이벤트 레벨 프로모션 식별자와 item 레벨 슬롯 정보를 조립한다", () => {
		expect(buildPromotionParams(paidBanner, "seeker_center_2", 1)).toEqual({
			items: [
				{
					creative_slot: "seeker_center_2",
					index: 1,
					item_id: "job-1",
					item_name: "강남 라운지 급구",
				},
			],
			promotion_id: "premium-banner",
			promotion_name: "프리미엄 배너",
		});
	});
});

describe("track 함수", () => {
	it("gtag가 있으면 view_promotion을 보낸다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		trackPromotionView(paidBanner, "seeker_left_1", 0);
		expect(gtag).toHaveBeenCalledWith(
			"event",
			"view_promotion",
			buildPromotionParams(paidBanner, "seeker_left_1", 0)
		);
	});

	it("gtag가 있으면 select_promotion을 보낸다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		trackPromotionSelect(paidBanner, "community_center_3", 2);
		expect(gtag).toHaveBeenCalledWith(
			"event",
			"select_promotion",
			buildPromotionParams(paidBanner, "community_center_3", 2)
		);
	});

	it("window(SSR)나 gtag(비프로덕션)가 없으면 조용히 무시한다", () => {
		expect(() =>
			trackPromotionView(paidBanner, "seeker_left_1", 0)
		).not.toThrow();
		vi.stubGlobal("window", {});
		expect(() =>
			trackPromotionSelect(paidBanner, "seeker_left_1", 0)
		).not.toThrow();
	});

	it("크롤링 배너는 게이트를 건너뛴 호출에서도 전송하지 않는다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		trackPromotionView({ ...paidBanner, crawled: true }, "seeker_left_1", 0);
		expect(gtag).not.toHaveBeenCalled();
	});

	it("gtag가 예외를 던져도 전파하지 않는다", () => {
		vi.stubGlobal("window", {
			gtag: () => {
				throw new Error("boom");
			},
		});
		expect(() =>
			trackPromotionView(paidBanner, "seeker_left_1", 0)
		).not.toThrow();
	});
});
