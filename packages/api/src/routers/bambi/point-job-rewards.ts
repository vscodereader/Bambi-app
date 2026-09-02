import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import {
	bambiPointJobDailySelection,
	bambiPointJobReward,
	bambiSiteSettings,
	employerOrganizationProfile,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { AD_BANNER_EXPOSURE_TYPES } from "../../services/bambi-ad-exposure";
import { getKstDateString } from "../../services/bambi-attendance";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import { loadCrawledAdBannerPools } from "../../services/bambi-crawled-ad-banner-slots";
import { readCrawledLimits } from "../../services/bambi-crawled-limits";
import { listCrawledSectionRows } from "../../services/bambi-job-feed";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import {
	isPointJobRewardEligible,
	isPointJobSelectionActive,
	POINT_JOB_REWARD_CATEGORIES,
	pickPointJobCandidate,
	pointJobRewardNextEligibleAt,
} from "../../services/bambi-point-job-rewards";
import { awardMemberPoints } from "../../services/bambi-point-ledger";
import { SITE_SETTINGS_ROW_ID } from "../../services/bambi-point-settings";
import {
	DEFAULT_RECOMMENDED_CAPACITY,
	DEFAULT_SPECIAL_CAPACITY,
	hasActiveOrgResponderFilter,
} from "../../services/bambi-premium-capacity";

type Category = (typeof POINT_JOB_REWARD_CATEGORIES)[number];
type TargetSource = "crawled_job_post" | "job_post";

const categorySchema = z.enum(POINT_JOB_REWARD_CATEGORIES);
const targetSourceSchema = z.enum(["job_post", "crawled_job_post"]);

interface Candidate {
	organizationId: null | string;
	targetId: string;
	targetSource: TargetSource;
	title: string;
}

interface RewardConfig {
	points: null | number;
	rotationHours: null | number;
}

const loadRewardConfig = async (category: Category): Promise<RewardConfig> => {
	const [row] = await db
		.select({
			premiumPoints: bambiSiteSettings.premiumPointJobRewardPoints,
			premiumRotation: bambiSiteSettings.premiumPointJobRotationHours,
			recommendedPoints: bambiSiteSettings.recommendedPointJobRewardPoints,
			recommendedRotation: bambiSiteSettings.recommendedPointJobRotationHours,
			specialPoints: bambiSiteSettings.specialPointJobRewardPoints,
			specialRotation: bambiSiteSettings.specialPointJobRotationHours,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	if (category === "premium") {
		return {
			points: row?.premiumPoints ?? null,
			rotationHours: row?.premiumRotation ?? null,
		};
	}
	if (category === "special") {
		return {
			points: row?.specialPoints ?? null,
			rotationHours: row?.specialRotation ?? null,
		};
	}
	return {
		points: row?.recommendedPoints ?? null,
		rotationHours: row?.recommendedRotation ?? null,
	};
};

const paidExposureTypes = (category: Category): string[] =>
	category === "premium" ? [...AD_BANNER_EXPOSURE_TYPES] : [category];

const loadCandidates = async (
	category: Category,
	now: Date
): Promise<Candidate[]> => {
	const exposureWindow =
		category === "premium"
			? or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
			: and(isNotNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now));
	const [[settings], paid] = await Promise.all([
		db
			.select({
				crawledAdBannerEnabled: bambiSiteSettings.crawledAdBannerEnabled,
				crawledJobFeedEnabled: bambiSiteSettings.crawledJobFeedEnabled,
				recommendedCapacity: bambiSiteSettings.recommendedCapacity,
				specialCapacity: bambiSiteSettings.specialCapacity,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
			.limit(1),
		db
			.select({
				organizationId: jobPost.organizationId,
				targetId: jobPost.id,
				title: jobPost.title,
			})
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.where(
				and(
					eq(jobPost.status, "published"),
					eq(jobPost.paymentStatus, "paid"),
					inArray(jobPost.exposureType, paidExposureTypes(category) as never[]),
					exposureWindow,
					eq(employerOrganizationProfile.verificationStatus, "verified"),
					hasActiveOrgResponderFilter()
				)
			)
			.orderBy(
				desc(sql`greatest(${jobPost.boostedAt}, ${jobPost.publishedAt})`),
				desc(jobPost.id)
			),
	]);
	const includeCrawled =
		category === "premium"
			? Boolean(settings?.crawledAdBannerEnabled)
			: Boolean(settings?.crawledJobFeedEnabled);
	let crawled: Candidate[] = [];
	if (includeCrawled && category === "premium") {
		const pools = await loadCrawledAdBannerPools();
		const unique = new Map(
			[...pools.horizontal, ...pools.vertical].map((item) => [item.id, item])
		);
		crawled = [...unique.values()].map((item) => ({
			organizationId: null,
			targetId: item.id,
			targetSource: "crawled_job_post",
			title: item.title,
		}));
	}
	if (includeCrawled && category !== "premium") {
		const limits = await readCrawledLimits();
		const rows = await listCrawledSectionRows({
			limit: limits[category],
			type: category,
		});
		crawled = rows.map((item) => ({
			organizationId: null,
			targetId: item.id,
			targetSource: "crawled_job_post",
			title: item.title,
		}));
	}
	let paidLimit = paid.length;
	if (category === "special") {
		paidLimit = settings?.specialCapacity ?? DEFAULT_SPECIAL_CAPACITY;
	}
	if (category === "recommended") {
		paidLimit = settings?.recommendedCapacity ?? DEFAULT_RECOMMENDED_CAPACITY;
	}
	return [
		...paid
			.slice(0, paidLimit)
			.map((item) => ({ ...item, targetSource: "job_post" as const })),
		...crawled,
	];
};

const resolveSelection = async (category: Category, now: Date) => {
	const config = await loadRewardConfig(category);
	if (
		config.points === null ||
		config.points <= 0 ||
		config.rotationHours === null
	) {
		return null;
	}
	const rotationHours = config.rotationHours;
	const selectedOn = getKstDateString(now);
	return await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`point-job-selection:${category}`}, 0))`
		);
		const [current] = await tx
			.select()
			.from(bambiPointJobDailySelection)
			.where(eq(bambiPointJobDailySelection.category, category))
			.orderBy(desc(bambiPointJobDailySelection.selectedAt))
			.limit(1);
		const candidates = await loadCandidates(category, now);
		const currentCandidate = current
			? candidates.find(
					(item) =>
						item.targetId === current.targetId &&
						item.targetSource === current.targetSource
				)
			: undefined;
		if (
			current &&
			currentCandidate &&
			isPointJobSelectionActive(current.selectedAt, rotationHours, now)
		) {
			return current;
		}
		if (candidates.length === 0) {
			return null;
		}
		const selected = pickPointJobCandidate(candidates, Math.random());
		if (!selected) {
			return null;
		}
		const values = {
			category,
			selectedAt: now,
			selectedOn,
			targetId: selected.targetId,
			targetSource: selected.targetSource,
			titleSnapshot: selected.title,
		};
		const [created] = await tx
			.insert(bambiPointJobDailySelection)
			.values(values)
			.returning();
		return created ?? null;
	});
};

const isOwnOrganizationJob = async (
	userId: string,
	targetSource: TargetSource,
	targetId: string
): Promise<boolean> => {
	if (targetSource === "crawled_job_post") {
		return false;
	}
	const [row] = await db
		.select({ id: member.id })
		.from(jobPost)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, jobPost.organizationId),
				eq(member.userId, userId),
				eq(member.status, "active")
			)
		)
		.where(eq(jobPost.id, targetId))
		.limit(1);
	return Boolean(row);
};

export const pointJobRewardsRouter = {
	getCurrent: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		const now = new Date();
		if (!(profile.role === "job_seeker" || profile.role === "employer")) {
			return { selections: [] };
		}
		const selections = (
			await Promise.all(
				POINT_JOB_REWARD_CATEGORIES.map((category) =>
					resolveSelection(category, now)
				)
			)
		).filter((item): item is NonNullable<typeof item> => item !== null);
		const rewards = await db
			.select({
				category: bambiPointJobReward.category,
				cooldownUntil: bambiPointJobReward.cooldownUntil,
				rewardedAt: bambiPointJobReward.rewardedAt,
			})
			.from(bambiPointJobReward)
			.where(
				and(
					eq(bambiPointJobReward.userId, profile.userId),
					inArray(
						bambiPointJobReward.category,
						POINT_JOB_REWARD_CATEGORIES as unknown as Category[]
					)
				)
			)
			.orderBy(desc(bambiPointJobReward.rewardedAt));
		const latest = new Map<
			Category,
			{ cooldownUntil: Date; rewardedAt: Date }
		>();
		for (const reward of rewards) {
			if (!latest.has(reward.category)) {
				latest.set(reward.category, reward);
			}
		}
		return {
			selections: await Promise.all(
				selections.map(async (selection) => {
					const last = latest.get(selection.category);
					const nextEligibleAt = last?.cooldownUntil ?? null;
					const config = await loadRewardConfig(selection.category);
					const own = await isOwnOrganizationJob(
						profile.userId,
						selection.targetSource,
						selection.targetId
					);
					return {
						category: selection.category,
						eligible: !own && isPointJobRewardEligible(nextEligibleAt, now),
						nextEligibleAt,
						rewardPoints: config.points ?? 0,
						targetId: selection.targetId,
						targetSource: selection.targetSource,
					};
				})
			),
		};
	}),

	claim: protectedProcedure
		.input(
			z.object({
				category: categorySchema,
				targetId: z.uuid(),
				targetSource: targetSourceSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			if (!(profile.role === "job_seeker" || profile.role === "employer")) {
				throw new ORPCError("FORBIDDEN", {
					message: "포인트 공고 보상 대상이 아닙니다.",
				});
			}
			const now = new Date();
			const selection = await resolveSelection(input.category, now);
			if (
				!selection ||
				selection.targetId !== input.targetId ||
				selection.targetSource !== input.targetSource
			) {
				return { awarded: 0, reason: "not_selected" as const };
			}
			if (
				await isOwnOrganizationJob(
					profile.userId,
					input.targetSource,
					input.targetId
				)
			) {
				return { awarded: 0, reason: "own_organization" as const };
			}
			const result = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtextextended(${`point-job-reward:${profile.userId}:${input.category}`}, 0))`
				);
				const [latest] = await tx
					.select({ cooldownUntil: bambiPointJobReward.cooldownUntil })
					.from(bambiPointJobReward)
					.where(
						and(
							eq(bambiPointJobReward.userId, profile.userId),
							eq(bambiPointJobReward.category, input.category)
						)
					)
					.orderBy(desc(bambiPointJobReward.rewardedAt))
					.limit(1);
				const nextEligibleAt = latest?.cooldownUntil ?? null;
				if (nextEligibleAt && nextEligibleAt > now) {
					return { awarded: 0, nextEligibleAt, reason: "cooldown" as const };
				}
				const config = await loadRewardConfig(input.category);
				if (
					config.points === null ||
					config.points <= 0 ||
					config.rotationHours === null
				) {
					return { awarded: 0, reason: "disabled" as const };
				}
				const cooldownUntil = pointJobRewardNextEligibleAt(
					now,
					config.rotationHours
				);
				if (!cooldownUntil) {
					return { awarded: 0, reason: "disabled" as const };
				}
				const rewardId = crypto.randomUUID();
				const awarded = await awardMemberPoints(tx, {
					amount: config.points,
					description: selection.titleSnapshot,
					externalKey: `point_job_reward:${rewardId}`,
					reason: "point_job_view",
					userId: profile.userId,
				});
				if (awarded.awarded <= 0) {
					return { awarded: 0, reason: "points_cap" as const };
				}
				await tx.insert(bambiPointJobReward).values({
					amount: awarded.awarded,
					category: input.category,
					cooldownUntil,
					id: rewardId,
					rewardedAt: now,
					selectedOn: selection.selectedOn,
					selectionId: selection.id,
					targetId: selection.targetId,
					targetSource: selection.targetSource,
					titleSnapshot: selection.titleSnapshot,
					userId: profile.userId,
				});
				return {
					awarded: awarded.awarded,
					reason: "awarded" as const,
					transactionId: awarded.transactionId,
				};
			});
			if (
				result.awarded > 0 &&
				"transactionId" in result &&
				result.transactionId
			) {
				await notifyBambiNotification({
					metadata: {
						action: "point_job_reward",
						amount: result.awarded,
						category: input.category,
						jobPostId: input.targetId,
						targetSource: input.targetSource,
						title: selection.titleSnapshot,
					},
					recipientUserId: profile.userId,
					targetId: result.transactionId,
					targetType: "point_transaction",
				});
			}
			return result;
		}),
};
