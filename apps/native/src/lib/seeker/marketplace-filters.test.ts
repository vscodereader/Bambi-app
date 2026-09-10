import { describe, expect, it } from "vitest";
import {
	activeMarketplaceFilterCount,
	DEFAULT_NATIVE_MARKETPLACE_FILTERS,
	marketplaceFilterInput,
} from "./marketplace-filters";

describe("native marketplace filters", () => {
	it("기본값은 서버 필터를 적용하지 않는다", () => {
		expect(marketplaceFilterInput(DEFAULT_NATIVE_MARKETPLACE_FILTERS)).toEqual({
			districtCode: undefined,
			industryCategory: undefined,
			minPayAmount: undefined,
			onlyBeginnerFriendly: false,
			onlyToday: false,
			onlyVerified: false,
			regionCode: undefined,
		});
	});
	it("지역·금액·boolean을 서버 입력으로 바꾼다", () => {
		const value = {
			...DEFAULT_NATIVE_MARKETPLACE_FILTERS,
			minimumPay: "15,000",
			onlyToday: true,
			regionCode: "1100000000",
		};
		expect(marketplaceFilterInput(value)).toMatchObject({
			minPayAmount: 15_000,
			onlyToday: true,
			regionCode: "1100000000",
		});
		expect(activeMarketplaceFilterCount(value)).toBe(3);
	});
});
