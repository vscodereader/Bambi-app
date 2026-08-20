import { bambiSiteSettings, review } from "@bambi-app/db/schema/bambi";
import { eq, sql } from "drizzle-orm";

import {
	adjustMemberPoints,
	awardMemberPoints,
	type PointTx,
} from "./bambi-point-ledger";
import {
	DEFAULT_REVIEW_WRITE_POINTS,
	SITE_SETTINGS_ROW_ID,
} from "./bambi-point-settings";

export const transitionReviewPoints = async (
	tx: PointTx,
	args: {
		eventId: string;
		nextStatus: "hidden" | "pending_review" | "published";
		reviewId: string;
	}
) => {
	await tx.execute(
		sql`select ${review.id} from ${review} where ${review.id} = ${args.reviewId} for update`
	);
	const [current] = await tx
		.select({
			pointsAwarded: review.pointsAwarded,
			reviewerUserId: review.reviewerUserId,
			status: review.status,
		})
		.from(review)
		.where(eq(review.id, args.reviewId))
		.limit(1);
	if (!current) {
		return null;
	}
	let pointsAwarded = current.pointsAwarded;
	let appliedPoints = 0;
	let transactionId: null | string = null;
	if (
		current.status !== "hidden" &&
		args.nextStatus === "hidden" &&
		pointsAwarded > 0
	) {
		const result = await adjustMemberPoints(tx, {
			amount: -pointsAwarded,
			description: `후기 숨김: ${args.reviewId}`,
			externalKey: `review_write_revoke:${args.reviewId}:${args.eventId}`,
			reason: "review_write_revoke",
			userId: current.reviewerUserId,
		});
		appliedPoints = result.applied;
		transactionId = result.transactionId;
		pointsAwarded = 0;
	} else if (current.status === "hidden" && args.nextStatus === "published") {
		const [settings] = await tx
			.select({ points: bambiSiteSettings.reviewWritePoints })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
			.limit(1);
		const result = await awardMemberPoints(tx, {
			amount: settings?.points ?? DEFAULT_REVIEW_WRITE_POINTS,
			description: `후기 재게시: ${args.reviewId}`,
			externalKey: `review_write_restore:${args.reviewId}:${args.eventId}`,
			reason: "review_write",
			userId: current.reviewerUserId,
		});
		appliedPoints = result.awarded;
		transactionId = result.transactionId;
		pointsAwarded = result.awarded;
	}
	const [updated] = await tx
		.update(review)
		.set({ pointsAwarded, status: args.nextStatus })
		.where(eq(review.id, args.reviewId))
		.returning();
	return updated
		? {
				appliedPoints,
				reviewerUserId: current.reviewerUserId,
				review: updated,
				transactionId,
			}
		: null;
};
