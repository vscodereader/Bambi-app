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

export interface PublicJobListRow {
	description: string | null;
	employerDisplayName: string | null;
	employerVerificationStatus: string | null;
	id: string;
	industryCategory: string;
	payAmount: number;
	payUnit: string;
	publishedAt: Date | null;
	region: string;
	status: string;
	teamDisplayName: string | null;
	title: string;
	workSchedule: string | null;
}

export interface PublicPromotedJobListRow extends PublicJobListRow {
	lastBoostedAt: Date | null;
	promotionEndsAt: Date;
	promotionStartsAt: Date;
	promotionStatus: PromotionStatus;
	promotionTier: PromotionTier;
}

export type PublicPromotedJobListItem = Omit<
	PublicPromotedJobListRow,
	"promotionEndsAt" | "promotionStartsAt" | "promotionStatus"
> & {
	isPromoted: true;
	promotionLabel: string;
};

export type PublicOrganicJobListItem = PublicJobListRow & {
	isPromoted: false;
	lastBoostedAt: null;
	promotionLabel: null;
	promotionTier: null;
};

export interface PublicJobSections {
	sections: {
		organic: PublicOrganicJobListItem[];
		premium: PublicPromotedJobListItem[];
		recommended: PublicPromotedJobListItem[];
	};
	totalCount: number;
}

interface BuildPublicJobSectionsInput {
	limit: number;
	now: Date;
	organicRows: PublicJobListRow[];
	premiumRows: PublicPromotedJobListRow[];
	recommendedRows: PublicPromotedJobListRow[];
}

interface CampaignEmployerAccessInput {
	organizationId: string;
	teamId?: null | string;
}

export interface CampaignEmployerAccessScope {
	organizationId: string;
	teamId?: null | string;
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

const promotedSectionLimits = {
	premium: 5,
	recommended: 10,
} as const satisfies Record<PromotedSection, number>;

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

const toPromotedJobListItem = (
	row: PublicPromotedJobListRow,
	now: Date
): PublicPromotedJobListItem | null => {
	const campaign: PromotionCampaignForListing = {
		endsAt: row.promotionEndsAt,
		id: row.id,
		jobPostStatus: row.status as JobPostStatus,
		lastBoostedAt: row.lastBoostedAt,
		manualBoostsTotal: 0,
		manualBoostsUsed: 0,
		startsAt: row.promotionStartsAt,
		status: row.promotionStatus,
		tier: row.promotionTier,
	};

	if (!isCampaignPubliclyActive(campaign, now)) {
		return null;
	}

	const { promotionEndsAt, promotionStartsAt, promotionStatus, ...publicRow } =
		row;

	return {
		...publicRow,
		isPromoted: true,
		promotionLabel: getPromotionLabel(row.promotionTier),
	};
};

const sortPromotedJobRows = (
	rows: PublicPromotedJobListRow[]
): PublicPromotedJobListRow[] =>
	rows.toSorted((left, right) => {
		const boostDifference =
			getTimestamp(right.lastBoostedAt) - getTimestamp(left.lastBoostedAt);

		if (boostDifference !== 0) {
			return boostDifference;
		}

		return right.promotionStartsAt.getTime() - left.promotionStartsAt.getTime();
	});

const buildPromotedSection = (
	rows: PublicPromotedJobListRow[],
	now: Date,
	limit: number
): PublicPromotedJobListItem[] =>
	sortPromotedJobRows(rows)
		.map((row) => toPromotedJobListItem(row, now))
		.filter((row): row is PublicPromotedJobListItem => row !== null)
		.slice(0, limit);

export const buildPublicJobSections = ({
	limit,
	now,
	organicRows,
	premiumRows,
	recommendedRows,
}: BuildPublicJobSectionsInput): PublicJobSections => {
	const premium = buildPromotedSection(
		premiumRows,
		now,
		promotedSectionLimits.premium
	);
	const recommended = buildPromotedSection(
		recommendedRows,
		now,
		promotedSectionLimits.recommended
	);
	const promotedJobIds = new Set(
		[...premium, ...recommended].map((job) => job.id)
	);
	const organicLimit = Math.max(0, limit - premium.length - recommended.length);
	const organic = organicRows
		.filter((row) => row.status === "published" && !promotedJobIds.has(row.id))
		.slice(0, organicLimit)
		.map(
			(row): PublicOrganicJobListItem => ({
				...row,
				isPromoted: false,
				lastBoostedAt: null,
				promotionLabel: null,
				promotionTier: null,
			})
		);

	return {
		sections: {
			organic,
			premium,
			recommended,
		},
		totalCount: premium.length + recommended.length + organic.length,
	};
};

export const getCampaignEmployerAccessScope = ({
	organizationId,
	teamId,
}: CampaignEmployerAccessInput): CampaignEmployerAccessScope => ({
	organizationId,
	teamId,
});
