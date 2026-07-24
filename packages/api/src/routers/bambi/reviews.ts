import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import { interviewSchedule, review } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import {
	maskReviewerDisplayName,
	validateReviewInput,
} from "../../services/bambi-review-policy";

const createReviewInput = z.object({
	body: z.string().min(1).max(1200),
	chatRoomId: z.string().uuid(),
	isAnonymous: z.boolean().default(false),
	rating: z.number(),
});

const listByJobPostInput = z.object({
	jobPostId: z.string().uuid(),
	limit: z.number().int().min(1).max(50).default(10),
	offset: z.number().int().min(0).default(0),
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
					isAnonymous: input.isAnonymous,
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

	// 공고 상세용 후기 목록. 회원(활성 bambi 프로필) 전용이며, 게시된(published) 후기만
	// 서버에서 강제 필터한다. 작성자 식별 정보(reviewerUserId·원본 표시명)는 응답에 넣지 않고,
	// 익명이면 "익명", 아니면 마스킹된 표시명만 내려준다.
	listByJobPost: protectedProcedure
		.input(listByJobPostInput)
		.handler(async ({ context, input }) => {
			await requireActiveBambiProfile(context.session);

			const rows = await db
				.select({
					body: review.body,
					createdAt: review.createdAt,
					displayName: user.name,
					id: review.id,
					isAnonymous: review.isAnonymous,
					rating: review.rating,
				})
				.from(review)
				.leftJoin(user, eq(review.reviewerUserId, user.id))
				.where(
					and(
						eq(review.jobPostId, input.jobPostId),
						eq(review.status, "published")
					)
				)
				.orderBy(desc(review.createdAt))
				.offset(input.offset)
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = (hasMore ? rows.slice(0, input.limit) : rows).map(
				(row) => ({
					body: row.body,
					createdAt: row.createdAt,
					id: row.id,
					rating: row.rating,
					reviewerDisplayName: row.isAnonymous
						? "익명"
						: maskReviewerDisplayName(row.displayName),
				})
			);

			return { hasMore, items };
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
