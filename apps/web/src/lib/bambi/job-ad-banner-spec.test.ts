import { describe, expect, it } from "vitest";

import {
	findJobAdBannerRejection,
	formatJobAdBannerSpec,
	isAllowedJobAdBannerAspect,
} from "./job-ad-banner-spec";

describe("isAllowedJobAdBannerAspect", () => {
	it("allows sizes within the ±15% band the object-cover crop absorbs", () => {
		// 1200×500(2.400)은 7:3(2.333)과 오차 2.9% — 티 없이 잘리므로 통과시킨다.
		expect(
			isAllowedJobAdBannerAspect({
				height: 500,
				usage: "ad_horizontal",
				width: 1200,
			})
		).toBe(true);
	});

	it("rejects a horizontal banner far too wide for 7:3", () => {
		// 970×250(3.88)은 7:3보다 훨씬 넓적해 좌우가 크게 잘린다.
		expect(
			isAllowedJobAdBannerAspect({
				height: 250,
				usage: "ad_horizontal",
				width: 970,
			})
		).toBe(false);
	});

	it("rejects 9:16 verticals that are off the 4:9 spec", () => {
		// 세로 표준 1080×1920(0.5625)은 4:9(0.444)보다 넓적해 좌우가 크게 잘린다.
		expect(
			isAllowedJobAdBannerAspect({
				height: 1920,
				usage: "ad_vertical",
				width: 1080,
			})
		).toBe(false);
	});

	it("rejects a square image in a 7:3 slot", () => {
		expect(
			isAllowedJobAdBannerAspect({
				height: 1000,
				usage: "ad_horizontal",
				width: 1000,
			})
		).toBe(false);
	});

	it("does not judge when dimensions are missing", () => {
		// 치수를 못 읽었으면 크기 검증이 잡으므로 비율은 판단하지 않는다.
		expect(
			isAllowedJobAdBannerAspect({
				height: 0,
				usage: "ad_horizontal",
				width: 0,
			})
		).toBe(true);
	});
});

describe("formatJobAdBannerSpec", () => {
	it("shows the ratio plus both the minimum and recommended sizes", () => {
		expect(formatJobAdBannerSpec("ad_horizontal")).toBe(
			"권장 비율 7:3 · 최소 700×300px · 권장 1400×600px"
		);
		expect(formatJobAdBannerSpec("ad_vertical")).toBe(
			"권장 비율 4:9 · 최소 400×900px"
		);
	});
});

// 에디터 저장 가드와 이미지 슬롯 경고가 같은 판정을 써야 "등록할 수 없습니다"라고 띄우고도
// 저장이 통과하는 어긋남이 안 생긴다.
describe("findJobAdBannerRejection", () => {
	it("names the aspect and size violations, and clears a valid image", () => {
		expect(
			findJobAdBannerRejection({
				height: 1000,
				usage: "ad_horizontal",
				width: 1000,
			})
		).toBe("aspect");
		expect(
			findJobAdBannerRejection({
				height: 300,
				usage: "ad_horizontal",
				width: 700,
			})
		).toBe(null);
		expect(
			findJobAdBannerRejection({
				height: 150,
				usage: "ad_horizontal",
				width: 350,
			})
		).toBe("size");
	});

	it("stays silent when dimensions could not be read", () => {
		// 치수를 못 읽은 항목은 폼 검증이 따로 잡는다. 여기서 막으면 사유가 겹친다.
		expect(findJobAdBannerRejection({ usage: "ad_horizontal" })).toBe(null);
	});
});
