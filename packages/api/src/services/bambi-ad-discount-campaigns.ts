import { db } from "@bambi-app/db";
import { adProductDiscountCampaign } from "@bambi-app/db/schema/bambi";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { discountedAdAmount } from "./bambi-ad-pricing";

export type DiscountCampaign = typeof adProductDiscountCampaign.$inferSelect;

export const discountCampaignStatus = (
	campaign: DiscountCampaign,
	now: Date
): "active" | "cancelled" | "ended" | "planned" => {
	if (campaign.cancelledAt) {
		return "cancelled";
	}
	if (campaign.endsAtExclusive && campaign.endsAtExclusive <= now) {
		return "ended";
	}
	if (campaign.startsAt > now) {
		return "planned";
	}
	return "active";
};

export const resolveEffectiveAdPrice = ({
	amount,
	baseDiscountPercent,
	campaigns,
	now,
}: {
	amount: number;
	baseDiscountPercent: number;
	campaigns: DiscountCampaign[];
	now: Date;
}) => {
	const active = campaigns
		.filter((campaign) => discountCampaignStatus(campaign, now) === "active")
		.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
	const discountPercent = active?.discountPercent ?? baseDiscountPercent;
	const futureBoundaries = campaigns.flatMap((campaign) => {
		if (campaign.cancelledAt) {
			return [];
		}
		const values: Date[] = [];
		if (campaign.startsAt > now) {
			values.push(campaign.startsAt);
		}
		if (campaign.endsAtExclusive && campaign.endsAtExclusive > now) {
			values.push(campaign.endsAtExclusive);
		}
		return values;
	});
	const nextPricingChangeAt = futureBoundaries.sort(
		(a, b) => a.getTime() - b.getTime()
	)[0];
	return {
		amount: discountedAdAmount(amount, discountPercent),
		campaignEndsAt: active?.endsAtExclusive
			? new Date(active.endsAtExclusive.getTime() - 60_000)
			: null,
		campaignStartsAt: active?.startsAt ?? null,
		discountPercent,
		nextPricingChangeAt: nextPricingChangeAt ?? null,
	};
};

export const loadDiscountCampaigns = async (
	productIds: string[]
): Promise<DiscountCampaign[]> => {
	if (productIds.length === 0) {
		return [];
	}
	return await db
		.select()
		.from(adProductDiscountCampaign)
		.where(inArray(adProductDiscountCampaign.adProductId, productIds));
};

export const loadOpenDiscountCampaigns = async (
	productId: string,
	priceOptionDays: number
) =>
	await db
		.select()
		.from(adProductDiscountCampaign)
		.where(
			and(
				eq(adProductDiscountCampaign.adProductId, productId),
				eq(adProductDiscountCampaign.priceOptionDays, priceOptionDays),
				isNull(adProductDiscountCampaign.cancelledAt)
			)
		);
