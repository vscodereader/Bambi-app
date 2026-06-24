import type { JobPostStatus } from "./bambi-policy";

export const promotionTiers = ["premium", "recommended", "standard"] as const;
export const promotionStatuses = [
	"draft",
	"pending_payment",
	"active",
	"paused",
	"expired",
	"canceled",
] as const;
export const promotedSections = ["premium", "recommended"] as const;

export type PromotionTier = (typeof promotionTiers)[number];
export type PromotionStatus = (typeof promotionStatuses)[number];
export type PromotedSection = (typeof promotedSections)[number];

export interface PromotionCampaignForListing {
	endsAt: Date;
	id: string;
	jobPostStatus: JobPostStatus;
	lastBoostedAt: Date | null;
	manualBoostsTotal: number;
	manualBoostsUsed: number;
	startsAt: Date;
	status: PromotionStatus;
	tier: PromotionTier;
}

export interface ManualBoostConsumption {
	lastBoostedAt: Date;
	manualBoostsUsed: number;
}

const promotionTierPriority = {
	premium: 0,
	recommended: 1,
	standard: 2,
} as const satisfies Record<PromotionTier, number>;

const promotionLabels = {
	premium: "프리미엄",
	recommended: "추천",
	standard: "일반",
} as const satisfies Record<PromotionTier, string>;

const getTimestamp = (date: Date | null): number => date?.getTime() ?? 0;

export const isCampaignPubliclyActive = (
	campaign: PromotionCampaignForListing,
	now: Date
): boolean =>
	campaign.status === "active" &&
	campaign.jobPostStatus === "published" &&
	campaign.startsAt.getTime() <= now.getTime() &&
	campaign.endsAt.getTime() > now.getTime();

export const getPromotionSection = (
	campaign: PromotionCampaignForListing,
	now: Date
): PromotedSection | null => {
	if (!isCampaignPubliclyActive(campaign, now)) {
		return null;
	}

	if (campaign.tier === "premium" || campaign.tier === "recommended") {
		return campaign.tier;
	}

	return null;
};

export const sortPromotedCampaigns = <
	TCampaign extends PromotionCampaignForListing,
>(
	campaigns: TCampaign[],
	now: Date
): TCampaign[] =>
	campaigns
		.filter((campaign) => getPromotionSection(campaign, now) !== null)
		.toSorted((left, right) => {
			const tierDifference =
				promotionTierPriority[left.tier] - promotionTierPriority[right.tier];

			if (tierDifference !== 0) {
				return tierDifference;
			}

			const boostDifference =
				getTimestamp(right.lastBoostedAt) - getTimestamp(left.lastBoostedAt);

			if (boostDifference !== 0) {
				return boostDifference;
			}

			return right.startsAt.getTime() - left.startsAt.getTime();
		});

export const getRemainingManualBoosts = (
	campaign: Pick<
		PromotionCampaignForListing,
		"manualBoostsTotal" | "manualBoostsUsed"
	>
): number =>
	Math.max(0, campaign.manualBoostsTotal - campaign.manualBoostsUsed);

export const canConsumeManualBoost = (
	campaign: PromotionCampaignForListing,
	now: Date
): boolean =>
	isCampaignPubliclyActive(campaign, now) &&
	getRemainingManualBoosts(campaign) > 0;

export const getManualBoostConsumption = (
	campaign: PromotionCampaignForListing,
	now: Date
): ManualBoostConsumption => {
	if (!canConsumeManualBoost(campaign, now)) {
		throw new Error("Manual boost is not available for this campaign.");
	}

	return {
		lastBoostedAt: now,
		manualBoostsUsed: campaign.manualBoostsUsed + 1,
	};
};

export const getPromotionLabel = (tier: PromotionTier): string =>
	promotionLabels[tier];
