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
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import z from "zod";

import { protectedProcedure } from "../../index";
import { syncAdvertiserFlagForOrganization } from "../../services/bambi-advertiser";
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
	// 운영자 콘솔은 전체 계정 관리가 목적이라 상한을 넉넉히 둔다(기본도 전체 조회).
	limit: z.number().int().min(1).max(1000).default(1000),
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

const setJobPostPaymentInput = z.object({
	jobPostId: z.string().uuid(),
	paymentStatus: z.enum(["unpaid", "paid"]),
});

const listJobsForPaymentInput = z.object({
	onlyUnpaid: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(50),
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

const bulkSetJobPostPaymentInput = z.object({
	jobPostIds: z.array(z.string().uuid()),
	paymentStatus: z.enum(["unpaid", "paid"]),
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
					exposureType: jobPost.exposureType,
					exposureAmount: jobPost.exposureAmount,
					paymentStatus: jobPost.paymentStatus,
					exposureDurationDays: jobPost.exposureDurationDays,
					exposureEndsAt: jobPost.exposureEndsAt,
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

			// 계정 목록의 기준 테이블은 user다. bambi_profile은 좌측 조인해 부가 정보로만
			// 붙이므로, 프로필이 아직 없는(온보딩 전) 계정도 그대로 노출된다. name은 계정
			// 이름(user.name), displayName은 프로필 표시 이름(없으면 null)으로 각각 반환한다.
			// 누적 신고/경고 횟수는 서브쿼리로 실제 집계한다.
			const reportsCountSql = sql<number>`(
				select count(*)::int from ${report}
				where ${report.targetType} = 'user' and ${report.targetId} = ${user.id}
			)`;
			const warningsCountSql = sql<number>`(
				select count(*)::int from ${adminModerationAction}
				where ${adminModerationAction.targetType} = 'user'
					and ${adminModerationAction.targetId} = ${user.id}
					and ${adminModerationAction.action} = 'set_status:warned'
			)`;
			const query = db
				.select({
					userId: user.id,
					name: user.name,
					displayName: bambiProfile.displayName,
					email: user.email,
					role: sql<string>`coalesce(${bambiProfile.role}, 'job_seeker')`,
					status: sql<
						"active" | "suspended" | "warned"
					>`coalesce(${bambiProfile.status}, 'active')`,
					isPhoneVerified: sql<boolean>`coalesce(${bambiProfile.isPhoneVerified}, false)`,
					phoneNumber: bambiProfile.phoneNumber,
					reportsCount: reportsCountSql,
					warningsCount: warningsCountSql,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				})
				.from(user)
				.leftJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.orderBy(desc(user.createdAt))
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

	setJobPostPayment: protectedProcedure
		.input(setJobPostPaymentInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const [existing] = await db
				.select({
					exposureDurationDays: jobPost.exposureDurationDays,
					organizationId: jobPost.organizationId,
				})
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			const exposureEndsAt =
				input.paymentStatus === "paid" && existing.exposureDurationDays !== null
					? new Date(Date.now() + existing.exposureDurationDays * MS_PER_DAY)
					: null;

			const [updated] = await db
				.update(jobPost)
				.set({
					exposureEndsAt,
					paymentStatus: input.paymentStatus,
				})
				.where(eq(jobPost.id, input.jobPostId))
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}

			// 결제 상태 전환은 공개 게이트(published AND paid)를 넘나들 수 있으므로
			// 해당 조직 owner/admin의 수다방 광고 자격 캐시를 재동기화한다.
			await syncAdvertiserFlagForOrganization({
				now: new Date(),
				organizationId: existing.organizationId,
			});

			return updated;
		}),

	// 결제 처리가 의미있는 공고 목록(초안 제외: pending_review·published).
	// 인증 업체 공고는 검수 큐 없이 자동 published라 여기서 결제를 처리한다.
	listJobsForPayment: protectedProcedure
		.input(listJobsForPaymentInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const conditions = [
				inArray(jobPost.status, ["pending_review", "published"]),
				// 유료 여부의 단일 원천은 광고 상품 연결(adProductId)이다. exposureType은
				// previewTemplate 'none' 상품에서 standard가 되므로 결제 판별에 쓰면 누락된다.
				isNotNull(jobPost.adProductId),
			];

			if (input.onlyUnpaid) {
				conditions.push(eq(jobPost.paymentStatus, "unpaid"));
			}

			return await db
				.select({
					id: jobPost.id,
					title: jobPost.title,
					status: jobPost.status,
					exposureType: jobPost.exposureType,
					exposureAmount: jobPost.exposureAmount,
					paymentStatus: jobPost.paymentStatus,
					exposureDurationDays: jobPost.exposureDurationDays,
					exposureEndsAt: jobPost.exposureEndsAt,
					organizationDisplayName: employerOrganizationProfile.displayName,
					createdAt: jobPost.createdAt,
				})
				.from(jobPost)
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.where(and(...conditions))
				.orderBy(desc(jobPost.createdAt))
				.limit(input.limit);
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

	// 결제관리 목록에서 선택한 공고들의 결제 상태를 일괄 전환한다.
	// 단건 setJobPostPayment와 동일하게 paid 전환 시 노출 만료일(exposureEndsAt)을 계산한다.
	bulkSetJobPostPayment: protectedProcedure
		.input(bulkSetJobPostPaymentInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			// 갱신에 성공한 공고들의 조직 유니크 집합 — 트랜잭션 커밋 후 광고 자격 캐시 동기화용.
			const affectedOrganizationIds = new Set<string>();

			const result = await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (jobPostId) => {
							const [existing] = await tx
								.select({
									exposureDurationDays: jobPost.exposureDurationDays,
									organizationId: jobPost.organizationId,
								})
								.from(jobPost)
								.where(eq(jobPost.id, jobPostId))
								.limit(1);

							if (!existing) {
								throw new ORPCError("NOT_FOUND", {
									message: "Job post was not found.",
								});
							}

							const exposureEndsAt =
								input.paymentStatus === "paid" &&
								existing.exposureDurationDays !== null
									? new Date(
											Date.now() + existing.exposureDurationDays * MS_PER_DAY
										)
									: null;

							await tx
								.update(jobPost)
								.set({
									exposureEndsAt,
									paymentStatus: input.paymentStatus,
								})
								.where(eq(jobPost.id, jobPostId));

							affectedOrganizationIds.add(existing.organizationId);
						},
						targetIds: input.jobPostIds,
					})
			);

			// 결제 전환은 공개 게이트를 넘나들 수 있으므로 갱신된 조직들의 수다방 광고
			// 자격 캐시를 재동기화한다. 트랜잭션 커밋 후 실행한다.
			const now = new Date();
			for (const organizationId of affectedOrganizationIds) {
				await syncAdvertiserFlagForOrganization({ now, organizationId });
			}

			return result;
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
					.limit(1)
					.for("update");

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
