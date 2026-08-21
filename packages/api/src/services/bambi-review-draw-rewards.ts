import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	bambiReviewDrawReward,
	review,
} from "@bambi-app/db/schema/bambi";
import { and, asc, eq, isNull, lte } from "drizzle-orm";

import { adjustMemberItem } from "./bambi-member-items";
import { notifyBambiNotification } from "./bambi-notifications";
import type { PointTx } from "./bambi-point-ledger";
import { resolveReviewDrawRewardDecision } from "./bambi-review-draw-policy";

export const REVIEW_DRAW_REWARD_DELAY_MS = 72 * 60 * 60 * 1000;

export async function disqualifyReviewDrawReward(
	tx: PointTx,
	args: { reason: string; reviewId: string }
): Promise<void> {
	await tx
		.update(bambiReviewDrawReward)
		.set({
			disqualifiedReason: args.reason,
			processedAt: new Date(),
			status: "disqualified",
		})
		.where(
			and(
				eq(bambiReviewDrawReward.reviewId, args.reviewId),
				eq(bambiReviewDrawReward.status, "pending")
			)
		);
}

export async function runReviewDrawRewardTick(
	now: Date = new Date()
): Promise<{ awarded: number; disqualified: number; processed: number }> {
	const candidates = await db
		.select({ reviewId: bambiReviewDrawReward.reviewId })
		.from(bambiReviewDrawReward)
		.where(
			and(
				eq(bambiReviewDrawReward.status, "pending"),
				lte(bambiReviewDrawReward.eligibleAt, now)
			)
		)
		.orderBy(asc(bambiReviewDrawReward.eligibleAt))
		.limit(100);
	let awarded = 0;
	let disqualified = 0;
	for (const candidate of candidates) {
		const result = await db.transaction(async (tx) => {
			// 운영자 상태 변경(transitionReviewPoints)도 review를 먼저 갱신한 뒤 reward를
			// disqualify한다. 같은 순서로 잠가 72시간 경계의 숨김·지급 경합을 직렬화한다.
			const [reviewState] = await tx
				.select({ status: review.status })
				.from(review)
				.where(eq(review.id, candidate.reviewId))
				.limit(1)
				.for("update");
			const [reward] = await tx
				.select({
					recipientUserId: bambiReviewDrawReward.recipientUserId,
					status: bambiReviewDrawReward.status,
				})
				.from(bambiReviewDrawReward)
				.where(eq(bambiReviewDrawReward.reviewId, candidate.reviewId))
				.limit(1)
				.for("update");
			if (reward?.status !== "pending") {
				return { status: "skipped" as const };
			}
			const [recipient] = await tx
				.select({
					accountDeletedAt: user.deletedAt,
					profileRole: bambiProfile.role,
					profileStatus: bambiProfile.status,
				})
				.from(user)
				.innerJoin(
					bambiProfile,
					eq(bambiProfile.userId, reward.recipientUserId)
				)
				.where(and(eq(user.id, reward.recipientUserId), isNull(user.deletedAt)))
				.limit(1);
			const decision = resolveReviewDrawRewardDecision({
				accountActive:
					recipient?.profileStatus === "active" &&
					recipient.accountDeletedAt === null,
				eligibleAt: now,
				now,
				recipientRole: recipient?.profileRole ?? "inactive",
				reviewStatus: reviewState?.status ?? "deleted",
			});
			if (decision !== "award") {
				await disqualifyReviewDrawReward(tx, {
					reason:
						reviewState?.status === "published"
							? "recipient_inactive"
							: "review_not_published",
					reviewId: candidate.reviewId,
				});
				return { status: "disqualified" as const };
			}
			const item = await adjustMemberItem(tx, {
				description: "후기 3일 유지 보상",
				externalKey: `review_draw_ticket:${candidate.reviewId}`,
				itemType: "draw_ticket",
				quantity: 1,
				reason: "employer_review_retained",
				referenceId: candidate.reviewId,
				referenceType: "review",
				userId: reward.recipientUserId,
			});
			await tx
				.update(bambiReviewDrawReward)
				.set({
					itemTransactionId: item.transactionId,
					processedAt: now,
					status: "awarded",
				})
				.where(eq(bambiReviewDrawReward.reviewId, candidate.reviewId));
			return {
				itemTransactionId: item.transactionId,
				recipientUserId: reward.recipientUserId,
				status: "awarded" as const,
			};
		});
		if (result.status === "awarded") {
			awarded += 1;
			await notifyBambiNotification({
				metadata: { action: "employer_review_draw_ticket" },
				recipientUserId: result.recipientUserId,
				targetId: result.itemTransactionId,
				targetType: "member_item_transaction",
			});
		} else if (result.status === "disqualified") {
			disqualified += 1;
		}
	}
	return { awarded, disqualified, processed: candidates.length };
}
