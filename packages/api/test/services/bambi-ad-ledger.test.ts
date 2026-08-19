import { describe, expect, it } from "vitest";

import { buildAdLedgerInsert } from "@/services/bambi-ad-ledger";

const paidAdJob = {
	organizationId: "org-1",
	adProductId: "prod-1",
	exposureDurationDays: 30,
	exposureAmount: 50_000,
};

describe("buildAdLedgerInsert", () => {
	it("무료 공고(adProductId null)는 적재하지 않는다", () => {
		expect(
			buildAdLedgerInsert(
				"job-1",
				{ ...paidAdJob, adProductId: null },
				"moderation_single"
			)
		).toBeNull();
	});

	it("유료 광고 공고는 결제 스냅샷 1행을 만든다", () => {
		expect(
			buildAdLedgerInsert("job-1", paidAdJob, "moderation_single")
		).toEqual({
			organizationId: "org-1",
			jobPostId: "job-1",
			adProductId: "prod-1",
			durationDays: 30,
			amount: 50_000,
			source: "moderation_single",
		});
	});

	it("기간·금액이 null이면 0으로 채운다(count는 유지)", () => {
		const row = buildAdLedgerInsert(
			"job-2",
			{
				organizationId: "org-2",
				adProductId: "prod-2",
				exposureDurationDays: null,
				exposureAmount: null,
			},
			"moderation_bulk"
		);
		expect(row).toMatchObject({
			durationDays: 0,
			amount: 0,
			source: "moderation_bulk",
		});
	});
});
