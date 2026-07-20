import { describe, expect, it } from "vitest";

import {
	formatJobAdBannerSpec,
	getJobAdBannerCropDirection,
} from "./job-ad-banner-spec";

describe("getJobAdBannerCropDirection", () => {
	it("stays quiet for near-spec sizes the old ±2% gate rejected", () => {
		// 1200×500(2.400)은 7:3(2.333)과 2.9% 차이 — 반려 기준으론 걸렸지만 눈에 띄게
		// 잘리는 수준은 아니라 경고하지 않는다.
		expect(
			getJobAdBannerCropDirection({
				height: 500,
				usage: "ad_horizontal",
				width: 1200,
			})
		).toBeNull();
	});

	it("warns about side cropping when the image is too wide", () => {
		// 970×250(3.88)은 7:3보다 훨씬 넓적해서 좌우가 잘린다.
		expect(
			getJobAdBannerCropDirection({
				height: 250,
				usage: "ad_horizontal",
				width: 970,
			})
		).toBe("sides");
	});

	it("warns about side cropping for 9:16 verticals", () => {
		// 세로 소재 사실상 표준인 1080×1920(0.5625)은 4:9(0.444)보다 넓적해 좌우가 잘린다.
		expect(
			getJobAdBannerCropDirection({
				height: 1920,
				usage: "ad_vertical",
				width: 1080,
			})
		).toBe("sides");
	});

	it("warns about top/bottom cropping when the image is too tall", () => {
		// 정사각형(1.0)은 7:3 슬롯보다 길쭉해서 위아래가 잘린다.
		expect(
			getJobAdBannerCropDirection({
				height: 1000,
				usage: "ad_horizontal",
				width: 1000,
			})
		).toBe("topBottom");
	});

	it("says nothing when dimensions are missing", () => {
		expect(
			getJobAdBannerCropDirection({
				height: 0,
				usage: "ad_horizontal",
				width: 0,
			})
		).toBeNull();
	});
});

describe("formatJobAdBannerSpec", () => {
	it("presents the ratio as recommended and the size as required", () => {
		expect(formatJobAdBannerSpec("ad_horizontal")).toBe(
			"권장 비율 7:3 · 최소 150×50px"
		);
		expect(formatJobAdBannerSpec("ad_vertical")).toBe(
			"권장 비율 4:9 · 권장 크기 400×900px"
		);
	});
});
