import { describe, expect, it } from "vitest";

import {
	resolveCappedPointRefund,
	resolveJobPointUseLimit,
} from "@/services/bambi-job-payment-points";

describe("resolveJobPointUseLimit", () => {
	it("disables use until a positive minimum is configured", () => {
		expect(
			resolveJobPointUseLimit({
				balance: 10_000,
				grossAmount: 650_000,
				maximum: null,
				minimum: null,
			})
		).toEqual({ enabled: false, maximum: 10_000, minimum: 0 });
	});
	it("uses the smallest balance, charge and configured maximum", () => {
		expect(
			resolveJobPointUseLimit({
				balance: 2500,
				grossAmount: 650_000,
				maximum: 3000,
				minimum: 2000,
			})
		).toEqual({ enabled: true, maximum: 2500, minimum: 2000 });
	});
});

describe("resolveCappedPointRefund", () => {
	it("refunds only the room under the member cap", () => {
		expect(
			resolveCappedPointRefund({
				balance: 500,
				cap: 10_000,
				usedAmount: 10_000,
			})
		).toEqual({ forfeitedAmount: 500, refundAmount: 9500 });
	});
	it("forfeits the full refund when already at the cap", () => {
		expect(
			resolveCappedPointRefund({
				balance: 10_000,
				cap: 10_000,
				usedAmount: 2500,
			})
		).toEqual({ forfeitedAmount: 2500, refundAmount: 0 });
	});
});
