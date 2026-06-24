import { describe, expect, it } from "vitest";

import {
	buildPublicJobSections,
	canConsumeManualBoost,
	getCampaignEmployerAccessScope,
	getManualBoostConsumption,
	getPromotionSection,
	getRemainingManualBoosts,
	isCampaignPubliclyActive,
	type PromotionCampaignForListing,
	type PublicJobListRow,
	type PublicPromotedJobListRow,
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

const makeJobRow = (
	overrides: Partial<PublicJobListRow> = {}
): PublicJobListRow => ({
	description: "안전한 채팅으로 면접 일정을 조율합니다.",
	employerDisplayName: "클럽 루나",
	employerVerificationStatus: "verified",
	id: "job-1",
	industryCategory: "라운지",
	payAmount: 180_000,
	payUnit: "일급",
	publishedAt: new Date("2026-06-20T09:00:00.000Z"),
	region: "서울 강남구",
	status: "published",
	teamDisplayName: null,
	title: "강남 라운지 홀 스태프",
	workSchedule: "20:00-02:00",
	...overrides,
});

const makePromotedJobRow = (
	overrides: Partial<PublicPromotedJobListRow> = {}
): PublicPromotedJobListRow => ({
	...makeJobRow(),
	lastBoostedAt: null,
	promotionEndsAt: FUTURE,
	promotionStartsAt: PAST,
	promotionStatus: "active",
	promotionTier: "premium",
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

	it("builds public job sections without unpublished jobs", () => {
		const sections = buildPublicJobSections({
			limit: 10,
			now: NOW,
			organicRows: [
				makeJobRow({ id: "organic-published" }),
				makeJobRow({ id: "organic-hidden", status: "hidden" }),
			],
			premiumRows: [
				makePromotedJobRow({ id: "premium-published" }),
				makePromotedJobRow({ id: "premium-hidden", status: "hidden" }),
			],
			recommendedRows: [],
		});

		expect(sections.totalCount).toBe(2);
		expect(sections.sections.premium.map((job) => job.id)).toEqual([
			"premium-published",
		]);
		expect(sections.sections.organic.map((job) => job.id)).toEqual([
			"organic-published",
		]);
	});

	it("adds promotion labels only for active public campaigns", () => {
		const sections = buildPublicJobSections({
			limit: 10,
			now: NOW,
			organicRows: [],
			premiumRows: [makePromotedJobRow({ id: "active-premium" })],
			recommendedRows: [
				makePromotedJobRow({
					id: "paused-recommended",
					promotionStatus: "paused",
					promotionTier: "recommended",
				}),
			],
		});

		expect(sections.sections.premium).toMatchObject([
			{
				id: "active-premium",
				isPromoted: true,
				promotionLabel: "프리미엄",
				promotionTier: "premium",
			},
		]);
		expect(sections.sections.recommended).toEqual([]);
	});

	it("builds employer access scope from the campaign organization before boost", () => {
		expect(
			getCampaignEmployerAccessScope({
				organizationId: "other-organization",
				teamId: "other-team",
			})
		).toEqual({
			organizationId: "other-organization",
			teamId: "other-team",
		});
	});
});
