import { randomInt } from "node:crypto";

import { db } from "@bambi-app/db";
import {
	bambiMemberItemTransaction,
	bambiPointDraw,
	bambiPointDrawPrize,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import {
	adjustMemberItem,
	getMemberItemBalanceTx,
	lockMemberItem,
} from "../../services/bambi-member-items";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import {
	selectWeightedPrize,
	sumPrizeWeights,
} from "../../services/bambi-point-draw";
import {
	awardMemberPoints,
	lockMemberPoints,
} from "../../services/bambi-point-ledger";

const DRAW_ROLES = new Set<string>(["job_seeker", "employer"]);
const prizeInput = z.object({
	isActive: z.boolean(),
	points: z.number().int().min(1).max(10_000_000),
	sortOrder: z.number().int().min(0).max(100_000),
	weight: z.number().int().min(1).max(1_000_000),
});

const requireDrawProfile = async (
	session: Parameters<typeof requireActiveBambiProfile>[0]
) => {
	const profile = await requireActiveBambiProfile(session);
	if (!DRAW_ROLES.has(profile.role)) {
		throw new ORPCError("FORBIDDEN", {
			message: "포인트 랜덤 뽑기는 구직자·업소 회원만 이용할 수 있어요.",
		});
	}
	return profile;
};

export const pointDrawRouter = {
	adminCreatePrize: adminProcedure
		.input(prizeInput)
		.handler(async ({ input }) => {
			const [created] = await db
				.insert(bambiPointDrawPrize)
				.values(input)
				.returning();
			return created;
		}),

	adminListPrizes: adminProcedure.handler(async () =>
		db
			.select()
			.from(bambiPointDrawPrize)
			.orderBy(asc(bambiPointDrawPrize.sortOrder), asc(bambiPointDrawPrize.id))
	),

	adminRemovePrize: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			const [removed] = await db
				.delete(bambiPointDrawPrize)
				.where(eq(bambiPointDrawPrize.id, input.id))
				.returning({ id: bambiPointDrawPrize.id });
			if (!removed) {
				throw new ORPCError("NOT_FOUND", {
					message: "당첨 설정을 찾을 수 없어요.",
				});
			}
			return removed;
		}),

	adminUpdatePrize: adminProcedure
		.input(prizeInput.extend({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			const [updated] = await db
				.update(bambiPointDrawPrize)
				.set({
					isActive: input.isActive,
					points: input.points,
					sortOrder: input.sortOrder,
					updatedAt: new Date(),
					weight: input.weight,
				})
				.where(eq(bambiPointDrawPrize.id, input.id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "당첨 설정을 찾을 수 없어요.",
				});
			}
			return updated;
		}),

	draw: protectedProcedure
		.input(z.object({ requestId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requireDrawProfile(context.session);
			const result = await db.transaction(async (tx) => {
				await lockMemberPoints(tx, profile.userId);
				await lockMemberItem(tx, profile.userId, "draw_ticket");
				const [existing] = await tx
					.select()
					.from(bambiPointDraw)
					.where(
						and(
							eq(bambiPointDraw.userId, profile.userId),
							eq(bambiPointDraw.requestId, input.requestId)
						)
					)
					.limit(1);
				if (existing) {
					return {
						awardedPoints: existing.awardedPoints,
						created: false,
						drawId: existing.id,
						notificationTargetId: null,
						notificationTargetType: null,
						prizePoints: existing.prizePointsSnapshot,
						remainingTickets: await getMemberItemBalanceTx(
							tx,
							profile.userId,
							"draw_ticket"
						),
					};
				}
				const prizes = await tx
					.select({
						id: bambiPointDrawPrize.id,
						points: bambiPointDrawPrize.points,
						weight: bambiPointDrawPrize.weight,
					})
					.from(bambiPointDrawPrize)
					.where(eq(bambiPointDrawPrize.isActive, true))
					.orderBy(asc(bambiPointDrawPrize.id));
				if (prizes.length === 0) {
					throw new ORPCError("BAD_REQUEST", {
						message: "운영자가 뽑기 보상을 준비 중입니다.",
					});
				}
				const totalWeight = sumPrizeWeights(prizes);
				if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "당첨 설정을 확인해 주세요.",
					});
				}
				const prize = selectWeightedPrize(prizes, randomInt(totalWeight));
				let ticketUse: Awaited<ReturnType<typeof adjustMemberItem>>;
				try {
					ticketUse = await adjustMemberItem(tx, {
						description: "포인트 랜덤 뽑기 사용",
						externalKey: `point_draw_ticket:${profile.userId}:${input.requestId}`,
						itemType: "draw_ticket",
						quantity: -1,
						reason: "draw_use",
						referenceId: input.requestId,
						referenceType: "point_draw",
						userId: profile.userId,
					});
				} catch (error) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							error instanceof Error ? error.message : "뽑기권이 부족합니다.",
					});
				}
				const award = await awardMemberPoints(tx, {
					amount: prize.points,
					description: `포인트 랜덤 뽑기 · ${prize.points.toLocaleString("ko-KR")}P 당첨`,
					externalKey: `point_draw_reward:${profile.userId}:${input.requestId}`,
					reason: "point_draw_reward",
					userId: profile.userId,
				});
				const [draw] = await tx
					.insert(bambiPointDraw)
					.values({
						awardedPoints: award.awarded,
						pointTransactionId: award.transactionId,
						prizeId: prize.id,
						prizePointsSnapshot: prize.points,
						prizeWeightSnapshot: prize.weight,
						requestId: input.requestId,
						ticketTransactionId: ticketUse.transactionId,
						userId: profile.userId,
					})
					.returning({ id: bambiPointDraw.id });
				if (!draw) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}
				return {
					awardedPoints: award.awarded,
					created: true,
					drawId: draw.id,
					notificationTargetId: award.transactionId ?? ticketUse.transactionId,
					notificationTargetType: award.transactionId
						? ("point_transaction" as const)
						: ("member_item_transaction" as const),
					prizePoints: prize.points,
					remainingTickets: ticketUse.balance,
				};
			});
			if (
				result.created &&
				result.notificationTargetId &&
				result.notificationTargetType
			) {
				await notifyBambiNotification({
					metadata: {
						action: "point_draw_reward",
						amount: result.awardedPoints,
						prizePoints: result.prizePoints,
					},
					recipientUserId: profile.userId,
					targetId: result.notificationTargetId,
					targetType: result.notificationTargetType,
				});
			}
			return result;
		}),

	getState: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireDrawProfile(context.session);
		const [ticketRow, prizeRow, recentDraw] = await Promise.all([
			db
				.select({
					balance: sql<number>`coalesce(sum(${bambiMemberItemTransaction.quantity}), 0)::int`,
				})
				.from(bambiMemberItemTransaction)
				.where(
					and(
						eq(bambiMemberItemTransaction.userId, profile.userId),
						eq(bambiMemberItemTransaction.itemType, "draw_ticket")
					)
				),
			db
				.select({
					maxPoints: sql<number>`max(${bambiPointDrawPrize.points})::int`,
				})
				.from(bambiPointDrawPrize)
				.where(eq(bambiPointDrawPrize.isActive, true)),
			db
				.select({
					awardedPoints: bambiPointDraw.awardedPoints,
					createdAt: bambiPointDraw.createdAt,
					id: bambiPointDraw.id,
					prizePoints: bambiPointDraw.prizePointsSnapshot,
				})
				.from(bambiPointDraw)
				.where(eq(bambiPointDraw.userId, profile.userId))
				.orderBy(desc(bambiPointDraw.createdAt))
				.limit(1),
		]);
		return {
			activePrizeAvailable: (prizeRow[0]?.maxPoints ?? null) !== null,
			maxPrizePoints: prizeRow[0]?.maxPoints ?? null,
			recentDraw: recentDraw[0] ?? null,
			ticketBalance: ticketRow[0]?.balance ?? 0,
		};
	}),
};
