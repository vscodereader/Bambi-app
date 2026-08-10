import { describe, expect, it } from "vitest";

import {
	resolveJobDetailDesign,
	sumJobPaymentAmount,
} from "@/services/bambi-job-detail-design";

describe("sumJobPaymentAmount", () => {
	it("둘 다 null이면 null이다(무료 공고)", () => {
		expect(sumJobPaymentAmount(null, null)).toBeNull();
	});

	it("노출 금액만 있으면 그대로 반환한다", () => {
		expect(sumJobPaymentAmount(50_000, null)).toBe(50_000);
	});

	it("노출 금액과 옵션 금액을 더한다", () => {
		expect(sumJobPaymentAmount(50_000, 30_000)).toBe(80_000);
	});

	it("옵션 금액만 있으면 그 값만 반환한다", () => {
		expect(sumJobPaymentAmount(null, 30_000)).toBe(30_000);
	});
});

describe("resolveJobDetailDesign", () => {
	it("신청하면 상품 가격을 스냅샷하고 requested로 시작한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 30_000, detailDesignStatus: "requested" },
		});
	});

	it("옵션이 없는 상품(가격 null)에 신청하면 not_offered로 거절한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				productDetailDesignPrice: null,
				requested: true,
			})
		).toEqual({ code: "not_offered", ok: false });
	});

	it("클라이언트가 본 가격과 서버 가격이 다르면 amount_changed로 거절한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				expectedAmount: 20_000,
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			code: "amount_changed",
			expectedAmount: 20_000,
			ok: false,
			price: 30_000,
		});
	});

	it("이미 completed면 상태를 requested로 되돌리지 않는다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 30_000, detailDesignStatus: "completed" },
		});
	});

	it("해제하면 금액·상태를 모두 null로 되돌린다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "requested",
				productDetailDesignPrice: 30_000,
				requested: false,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: null, detailDesignStatus: null },
		});
	});

	it("completed인 공고는 해제할 수 없다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: 30_000,
				requested: false,
			})
		).toEqual({ code: "completed_locked", ok: false });
	});
});
