import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	bambiSiteSettings,
	employerOrganizationProfile,
	employerTeamProfile,
	jobBoostEvent,
	jobBoostPurchase,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	max,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	isEmployerLikeRole,
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	BOOST_INELIGIBLE_MESSAGES,
	type BoostPurchaseLike,
	DEFAULT_MANUAL_BOOST_COOLDOWN_MINUTES,
	getKstDayStart,
	isManualBoostWithinCooldown,
	manualBoostCooldownRemainingMs,
	pickCountPurchaseToConsume,
	resolveBoostEligibility,
	sumActivePeriodBoostsPerDay,
	sumRemainingBoostCount,
} from "../../services/bambi-job-boost";
import { isOrganizationManagerRole } from "../../services/bambi-organization-authz";
import {
	DEFAULT_RECOMMENDED_CAPACITY,
	DEFAULT_SPECIAL_CAPACITY,
	deriveListingQueue,
	derivePremiumQueue,
} from "../../services/bambi-premium-capacity";

// 구 jobPromotionCampaign 축 라우터를 광고 상품 축으로 재작성했다.
type BoostTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 상품별 쿨다운(최소 간격) 게이트. 잠금·자격 판정 뒤, 횟수권 소비·이벤트 기록 전에 호출한다.
// 하루 한도와 별개로 연타를 막아 목록 품질을 지킨다. 이 공고의 가장 최근 수동 끌어올림
// (daily·count 무관) 시각과 비교한다. 쿨다운 분은 정책 노브라 라이브 참조한다(운영자 변경 즉시
// 반영): 광고 공고는 adProduct 현재 값, 무료 공고(adProductId null)는 기본값.
const assertManualBoostCooldown = async (
	tx: BoostTx,
	{
		adProductId,
		jobPostId,
		now,
	}: { adProductId: string | null; jobPostId: string; now: Date }
): Promise<void> => {
	const [lastManual] = await tx
		.select({ lastAt: max(jobBoostEvent.createdAt) })
		.from(jobBoostEvent)
		.where(
			and(
				eq(jobBoostEvent.jobPostId, jobPostId),
				eq(jobBoostEvent.boostType, "manual")
			)
		);
	const lastManualBoostAt = lastManual?.lastAt ?? null;

	let cooldownMinutes = DEFAULT_MANUAL_BOOST_COOLDOWN_MINUTES;
	if (adProductId !== null) {
		const [product] = await tx
			.select({
				manualBoostCooldownMinutes: adProduct.manualBoostCooldownMinutes,
			})
			.from(adProduct)
			.where(eq(adProduct.id, adProductId))
			.limit(1);
		cooldownMinutes =
			product?.manualBoostCooldownMinutes ??
			DEFAULT_MANUAL_BOOST_COOLDOWN_MINUTES;
	}

	if (isManualBoostWithinCooldown(lastManualBoostAt, now, cooldownMinutes)) {
		const remainingMinutes = Math.ceil(
			manualBoostCooldownRemainingMs(lastManualBoostAt, now, cooldownMinutes) /
				60_000
		);
		throw new ORPCError("BAD_REQUEST", {
			message: `너무 잦은 끌어올리기예요. 약 ${remainingMinutes}분 후에 다시 시도해 주세요.`,
		});
	}
};

// 광고 목록(listMyAds)과 수동 끌어올리기(boost)만 제공한다.
export const promotionsRouter = {
	listMyAds: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		if (!isEmployerLikeRole(profile.role)) {
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
			.filter((membership) => isOrganizationManagerRole(membership.role))
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
				// 무통장입금 재안내의 결제 예정 총액에 노출 금액과 함께 합산된다.
				detailDesignAmount: jobPost.detailDesignAmount,
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
			// 무료 공고도 옵션만으로 끌어올릴 수 있어 광고 상품 없는 공고까지 포함한다(leftJoin).
			.leftJoin(adProduct, eq(jobPost.adProductId, adProduct.id))
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
			)
			.where(or(...accessFilters))
			.orderBy(desc(jobPost.updatedAt));

		if (rows.length === 0) {
			return [];
		}

		const now = new Date();
		const dayStart = getKstDayStart(now);
		const jobPostIds = rows.map((row) => row.jobPostId);
		// 수동 사용량은 boostType='manual'이면서 횟수권 소비분이 아닌 것(purchaseId null)만 센다.
		// 자동 이벤트가 수동 쿼터를 잠식하지 않고, 횟수권 사용분도 하루 한도를 잠식하지 않는다.
		const usedRows = await db
			.select({ jobPostId: jobBoostEvent.jobPostId, used: count() })
			.from(jobBoostEvent)
			.where(
				and(
					inArray(jobBoostEvent.jobPostId, jobPostIds),
					eq(jobBoostEvent.boostType, "manual"),
					isNull(jobBoostEvent.purchaseId),
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

		// 공고별 끌어올리기 추가 옵션 구매를 일괄 조회해 JS에서 Task 2 헬퍼로 집계한다.
		const purchaseRows = await db
			.select({
				boostsPerDay: jobBoostPurchase.boostsPerDay,
				createdAt: jobBoostPurchase.createdAt,
				expiresAt: jobBoostPurchase.expiresAt,
				id: jobBoostPurchase.id,
				jobPostId: jobBoostPurchase.jobPostId,
				optionType: jobBoostPurchase.optionType,
				paymentStatus: jobBoostPurchase.paymentStatus,
				remainingCount: jobBoostPurchase.remainingCount,
			})
			.from(jobBoostPurchase)
			.where(inArray(jobBoostPurchase.jobPostId, jobPostIds));
		const purchasesByJobId = new Map<string, BoostPurchaseLike[]>();
		for (const purchaseRow of purchaseRows) {
			const list = purchasesByJobId.get(purchaseRow.jobPostId) ?? [];
			list.push(purchaseRow);
			purchasesByJobId.set(purchaseRow.jobPostId, list);
		}

		// 배너 + 스페셜/추천 미결제 신청의 파생 큐 정보(진행 가능 여부·대기 순번)를 한데 모아
		// 같은 premiumQueue 필드로 노출한다 — 신청자 쪽은 배너냐 리스팅이냐가 아니라 "내 신청이
		// 진행 가능한지, 대기 몇 번째인지"만 필요해서다(기존 premiumQueue 필드·관용 그대로 확장).
		// 각 파생 큐의 ranksByJobId는 해당 섹션 pending 공고만 담으므로(exposureType로 나뉜
		// 서로 다른 공고 집합) 세 맵을 합쳐도 키가 겹치지 않는다.
		const [settingsRow] = await db
			.select({
				recommendedCapacity: bambiSiteSettings.recommendedCapacity,
				specialCapacity: bambiSiteSettings.specialCapacity,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"))
			.limit(1);
		const [premiumQueueResult, specialQueueResult, recommendedQueueResult] =
			await Promise.all([
				derivePremiumQueue(db, now),
				deriveListingQueue(
					db,
					"special",
					settingsRow?.specialCapacity ?? DEFAULT_SPECIAL_CAPACITY,
					now
				),
				deriveListingQueue(
					db,
					"recommended",
					settingsRow?.recommendedCapacity ?? DEFAULT_RECOMMENDED_CAPACITY,
					now
				),
			]);
		const queueByJobId = new Map([
			...premiumQueueResult.ranksByJobId,
			...specialQueueResult.ranksByJobId,
			...recommendedQueueResult.ranksByJobId,
		]);

		return rows.map((row) => {
			const purchases = purchasesByJobId.get(row.jobPostId) ?? [];
			return {
				...row,
				autoBoostsUsedToday: autoUsedByJobId.get(row.jobPostId) ?? 0,
				boostCountRemaining: sumRemainingBoostCount(purchases, now),
				boostOptionAutoPerDay: sumActivePeriodBoostsPerDay(
					purchases,
					"auto_period",
					now
				),
				boostOptionManualPerDay: sumActivePeriodBoostsPerDay(
					purchases,
					"manual_period",
					now
				),
				boostsUsedToday: usedByJobId.get(row.jobPostId) ?? 0,
				hasUnpaidBoostOption: purchases.some(
					(p) => p.paymentStatus === "unpaid"
				),
				premiumQueue: queueByJobId.get(row.jobPostId) ?? null,
			};
		});
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

				// 같은 tx에서 이 공고의 끌어올리기 추가 옵션 구매 전체를 읽는다(판정·차감 대상).
				const purchases: BoostPurchaseLike[] = await tx
					.select({
						boostsPerDay: jobBoostPurchase.boostsPerDay,
						createdAt: jobBoostPurchase.createdAt,
						expiresAt: jobBoostPurchase.expiresAt,
						id: jobBoostPurchase.id,
						optionType: jobBoostPurchase.optionType,
						paymentStatus: jobBoostPurchase.paymentStatus,
						remainingCount: jobBoostPurchase.remainingCount,
					})
					.from(jobBoostPurchase)
					.where(eq(jobBoostPurchase.jobPostId, input.jobPostId));

				const [usage] = await tx
					.select({ used: count() })
					.from(jobBoostEvent)
					.where(
						and(
							eq(jobBoostEvent.jobPostId, input.jobPostId),
							// 수동 한도 판정은 boostType='manual'이면서 횟수권 소비분이 아닌 것만 센다.
							// 횟수권 사용분(purchaseId 있음)은 하루 한도를 잠식하지 않는다.
							eq(jobBoostEvent.boostType, "manual"),
							isNull(jobBoostEvent.purchaseId),
							gte(jobBoostEvent.createdAt, dayStart)
						)
					);
				const usedToday = usage?.used ?? 0;
				const verdict = resolveBoostEligibility({
					adProductId: post.adProductId,
					countRemaining: sumRemainingBoostCount(purchases, now),
					exposureEndsAt: post.exposureEndsAt,
					exposureType: post.exposureType,
					manualBoostsPerDay: locked?.manualBoostsPerDay ?? 0,
					now,
					optionManualPerDay: sumActivePeriodBoostsPerDay(
						purchases,
						"manual_period",
						now
					),
					paymentStatus: post.paymentStatus,
					status: post.status,
					usedToday,
				});

				if (!verdict.eligible) {
					throw new ORPCError("BAD_REQUEST", {
						message: BOOST_INELIGIBLE_MESSAGES[verdict.reason],
					});
				}

				// 상품별 쿨다운(최소 간격) 게이트: 잠금·자격 판정 뒤, 횟수권 소비·이벤트 기록 전.
				await assertManualBoostCooldown(tx, {
					adProductId: post.adProductId,
					jobPostId: input.jobPostId,
					now,
				});

				// 횟수권 소비면 가장 오래된 활성 구매를 조건부 차감한다. remainingCount > 0 가드로
				// 동시 클릭 시 0행이 나면 CONFLICT로 막는다. purchaseId를 이벤트에 남겨 하루 한도와
				// 분리한다. daily 소비면 기존대로 purchaseId 없이 기록한다.
				let purchaseId: string | null = null;
				if (verdict.consume === "count") {
					const pick = pickCountPurchaseToConsume(purchases, now);
					const consumed = pick
						? await tx
								.update(jobBoostPurchase)
								.set({
									remainingCount: sql`${jobBoostPurchase.remainingCount} - 1`,
								})
								.where(
									and(
										eq(jobBoostPurchase.id, pick.id),
										gt(jobBoostPurchase.remainingCount, 0)
									)
								)
								.returning({ id: jobBoostPurchase.id })
						: [];

					if (consumed.length === 0) {
						throw new ORPCError("CONFLICT", {
							message:
								"끌어올리기 처리 중 잔여 횟수가 변경되었습니다. 다시 시도해 주세요.",
						});
					}
					purchaseId = pick?.id ?? null;
				}

				await tx.insert(jobBoostEvent).values({
					actorUserId: actor.userId,
					boostType: "manual",
					jobPostId: input.jobPostId,
					organizationId: post.organizationId,
					purchaseId,
				});
				await tx
					.update(jobPost)
					.set({ boostedAt: now })
					.where(eq(jobPost.id, input.jobPostId));

				// 횟수권 소비는 하루 한도를 잠식하지 않아 usedToday가 그대로다.
				return verdict.consume === "daily" ? usedToday + 1 : usedToday;
			});

			return { boostedAt: now, boostsUsedToday };
		}),
};
