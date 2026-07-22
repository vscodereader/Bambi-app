import { randomUUID } from "node:crypto";
import { db } from "@bambi-app/db";
import {
	account,
	invitation,
	member,
	session,
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
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lte,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import { syncAdvertiserFlagForOrganization } from "../../services/bambi-advertiser";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
} from "../../services/bambi-authz";
import { resolveWithdrawalRetentionDays } from "../../services/bambi-member-policy";
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

const reviewModerationStatusSchema = z.enum([
	"published",
	"pending_review",
	"hidden",
]);

const listReviewsInput = z.object({
	status: reviewModerationStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

const setReviewStatusInput = z.object({
	reviewId: z.string().uuid(),
	status: reviewModerationStatusSchema,
	reason: z.string().min(2).max(500),
});

const bulkSetReviewStatusInput = z.object({
	reviewIds: z.array(z.string().uuid()),
	status: reviewModerationStatusSchema,
	reason: z.string().min(2).max(500),
});

const employerVerificationStatusSchema = z.enum([
	"none",
	"pending",
	"verified",
	"rejected",
]);

const listEmployersInput = z.object({
	status: employerVerificationStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

const setChatRoomBlockedInput = z.object({
	chatRoomId: z.string().uuid(),
	isBlocked: z.boolean(),
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

const bulkSetJobPostPaymentInput = z.object({
	jobPostIds: z.array(z.string().uuid()),
	paymentStatus: z.enum(["unpaid", "paid"]),
});

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

const getJobPostTargetContext = async (targetId: string) => {
	const [row] = await db
		.select({
			id: jobPost.id,
			title: jobPost.title,
			description: jobPost.description,
			status: jobPost.status,
			riskFlags: jobPost.riskFlags,
			rejectionReason: jobPost.rejectionReason,
			organizationDisplayName: employerOrganizationProfile.displayName,
		})
		.from(jobPost)
		.innerJoin(
			employerOrganizationProfile,
			eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
		)
		.where(eq(jobPost.id, targetId))
		.limit(1);

	return row ? { jobPost: row } : null;
};

const getReviewTargetContext = async (targetId: string) => {
	const [row] = await db
		.select({
			id: review.id,
			body: review.body,
			rating: review.rating,
			status: review.status,
			jobPostId: review.jobPostId,
			riskFlags: review.riskFlags,
		})
		.from(review)
		.where(eq(review.id, targetId))
		.limit(1);

	return row ? { review: row } : null;
};

const getUserTargetContext = async (targetId: string) => {
	const [row] = await db
		.select({
			userId: bambiProfile.userId,
			displayName: bambiProfile.displayName,
			role: bambiProfile.role,
			status: bambiProfile.status,
			isPhoneVerified: bambiProfile.isPhoneVerified,
		})
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, targetId))
		.limit(1);

	return row ? { user: row } : null;
};

const getChatRoomTargetContext = async (targetId: string) => {
	const [room] = await db
		.select({
			id: chatRoom.id,
			isBlocked: chatRoom.isBlocked,
			jobPostTitle: jobPost.title,
		})
		.from(chatRoom)
		.innerJoin(jobPost, eq(chatRoom.jobPostId, jobPost.id))
		.where(eq(chatRoom.id, targetId))
		.limit(1);

	if (!room) {
		return null;
	}

	// 첨부(storageKey)나 파일 세부는 절대 노출하지 않는다. 최근 메시지 본문만 요약한다.
	const recentMessages = await db
		.select({
			id: chatMessage.id,
			senderUserId: chatMessage.senderUserId,
			body: chatMessage.body,
			createdAt: chatMessage.createdAt,
		})
		.from(chatMessage)
		.where(eq(chatMessage.chatRoomId, targetId))
		.orderBy(desc(chatMessage.createdAt))
		.limit(10);

	return { chatRoom: { ...room, recentMessages } };
};

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
		case "job_post":
			return await getJobPostTargetContext(reportRow.targetId);
		case "review":
			return await getReviewTargetContext(reportRow.targetId);
		case "user":
			return await getUserTargetContext(reportRow.targetId);
		case "chat_room":
			return await getChatRoomTargetContext(reportRow.targetId);
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

// 신고 목록 각 row에 붙일 신고자 표시 정보(실명·이메일 폴백·역할). displayName은 null일 수
// 있어 클라이언트가 listUsers와 동일하게 displayName ?? email로 표시한다.
// orpc 추론이 listReports 반환 타입에 이 이름을 참조하므로 export 해 패키지 경계 밖에서
// 명명 가능하게 한다(비-export 시 TS4023).
export interface ReportReporter {
	displayName: string | null;
	email: string;
	role: string;
}

// listReports 전용: 신고자(reporterUserId)의 실명·역할을 배치 조회해 각 row에 reporter로
// 붙인다. 목록 전체를 N+1로 돌리지 않도록 distinct reporterUserId를 inArray로 한 번에
// 조회하고 맵으로 합류한다. displayName은 bambiProfile, 폴백용 email은 auth user 테이블에서
// 가져온다(listUsers와 동일한 조인·폴백 패턴). 대상 row가 없는 신고자는 reporter=null.
const withReporters = async <T extends ReportRow>(
	reportRows: T[]
): Promise<(T & { reporter: ReportReporter | null })[]> => {
	const reporterIds = [...new Set(reportRows.map((row) => row.reporterUserId))];

	if (reporterIds.length === 0) {
		return reportRows.map((row) => ({ ...row, reporter: null }));
	}

	const reporterRows = await db
		.select({
			userId: bambiProfile.userId,
			displayName: bambiProfile.displayName,
			email: user.email,
			role: bambiProfile.role,
		})
		.from(bambiProfile)
		.innerJoin(user, eq(bambiProfile.userId, user.id))
		.where(inArray(bambiProfile.userId, reporterIds));

	const reporterMap = new Map<string, ReportReporter>(
		reporterRows.map((row) => [
			row.userId,
			{ displayName: row.displayName, email: row.email, role: row.role },
		])
	);

	return reportRows.map((row) => ({
		...row,
		reporter: reporterMap.get(row.reporterUserId) ?? null,
	}));
};

// 관리자용 신고 목록: 대상 맥락 + 신고자 정보를 모두 붙여 반환한다(listMyReports는 미적용).
const listReportsWithDetails = async (reportRows: ReportRow[]) =>
	await withReporters(await withReportTargetContexts(reportRows));

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

			if (input.targetType === "user" && input.targetId === profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "자기 자신은 신고할 수 없어요.",
				});
			}

			await assertReportTargetExists(input.targetType, input.targetId);

			// 동일 신고자·대상의 중복 신고는 멱등 처리한다(스키마 변경 없이 기존 row 반환).
			const [existing] = await db
				.select()
				.from(report)
				.where(
					and(
						eq(report.reporterUserId, profile.userId),
						eq(report.targetType, input.targetType),
						eq(report.targetId, input.targetId)
					)
				)
				.limit(1);

			if (existing) {
				return existing;
			}

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

				return await listReportsWithDetails(reportRows);
			}

			const reportRows = await db
				.select()
				.from(report)
				.orderBy(desc(report.createdAt))
				.limit(input.limit);

			return await listReportsWithDetails(reportRows);
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

	listReviews: protectedProcedure
		.input(listReviewsInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const query = db
				.select({
					id: review.id,
					body: review.body,
					rating: review.rating,
					status: review.status,
					riskFlags: review.riskFlags,
					reviewerUserId: review.reviewerUserId,
					reviewerDisplayName: bambiProfile.displayName,
					organizationDisplayName: employerOrganizationProfile.displayName,
					jobPostId: review.jobPostId,
					jobPostTitle: jobPost.title,
					createdAt: review.createdAt,
				})
				.from(review)
				.innerJoin(jobPost, eq(review.jobPostId, jobPost.id))
				.innerJoin(
					employerOrganizationProfile,
					eq(review.organizationId, employerOrganizationProfile.organizationId)
				)
				.leftJoin(bambiProfile, eq(review.reviewerUserId, bambiProfile.userId))
				.orderBy(desc(review.createdAt))
				.limit(input.limit);

			if (input.status) {
				return await query.where(eq(review.status, input.status));
			}

			return await query;
		}),

	setReviewStatus: protectedProcedure
		.input(setReviewStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(review)
					.set({ status: input.status })
					.where(eq(review.id, input.reviewId))
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "review",
					targetId: input.reviewId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});

				return updated;
			});
		}),

	bulkSetReviewStatus: protectedProcedure
		.input(bulkSetReviewStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (reviewId) => {
							const [updated] = await tx
								.update(review)
								.set({ status: input.status })
								.where(eq(review.id, reviewId))
								.returning();

							if (!updated) {
								throw new ORPCError("NOT_FOUND", {
									message: "Review was not found.",
								});
							}

							await tx.insert(adminModerationAction).values({
								adminUserId: admin.userId,
								targetType: "review",
								targetId: reviewId,
								action: `set_status:${input.status}`,
								reason: input.reason,
								metadata: { bulk: true },
							});
						},
						targetIds: input.reviewIds,
					})
			);
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

	listEmployers: protectedProcedure
		.input(listEmployersInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const query = db
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
						eq(
							member.organizationId,
							employerOrganizationProfile.organizationId
						),
						eq(member.role, "owner")
					)
				)
				.innerJoin(user, eq(user.id, member.userId))
				.orderBy(desc(employerOrganizationProfile.createdAt))
				.limit(input.limit);

			if (input.status) {
				return await query.where(
					eq(employerOrganizationProfile.verificationStatus, input.status)
				);
			}

			return await query;
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

	setChatRoomBlocked: protectedProcedure
		.input(setChatRoomBlockedInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(chatRoom)
					.set({ isBlocked: input.isBlocked })
					.where(eq(chatRoom.id, input.chatRoomId))
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "chat_room",
					targetId: input.chatRoomId,
					action: `set_blocked:${input.isBlocked}`,
					reason: input.reason,
				});

				return updated;
			});
		}),

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

	// 탈퇴 계정 개인정보 파기 배치. 보존기간(운영자 설정, 기본 30일) 경과분의
	// PII를 스크럽한다. user 행 자체는 지우지 않는다 — 채팅·리뷰·신고 등 상대방
	// 데이터가 onDelete 미지정(RESTRICT) FK로 물려 있어 행 삭제는 실패하거나 상대방
	// 기록까지 깨진다. 파기 후 이메일이 tombstone으로 바뀌어 원 이메일 재가입이
	// 다시 열린다. cron 인프라가 없어 운영자 수동/외부 호출로 트리거한다.
	purgeWithdrawnAccounts: adminProcedure.handler(async () => {
		const retentionDays = await resolveWithdrawalRetentionDays();
		const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
		const targets = await db
			.select({ id: user.id })
			.from(user)
			.where(
				and(
					isNotNull(user.deletedAt),
					lte(user.deletedAt, cutoff),
					isNull(user.purgedAt)
				)
			);
		if (targets.length === 0) {
			return { purgedCount: 0 };
		}
		const ids = targets.map((row) => row.id);

		await db.transaction(async (tx) => {
			await tx.delete(session).where(inArray(session.userId, ids));
			// 비밀번호 등 자격증명 파기.
			await tx.delete(account).where(inArray(account.userId, ids));
			await tx
				.update(bambiProfile)
				.set({
					displayName: "탈퇴한 회원",
					phoneNumber: null,
					gender: null,
					birthDate: null,
					ciHash: null,
					diHash: null,
					isPhoneVerified: false,
				})
				.where(inArray(bambiProfile.userId, ids));
			// 이메일은 unique 제약이라 사용자별 tombstone으로 치환한다.
			for (const id of ids) {
				await tx
					.update(user)
					.set({
						email: `withdrawn-${id}@invalid.bambi`,
						name: "탈퇴한 회원",
						image: null,
						purgedAt: new Date(),
					})
					.where(eq(user.id, id));
			}
		});

		return { purgedCount: ids.length };
	}),
};
