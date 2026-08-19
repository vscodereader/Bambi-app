import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiPointShopItem,
	bambiPointShopOrder,
	bambiPointTransaction,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../index";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "../../services/bambi-authz";
import { POINT_SHOP_REASONS } from "../../services/bambi-member-points";
import {
	acquirePointShopUserLock,
	POINT_SHOP_ORDER_STATUSES,
	POINT_SHOP_PURCHASE_ROLES,
	resolveOrderTransition,
	resolvePurchase,
} from "../../services/bambi-point-shop";

// 잔액은 원장 합산(잔액 컬럼 없음 — attendance.ts와 동일 규칙).
const pointBalanceSql = sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`;

const PURCHASE_DENIAL_MESSAGES = {
	inactive: "판매가 종료된 아이템입니다.",
	insufficient: "보유 포인트가 부족합니다.",
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

const itemFields = {
	id: bambiPointShopItem.id,
	name: bambiPointShopItem.name,
	description: bambiPointShopItem.description,
	imageUrl: bambiPointShopItem.imageUrl,
	pricePoints: bambiPointShopItem.pricePoints,
};

const itemInput = z.object({
	description: z.string().trim().max(500).nullable().optional(),
	imageUrl: z.string().trim().url().max(600).nullable().optional(),
	isActive: z.boolean(),
	name: z.string().trim().min(1).max(60),
	pricePoints: z.number().int().min(1).max(10_000_000),
	sortOrder: z.number().int().min(0).max(100_000),
});

export const pointShopRouter = {
	listItems: publicProcedure.handler(async () =>
		db
			.select(itemFields)
			.from(bambiPointShopItem)
			.where(eq(bambiPointShopItem.isActive, true))
			.orderBy(
				asc(bambiPointShopItem.sortOrder),
				asc(bambiPointShopItem.createdAt)
			)
	),

	getMyBalance: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
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
				const [item] = await tx
					.select()
					.from(bambiPointShopItem)
					.where(eq(bambiPointShopItem.id, input.itemId))
					.limit(1);
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
					balance,
					isActive: item.isActive,
					pricePoints: item.pricePoints,
				});
				if (!verdict.ok) {
					throw new ORPCError("BAD_REQUEST", {
						message: PURCHASE_DENIAL_MESSAGES[verdict.code],
					});
				}
				const [order] = await tx
					.insert(bambiPointShopOrder)
					.values({
						itemId: item.id,
						itemName: item.name,
						pricePoints: item.pricePoints,
						userId: profile.userId,
					})
					.returning({ id: bambiPointShopOrder.id });
				await tx.insert(bambiPointTransaction).values({
					amount: -item.pricePoints,
					reason: POINT_SHOP_REASONS.purchase,
					userId: profile.userId,
				});
				return {
					orderId: order?.id,
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
				operatorMemo: bambiPointShopOrder.operatorMemo,
				createdAt: bambiPointShopOrder.createdAt,
				processedAt: bambiPointShopOrder.processedAt,
			})
			.from(bambiPointShopOrder)
			.where(eq(bambiPointShopOrder.userId, profile.userId))
			.orderBy(desc(bambiPointShopOrder.createdAt));
	}),

	adminListItems: adminProcedure.handler(async () =>
		db
			.select()
			.from(bambiPointShopItem)
			.orderBy(
				asc(bambiPointShopItem.sortOrder),
				asc(bambiPointShopItem.createdAt)
			)
	),

	createItem: adminProcedure.input(itemInput).handler(async ({ input }) => {
		const [created] = await db
			.insert(bambiPointShopItem)
			.values({
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
			const [updated] = await db
				.update(bambiPointShopItem)
				.set({
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
					operatorMemo: bambiPointShopOrder.operatorMemo,
					createdAt: bambiPointShopOrder.createdAt,
					processedAt: bambiPointShopOrder.processedAt,
					buyerName: user.name,
					buyerEmail: user.email,
				})
				.from(bambiPointShopOrder)
				.leftJoin(user, eq(bambiPointShopOrder.userId, user.id))
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

	cancelOrder: adminProcedure
		.input(
			z.object({
				memo: z.string().trim().max(300).optional(),
				orderId: z.string().uuid(),
			})
		)
		.handler(async ({ input }) =>
			db.transaction(async (tx) => {
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
				const transition = resolveOrderTransition(order.status, "cancel");
				if (!transition) {
					throw new ORPCError("CONFLICT", {
						message: "이미 처리된 주문입니다.",
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({
						operatorMemo: input.memo ?? null,
						processedAt: new Date(),
						status: transition.next,
					})
					.where(eq(bambiPointShopOrder.id, order.id));
				if (transition.refund) {
					await tx.insert(bambiPointTransaction).values({
						amount: order.pricePoints,
						reason: POINT_SHOP_REASONS.refund,
						userId: order.userId,
					});
				}
				return { id: order.id, status: transition.next };
			})
		),
};
