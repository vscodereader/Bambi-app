import { db } from "@bambi-app/db";
import { member, user } from "@bambi-app/db/schema/auth";
import {
	bambiSiteSettings,
	interviewSchedule,
	jobPost,
	review,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import {
	adjustMemberPoints,
	awardMemberPoints,
} from "../../services/bambi-point-ledger";
import {
	DEFAULT_REVIEW_VIEW_POINTS,
	DEFAULT_REVIEW_WRITE_POINTS,
	SITE_SETTINGS_ROW_ID,
} from "../../services/bambi-point-settings";
import {
	maskReviewerDisplayName,
	validateReviewInput,
} from "../../services/bambi-review-policy";
import {
	isWithdrawnAccount,
	WITHDRAWN_DISPLAY_NAME,
} from "../../services/bambi-withdrawn-display";

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
const unlockReviewInput = z.object({ reviewId: z.string().uuid() });

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

// 후기 목록에 실을 작성자 표기. 익명 후기가 가장 먼저고, 그다음이 탈퇴다 —
// 익명으로 남긴 후기는 작성자가 탈퇴했더라도 계속 "익명"이어야 한다.
const resolveReviewerDisplayName = (row: {
	deletedAt: Date | null;
	displayName: null | string;
	isAnonymous: boolean;
}): string => {
	if (row.isAnonymous) {
		return "익명";
	}
	if (isWithdrawnAccount(row)) {
		return WITHDRAWN_DISPLAY_NAME;
	}
	return maskReviewerDisplayName(row.displayName);
};

export const reviewsRouter = {
	create: protectedProcedure
		.input(createReviewInput)
		.handler(async ({ context, input }) => {
			// 후기 진입점이 "예정된 면접"(나간 방 포함)으로 이관돼, 완료 처리와 같은
			// 나간 방 예외를 후기 등록에도 연다 — 아래 가드가 면접 성사 여부를 계속 막는다.
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session,
				{ allowLeftRoom: true }
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
						eq(interviewSchedule.status, "completed")
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
						eq(review.jobPostId, room.jobPostId),
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

			const created = await db.transaction(async (tx) => {
				const [reviewedJob] = await tx
					.select({ title: jobPost.title })
					.from(jobPost)
					.where(eq(jobPost.id, room.jobPostId))
					.limit(1);
				if (!reviewedJob) {
					throw new ORPCError("NOT_FOUND", {
						message: "후기를 작성할 공고를 찾을 수 없어요.",
					});
				}
				const [settings] = await tx
					.select({ points: bambiSiteSettings.reviewWritePoints })
					.from(bambiSiteSettings)
					.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
					.limit(1);
				const requestedPoints = settings?.points ?? DEFAULT_REVIEW_WRITE_POINTS;
				const [row] = await tx
					.insert(review)
					.values({
						body: input.body.trim(),
						chatRoomId: room.id,
						isAnonymous: input.isAnonymous,
						jobPostId: room.jobPostId,
						organizationId: room.organizationId,
						rating: input.rating,
						reviewerUserId: profile.userId,
						pointsAwarded: 0,
						riskFlags: policyResult.riskFlags,
						status: policyResult.status,
					})
					.returning();
				if (!row) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}
				const awarded = await awardMemberPoints(tx, {
					amount: requestedPoints,
					description: `후기 작성 · ${reviewedJob.title}`,
					externalKey: `review_write:${row.id}:created`,
					reason: "review_write",
					userId: profile.userId,
				});
				if (awarded.awarded > 0) {
					await tx
						.update(review)
						.set({ pointsAwarded: awarded.awarded })
						.where(eq(review.id, row.id));
				}
				return {
					...row,
					pointTransactionId: awarded.transactionId,
					pointsAwarded: awarded.awarded,
				};
			});
			if (created.pointTransactionId && created.pointsAwarded > 0) {
				await notifyBambiNotification({
					actorUserId: profile.userId,
					metadata: { action: "review_written", amount: created.pointsAwarded },
					recipientUserId: profile.userId,
					targetId: created.pointTransactionId,
					targetType: "point_transaction",
				});
			}

			// 후기는 구직자만 남기고, 그 대상은 그 방의 구인자다. 정책 판정이 심사 대기면
			// 아직 게시되지 않으므로 구인자에게는 알리지 않는다(그 경우는 아래 운영자 큐로).
			if (created && created.status === "published") {
				// 공고를 여러 개 굴리는 업주는 제목이 없으면 어느 공고의 후기인지 모른다.
				const [reviewedJobPost] = await db
					.select({ title: jobPost.title })
					.from(jobPost)
					.where(eq(jobPost.id, room.jobPostId))
					.limit(1);

				await notifyBambiNotification({
					actorUserId: profile.userId,
					metadata: {
						action: "created",
						jobPostId: room.jobPostId,
						jobPostTitle: reviewedJobPost?.title ?? null,
					},
					recipientUserId: room.employerUserId,
					targetId: created.id,
					targetType: "review",
				});
			}

			// 정책 판정이 심사 대기면 구인자 알림 대신 운영자 큐로 보낸다(둘은 배타적이다).
			if (created && created.status === "pending_review") {
				await notifyBambiNotification({
					actorUserId: profile.userId,
					metadata: { action: "submitted", jobPostId: room.jobPostId },
					recipientRole: "admin",
					targetId: created.id,
					targetType: "review",
				});
			}

			return created;
		}),

	// 공고 상세용 후기 목록. 회원(활성 bambi 프로필) 전용이며, 게시된(published) 후기만
	// 서버에서 강제 필터한다. 작성자 식별 정보(reviewerUserId·원본 표시명)는 응답에 넣지 않고,
	// 익명이면 "익명", 탈퇴자면 "탈퇴한 회원", 그 외에는 마스킹된 표시명만 내려준다.
	listByJobPost: protectedProcedure
		.input(listByJobPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const [job] = await db
				.select({ organizationId: jobPost.organizationId })
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);
			const [membership] =
				job && profile.role === "employer"
					? await db
							.select({ userId: member.userId })
							.from(member)
							.where(
								and(
									eq(member.userId, profile.userId),
									eq(member.organizationId, job.organizationId)
								)
							)
							.limit(1)
					: [];
			const canViewAll = profile.role === "admin" || Boolean(membership);

			const rows = await db
				.select({
					body: review.body,
					createdAt: review.createdAt,
					// 탈퇴자는 마스킹 대신 탈퇴 문구를 쓴다 — 탈퇴는 마커만 남기므로
					// 마스킹된 원본("김*")도 실제 닉네임의 일부가 그대로 남는다.
					deletedAt: user.deletedAt,
					displayName: user.name,
					id: review.id,
					isAnonymous: review.isAnonymous,
					rating: review.rating,
					reviewerUserId: review.reviewerUserId,
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
					body:
						canViewAll || row.reviewerUserId === profile.userId
							? row.body
							: null,
					createdAt: row.createdAt,
					id: row.id,
					// 잠긴 후기에서도 실제 별점의 윤곽은 옅게 보여 주고, 본문만 결제 전까지
					// 감춘다. 화면이 임의의 고정 별점을 그리면 후기마다 같은 값처럼 보인다.
					rating: row.rating,
					locked: !(canViewAll || row.reviewerUserId === profile.userId),
					reviewerDisplayName: resolveReviewerDisplayName(row),
				})
			);

			const [settings] = await db
				.select({ points: bambiSiteSettings.reviewViewPoints })
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
				.limit(1);
			return {
				hasMore,
				items,
				reviewViewPoints: settings?.points ?? DEFAULT_REVIEW_VIEW_POINTS,
			};
		}),

	unlock: protectedProcedure
		.input(unlockReviewInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const [target] = await db
				.select({
					body: review.body,
					id: review.id,
					jobPostId: review.jobPostId,
					rating: review.rating,
					reviewerUserId: review.reviewerUserId,
					status: review.status,
				})
				.from(review)
				.where(eq(review.id, input.reviewId))
				.limit(1);
			if (target?.status !== "published") {
				throw new ORPCError("NOT_FOUND");
			}
			if (
				target.reviewerUserId === profile.userId ||
				profile.role === "admin"
			) {
				return { body: target.body, rating: target.rating };
			}
			const [job] = await db
				.select({ organizationId: jobPost.organizationId })
				.from(jobPost)
				.where(eq(jobPost.id, target.jobPostId))
				.limit(1);
			const [membership] =
				job && profile.role === "employer"
					? await db
							.select({ userId: member.userId })
							.from(member)
							.where(
								and(
									eq(member.userId, profile.userId),
									eq(member.organizationId, job.organizationId)
								)
							)
							.limit(1)
					: [];
			if (membership) {
				return { body: target.body, rating: target.rating };
			}
			await db.transaction(async (tx) => {
				const [settings] = await tx
					.select({ points: bambiSiteSettings.reviewViewPoints })
					.from(bambiSiteSettings)
					.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
					.limit(1);
				const cost = settings?.points ?? DEFAULT_REVIEW_VIEW_POINTS;
				if (cost > 0) {
					await adjustMemberPoints(tx, {
						amount: -cost,
						description: `후기 열람: ${target.jobPostId}/${target.id}`,
						reason: "review_view",
						userId: profile.userId,
					});
				}
			});
			return { body: target.body, rating: target.rating };
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
