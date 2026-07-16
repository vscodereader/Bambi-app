import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	employerOrganizationProfile,
	employerTeamProfile,
	jobBoostEvent,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	or,
	type SQL,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	BOOST_INELIGIBLE_MESSAGES,
	getKstDayStart,
	resolveBoostEligibility,
} from "../../services/bambi-job-boost";

// 구 jobPromotionCampaign 축 라우터를 광고 상품 축으로 재작성했다.
// 광고 목록(listMyAds)과 수동 끌어올리기(boost)만 제공한다.
export const promotionsRouter = {
	listMyAds: protectedProcedure.handler(async ({ context }) => {
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
				adProductName: adProduct.name,
				boostedAt: jobPost.boostedAt,
				employerDisplayName: employerOrganizationProfile.displayName,
				exposureEndsAt: jobPost.exposureEndsAt,
				exposureType: jobPost.exposureType,
				jobPostId: jobPost.id,
				manualBoostsPerDay: adProduct.manualBoostsPerDay,
				paymentStatus: jobPost.paymentStatus,
				publishedAt: jobPost.publishedAt,
				status: jobPost.status,
				teamDisplayName: employerTeamProfile.displayName,
				title: jobPost.title,
			})
			.from(jobPost)
			.innerJoin(adProduct, eq(jobPost.adProductId, adProduct.id))
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
			)
			.where(and(or(...accessFilters), isNotNull(jobPost.adProductId)))
			.orderBy(desc(jobPost.updatedAt));

		if (rows.length === 0) {
			return [];
		}

		const dayStart = getKstDayStart(new Date());
		const usedRows = await db
			.select({ jobPostId: jobBoostEvent.jobPostId, used: count() })
			.from(jobBoostEvent)
			.where(
				and(
					inArray(
						jobBoostEvent.jobPostId,
						rows.map((row) => row.jobPostId)
					),
					gte(jobBoostEvent.createdAt, dayStart)
				)
			)
			.groupBy(jobBoostEvent.jobPostId);
		const usedByJobId = new Map(
			usedRows.map((row) => [row.jobPostId, row.used])
		);

		return rows.map((row) => ({
			...row,
			boostsUsedToday: usedByJobId.get(row.jobPostId) ?? 0,
		}));
	}),

	boost: protectedProcedure
		.input(z.object({ jobPostId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const [post] = await db
				.select({
					adProductId: jobPost.adProductId,
					exposureEndsAt: jobPost.exposureEndsAt,
					manualBoostsPerDay: adProduct.manualBoostsPerDay,
					organizationId: jobPost.organizationId,
					paymentStatus: jobPost.paymentStatus,
					status: jobPost.status,
					teamId: jobPost.teamId,
				})
				.from(jobPost)
				.leftJoin(adProduct, eq(jobPost.adProductId, adProduct.id))
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			const actor = await requireEmployerPostingAccess({
				organizationId: post.organizationId,
				teamId: post.teamId,
				session: context.session,
			});

			const now = new Date();
			const dayStart = getKstDayStart(now);
			const boostsUsedToday = await db.transaction(async (tx) => {
				// jobPost 행 잠금이 동시 클릭의 직렬화 지점: 카운트→검증→기록이
				// 한 번에 한 요청씩 진행돼 일일 한도 초과 사용을 막는다.
				await tx
					.select({ id: jobPost.id })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.for("update");

				const [usage] = await tx
					.select({ used: count() })
					.from(jobBoostEvent)
					.where(
						and(
							eq(jobBoostEvent.jobPostId, input.jobPostId),
							gte(jobBoostEvent.createdAt, dayStart)
						)
					);
				const usedToday = usage?.used ?? 0;
				const verdict = resolveBoostEligibility({
					adProductId: post.adProductId,
					exposureEndsAt: post.exposureEndsAt,
					manualBoostsPerDay: post.manualBoostsPerDay ?? 0,
					now,
					paymentStatus: post.paymentStatus,
					status: post.status,
					usedToday,
				});

				if (!verdict.eligible) {
					throw new ORPCError("BAD_REQUEST", {
						message: BOOST_INELIGIBLE_MESSAGES[verdict.reason],
					});
				}

				await tx.insert(jobBoostEvent).values({
					actorUserId: actor.userId,
					boostType: "manual",
					jobPostId: input.jobPostId,
					organizationId: post.organizationId,
				});
				await tx
					.update(jobPost)
					.set({ boostedAt: now })
					.where(eq(jobPost.id, input.jobPostId));

				return usedToday + 1;
			});

			return { boostedAt: now, boostsUsedToday };
		}),
};
