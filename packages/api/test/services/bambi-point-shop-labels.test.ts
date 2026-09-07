import { describe, expect, it } from "vitest";

import {
	POINT_SHOP_AUDIENCES,
	POINT_SHOP_BENEFIT_TYPES,
	POINT_SHOP_ORDER_STATUSES,
} from "@/services/bambi-point-shop";
import {
	pointShopAudienceLabel,
	pointShopBenefitTypeLabel,
	pointShopBuyerStatusLabel,
	pointShopOrderStatusLabel,
} from "@/services/bambi-point-shop-labels";

const FALLBACK = /확인 필요/;

describe("point shop labels", () => {
	it("주문 상태 enum 전수에 구매자·운영자 라벨이 있다", () => {
		for (const status of POINT_SHOP_ORDER_STATUSES) {
			expect(pointShopBuyerStatusLabel(status)).not.toMatch(FALLBACK);
			expect(pointShopOrderStatusLabel(status)).not.toMatch(FALLBACK);
		}
	});

	it("혜택 유형·대상 enum 전수에 라벨이 있다", () => {
		for (const type of POINT_SHOP_BENEFIT_TYPES) {
			expect(pointShopBenefitTypeLabel(type)).not.toMatch(FALLBACK);
		}
		for (const audience of POINT_SHOP_AUDIENCES) {
			expect(pointShopAudienceLabel(audience)).not.toMatch(FALLBACK);
		}
	});

	it("모르는 값은 원값 대신 중립 폴백을 낸다", () => {
		expect(pointShopBuyerStatusLabel("weird")).toBe("상태 확인 필요");
		expect(pointShopBenefitTypeLabel("weird")).toBe("혜택 확인 필요");
	});
});
