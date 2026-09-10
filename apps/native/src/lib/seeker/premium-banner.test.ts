import { describe, expect, it } from "vitest";
import { premiumBannerHref, premiumBannerSlots } from "./premium-banner";

describe("premium banner", () => {
	it("고정 세 슬롯을 유지한다", () => {
		expect(premiumBannerSlots(["a"])).toEqual(["a", null, null]);
	});
	it("자체와 수집 상세 경로를 구분한다", () => {
		expect(premiumBannerHref({ id: "a", source: "original" })).toBe(
			"/(seeker)/jobs/a"
		);
		expect(premiumBannerHref({ id: "b", source: "crawled" })).toBe(
			"/(seeker)/jobs/crawled/b"
		);
	});
});
