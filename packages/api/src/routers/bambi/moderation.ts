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
	communityComment,
	communityPost,
	employerOrganizationProfile,
	employerTeamProfile,
	jobPost,
	jobPostMedia,
	report,
	review,
	supportInquiry,
	supportInquiryMessage,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
} from "../../services/bambi-authz";
import { executeBulkModeration } from "../../services/bambi-moderation-bulk";
import { normalizeOrganizationManagementRole } from "../../services/bambi-organization-authz";
import { extractTiptapText } from "../../services/bambi-tiptap-text";

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

const contentStatusSchema = z.enum(["published", "hidden", "deleted"]);

const setInquiryStatusByAdminInput = z.object({
	inquiryId: z.string().uuid(),
	reason: z.string().trim().min(2).max(500),
	status: contentStatusSchema,
});

const setInquiryMessageStatusByAdminInput = z.object({
	messageId: z.string().uuid(),
	reason: z.string().trim().min(2).max(500),
	status: contentStatusSchema,
});

// 통합 목록에 노출하는 유형. support_inquiry_message는 문의 맥락 없이 한 줄만 보면 판단이
// 불가능하므로 넣지 않는다 — 스레드 메시지 조치는 문의 상세 화면에서 한다.
const moderatableTargetTypeSchema = z.enum([
	"community_post",
	"community_comment",
	"support_inquiry",
]);

const listModeratableContentInput = z.object({
	page: z.number().int().min(1).default(1),
	status: contentStatusSchema.optional(),
	targetType: moderatableTargetTypeSchema,
});

const getModeratableContentDetailInput = z.object({
	id: z.string().uuid(),
	targetType: moderatableTargetTypeSchema,
});

const MODERATABLE_PAGE_SIZE = 20;
const EXCERPT_LENGTH = 120;

type ReportTargetType = z.infer<typeof targetTypeSchema>;
type ReportRow = typeof report.$inferSelect;
type JobPostModerationStatus = z.infer<typeof jobPostModerationStatusSchema>;
type JobPostRow = typeof jobPost.$inferSelect;

// 신고 가능 대상(targetTypeSchema)보다 DB enum이 넓으므로 행 타입을 기준으로 삼는다 —
// 신고 대상이 아닌 유형도 targetId가 uuid인지 판정해야 하기 때문.
const uuidTargetTypes = new Set<ReportRow["targetType"]>([
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"community_post",
	"community_comment",
	"support_inquiry",
	"support_inquiry_message",
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

const COMMUNITY_BODY_PREVIEW_MAX = 300;

// 글 본문(Tiptap JSON)에서 평문 발췌를 만든다. 평문 추출 규칙은 금칙어 검사와 공유한다
// (services/bambi-tiptap-text) — 두 곳에 같은 파서를 두면 규칙이 갈린다.
const toCommunityBodyPreview = (body: string): string =>
	extractTiptapText(body).slice(0, COMMUNITY_BODY_PREVIEW_MAX);

// community_post 신고 컨텍스트 — 운영자는 hidden/deleted 상태여도 원문 맥락을 봐야 하므로
// 상태와 무관하게 조회하고 현재 status를 그대로 노출한다.
const getCommunityPostTargetContext = async (targetId: string) => {
	const [post] = await db
		.select({
			authorDisplayName: communityPost.authorDisplayName,
			board: communityPost.board,
			body: communityPost.body,
			createdAt: communityPost.createdAt,
			id: communityPost.id,
			status: communityPost.status,
			title: communityPost.title,
		})
		.from(communityPost)
		.where(eq(communityPost.id, targetId))
		.limit(1);

	if (!post) {
		return null;
	}

	return {
		authorName: post.authorDisplayName,
		board: post.board,
		bodyPreview: toCommunityBodyPreview(post.body),
		createdAt: post.createdAt,
		id: post.id,
		status: post.status,
		title: post.title,
	};
};

// community_comment 신고 컨텍스트 — 작성자 표시명은 listComments와 동일하게 bambi_profile
// 표시명을 쓰고, 제목·게시판은 부모 글 조인으로 채운다(부모 글이 삭제 상태여도 조인 유지).
const getCommunityCommentTargetContext = async (targetId: string) => {
	const [comment] = await db
		.select({
			authorName: bambiProfile.displayName,
			body: communityComment.body,
			createdAt: communityComment.createdAt,
			id: communityComment.id,
			postBoard: communityPost.board,
			postId: communityComment.postId,
			postTitle: communityPost.title,
			status: communityComment.status,
		})
		.from(communityComment)
		.innerJoin(communityPost, eq(communityPost.id, communityComment.postId))
		.leftJoin(
			bambiProfile,
			eq(bambiProfile.userId, communityComment.authorUserId)
		)
		.where(eq(communityComment.id, targetId))
		.limit(1);

	if (!comment) {
		return null;
	}

	return {
		authorName: comment.authorName,
		bodyPreview: comment.body.slice(0, COMMUNITY_BODY_PREVIEW_MAX),
		createdAt: comment.createdAt,
		id: comment.id,
		postBoard: comment.postBoard,
		postId: comment.postId,
		postTitle: comment.postTitle,
		status: comment.status,
	};
};

const getReportTargetContext = async (reportRow: ReportRow) => {
	// uuid가 아닌 targetId는 대상 조회 자체가 불가하므로 컨텍스트 없이 넘어간다(신고 행은 유지).
	if (
		uuidTargetTypes.has(reportRow.targetType) &&
		!uuidTargetIdSchema.safeParse(reportRow.targetId).success
	) {
		return null;
	}

	switch (reportRow.targetType) {
		case "chat_message": {
			const message = await getChatMessageTargetContext(reportRow.targetId);
			return message ? { chatMessage: message } : null;
		}
		case "community_post": {
			const post = await getCommunityPostTargetContext(reportRow.targetId);
			return post ? { communityPost: post } : null;
		}
		case "community_comment": {
			const comment = await getCommunityCommentTargetContext(
				reportRow.targetId
			);
			return comment ? { communityComment: comment } : null;
		}
		default:
			return null;
	}
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

	setJobPostPayment: protectedProcedure
		.input(setJobPostPaymentInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const [existing] = await db
				.select({ exposureDurationDays: jobPost.exposureDurationDays })
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

	setInquiryStatusByAdmin: adminProcedure
		.input(setInquiryStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);

			await db.transaction(async (tx) => {
				const [inquiry] = await tx
					.select({ id: supportInquiry.id })
					.from(supportInquiry)
					.where(eq(supportInquiry.id, input.inquiryId))
					.limit(1);

				if (!inquiry) {
					throw new ORPCError("NOT_FOUND", {
						message: "문의를 찾을 수 없습니다.",
					});
				}

				await tx
					.update(supportInquiry)
					.set({ status: input.status, updatedAt: new Date() })
					.where(eq(supportInquiry.id, input.inquiryId));

				await tx.insert(adminModerationAction).values({
					adminUserId: profile.userId,
					targetType: "support_inquiry",
					targetId: input.inquiryId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});
			});

			return { ok: true };
		}),

	setInquiryMessageStatusByAdmin: adminProcedure
		.input(setInquiryMessageStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);

			await db.transaction(async (tx) => {
				const [message] = await tx
					.select({ id: supportInquiryMessage.id })
					.from(supportInquiryMessage)
					.where(eq(supportInquiryMessage.id, input.messageId))
					.limit(1);

				if (!message) {
					throw new ORPCError("NOT_FOUND", {
						message: "메시지를 찾을 수 없습니다.",
					});
				}

				await tx
					.update(supportInquiryMessage)
					.set({ status: input.status })
					.where(eq(supportInquiryMessage.id, input.messageId));

				await tx.insert(adminModerationAction).values({
					adminUserId: profile.userId,
					targetType: "support_inquiry_message",
					targetId: input.messageId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});
			});

			return { ok: true };
		}),

	// 유형이 달라도 서버에서 공통 형태로 정규화해 반환한다. UI가 유형별 분기를 하지 않아도 되고,
	// 대상 유형이 늘어도 화면을 고치지 않는다.
	listModeratableContent: adminProcedure
		.input(listModeratableContentInput)
		.handler(async ({ input }) => {
			const offset = (input.page - 1) * MODERATABLE_PAGE_SIZE;
			const excerpt = (text: string) => text.slice(0, EXCERPT_LENGTH);

			if (input.targetType === "community_post") {
				const where = input.status
					? eq(communityPost.status, input.status)
					: undefined;

				const [totalRow] = await db
					.select({ value: count() })
					.from(communityPost)
					.where(where);

				const rows = await db
					.select()
					.from(communityPost)
					.where(where)
					.orderBy(desc(communityPost.createdAt))
					.limit(MODERATABLE_PAGE_SIZE)
					.offset(offset);

				return {
					items: rows.map((row) => ({
						id: row.id,
						targetType: "community_post" as const,
						title: row.title,
						// 본문은 Tiptap JSON이라 평문을 뽑아 발췌한다(기존 신고 컨텍스트와 동일 규칙).
						excerpt: excerpt(toCommunityBodyPreview(row.body)),
						// 커뮤니티는 익명 게시판이라 글별 표시명을 쓴다(실명 표시명 노출 금지).
						authorName: row.authorDisplayName,
						authorUserId: row.authorUserId,
						status: row.status,
						createdAt: row.createdAt,
					})),
					page: input.page,
					pageSize: MODERATABLE_PAGE_SIZE,
					totalCount: totalRow?.value ?? 0,
				};
			}

			if (input.targetType === "community_comment") {
				const where = input.status
					? eq(communityComment.status, input.status)
					: undefined;

				const [totalRow] = await db
					.select({ value: count() })
					.from(communityComment)
					.where(where);

				const rows = await db
					.select({
						id: communityComment.id,
						body: communityComment.body,
						status: communityComment.status,
						createdAt: communityComment.createdAt,
						authorUserId: communityComment.authorUserId,
						postTitle: communityPost.title,
						postAuthorName: communityPost.authorDisplayName,
					})
					.from(communityComment)
					.innerJoin(
						communityPost,
						eq(communityComment.postId, communityPost.id)
					)
					.where(where)
					.orderBy(desc(communityComment.createdAt))
					.limit(MODERATABLE_PAGE_SIZE)
					.offset(offset);

				return {
					items: rows.map((row) => ({
						id: row.id,
						targetType: "community_comment" as const,
						// 댓글은 제목이 없으므로 원글 제목을 맥락으로 보여준다.
						title: row.postTitle,
						excerpt: excerpt(row.body),
						authorName: row.postAuthorName,
						authorUserId: row.authorUserId,
						status: row.status,
						createdAt: row.createdAt,
					})),
					page: input.page,
					pageSize: MODERATABLE_PAGE_SIZE,
					totalCount: totalRow?.value ?? 0,
				};
			}

			const where = input.status
				? eq(supportInquiry.status, input.status)
				: undefined;

			const [totalRow] = await db
				.select({ value: count() })
				.from(supportInquiry)
				.where(where);

			const rows = await db
				.select({
					id: supportInquiry.id,
					title: supportInquiry.title,
					body: supportInquiry.body,
					status: supportInquiry.status,
					createdAt: supportInquiry.createdAt,
					authorUserId: supportInquiry.authorUserId,
					// 고객센터는 익명 표시명이 없으므로 프로필 표시명을 조인한다.
					authorName: bambiProfile.displayName,
				})
				.from(supportInquiry)
				.leftJoin(
					bambiProfile,
					eq(supportInquiry.authorUserId, bambiProfile.userId)
				)
				.where(where)
				.orderBy(desc(supportInquiry.createdAt))
				.limit(MODERATABLE_PAGE_SIZE)
				.offset(offset);

			return {
				items: rows.map((row) => ({
					id: row.id,
					targetType: "support_inquiry" as const,
					title: row.title,
					excerpt: excerpt(row.body),
					authorName: row.authorName ?? "(표시명 없음)",
					authorUserId: row.authorUserId,
					status: row.status,
					createdAt: row.createdAt,
				})),
				page: input.page,
				pageSize: MODERATABLE_PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	// 목록은 120자 발췌만 주므로 행 펼침용 전체 본문을 따로 내려준다. 목록과 같은 철학으로
	// 유형별 차이를 서버에서 흡수해 공통 형태(board/category는 해당 없으면 null)로 정규화한다 —
	// 화면이 유니온 좁히기 없이 한 형태만 렌더한다.
	getModeratableContentDetail: adminProcedure
		.input(getModeratableContentDetailInput)
		.handler(async ({ input }) => {
			if (input.targetType === "community_post") {
				const [row] = await db
					.select({
						authorDisplayName: communityPost.authorDisplayName,
						board: communityPost.board,
						body: communityPost.body,
						createdAt: communityPost.createdAt,
						status: communityPost.status,
						title: communityPost.title,
					})
					.from(communityPost)
					.where(eq(communityPost.id, input.id))
					.limit(1);

				if (!row) {
					throw new ORPCError("NOT_FOUND");
				}

				return {
					title: row.title,
					// 본문은 Tiptap JSON이라 평문화한다 — 원문을 그대로 내보내면 화면에 JSON이 보인다.
					body: extractTiptapText(row.body),
					authorName: row.authorDisplayName,
					createdAt: row.createdAt,
					status: row.status,
					board: row.board as string | null,
					category: null as string | null,
				};
			}

			if (input.targetType === "community_comment") {
				const [row] = await db
					.select({
						body: communityComment.body,
						createdAt: communityComment.createdAt,
						postAuthorName: communityPost.authorDisplayName,
						postTitle: communityPost.title,
						status: communityComment.status,
					})
					.from(communityComment)
					.innerJoin(
						communityPost,
						eq(communityComment.postId, communityPost.id)
					)
					.where(eq(communityComment.id, input.id))
					.limit(1);

				if (!row) {
					throw new ORPCError("NOT_FOUND");
				}

				return {
					// 댓글은 제목이 없으므로 원글 제목·작성자를 맥락으로 보여준다(목록과 동일).
					title: row.postTitle,
					body: row.body,
					authorName: row.postAuthorName,
					createdAt: row.createdAt,
					status: row.status,
					board: null as string | null,
					category: null as string | null,
				};
			}

			const [row] = await db
				.select({
					authorName: bambiProfile.displayName,
					body: supportInquiry.body,
					category: supportInquiry.category,
					createdAt: supportInquiry.createdAt,
					status: supportInquiry.status,
					title: supportInquiry.title,
				})
				.from(supportInquiry)
				.leftJoin(
					bambiProfile,
					eq(supportInquiry.authorUserId, bambiProfile.userId)
				)
				.where(eq(supportInquiry.id, input.id))
				.limit(1);

			if (!row) {
				throw new ORPCError("NOT_FOUND");
			}

			return {
				title: row.title,
				body: row.body,
				authorName: row.authorName ?? "(표시명 없음)",
				createdAt: row.createdAt,
				status: row.status,
				board: null as string | null,
				category: row.category as string | null,
			};
		}),
};
