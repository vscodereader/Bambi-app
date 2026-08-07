import { describe, expect, it, vi } from "vitest";

vi.mock("@bambi-app/db", () => ({ db: {} }));

import {
	type DiscountCampaign,
	discountCampaignStatus,
	resolveEffectiveAdPrice,
} from "./bambi-ad-discount-campaigns";

const campaign = (
	overrides: Partial<DiscountCampaign> = {}
): DiscountCampaign => ({
	adProductId: "11111111-1111-4111-8111-111111111111",
	cancelledAt: null,
	createdAt: new Date("2026-08-01T00:00:00.000Z"),
	createdByUserId: "moderator-1",
	discountPercent: 50,
	endsAtExclusive: new Date("2026-08-05T15:00:00.000Z"),
	id: "22222222-2222-4222-8222-222222222222",
	priceOptionDays: 30,
	startsAt: new Date("2026-08-03T15:00:00.000Z"),
	supersededById: null,
	updatedAt: new Date("2026-08-01T00:00:00.000Z"),
	...overrides,
});

describe("ad discount campaign pricing", () => {
	it("uses the campaign only inside its inclusive-start exclusive-end window", () => {
		const item = campaign();
		const campaignEnd = new Date("2026-08-05T15:00:00.000Z");
		expect(
			resolveEffectiveAdPrice({
				amount: 1_000_000,
				baseDiscountPercent: 5,
				campaigns: [item],
				now: new Date("2026-08-04T00:00:00.000Z"),
			})
		).toMatchObject({
			amount: 500_000,
			campaignEndsAt: new Date("2026-08-05T14:59:00.000Z"),
			campaignStartsAt: new Date("2026-08-03T15:00:00.000Z"),
			discountPercent: 50,
		});
		expect(
			resolveEffectiveAdPrice({
				amount: 1_000_000,
				baseDiscountPercent: 5,
				campaigns: [item],
				now: campaignEnd,
			})
		).toMatchObject({
			amount: 950_000,
			campaignEndsAt: null,
			campaignStartsAt: null,
			discountPercent: 5,
		});
	});

	it("supports an indefinite campaign and ignores a cancelled campaign", () => {
		const indefinite = campaign({ endsAtExclusive: null });
		expect(
			resolveEffectiveAdPrice({
				amount: 1_000_000,
				baseDiscountPercent: 5,
				campaigns: [indefinite],
				now: new Date("2030-01-01T00:00:00.000Z"),
			})
		).toMatchObject({ amount: 500_000, discountPercent: 50 });
		expect(
			resolveEffectiveAdPrice({
				amount: 1_000_000,
				baseDiscountPercent: 5,
				campaigns: [
					campaign({ cancelledAt: new Date("2026-08-04T00:00:00.000Z") }),
				],
				now: new Date("2026-08-04T01:00:00.000Z"),
			})
		).toMatchObject({ amount: 950_000, discountPercent: 5 });
	});

	it("reports planned, active, ended, and cancelled states", () => {
		const item = campaign();
		const campaignEnd = new Date("2026-08-05T15:00:00.000Z");
		expect(discountCampaignStatus(item, new Date("2026-08-02T00:00:00Z"))).toBe(
			"planned"
		);
		expect(discountCampaignStatus(item, new Date("2026-08-04T00:00:00Z"))).toBe(
			"active"
		);
		expect(discountCampaignStatus(item, campaignEnd)).toBe("ended");
		expect(
			discountCampaignStatus(
				campaign({ cancelledAt: new Date("2026-08-04T00:00:00Z") }),
				new Date("2026-08-04T01:00:00Z")
			)
		).toBe("cancelled");
	});
});
