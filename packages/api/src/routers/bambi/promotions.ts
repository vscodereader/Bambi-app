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
				// 라이브 상품이 아니라 공고 구매 시점 스냅샷을 노출한다(상품 join은 이름 표기용만 유지).
				autoBoostsPerDay: jobPost.autoBoostsPerDay,
				boostedAt: jobPost.boostedAt,
				employerDisplayName: employerOrganizationProfile.displayName,
				// 미결제 행의 무통장입금 재안내에서 결제 예정 금액을 보여주는 데 쓴다.
				exposureAmount: jobPost.exposureAmount,
				exposureEndsAt: jobPost.exposureEndsAt,
				exposureType: jobPost.exposureType,
				jobPostId: jobPost.id,
				manualBoostsPerDay: jobPost.manualBoostsPerDay,
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
		const jobPostIds = rows.map((row) => row.jobPostId);
		// 수동 사용량은 boostType='manual'만 센다(자동 이벤트가 수동 쿼터를 잠식하지 않도록).
		const usedRows = await db
			.select({ jobPostId: jobBoostEvent.jobPostId, used: count() })
			.from(jobBoostEvent)
			.where(
				and(
					inArray(jobBoostEvent.jobPostId, jobPostIds),
					eq(jobBoostEvent.boostType, "manual"),
					gte(jobBoostEvent.createdAt, dayStart)
				)
			)
			.groupBy(jobBoostEvent.jobPostId);
		const usedByJobId = new Map(
			usedRows.map((row) => [row.jobPostId, row.used])
		);
		// 자동 사용량은 boostType='auto'만 센다(오늘 실행 현황 표시용).
		const autoUsedRows = await db
			.select({ jobPostId: jobBoostEvent.jobPostId, used: count() })
			.from(jobBoostEvent)
			.where(
				and(
					inArray(jobBoostEvent.jobPostId, jobPostIds),
					eq(jobBoostEvent.boostType, "auto"),
					gte(jobBoostEvent.createdAt, dayStart)
				)
			)
			.groupBy(jobBoostEvent.jobPostId);
		const autoUsedByJobId = new Map(
			autoUsedRows.map((row) => [row.jobPostId, row.used])
		);

		return rows.map((row) => ({
			...row,
			autoBoostsUsedToday: autoUsedByJobId.get(row.jobPostId) ?? 0,
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
					exposureType: jobPost.exposureType,
					organizationId: jobPost.organizationId,
					paymentStatus: jobPost.paymentStatus,
					status: jobPost.status,
					teamId: jobPost.teamId,
				})
				.from(jobPost)
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
				// 끌어올리기 횟수는 라이브 상품이 아니라 잠긴 공고 행의 구매 시점 스냅샷에서 읽는다.
				const [locked] = await tx
					.select({ manualBoostsPerDay: jobPost.manualBoostsPerDay })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.for("update");

				const [usage] = await tx
					.select({ used: count() })
					.from(jobBoostEvent)
					.where(
						and(
							eq(jobBoostEvent.jobPostId, input.jobPostId),
							// 수동 한도 판정은 boostType='manual'만 센다(자동 이벤트는 별도 쿼터).
							eq(jobBoostEvent.boostType, "manual"),
							gte(jobBoostEvent.createdAt, dayStart)
						)
					);
				const usedToday = usage?.used ?? 0;
				const verdict = resolveBoostEligibility({
					adProductId: post.adProductId,
					exposureEndsAt: post.exposureEndsAt,
					exposureType: post.exposureType,
					manualBoostsPerDay: locked?.manualBoostsPerDay ?? 0,
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
