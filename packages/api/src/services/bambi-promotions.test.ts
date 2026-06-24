import { describe, expect, it } from "vitest";

import {
	canConsumeManualBoost,
	getManualBoostConsumption,
	getPromotionSection,
	getRemainingManualBoosts,
	isCampaignPubliclyActive,
	type PromotionCampaignForListing,
	sortPromotedCampaigns,
} from "./bambi-promotions";

const NOW = new Date("2026-06-24T09:00:00.000Z");
const FUTURE = new Date("2026-06-25T09:00:00.000Z");
const PAST = new Date("2026-06-23T09:00:00.000Z");

const makeCampaign = (
	overrides: Partial<PromotionCampaignForListing> = {}
): PromotionCampaignForListing => ({
	endsAt: FUTURE,
	id: "campaign-1",
	jobPostStatus: "published",
	lastBoostedAt: null,
	manualBoostsTotal: 3,
	manualBoostsUsed: 0,
	startsAt: PAST,
	status: "active",
	tier: "recommended",
	...overrides,
});

describe("bambi promotions", () => {
	it("places active premium campaigns before active recommended campaigns", () => {
		const campaigns = [
			makeCampaign({
				id: "recommended",
				lastBoostedAt: new Date("2026-06-24T08:00:00.000Z"),
				tier: "recommended",
			}),
			makeCampaign({
				id: "premium",
				lastBoostedAt: new Date("2026-06-24T07:00:00.000Z"),
				tier: "premium",
			}),
		];

		expect(
			sortPromotedCampaigns(campaigns, NOW).map((item) => item.id)
		).toEqual(["premium", "recommended"]);
	});

	it("keeps recommended campaigns in a promoted section instead of organic", () => {
		expect(
			getPromotionSection(makeCampaign({ tier: "recommended" }), NOW)
		).toBe("recommended");
		expect(getPromotionSection(makeCampaign({ tier: "premium" }), NOW)).toBe(
			"premium"
		);
		expect(getPromotionSection(makeCampaign({ tier: "standard" }), NOW)).toBe(
			null
		);
	});

	it("excludes inactive or hidden-job campaigns from public promoted sections", () => {
		const inactiveCampaigns = [
			makeCampaign({ endsAt: PAST }),
			makeCampaign({ status: "paused" }),
			makeCampaign({ status: "canceled" }),
			makeCampaign({ jobPostStatus: "hidden" }),
		];

		for (const campaign of inactiveCampaigns) {
			expect(isCampaignPubliclyActive(campaign, NOW)).toBe(false);
			expect(getPromotionSection(campaign, NOW)).toBe(null);
		}
	});

	it("sorts same-tier campaigns by latest boost and then start date", () => {
		const campaigns = [
			makeCampaign({
				id: "started-later",
				lastBoostedAt: null,
				startsAt: new Date("2026-06-24T06:00:00.000Z"),
			}),
			makeCampaign({
				id: "boosted",
				lastBoostedAt: new Date("2026-06-24T07:00:00.000Z"),
				startsAt: new Date("2026-06-23T06:00:00.000Z"),
			}),
			makeCampaign({
				id: "started-earlier",
				lastBoostedAt: null,
				startsAt: new Date("2026-06-23T06:00:00.000Z"),
			}),
		];

		expect(
			sortPromotedCampaigns(campaigns, NOW).map((item) => item.id)
		).toEqual(["boosted", "started-later", "started-earlier"]);
	});

	it("builds manual boost consumption values", () => {
		expect(
			getManualBoostConsumption(
				makeCampaign({ manualBoostsTotal: 3, manualBoostsUsed: 1 }),
				NOW
			)
		).toEqual({
			lastBoostedAt: NOW,
			manualBoostsUsed: 2,
		});
	});

	it("rejects manual boost when credits are exhausted or campaign is inactive", () => {
		expect(
			canConsumeManualBoost(
				makeCampaign({ manualBoostsTotal: 2, manualBoostsUsed: 2 }),
				NOW
			)
		).toBe(false);
		expect(canConsumeManualBoost(makeCampaign({ status: "paused" }), NOW)).toBe(
			false
		);
		expect(canConsumeManualBoost(makeCampaign(), NOW)).toBe(true);
	});

	it("returns remaining manual boosts without negative values", () => {
		expect(
			getRemainingManualBoosts(
				makeCampaign({ manualBoostsTotal: 5, manualBoostsUsed: 2 })
			)
		).toBe(3);
		expect(
			getRemainingManualBoosts(
				makeCampaign({ manualBoostsTotal: 2, manualBoostsUsed: 5 })
			)
		).toBe(0);
	});
});
