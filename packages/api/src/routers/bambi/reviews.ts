import { db } from "@bambi-app/db";
import { interviewSchedule, review } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import { validateReviewInput } from "../../services/bambi-review-policy";

const createReviewInput = z.object({
	body: z.string().min(1).max(1200),
	chatRoomId: z.string().uuid(),
	rating: z.number(),
});

const getPolicyErrorMessage = (code: string): string => {
	switch (code) {
		case "invalid_rating":
			return "Review rating must be an integer from 1 to 5.";
		case "body_too_long":
			return "Review body must be 1000 characters or fewer.";
		default:
			return "Review body must be at least 20 characters.";
	}
};

export const reviewsRouter = {
	create: protectedProcedure
		.input(createReviewInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			if (profile.userId !== room.jobSeekerUserId) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only the job seeker can review this chat room.",
				});
			}

			const [eligibleSchedule] = await db
				.select({ id: interviewSchedule.id })
				.from(interviewSchedule)
				.where(
					and(
						eq(interviewSchedule.chatRoomId, room.id),
						or(
							eq(interviewSchedule.status, "confirmed"),
							eq(interviewSchedule.status, "completed")
						)
					)
				)
				.limit(1);

			if (!eligibleSchedule) {
				throw new ORPCError("FORBIDDEN", {
					message: "A confirmed or completed interview is required.",
				});
			}

			const [existingReview] = await db
				.select({ id: review.id })
				.from(review)
				.where(
					and(
						eq(review.chatRoomId, room.id),
						eq(review.reviewerUserId, profile.userId)
					)
				)
				.limit(1);

			if (existingReview) {
				throw new ORPCError("CONFLICT", {
					message: "This chat room already has a review from this user.",
				});
			}

			const policyResult = validateReviewInput(input);

			if (!policyResult.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message: getPolicyErrorMessage(policyResult.code),
				});
			}

			const [created] = await db
				.insert(review)
				.values({
					body: input.body.trim(),
					chatRoomId: room.id,
					jobPostId: room.jobPostId,
					organizationId: room.organizationId,
					rating: input.rating,
					reviewerUserId: profile.userId,
					riskFlags: policyResult.riskFlags,
					status: policyResult.status,
				})
				.returning();

			return created;
		}),

	listMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		return await db
			.select()
			.from(review)
			.where(eq(review.reviewerUserId, profile.userId))
			.orderBy(desc(review.createdAt));
	}),
};
