import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	employerOrganizationProfile,
	employerTeamProfile,
	jobPost,
	jobPromotionBoostEvent,
	jobPromotionCampaign,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
	type SessionLike,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import type { JobPostStatus } from "../../services/bambi-policy";
import {
	canConsumeManualBoost,
	getCampaignEmployerAccessScope,
	getManualBoostConsumption,
	getPromotionLabel,
	getRemainingManualBoosts,
	type PromotionCampaignForListing,
	type PromotionStatus,
	type PromotionTier,
	promotionTiers,
} from "../../services/bambi-promotions";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const campaignIdInput = z.object({
	campaignId: z.string().uuid(),
});

const createDraftInput = z.object({
	autoBoostsPerDay: z.number().int().min(0).max(24).default(0),
	days: z.number().int().min(1).max(30).default(7),
	jobPostId: z.string().uuid(),
	manualBoostsTotal: z.number().int().min(0).max(100).default(3),
	tier: z.enum(promotionTiers),
});

const getCampaignForAccess = async (
	campaignId: string,
	session: SessionLike | null | undefined
) => {
	const [row] = await db
		.select({
			id: jobPromotionCampaign.id,
			jobPostId: jobPromotionCampaign.jobPostId,
			organizationId: jobPromotionCampaign.organizationId,
			tier: jobPromotionCampaign.tier,
			status: jobPromotionCampaign.status,
			startsAt: jobPromotionCampaign.startsAt,
			endsAt: jobPromotionCampaign.endsAt,
			manualBoostsTotal: jobPromotionCampaign.manualBoostsTotal,
			manualBoostsUsed: jobPromotionCampaign.manualBoostsUsed,
			autoBoostsPerDay: jobPromotionCampaign.autoBoostsPerDay,
			lastBoostedAt: jobPromotionCampaign.lastBoostedAt,
			jobStatus: jobPost.status,
			teamId: jobPost.teamId,
			title: jobPost.title,
		})
		.from(jobPromotionCampaign)
		.innerJoin(jobPost, eq(jobPromotionCampaign.jobPostId, jobPost.id))
		.where(eq(jobPromotionCampaign.id, campaignId))
		.limit(1);

	if (!row) {
		throw new ORPCError("NOT_FOUND");
	}

	const actor = await requireEmployerPostingAccess({
		...getCampaignEmployerAccessScope(row),
		session,
	});

	return { actor, campaign: row };
};

const toCampaignForListing = (
	campaign: Awaited<ReturnType<typeof getCampaignForAccess>>["campaign"]
): PromotionCampaignForListing => ({
	endsAt: campaign.endsAt,
	id: campaign.id,
	jobPostStatus: campaign.jobStatus as JobPostStatus,
	lastBoostedAt: campaign.lastBoostedAt,
	manualBoostsTotal: campaign.manualBoostsTotal,
	manualBoostsUsed: campaign.manualBoostsUsed,
	startsAt: campaign.startsAt,
	status: campaign.status as PromotionStatus,
	tier: campaign.tier as PromotionTier,
});

export const promotionsRouter = {
	listMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		if (profile.role === "job_seeker") {
			throw new ORPCError("FORBIDDEN");
		}

		const organizationMemberships = await db
			.select({
				organizationId: member.organizationId,
				role: member.role,
			})
			.from(member)
			.where(eq(member.userId, profile.userId));
		const teamMemberships = await db
			.select({
				organizationId: team.organizationId,
				teamId: teamMember.teamId,
			})
			.from(teamMember)
			.innerJoin(team, eq(teamMember.teamId, team.id))
			.where(eq(teamMember.userId, profile.userId));
		const organizationIds = organizationMemberships.map(
			(membership) => membership.organizationId
		);
		const manageableOrganizationIds = organizationMemberships
			.filter(
				(membership) =>
					membership.role === "owner" || membership.role === "admin"
			)
			.map((membership) => membership.organizationId);
		const accessibleTeamPostScopes = getAccessibleTeamPostScopes({
			organizationIds,
			teamMemberships,
		});
		const accessFilters: SQL[] = [];

		if (manageableOrganizationIds.length > 0) {
			accessFilters.push(
				inArray(jobPost.organizationId, manageableOrganizationIds)
			);
		}

		for (const scope of accessibleTeamPostScopes) {
			const teamAccessFilter = and(
				eq(jobPost.organizationId, scope.organizationId),
				eq(jobPost.teamId, scope.teamId)
			);

			if (teamAccessFilter) {
				accessFilters.push(teamAccessFilter);
			}
		}

		if (accessFilters.length === 0) {
			return [];
		}

		const rows = await db
			.select({
				id: jobPromotionCampaign.id,
				jobPostId: jobPromotionCampaign.jobPostId,
				organizationId: jobPromotionCampaign.organizationId,
				tier: jobPromotionCampaign.tier,
				status: jobPromotionCampaign.status,
				startsAt: jobPromotionCampaign.startsAt,
				endsAt: jobPromotionCampaign.endsAt,
				manualBoostsTotal: jobPromotionCampaign.manualBoostsTotal,
				manualBoostsUsed: jobPromotionCampaign.manualBoostsUsed,
				autoBoostsPerDay: jobPromotionCampaign.autoBoostsPerDay,
				lastBoostedAt: jobPromotionCampaign.lastBoostedAt,
				jobTitle: jobPost.title,
				jobStatus: jobPost.status,
				employerDisplayName: employerOrganizationProfile.displayName,
				teamDisplayName: employerTeamProfile.displayName,
			})
			.from(jobPromotionCampaign)
			.innerJoin(jobPost, eq(jobPromotionCampaign.jobPostId, jobPost.id))
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
			)
			.where(or(...accessFilters))
			.orderBy(desc(jobPromotionCampaign.updatedAt));

		return rows.map((row) => ({
			...row,
			promotionLabel: getPromotionLabel(row.tier as PromotionTier),
			remainingManualBoosts: getRemainingManualBoosts(row),
		}));
	}),

	createDraft: protectedProcedure
		.input(createDraftInput)
		.handler(async ({ context, input }) => {
			const [post] = await db
				.select({
					id: jobPost.id,
					organizationId: jobPost.organizationId,
					teamId: jobPost.teamId,
				})
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			await requireEmployerPostingAccess({
				organizationId: post.organizationId,
				teamId: post.teamId,
				session: context.session,
			});

			const now = new Date();
			const [created] = await db
				.insert(jobPromotionCampaign)
				.values({
					autoBoostsPerDay: input.autoBoostsPerDay,
					endsAt: new Date(now.getTime() + input.days * MS_PER_DAY),
					jobPostId: post.id,
					manualBoostsTotal: input.manualBoostsTotal,
					manualBoostsUsed: 0,
					organizationId: post.organizationId,
					startsAt: now,
					status: "draft",
					tier: input.tier,
				})
				.returning();

			return created;
		}),

	activateForManualPayment: protectedProcedure
		.input(campaignIdInput)
		.handler(async ({ context, input }) => {
			await getCampaignForAccess(input.campaignId, context.session);
			const now = new Date();
			const [updated] = await db
				.update(jobPromotionCampaign)
				.set({
					startsAt: now,
					status: "active",
					updatedAt: now,
				})
				.where(eq(jobPromotionCampaign.id, input.campaignId))
				.returning();

			return updated;
		}),

	pause: protectedProcedure
		.input(campaignIdInput)
		.handler(async ({ context, input }) => {
			await getCampaignForAccess(input.campaignId, context.session);
			const [updated] = await db
				.update(jobPromotionCampaign)
				.set({
					status: "paused",
					updatedAt: new Date(),
				})
				.where(eq(jobPromotionCampaign.id, input.campaignId))
				.returning();

			return updated;
		}),

	boost: protectedProcedure
		.input(campaignIdInput)
		.handler(async ({ context, input }) => {
			const { actor, campaign } = await getCampaignForAccess(
				input.campaignId,
				context.session
			);
			const now = new Date();
			const campaignForListing = toCampaignForListing(campaign);

			if (!canConsumeManualBoost(campaignForListing, now)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Manual boost is not available for this campaign.",
				});
			}

			const consumption = getManualBoostConsumption(campaignForListing, now);
			const [updated] = await db.transaction(async (tx) => {
				const [campaignUpdate] = await tx
					.update(jobPromotionCampaign)
					.set({
						lastBoostedAt: consumption.lastBoostedAt,
						manualBoostsUsed: consumption.manualBoostsUsed,
						updatedAt: now,
					})
					.where(eq(jobPromotionCampaign.id, input.campaignId))
					.returning();

				await tx.insert(jobPromotionBoostEvent).values({
					actorUserId: actor.userId,
					boostType: "manual",
					campaignId: campaign.id,
					jobPostId: campaign.jobPostId,
					organizationId: campaign.organizationId,
				});

				return [campaignUpdate];
			});

			return updated;
		}),
};
