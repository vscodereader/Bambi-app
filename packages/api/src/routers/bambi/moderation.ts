import { randomUUID } from "node:crypto";
import { db } from "@bambi-app/db";
import {
	invitation,
	member,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiProfile,
	chatAttachment,
	chatMessage,
	chatRoom,
	employerOrganizationProfile,
	employerTeamProfile,
	jobPost,
	jobPostMedia,
	report,
	review,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
} from "../../services/bambi-authz";
import { executeBulkModeration } from "../../services/bambi-moderation-bulk";
import { normalizeOrganizationManagementRole } from "../../services/bambi-organization-authz";

export const targetTypeSchema = z.enum([
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
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

const teamInvitationDecisionSchema = z.enum(["accepted", "rejected"]);

const setTeamInvitationStatusInput = z
	.object({
		invitationId: z.string().min(1),
		status: teamInvitationDecisionSchema,
		reason: z.string().max(500).optional(),
	})
	.refine(
		(value) =>
			value.status !== "rejected" || (value.reason?.trim().length ?? 0) >= 2,
		{ message: "반려 사유를 입력하세요.", path: ["reason"] }
	);

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
			default:
				return [];
		}
	})();

	if (!target) {
		throw new ORPCError("NOT_FOUND");
	}
};

type ModerationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InvitationRow = typeof invitation.$inferSelect;

const rejectTeamInvitation = async (
	tx: ModerationTx,
	adminUserId: string,
	invite: InvitationRow,
	reason: string | undefined
) => {
	const [updated] = await tx
		.update(invitation)
		.set({
			status: "rejected",
			rejectionReason: reason ?? null,
			updatedAt: new Date(),
		})
		.where(eq(invitation.id, invite.id))
		.returning();

	await tx.insert(adminModerationAction).values({
		adminUserId,
		targetType: "team_invitation",
		targetId: invite.id,
		action: "set_team_invitation:rejected",
		reason: reason ?? "반려",
		metadata: {
			organizationId: invite.organizationId,
			teamId: invite.teamId,
			invitedEmail: invite.email,
		},
	});
	return updated;
};

const acceptTeamInvitation = async (
	tx: ModerationTx,
	adminUserId: string,
	invite: InvitationRow,
	reason: string | undefined
) => {
	if (invite.expiresAt.getTime() < Date.now()) {
		throw new ORPCError("CONFLICT", { message: "만료된 초대입니다." });
	}

	const [invitee] = await tx
		.select({ userId: user.id })
		.from(user)
		.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
		.where(
			and(
				eq(user.email, invite.email.toLowerCase()),
				eq(bambiProfile.role, "employer")
			)
		)
		.limit(1);

	if (!invitee) {
		throw new ORPCError("NOT_FOUND", {
			message: "초대 대상 구인자 계정을 찾을 수 없습니다.",
		});
	}

	const [existingMember] = await tx
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.organizationId, invite.organizationId),
				eq(member.userId, invitee.userId)
			)
		)
		.limit(1);

	if (!existingMember) {
		await tx.insert(member).values({
			id: `member_${randomUUID()}`,
			organizationId: invite.organizationId,
			userId: invitee.userId,
			role: normalizeOrganizationManagementRole(invite.role) ?? "staff",
			status: "active",
			invitedEmail: invite.email,
			acceptedUserId: invitee.userId,
			createdAt: new Date(),
		});
	}

	if (invite.teamId) {
		const [existingTeamMember] = await tx
			.select({ id: teamMember.id })
			.from(teamMember)
			.where(
				and(
					eq(teamMember.teamId, invite.teamId),
					eq(teamMember.userId, invitee.userId)
				)
			)
			.limit(1);
		if (!existingTeamMember) {
			await tx.insert(teamMember).values({
				id: `team_member_${randomUUID()}`,
				teamId: invite.teamId,
				userId: invitee.userId,
				createdAt: new Date(),
			});
		}
	}

	const [updated] = await tx
		.update(invitation)
		.set({
			status: "accepted",
			acceptedUserId: invitee.userId,
			updatedAt: new Date(),
		})
		.where(eq(invitation.id, invite.id))
		.returning();

	await tx.insert(adminModerationAction).values({
		adminUserId,
		targetType: "team_invitation",
		targetId: invite.id,
		action: "set_team_invitation:accepted",
		reason: reason?.trim() || "승인",
		metadata: {
			organizationId: invite.organizationId,
			teamId: invite.teamId,
			invitedEmail: invite.email,
			joinedUserId: invitee.userId,
		},
	});

	return updated;
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

	listPendingTeamInvitations: protectedProcedure.handler(
		async ({ context }) => {
			await requireAdminProfile(context.session);

			const inviterUser = alias(user, "inviter_user");
			const inviteeUser = alias(user, "invitee_user");

			const rows = await db
				.select({
					id: invitation.id,
					organizationId: invitation.organizationId,
					organizationName: employerOrganizationProfile.displayName,
					email: invitation.email,
					inviteeName: inviteeUser.name,
					inviterName: inviterUser.name,
					inviterEmail: inviterUser.email,
					role: invitation.role,
					teamId: invitation.teamId,
					teamNameRaw: team.name,
					teamProfileName: employerTeamProfile.displayName,
					status: invitation.status,
					createdAt: invitation.createdAt,
					expiresAt: invitation.expiresAt,
				})
				.from(invitation)
				.leftJoin(
					employerOrganizationProfile,
					eq(
						employerOrganizationProfile.organizationId,
						invitation.organizationId
					)
				)
				.leftJoin(inviterUser, eq(inviterUser.id, invitation.inviterId))
				.leftJoin(inviteeUser, eq(inviteeUser.email, invitation.email))
				.leftJoin(team, eq(team.id, invitation.teamId))
				.leftJoin(
					employerTeamProfile,
					eq(employerTeamProfile.teamId, invitation.teamId)
				)
				.where(eq(invitation.status, "pending"))
				.orderBy(desc(invitation.createdAt));

			const now = Date.now();
			return rows.map((row) => ({
				id: row.id,
				organizationId: row.organizationId,
				organizationName: row.organizationName,
				email: row.email,
				inviteeName: row.inviteeName,
				inviterName: row.inviterName,
				inviterEmail: row.inviterEmail,
				role: normalizeOrganizationManagementRole(row.role) ?? "staff",
				teamId: row.teamId,
				teamName: row.teamProfileName ?? row.teamNameRaw ?? null,
				status: row.status,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
				isExpired: row.expiresAt.getTime() < now,
			}));
		}
	),

	setTeamInvitationStatus: protectedProcedure
		.input(setTeamInvitationStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [invite] = await tx
					.select()
					.from(invitation)
					.where(eq(invitation.id, input.invitationId))
					.limit(1);

				if (!invite) {
					throw new ORPCError("NOT_FOUND");
				}
				if (invite.status !== "pending") {
					throw new ORPCError("CONFLICT", {
						message: "이미 처리된 초대입니다.",
					});
				}

				return input.status === "rejected"
					? await rejectTeamInvitation(tx, admin.userId, invite, input.reason)
					: await acceptTeamInvitation(tx, admin.userId, invite, input.reason);
			});
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
