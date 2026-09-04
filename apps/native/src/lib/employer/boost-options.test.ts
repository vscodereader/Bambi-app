import { describe, expect, it } from "vitest";

import {
	canOpenBoostPurchase,
	canSubmitBoostPurchase,
	getCancelableBoostPurchases,
} from "./boost-options";

describe("canOpenBoostPurchase", () => {
	it("일반 공고는 연다", () => {
		expect(canOpenBoostPurchase("standard")).toBe(true);
	});

	// 배너 광고는 서버가 구매를 거부한다 — 진입 버튼 자체를 숨긴다.
	it("배너 광고는 열지 않는다", () => {
		expect(canOpenBoostPurchase("premium-banner")).toBe(false);
	});
});

describe("getCancelableBoostPurchases", () => {
	const base = {
		amount: 30_000,
		id: "p1",
		optionType: "manual_period" as const,
		paymentStatus: "unpaid",
		purchaseSource: "standalone",
	};

	it("미결제 단독 구매만 남긴다", () => {
		expect(getCancelableBoostPurchases([base])).toHaveLength(1);
	});

	it("입금이 확인된 구매는 뺀다", () => {
		expect(
			getCancelableBoostPurchases([{ ...base, paymentStatus: "paid" }])
		).toHaveLength(0);
	});

	// 공고 등록과 함께 산 옵션은 서버가 취소를 거부한다(공고 결제에서 관리).
	it("공고 결제에 묶인 구매는 뺀다", () => {
		expect(
			getCancelableBoostPurchases([{ ...base, purchaseSource: "job_payment" }])
		).toHaveLength(0);
	});

	it("입력이 없으면 빈 배열", () => {
		expect(getCancelableBoostPurchases(undefined)).toEqual([]);
	});
});

describe("canSubmitBoostPurchase", () => {
	it("옵션을 고르고 무통장이면 살 수 있다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: false,
				paymentMethod: "bank_transfer",
				selectedType: "manual_period",
			})
		).toBe(true);
	});

	it("옵션을 안 고르면 못 산다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: false,
				paymentMethod: "bank_transfer",
				selectedType: null,
			})
		).toBe(false);
	});

	// 카드 결제는 아직 준비 중이라 화면에서 막는다(공고 결제와 같은 축).
	it("카드 결제는 막는다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: false,
				paymentMethod: "card",
				selectedType: "manual_period",
			})
		).toBe(false);
	});

	it("요청 중이면 중복 제출을 막는다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: true,
				paymentMethod: "bank_transfer",
				selectedType: "manual_period",
			})
		).toBe(false);
	});
});
