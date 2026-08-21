import { db } from "@bambi-app/db";
import { member, team, teamMember, user } from "@bambi-app/db/schema/auth";
import {
	bambiPointShopItem,
	bambiPointShopOrder,
	bambiPointTransaction,
	bambiProfile,
	jobBoostPurchase,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import z from "zod";

import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../index";
import { AD_BANNER_EXPOSURE_TYPES } from "../../services/bambi-ad-exposure";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
	type SessionLike,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import { POINT_SHOP_REASONS } from "../../services/bambi-member-points";
import { isOrganizationManagerRole } from "../../services/bambi-organization-authz";
import {
	adjustMemberPoints,
	awardMemberPoints,
} from "../../services/bambi-point-ledger";
import {
	acquirePointShopUserLock,
	buildBoostPurchaseValues,
	decrementItemStock,
	extendJobPostExposureAtomic,
	isItemSoldOut,
	isJobPostUsableForBenefit,
	isUsableBenefit,
	POINT_SHOP_AUDIENCES,
	POINT_SHOP_BENEFIT_TYPES,
	POINT_SHOP_ORDER_STATUSES,
	POINT_SHOP_PURCHASE_ROLES,
	resolveOrderCancellation,
	resolveOrderTransition,
	resolveOwnedUsage,
	resolvePurchase,
	restoreItemStock,
	shouldRestoreItemStock,
	validateItemBenefitSpec,
} from "../../services/bambi-point-shop";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 잔액은 원장 합산(잔액 컬럼 없음 — attendance.ts와 동일 규칙).
const pointBalanceSql = sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`;

const PURCHASE_DENIAL_MESSAGES = {
	audience: "이 아이템은 구매 대상이 아니에요.",
	identity: "본인인증 후 구매할 수 있어요.",
	inactive: "판매가 종료된 아이템입니다.",
	insufficient: "보유 포인트가 부족합니다.",
	soldout: "품절된 아이템입니다.",
} as const;

const requirePurchaseProfile = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);
	if (!POINT_SHOP_PURCHASE_ROLES.has(profile.role)) {
		throw new ORPCError("FORBIDDEN", {
			message: "포인트몰 구매는 구직자·업소 회원만 이용할 수 있어요.",
		});
	}
	return profile;
};

// 혜택 스펙·사용기한·재고는 유형별로만 채우는 선택 정수(구매 후 검증은 순수 함수).
const nullableSpecInput = z.number().int().min(1).nullable().optional();

const itemInput = z.object({
	audience: z.enum(POINT_SHOP_AUDIENCES),
	benefitType: z.enum(POINT_SHOP_BENEFIT_TYPES),
	boostCount: nullableSpecInput,
	boostsPerDay: nullableSpecInput,
	description: z.string().trim().max(500).nullable().optional(),
	durationDays: nullableSpecInput,
	extendDays: nullableSpecInput,
	imageUrl: z.string().trim().url().max(600).nullable().optional(),
	isActive: z.boolean(),
	name: z.string().trim().min(1).max(60),
	pricePoints: z.number().int().min(1).max(10_000_000),
	sortOrder: z.number().int().min(0).max(100_000),
	stockQuantity: nullableSpecInput,
	usageLimitDays: nullableSpecInput,
});

const ITEM_SPEC_ERROR_MESSAGES = {
	audience_conflict: "구직 회원 전용으로는 만들 수 없는 혜택이에요.",
	missing_spec: "선택한 혜택 유형에 필요한 값을 입력해 주세요.",
	unexpected_spec: "선택한 혜택 유형과 맞지 않는 값이 있어요.",
} as const;

// createItem·updateItem 공통: 유형별 스펙 정합을 검증하고 저장할 혜택 컬럼값을 만든다.
// 비해당 스펙 필드는 null로 접는다(검증이 비-null을 unexpected_spec로 거부).
const buildValidatedBenefitColumns = (input: z.infer<typeof itemInput>) => {
	const columns = {
		audience: input.audience,
		benefitType: input.benefitType,
		boostCount: input.boostCount ?? null,
		boostsPerDay: input.boostsPerDay ?? null,
		durationDays: input.durationDays ?? null,
		extendDays: input.extendDays ?? null,
		stockQuantity: input.stockQuantity ?? null,
		usageLimitDays: input.usageLimitDays ?? null,
	};
	const verdict = validateItemBenefitSpec({
		audience: columns.audience,
		benefitType: columns.benefitType,
		boostCount: columns.boostCount,
		boostsPerDay: columns.boostsPerDay,
		durationDays: columns.durationDays,
		extendDays: columns.extendDays,
	});
	if (!verdict.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: ITEM_SPEC_ERROR_MESSAGES[verdict.code],
		});
	}
	return columns;
};

export const pointShopRouter = {
	listItems: publicProcedure.handler(async () => {
		const items = await db
			.select({
				audience: bambiPointShopItem.audience,
				benefitType: bambiPointShopItem.benefitType,
				description: bambiPointShopItem.description,
				id: bambiPointShopItem.id,
				imageUrl: bambiPointShopItem.imageUrl,
				name: bambiPointShopItem.name,
				pricePoints: bambiPointShopItem.pricePoints,
				stockQuantity: bambiPointShopItem.stockQuantity,
				// 끌올·연장 사용기한(구매 후 N일, null=무기한). 구매 전 다이얼로그가
				// 만료=소멸 정책을 사전 고지하려면 목록 응답에 실려야 한다(§3.4·확정 결정).
				usageLimitDays: bambiPointShopItem.usageLimitDays,
			})
			.from(bambiPointShopItem)
			.where(eq(bambiPointShopItem.isActive, true))
			.orderBy(
				asc(bambiPointShopItem.sortOrder),
				asc(bambiPointShopItem.createdAt)
			);
		return items.map(({ stockQuantity, ...rest }) => ({
			...rest,
			soldOut: isItemSoldOut({ stockQuantity }),
		}));
	}),

	getMyBalance: protectedProcedure.handler(async ({ context }) => {
		const profile = await requirePurchaseProfile(context.session);
		const [row] = await db
			.select({ pointBalance: pointBalanceSql })
			.from(bambiPointTransaction)
			.where(eq(bambiPointTransaction.userId, profile.userId));
		return { pointBalance: row?.pointBalance ?? 0 };
	}),

	purchase: protectedProcedure
		.input(z.object({ itemId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requirePurchaseProfile(context.session);
			return await db.transaction(async (tx) => {
				// 잔액이 원장 합산이라 FOR UPDATE 불가 — 계정 단위 advisory lock으로
				// "합산 조회→검증→차감"을 한 번에 한 구매만 진행시킨다.
				await acquirePointShopUserLock(tx, profile.userId);
				// 아이템 행 FOR UPDATE로 updateItem(유형 변경 잠금·재고 저장)과 직렬화한다 —
				// stale 재고 읽기(무제한↔0 전환)와 판매 이력 판정 우회를 함께 봉쇄한다.
				const [item] = await tx
					.select()
					.from(bambiPointShopItem)
					.where(eq(bambiPointShopItem.id, input.itemId))
					.limit(1)
					.for("update");
				if (!item) {
					throw new ORPCError("NOT_FOUND", {
						message: "아이템을 찾을 수 없습니다.",
					});
				}
				const [balanceRow] = await tx
					.select({ pointBalance: pointBalanceSql })
					.from(bambiPointTransaction)
					.where(eq(bambiPointTransaction.userId, profile.userId));
				const balance = balanceRow?.pointBalance ?? 0;
				const verdict = resolvePurchase({
					audience: item.audience,
					balance,
					benefitType: item.benefitType,
					isActive: item.isActive,
					isPhoneVerified: profile.isPhoneVerified,
					pricePoints: item.pricePoints,
					role: profile.role,
					soldOut: isItemSoldOut({ stockQuantity: item.stockQuantity }),
				});
				if (!verdict.ok) {
					throw new ORPCError("BAD_REQUEST", {
						message: PURCHASE_DENIAL_MESSAGES[verdict.code],
					});
				}
				// 재고 설정형은 조건부 원자 차감으로 서버 정본 품절을 판정한다(0행이면 롤백).
				// 차감 사실은 주문에 각인해 취소 복원의 근거로 쓴다(이후 무제한↔유한 전환 무관).
				const stockDecremented = item.stockQuantity !== null;
				if (stockDecremented && !(await decrementItemStock(tx, item.id))) {
					throw new ORPCError("BAD_REQUEST", {
						message: PURCHASE_DENIAL_MESSAGES.soldout,
					});
				}
				const now = new Date();
				// 끌올·연장은 보유함(owned)에서 사용, 수동·쿠폰은 운영자 지급 대기(pending).
				const isUsable = isUsableBenefit(item.benefitType);
				const usableUntil =
					isUsable && item.usageLimitDays !== null
						? new Date(now.getTime() + item.usageLimitDays * MS_PER_DAY)
						: null;
				const [order] = await tx
					.insert(bambiPointShopOrder)
					.values({
						benefitType: item.benefitType,
						boostCount: item.boostCount,
						boostsPerDay: item.boostsPerDay,
						durationDays: item.durationDays,
						extendDays: item.extendDays,
						itemId: item.id,
						itemName: item.name,
						pricePoints: item.pricePoints,
						status: isUsable ? "owned" : "pending",
						stockDecremented,
						usableUntil,
						userId: profile.userId,
					})
					.returning({ id: bambiPointShopOrder.id });
				if (!order) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "주문을 생성하지 못했습니다.",
					});
				}
				// 차감(−)은 원장 서비스 경유 — external_key 멱등·balance_after·상한 규칙 재사용.
				// 포인트몰 락을 이미 잡았고 원장 락은 이 호출 내부라 락 순서가 고정된다.
				try {
					await adjustMemberPoints(tx, {
						amount: -item.pricePoints,
						description: `포인트몰 구매: ${item.name}`,
						externalKey: `point_shop_purchase:${order.id}`,
						reason: POINT_SHOP_REASONS.purchase,
						userId: profile.userId,
					});
				} catch (error) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							error instanceof Error
								? error.message
								: PURCHASE_DENIAL_MESSAGES.insufficient,
					});
				}
				return {
					orderId: order.id,
					pointBalance: balance - item.pricePoints,
				};
			});
		}),

	myOrders: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		return db
			.select({
				id: bambiPointShopOrder.id,
				itemName: bambiPointShopOrder.itemName,
				pricePoints: bambiPointShopOrder.pricePoints,
				status: bambiPointShopOrder.status,
				benefitType: bambiPointShopOrder.benefitType,
				operatorMemo: bambiPointShopOrder.operatorMemo,
				createdAt: bambiPointShopOrder.createdAt,
				processedAt: bambiPointShopOrder.processedAt,
				usableUntil: bambiPointShopOrder.usableUntil,
				usedAt: bambiPointShopOrder.usedAt,
				targetJobPostId: bambiPointShopOrder.targetJobPostId,
			})
			.from(bambiPointShopOrder)
			.where(eq(bambiPointShopOrder.userId, profile.userId))
			.orderBy(desc(bambiPointShopOrder.createdAt));
	}),

	// 사용 대상 공고 후보 = 내가 관리하는 조직·팀 공고 중 혜택 적격분(구인자 공고 목록과 같은 스코프).
	listUsableJobPosts: protectedProcedure
		.input(z.object({ orderId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const [order] = await db
				.select({
					benefitType: bambiPointShopOrder.benefitType,
					status: bambiPointShopOrder.status,
					usableUntil: bambiPointShopOrder.usableUntil,
					usedAt: bambiPointShopOrder.usedAt,
					userId: bambiPointShopOrder.userId,
				})
				.from(bambiPointShopOrder)
				.where(eq(bambiPointShopOrder.id, input.orderId))
				.limit(1);
			if (!order || order.userId !== profile.userId) {
				throw new ORPCError("NOT_FOUND", {
					message: "주문을 찾을 수 없습니다.",
				});
			}
			// 사용 불가(유형·상태·만료) 주문은 대상 후보가 없다.
			const now = new Date();
			const usage = resolveOwnedUsage({
				benefitType: order.benefitType,
				now,
				status: order.status,
				usableUntil: order.usableUntil,
				usedAt: order.usedAt,
			});
			if (!usage.ok) {
				return [];
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
					exposureEndsAt: jobPost.exposureEndsAt,
					exposureType: jobPost.exposureType,
					id: jobPost.id,
					paymentStatus: jobPost.paymentStatus,
					status: jobPost.status,
					title: jobPost.title,
				})
				.from(jobPost)
				.where(or(...accessFilters))
				.orderBy(desc(jobPost.updatedAt));
			const bannerTypes = new Set<string>(AD_BANNER_EXPOSURE_TYPES);
			return rows
				.filter((post) =>
					isJobPostUsableForBenefit({
						benefitType: order.benefitType,
						exposureEndsAt: post.exposureEndsAt,
						isBannerExposure: bannerTypes.has(post.exposureType),
						now,
						paymentStatus: post.paymentStatus,
						status: post.status,
					})
				)
				.map((post) => ({ id: post.id, title: post.title }));
		}),

	// 보유 혜택 사용(끌올·연장). 주문 FOR UPDATE로 이중 사용을 봉쇄하고, 대상 공고 접근·적격을
	// 다시 검사한다(역할 전환·조직 이탈 재검증).
	useBenefit: protectedProcedure
		.input(
			z.object({
				jobPostId: z.string().uuid(),
				orderId: z.string().uuid(),
			})
		)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			return db.transaction(async (tx) => {
				const [order] = await tx
					.select()
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1)
					.for("update");
				if (!order || order.userId !== profile.userId) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				const now = new Date();
				const usage = resolveOwnedUsage({
					benefitType: order.benefitType,
					now,
					status: order.status,
					usableUntil: order.usableUntil,
					usedAt: order.usedAt,
				});
				if (!usage.ok) {
					throw new ORPCError("CONFLICT", {
						message: "사용할 수 없는 주문입니다.",
					});
				}
				const [post] = await tx
					.select({
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
					throw new ORPCError("NOT_FOUND", {
						message: "대상 공고를 찾을 수 없습니다.",
					});
				}
				// 대상 공고 조직·팀 접근 권한 재검사(구매 시점 이후 역할·소속 변동 방어).
				await requireEmployerPostingAccess({
					organizationId: post.organizationId,
					session: context.session,
					teamId: post.teamId,
				});
				const bannerTypes = new Set<string>(AD_BANNER_EXPOSURE_TYPES);
				if (
					!isJobPostUsableForBenefit({
						benefitType: order.benefitType,
						exposureEndsAt: post.exposureEndsAt,
						isBannerExposure: bannerTypes.has(post.exposureType),
						now,
						paymentStatus: post.paymentStatus,
						status: post.status,
					})
				) {
					throw new ORPCError("BAD_REQUEST", {
						message: "이 공고에는 사용할 수 없어요.",
					});
				}
				if (order.benefitType === "ad_extend") {
					const extended = await extendJobPostExposureAtomic(
						tx,
						input.jobPostId,
						order.extendDays ?? 0
					);
					if (extended === null) {
						throw new ORPCError("BAD_REQUEST", {
							message: "이 공고에는 사용할 수 없어요.",
						});
					}
				} else {
					const values = buildBoostPurchaseValues({
						benefitType: order.benefitType,
						boostCount: order.boostCount,
						boostsPerDay: order.boostsPerDay,
						durationDays: order.durationDays,
						now,
					});
					await tx.insert(jobBoostPurchase).values({
						...values,
						buyerUserId: profile.userId,
						jobPostId: input.jobPostId,
						organizationId: post.organizationId,
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({
						status: "used",
						targetJobPostId: input.jobPostId,
						usedAt: now,
					})
					.where(eq(bambiPointShopOrder.id, order.id));
				return { id: order.id, status: "used" as const };
			});
		}),

	// 보유·대기 주문 본인 취소·환불. 락 순서: 포인트몰 락 → (원장 락은 awardMemberPoints 내부).
	cancelMyOrder: protectedProcedure
		.input(z.object({ orderId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			return db.transaction(async (tx) => {
				await acquirePointShopUserLock(tx, profile.userId);
				const [order] = await tx
					.select()
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1)
					.for("update");
				if (!order || order.userId !== profile.userId) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				const verdict = resolveOrderCancellation({
					benefitType: order.benefitType,
					now: new Date(),
					status: order.status,
					usableUntil: order.usableUntil,
					usedAt: order.usedAt,
				});
				if (!verdict.ok) {
					throw new ORPCError("CONFLICT", {
						message: "취소할 수 없는 주문입니다.",
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({ processedAt: new Date(), status: "canceled" })
					.where(eq(bambiPointShopOrder.id, order.id));
				// 구매 시 실제 차감된 주문만 복원 — 이후 무제한↔유한 재고 전환에도 부풀림 없음.
				if (shouldRestoreItemStock(order)) {
					await restoreItemStock(tx, order.itemId);
				}
				// 환불(+): external_key 유니크로 멱등, 상한 클램프 적용. 클램프로 실제 환급이
				// 가격보다 적거나 0일 수 있어(§3.6 잔여 소멸) 실환급액을 반환해 안내에 쓴다.
				const refund = await awardMemberPoints(tx, {
					amount: order.pricePoints,
					description: `포인트몰 취소·환불: ${order.itemName}`,
					externalKey: `point_shop_refund:${order.id}`,
					reason: POINT_SHOP_REASONS.refund,
					userId: order.userId,
				});
				return {
					id: order.id,
					refunded: refund.awarded,
					status: "canceled" as const,
				};
			});
		}),

	adminListItems: adminProcedure.handler(async () =>
		db
			.select({
				audience: bambiPointShopItem.audience,
				benefitType: bambiPointShopItem.benefitType,
				// 판매 이력 여부 — 폼이 benefit_type Select을 비활성화하는 근거(§2.2 폼 비활성).
				hasOrders: sql<boolean>`exists (select 1 from ${bambiPointShopOrder} where ${bambiPointShopOrder.itemId} = ${bambiPointShopItem.id})`,
				boostCount: bambiPointShopItem.boostCount,
				boostsPerDay: bambiPointShopItem.boostsPerDay,
				createdAt: bambiPointShopItem.createdAt,
				description: bambiPointShopItem.description,
				durationDays: bambiPointShopItem.durationDays,
				extendDays: bambiPointShopItem.extendDays,
				id: bambiPointShopItem.id,
				imageUrl: bambiPointShopItem.imageUrl,
				isActive: bambiPointShopItem.isActive,
				name: bambiPointShopItem.name,
				pricePoints: bambiPointShopItem.pricePoints,
				sortOrder: bambiPointShopItem.sortOrder,
				stockQuantity: bambiPointShopItem.stockQuantity,
				updatedAt: bambiPointShopItem.updatedAt,
				usageLimitDays: bambiPointShopItem.usageLimitDays,
			})
			.from(bambiPointShopItem)
			.orderBy(
				asc(bambiPointShopItem.sortOrder),
				asc(bambiPointShopItem.createdAt)
			)
	),

	createItem: adminProcedure.input(itemInput).handler(async ({ input }) => {
		const benefitColumns = buildValidatedBenefitColumns(input);
		const [created] = await db
			.insert(bambiPointShopItem)
			.values({
				...benefitColumns,
				description: input.description ?? null,
				imageUrl: input.imageUrl ?? null,
				isActive: input.isActive,
				name: input.name,
				pricePoints: input.pricePoints,
				sortOrder: input.sortOrder,
			})
			.returning({ id: bambiPointShopItem.id });
		return created;
	}),

	updateItem: adminProcedure
		.input(itemInput.extend({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			const benefitColumns = buildValidatedBenefitColumns(input);
			// 유형 변경 잠금(판매 이력 검사)과 저장을 한 트랜잭션에서 처리하고, 아이템 행을
			// FOR UPDATE로 잠가 동시 purchase(주문 insert·재고 차감)와 직렬화한다 —
			// 검사와 저장 사이에 주문이 끼어들어 잠금을 우회하는 TOCTOU를 봉쇄한다.
			return await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ benefitType: bambiPointShopItem.benefitType })
					.from(bambiPointShopItem)
					.where(eq(bambiPointShopItem.id, input.id))
					.limit(1)
					.for("update");
				if (!existing) {
					throw new ORPCError("NOT_FOUND", {
						message: "아이템을 찾을 수 없습니다.",
					});
				}
				// 판매 이력(주문 존재)이 있으면 benefit_type 변경 금지(가격·이름 등은 허용).
				if (existing.benefitType !== input.benefitType) {
					const [soldOrder] = await tx
						.select({ id: bambiPointShopOrder.id })
						.from(bambiPointShopOrder)
						.where(eq(bambiPointShopOrder.itemId, input.id))
						.limit(1);
					if (soldOrder) {
						throw new ORPCError("CONFLICT", {
							message: "판매 이력이 있어 유형을 바꿀 수 없어요.",
						});
					}
				}
				const [updated] = await tx
					.update(bambiPointShopItem)
					.set({
						...benefitColumns,
						description: input.description ?? null,
						imageUrl: input.imageUrl ?? null,
						isActive: input.isActive,
						name: input.name,
						pricePoints: input.pricePoints,
						sortOrder: input.sortOrder,
						updatedAt: new Date(),
					})
					.where(eq(bambiPointShopItem.id, input.id))
					.returning({ id: bambiPointShopItem.id });
				if (!updated) {
					throw new ORPCError("NOT_FOUND", {
						message: "아이템을 찾을 수 없습니다.",
					});
				}
				return updated;
			});
		}),

	removeItem: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			// 주문은 스냅샷(item_name·price_points)을 들고 있고 FK가 set null이라 삭제해도
			// 구매 내역·환불 근거가 남는다.
			const [removed] = await db
				.delete(bambiPointShopItem)
				.where(eq(bambiPointShopItem.id, input.id))
				.returning({ id: bambiPointShopItem.id });
			if (!removed) {
				throw new ORPCError("NOT_FOUND", {
					message: "아이템을 찾을 수 없습니다.",
				});
			}
			return removed;
		}),

	adminListOrders: adminProcedure
		.input(z.object({ status: z.enum(POINT_SHOP_ORDER_STATUSES).optional() }))
		.handler(async ({ input }) =>
			db
				.select({
					id: bambiPointShopOrder.id,
					itemName: bambiPointShopOrder.itemName,
					pricePoints: bambiPointShopOrder.pricePoints,
					status: bambiPointShopOrder.status,
					benefitType: bambiPointShopOrder.benefitType,
					operatorMemo: bambiPointShopOrder.operatorMemo,
					createdAt: bambiPointShopOrder.createdAt,
					processedAt: bambiPointShopOrder.processedAt,
					usableUntil: bambiPointShopOrder.usableUntil,
					usedAt: bambiPointShopOrder.usedAt,
					buyerName: user.name,
					buyerEmail: user.email,
					// 쿠폰형 발송용 구매자 번호(프로필 조인). UI는 쿠폰형 행에서만 노출.
					buyerPhone: bambiProfile.phoneNumber,
				})
				.from(bambiPointShopOrder)
				.leftJoin(user, eq(bambiPointShopOrder.userId, user.id))
				.leftJoin(
					bambiProfile,
					eq(bambiPointShopOrder.userId, bambiProfile.userId)
				)
				// 필터 없으면 undefined — drizzle이 where 절 자체를 생략한다.
				.where(
					input.status
						? eq(bambiPointShopOrder.status, input.status)
						: undefined
				)
				.orderBy(desc(bambiPointShopOrder.createdAt))
		),

	completeOrder: adminProcedure
		.input(z.object({ orderId: z.string().uuid() }))
		.handler(async ({ input }) =>
			db.transaction(async (tx) => {
				const [order] = await tx
					.select()
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1)
					.for("update");
				if (!order) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				const transition = resolveOrderTransition(order.status, "complete");
				if (!transition) {
					throw new ORPCError("CONFLICT", {
						message: "이미 처리된 주문입니다.",
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({ processedAt: new Date(), status: transition.next })
					.where(eq(bambiPointShopOrder.id, order.id));
				return { id: order.id, status: transition.next };
			})
		),

	// 운영자 취소·환불. 락 순서 고정: 포인트몰 계정 락 → 주문 FOR UPDATE →
	// (원장 락은 awardMemberPoints 내부). 회원 cancelMyOrder와 같은 순서라 상호 데드락이
	// 없다. 수동·쿠폰 pending·끌올·연장 owned(미사용·미만료)만 §3.4 가드로 취소한다.
	cancelOrder: adminProcedure
		.input(
			z.object({
				memo: z.string().trim().max(300).optional(),
				orderId: z.string().uuid(),
			})
		)
		.handler(async ({ input }) =>
			db.transaction(async (tx) => {
				// 계정 락은 userId 키라 소유자를 먼저 읽는다(userId는 불변 — FOR UPDATE 불요).
				const [owner] = await tx
					.select({ userId: bambiPointShopOrder.userId })
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1);
				if (!owner) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				await acquirePointShopUserLock(tx, owner.userId);
				// 주문 행 FOR UPDATE로 완료/취소 동시 처리를 직렬화한다(중복 환불 방지).
				const [order] = await tx
					.select()
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1)
					.for("update");
				if (!order) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				const verdict = resolveOrderCancellation({
					benefitType: order.benefitType,
					now: new Date(),
					status: order.status,
					usableUntil: order.usableUntil,
					usedAt: order.usedAt,
				});
				if (!verdict.ok) {
					throw new ORPCError("CONFLICT", {
						message: "취소할 수 없는 주문입니다.",
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({
						operatorMemo: input.memo ?? null,
						processedAt: new Date(),
						status: "canceled",
					})
					.where(eq(bambiPointShopOrder.id, order.id));
				// 회원 취소와 동일 가드 — 구매 시 실제 차감된 주문만 복원.
				if (shouldRestoreItemStock(order)) {
					await restoreItemStock(tx, order.itemId);
				}
				// 환불(+): external_key 유니크로 멱등, 상한 클램프(회원 취소와 동일 키·설명).
				await awardMemberPoints(tx, {
					amount: order.pricePoints,
					description: `포인트몰 취소·환불: ${order.itemName}`,
					externalKey: `point_shop_refund:${order.id}`,
					reason: POINT_SHOP_REASONS.refund,
					userId: order.userId,
				});
				return { id: order.id, status: "canceled" as const };
			})
		),
};
