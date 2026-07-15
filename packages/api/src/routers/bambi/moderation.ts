import { db } from "@bambi-app/db";
import { member, user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiProfile,
	chatAttachment,
	chatMessage,
	chatRoom,
	communityComment,
	communityPost,
	employerOrganizationProfile,
	jobPost,
	jobPostMedia,
	report,
	review,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
} from "../../services/bambi-authz";
import { executeBulkModeration } from "../../services/bambi-moderation-bulk";

export const targetTypeSchema = z.enum([
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"community_post",
	"community_comment",
]);

export const reportReasonSchema = z.enum([
	"illegal_or_prohibited_content",
	"coercion_or_safety",
	"underage_concern",
	"scam_or_fraud",
	"harassment",
	"misleading_job_information",
	"other",
]);

const reportStatusSchema = z.enum([
	"open",
	"reviewing",
	"resolved",
	"dismissed",
]);

const jobPostModerationStatusSchema = z.enum([
	"pending_review",
	"published",
	"hidden",
	"rejected",
]);

const accountStatusSchema = z.enum(["active", "warned", "suspended"]);

const createReportInput = z.object({
	targetType: targetTypeSchema,
	targetId: z.string().min(1),
	reason: reportReasonSchema,
	details: z.string().max(1000).optional(),
});

const listReportsInput = z.object({
	status: reportStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

const listJobPostsInput = z.object({
	status: jobPostModerationStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

const listUsersInput = z.object({
	status: accountStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

const setReportStatusInput = z.object({
	reportId: z.string().uuid(),
	status: reportStatusSchema,
	reason: z.string().min(2).max(500),
});

const setJobPostStatusInput = z.object({
	jobPostId: z.string().uuid(),
	status: jobPostModerationStatusSchema,
	reason: z.string().min(2).max(500),
});

const setUserStatusInput = z.object({
	targetUserId: z.string().min(1),
	status: accountStatusSchema,
	reason: z.string().min(2).max(500),
});

const employerVerificationDecisionSchema = z.enum(["verified", "rejected"]);

const setEmployerVerificationStatusInput = z.object({
	organizationId: z.string().min(1),
	status: employerVerificationDecisionSchema,
	reason: z.string().min(2).max(500),
});

const bulkSetReportStatusInput = z.object({
	reportIds: z.array(z.string().uuid()),
	status: reportStatusSchema,
	reason: z.string().min(2).max(500),
});

const bulkSetJobPostStatusInput = z.object({
	jobPostIds: z.array(z.string().uuid()),
	status: jobPostModerationStatusSchema,
	reason: z.string().min(2).max(500),
});

const bulkSetUserStatusInput = z.object({
	targetUserIds: z.array(z.string().min(1)),
	status: accountStatusSchema,
	reason: z.string().min(2).max(500),
});

type ReportTargetType = z.infer<typeof targetTypeSchema>;
type ReportRow = typeof report.$inferSelect;
type JobPostModerationStatus = z.infer<typeof jobPostModerationStatusSchema>;
type JobPostRow = typeof jobPost.$inferSelect;

const uuidTargetTypes = new Set<ReportTargetType>([
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"community_post",
	"community_comment",
]);

const uuidTargetIdSchema = z.string().uuid();

const getChatMessageTargetContext = async (targetId: string) => {
	const [message] = await db
		.select({
			body: chatMessage.body,
			chatRoomId: chatMessage.chatRoomId,
			createdAt: chatMessage.createdAt,
			id: chatMessage.id,
			senderUserId: chatMessage.senderUserId,
		})
		.from(chatMessage)
		.where(eq(chatMessage.id, targetId))
		.limit(1);

	if (!message) {
		return null;
	}

	const attachments = await db
		.select({
			byteSize: chatAttachment.byteSize,
			category: chatAttachment.category,
			createdAt: chatAttachment.createdAt,
			createdByUserId: chatAttachment.createdByUserId,
			fileName: chatAttachment.fileName,
			id: chatAttachment.id,
			messageId: chatAttachment.messageId,
			mimeType: chatAttachment.mimeType,
		})
		.from(chatAttachment)
		.where(eq(chatAttachment.messageId, targetId))
		.orderBy(asc(chatAttachment.createdAt));

	return {
		...message,
		attachments,
	};
};

const jobPostMediaCountSql = sql<number>`(
	select count(*)::integer
	from ${jobPostMedia}
	where ${jobPostMedia.jobPostId} = ${jobPost.id}
)`;
const jobPostHasCoverImageSql = sql<boolean>`exists(
	select 1
	from ${jobPostMedia}
	where ${jobPostMedia.jobPostId} = ${jobPost.id}
		and ${jobPostMedia.usage} = 'cover'
)`;

const getReportTargetContext = async (reportRow: ReportRow) => {
	if (reportRow.targetType !== "chat_message") {
		return null;
	}

	const message = await getChatMessageTargetContext(reportRow.targetId);

	return message ? { chatMessage: message } : null;
};

const withReportTargetContexts = async (reportRows: ReportRow[]) =>
	await Promise.all(
		reportRows.map(async (reportRow) => ({
			...reportRow,
			targetContext: await getReportTargetContext(reportRow),
		}))
	);

const getJobPostModerationStatusPatch = ({
	existing,
	reason,
	status,
}: {
	existing: JobPostRow;
	reason: string;
	status: JobPostModerationStatus;
}) => {
	const publishedAt =
		status === "published"
			? (existing.publishedAt ?? new Date())
			: existing.publishedAt;
	let rejectionReason = existing.rejectionReason;

	if (status === "published") {
		rejectionReason = null;
	}

	if (status === "rejected") {
		rejectionReason = reason;
	}

	return {
		publishedAt,
		rejectionReason,
		status,
	};
};

const assertReportTargetExists = async (
	targetType: ReportTargetType,
	targetId: string
): Promise<void> => {
	if (
		uuidTargetTypes.has(targetType) &&
		!uuidTargetIdSchema.safeParse(targetId).success
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Invalid report target id.",
		});
	}

	const [target] = await (async () => {
		switch (targetType) {
			case "job_post":
				return await db
					.select({ id: jobPost.id })
					.from(jobPost)
					.where(eq(jobPost.id, targetId))
					.limit(1);
			case "chat_room":
				return await db
					.select({ id: chatRoom.id })
					.from(chatRoom)
					.where(eq(chatRoom.id, targetId))
					.limit(1);
			case "chat_message":
				return await db
					.select({ id: chatMessage.id })
					.from(chatMessage)
					.where(eq(chatMessage.id, targetId))
					.limit(1);
			case "review":
				return await db
					.select({ id: review.id })
					.from(review)
					.where(eq(review.id, targetId))
					.limit(1);
			case "user":
				return await db
					.select({ id: bambiProfile.userId })
					.from(bambiProfile)
					.where(eq(bambiProfile.userId, targetId))
					.limit(1);
			case "community_post":
				return await db
					.select({ id: communityPost.id })
					.from(communityPost)
					.where(eq(communityPost.id, targetId))
					.limit(1);
			case "community_comment":
				return await db
					.select({ id: communityComment.id })
					.from(communityComment)
					.where(eq(communityComment.id, targetId))
					.limit(1);
			default:
				return [];
		}
	})();

	if (!target) {
		throw new ORPCError("NOT_FOUND");
	}
};

export const moderationRouter = {
	createReport: protectedProcedure
		.input(createReportInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await assertReportTargetExists(input.targetType, input.targetId);

			const [created] = await db
				.insert(report)
				.values({
					reporterUserId: profile.userId,
					targetType: input.targetType,
					targetId: input.targetId,
					reason: input.reason,
					details: input.details,
				})
				.returning();

			return created;
		}),

	listReports: protectedProcedure
		.input(listReportsInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			if (input.status) {
				const reportRows = await db
					.select()
					.from(report)
					.where(eq(report.status, input.status))
					.orderBy(desc(report.createdAt))
					.limit(input.limit);

				return await withReportTargetContexts(reportRows);
			}

			const reportRows = await db
				.select()
				.from(report)
				.orderBy(desc(report.createdAt))
				.limit(input.limit);

			return await withReportTargetContexts(reportRows);
		}),

	// 내가 접수한 신고 목록. 관리자용 listReports와 달리 reporterUserId=본인으로 한정한다.
	listMyReports: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			const reportRows = await db
				.select()
				.from(report)
				.where(eq(report.reporterUserId, profile.userId))
				.orderBy(desc(report.createdAt))
				.limit(input.limit);

			return await withReportTargetContexts(reportRows);
		}),

	listJobPosts: protectedProcedure
		.input(listJobPostsInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const query = db
				.select({
					id: jobPost.id,
					title: jobPost.title,
					industryCategory: jobPost.industryCategory,
					region: jobPost.region,
					payAmount: jobPost.payAmount,
					payUnit: jobPost.payUnit,
					workSchedule: jobPost.workSchedule,
					description: jobPost.description,
					descriptionBlocks: jobPost.descriptionBlocks,
					hasCoverImage: jobPostHasCoverImageSql,
					interviewNotes: jobPost.interviewNotes,
					mediaCount: jobPostMediaCountSql,
					status: jobPost.status,
					riskFlags: jobPost.riskFlags,
					rejectionReason: jobPost.rejectionReason,
					organizationDisplayName: employerOrganizationProfile.displayName,
					createdAt: jobPost.createdAt,
					updatedAt: jobPost.updatedAt,
				})
				.from(jobPost)
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.orderBy(desc(jobPost.updatedAt))
				.limit(input.limit);

			if (input.status) {
				return await query.where(eq(jobPost.status, input.status));
			}

			return await query;
		}),

	listUsers: protectedProcedure
		.input(listUsersInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const query = db
				.select({
					userId: bambiProfile.userId,
					displayName: bambiProfile.displayName,
					email: user.email,
					role: bambiProfile.role,
					status: bambiProfile.status,
					isPhoneVerified: bambiProfile.isPhoneVerified,
					phoneNumber: bambiProfile.phoneNumber,
					createdAt: bambiProfile.createdAt,
					updatedAt: bambiProfile.updatedAt,
				})
				.from(bambiProfile)
				.innerJoin(user, eq(bambiProfile.userId, user.id))
				.orderBy(desc(bambiProfile.updatedAt))
				.limit(input.limit);

			if (input.status) {
				return await query.where(eq(bambiProfile.status, input.status));
			}

			return await query;
		}),

	setReportStatus: protectedProcedure
		.input(setReportStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(report)
					.set({ status: input.status })
					.where(eq(report.id, input.reportId))
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: updated.targetType,
					targetId: updated.targetId,
					action: `set_report_status:${input.status}`,
					reason: input.reason,
					metadata: { reportId: input.reportId },
				});

				return updated;
			});
		}),

	bulkSetReportStatus: protectedProcedure
		.input(bulkSetReportStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (reportId) => {
							const [updated] = await tx
								.update(report)
								.set({ status: input.status })
								.where(eq(report.id, reportId))
								.returning();

							if (!updated) {
								throw new ORPCError("NOT_FOUND", {
									message: "Report was not found.",
								});
							}

							await tx.insert(adminModerationAction).values({
								adminUserId: admin.userId,
								targetType: updated.targetType,
								targetId: updated.targetId,
								action: `set_report_status:${input.status}`,
								reason: input.reason,
								metadata: { bulk: true, reportId },
							});
						},
						targetIds: input.reportIds,
					})
			);
		}),

	setJobPostStatus: protectedProcedure
		.input(setJobPostStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND");
				}

				const statusPatch = getJobPostModerationStatusPatch({
					existing,
					reason: input.reason,
					status: input.status,
				});

				const [updated] = await tx
					.update(jobPost)
					.set(statusPatch)
					.where(eq(jobPost.id, input.jobPostId))
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "job_post",
					targetId: input.jobPostId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});

				return updated;
			});
		}),

	bulkSetJobPostStatus: protectedProcedure
		.input(bulkSetJobPostStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (jobPostId) => {
							const [existing] = await tx
								.select()
								.from(jobPost)
								.where(eq(jobPost.id, jobPostId))
								.limit(1);

							if (!existing) {
								throw new ORPCError("NOT_FOUND", {
									message: "Job post was not found.",
								});
							}

							await tx
								.update(jobPost)
								.set(
									getJobPostModerationStatusPatch({
										existing,
										reason: input.reason,
										status: input.status,
									})
								)
								.where(eq(jobPost.id, jobPostId))
								.returning();

							await tx.insert(adminModerationAction).values({
								adminUserId: admin.userId,
								targetType: "job_post",
								targetId: jobPostId,
								action: `set_status:${input.status}`,
								reason: input.reason,
								metadata: { bulk: true },
							});
						},
						targetIds: input.jobPostIds,
					})
			);
		}),

	setUserStatus: protectedProcedure
		.input(setUserStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(bambiProfile)
					.set({ status: input.status })
					.where(eq(bambiProfile.userId, input.targetUserId))
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "user",
					targetId: input.targetUserId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});

				return updated;
			});
		}),

	bulkSetUserStatus: protectedProcedure
		.input(bulkSetUserStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (targetUserId) => {
							const [updated] = await tx
								.update(bambiProfile)
								.set({ status: input.status })
								.where(eq(bambiProfile.userId, targetUserId))
								.returning();

							if (!updated) {
								throw new ORPCError("NOT_FOUND", {
									message: "User was not found.",
								});
							}

							await tx.insert(adminModerationAction).values({
								adminUserId: admin.userId,
								targetType: "user",
								targetId: targetUserId,
								action: `set_status:${input.status}`,
								reason: input.reason,
								metadata: { bulk: true },
							});
						},
						targetIds: input.targetUserIds,
					})
			);
		}),

	listPendingEmployers: protectedProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);

		return await db
			.select({
				organizationId: employerOrganizationProfile.organizationId,
				displayName: employerOrganizationProfile.displayName,
				businessRegistrationNumber:
					employerOrganizationProfile.businessRegistrationNumber,
				verificationStatus: employerOrganizationProfile.verificationStatus,
				verificationNote: employerOrganizationProfile.verificationNote,
				ownerUserId: member.userId,
				ownerEmail: user.email,
				createdAt: employerOrganizationProfile.createdAt,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.role, "owner")
				)
			)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(employerOrganizationProfile.verificationStatus, "pending"))
			.orderBy(desc(employerOrganizationProfile.createdAt));
	}),

	setEmployerVerificationStatus: protectedProcedure
		.input(setEmployerVerificationStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [owner] = await tx
					.select({ userId: member.userId })
					.from(member)
					.where(
						and(
							eq(member.organizationId, input.organizationId),
							eq(member.role, "owner")
						)
					)
					.limit(1);

				const [updated] = await tx
					.update(employerOrganizationProfile)
					.set({
						verificationStatus: input.status,
						verificationNote: input.status === "rejected" ? input.reason : null,
						updatedAt: new Date(),
					})
					.where(
						eq(employerOrganizationProfile.organizationId, input.organizationId)
					)
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "user",
					targetId: owner?.userId ?? input.organizationId,
					action: `set_employer_verification:${input.status}`,
					reason: input.reason,
					metadata: { organizationId: input.organizationId },
				});

				return updated;
			});
		}),
};
