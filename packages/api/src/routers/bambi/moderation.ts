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
	chatMessageReadReceipt,
	chatRoom,
	communityBoard,
	communityComment,
	communityPost,
	employerBusinessDocument,
	employerOrganizationProfile,
	employerTeamProfile,
	interviewSchedule,
	jobAdPurchase,
	jobBoostEvent,
	jobBoostPurchase,
	jobPost,
	jobPostMedia,
	report,
	review,
	supportInquiry,
	supportInquiryMessage,
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	isNotNull,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import { buildAdLedgerInsert } from "../../services/bambi-ad-ledger";
import { syncAdvertiserFlagForOrganization } from "../../services/bambi-advertiser";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import { isChatRoomLeftByAnyone } from "../../services/bambi-chat-participation";
import {
	emitChatListUpdated,
	emitRoomUpdated,
} from "../../services/bambi-chat-realtime";
import { assertLegalAdvisorRoleSwitch } from "../../services/bambi-community-authz";
import { assertNotAlreadyDeleted } from "../../services/bambi-content-status";
import { jobDetailDesignStatuses } from "../../services/bambi-job-detail-design";
import { escapeLikePattern } from "../../services/bambi-job-feed";
import {
	JOB_POST_DETAIL_IMAGE_LIMIT,
	validateJobPostImageUpload,
	validateJobPostMediaSet,
} from "../../services/bambi-job-media-policy";
import { resolveListingPaymentExposure } from "../../services/bambi-listing-promotion";
import {
	getPointBalances,
	loadGradeBadges,
} from "../../services/bambi-member-points";
import { executeBulkModeration } from "../../services/bambi-moderation-bulk";
import { resolveNotificationRecipients } from "../../services/bambi-notification-recipients";
import {
	notifyBambiNotification,
	notifyModerationAction,
} from "../../services/bambi-notifications";
import { normalizeOrganizationManagementRole } from "../../services/bambi-organization-authz";
import {
	assertPremiumApprovalWithinCapacity,
	getListingQueuePositions,
	queuedListingWhere,
} from "../../services/bambi-premium-capacity";
import { PENDING_REPORT_STATUSES } from "../../services/bambi-report-status";
import { transitionReviewPoints } from "../../services/bambi-review-points";
import { getVerifiedIdentityForAdmin } from "../../services/bambi-secret-identity";
import {
	createJobPostMediaUploadIntent,
	getBusinessDocumentViewPath,
	getChatAttachmentObjectUrl,
	isOwnedJobPostMediaKey,
} from "../../services/bambi-storage";
import { extractTiptapText } from "../../services/bambi-tiptap-text";
import {
	normalizeAllExpiredWarningRestrictions,
	normalizeExpiredWarningRestriction,
	WARNING_RESTRICTION_DURATION_MS,
	WARNING_RESTRICTION_THRESHOLD,
} from "../../services/bambi-warning-restriction";
import { purgeWithdrawnAccountsBatch } from "../../services/bambi-withdrawal-purge";
import { deletePrivateObjects, deletePublicObjects } from "../../services/gcs";
import {
	applyJobPostUpdate,
	getJobPostMediaSet,
	getJobPostMediaStorageKeys,
	getStoredAdBannerLayout,
	jobPostInput,
} from "./jobs";

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

// on_hold(검수 보류)는 운영자 강제 숨김(hidden)과 다른 조치라 별도 값으로 받는다 —
// 목록 필터(listJobPosts)와 단건·일괄 상태 변경이 모두 이 스키마를 공유한다.
const jobPostModerationStatusSchema = z.enum([
	"pending_review",
	"published",
	"hidden",
	"rejected",
	"on_hold",
]);

const accountStatusSchema = z.enum(["active", "warned", "suspended"]);

const createReportInput = z.object({
	targetType: targetTypeSchema,
	targetId: z.string().min(1),
	reason: reportReasonSchema,
	details: z.string().max(1000).optional(),
});

const reportTargetDuplicateLabels: Record<
	z.infer<typeof targetTypeSchema>,
	string
> = {
	chat_message: "채팅방",
	chat_room: "채팅방",
	community_comment: "댓글",
	community_post: "글",
	job_post: "공고",
	review: "대상",
	user: "대상",
};

const duplicateReportMessage = (targetType: z.infer<typeof targetTypeSchema>) =>
	`이미 신고된 ${reportTargetDuplicateLabels[targetType]}입니다. 처리결과를 기다려주세요.`;

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

const listUserModerationActionsInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(50).default(10),
	targetUserId: z.string().min(1),
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

const setJobPostDesignStatusInput = z.object({
	jobPostId: z.string().uuid(),
	status: z.enum(jobDetailDesignStatuses),
});

const createJobPostDesignMediaUploadInput = z.object({
	byteSize: z.number().int().min(1),
	fileName: z.string().max(180),
	jobPostId: z.string().uuid(),
	mimeType: z.string().min(1).max(120),
});

const setJobPostDesignMediaInput = z.object({
	// 저장될 상세 이미지 전량. 빠진 기존 이미지는 행과 GCS 객체가 함께 지워진다.
	detail: z
		.array(
			z.object({
				altText: z.string().max(120).default(""),
				byteSize: z.number().int().min(1),
				fileName: z.string().max(180),
				height: z.number().int().min(1).max(20_000).optional(),
				mimeType: z.string().min(1).max(120),
				storageKey: z.string().min(1).max(512),
				width: z.number().int().min(1).max(20_000).optional(),
			})
		)
		.max(JOB_POST_DETAIL_IMAGE_LIMIT),
	jobPostId: z.string().uuid(),
});

const listJobsForPaymentInput = z.object({
	onlyUnpaid: z.boolean().default(false),
	// 상세이미지 디자인 제작을 신청한 건만 추린다(별도 큐 화면 대신 이 필터로 처리한다).
	onlyDetailDesign: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(50),
});

// 광고 기간 연장(양수)/단축(음수). 0은 아무 일도 하지 않으므로 막는다.
const adjustJobPostExposureInput = z.object({
	jobPostId: z.string().uuid(),
	days: z
		.number()
		.int()
		.min(-365)
		.max(365)
		.refine((value) => value !== 0, { message: "조정할 일수를 입력하세요." }),
	reason: z.string().min(2).max(500),
});

// 대기 중인 스페셜/추천 리스팅을 대기열에서 뺀다(결제 취소). 활성/비리스팅엔 쓰지 않는다.
const removeFromListingQueueInput = z.object({
	jobPostId: z.string().uuid(),
	reason: z.string().min(2).max(500),
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const USED_BUNDLED_BOOST_REVERT_MESSAGE =
	"이미 사용한 끌어올리기 옵션이 있어 미결제로 전환할 수 없어요.";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 공고 등록 결제에 묶인 옵션만 공고 결제 상태와 함께 움직인다. 단독 구매는 별도 결제
// 목록의 개별 처리 흐름을 유지한다. 미결제 전환은 실제 사용 이력이 하나라도 있으면 거절한다.
const syncBundledBoostPurchasePayment = async ({
	executor,
	jobPostId,
	now,
	paymentStatus,
}: {
	executor: DbTransaction;
	jobPostId: string;
	now: Date;
	paymentStatus: "paid" | "unpaid";
}) => {
	const purchases = await executor
		.select()
		.from(jobBoostPurchase)
		.where(
			and(
				eq(jobBoostPurchase.jobPostId, jobPostId),
				eq(jobBoostPurchase.purchaseSource, "job_registration")
			)
		)
		.for("update");
	if (paymentStatus === "unpaid" && purchases.length > 0) {
		// 어느 한 옵션이라도 사용됐으면 아무 행도 바꾸기 전에 전체 전환을 거절한다.
		// 루프 중간에 검사하면 앞 옵션만 unpaid가 되는 부분 갱신이 남을 수 있다.
		const [usedEvent] = await executor
			.select({ id: jobBoostEvent.id })
			.from(jobBoostEvent)
			.where(
				inArray(
					jobBoostEvent.purchaseId,
					purchases.map((purchase) => purchase.id)
				)
			)
			.limit(1);
		if (usedEvent) {
			throw new ORPCError("BAD_REQUEST", {
				message: USED_BUNDLED_BOOST_REVERT_MESSAGE,
			});
		}
	}

	for (const purchase of purchases) {
		if (purchase.paymentStatus === paymentStatus) {
			continue;
		}

		let patch: Partial<typeof jobBoostPurchase.$inferInsert>;
		if (paymentStatus === "unpaid") {
			patch = {
				activatedAt: null,
				expiresAt: null,
				paymentStatus,
				remainingCount: null,
			};
		} else if (purchase.optionType === "manual_count") {
			patch = {
				activatedAt: now,
				expiresAt: null,
				paymentStatus,
				remainingCount: purchase.boostCount,
			};
		} else {
			patch = {
				activatedAt: now,
				expiresAt: new Date(
					now.getTime() + (purchase.durationDays ?? 0) * MS_PER_DAY
				),
				paymentStatus,
				remainingCount: null,
			};
		}

		await executor
			.update(jobBoostPurchase)
			.set(patch)
			.where(eq(jobBoostPurchase.id, purchase.id));
	}
};

// 계정 제재는 bambi_profile 행을 갱신하므로 온보딩 전 계정에는 걸 수 없다.
const PROFILELESS_SANCTION_MESSAGE =
	"아직 온보딩을 마치지 않은 계정이라 제재할 수 없어요.";
const PROFILELESS_ROLE_MESSAGE =
	"아직 온보딩을 마치지 않은 계정이라 역할을 지정할 수 없어요.";

const setUserStatusInput = z.object({
	targetUserId: z.string().min(1),
	status: accountStatusSchema,
	reason: z.string().min(2).max(500),
});

const revertLatestWarningInput = z.object({
	reason: z.string().min(2).max(500),
	targetUserId: z.string().min(1),
});

const warningAction = alias(adminModerationAction, "warning_action");
const warningReversal = alias(adminModerationAction, "warning_reversal");
const activeWarningsCountSql = (
	targetUserId: string | ReturnType<typeof sql>
) =>
	sql<number>`(
		select count(*)::int
		from "admin_moderation_action" as warning_action
		where warning_action."target_type" = 'user'
			and warning_action."target_id" = ${targetUserId}
			and warning_action."action" = 'set_status:warned'
			and not exists (
				select 1
				from "admin_moderation_action" as warning_reversal
				where warning_reversal."target_type" = 'user'
					and warning_reversal."target_id" = warning_action."target_id"
					and warning_reversal."action" = 'revert_warning'
					and warning_reversal."metadata"->>'warningActionId' = warning_action."id"::text
			)
	)`;

// 법률 자문 계정 지정·해제. 전환 축이 구직자 ↔ 법률자문 둘뿐이라 입력도 그 둘만 받고,
// 나머지 조합(업소·운영자 계정)은 서버 가드(assertLegalAdvisorRoleSwitch)가 막는다.
const setUserRoleInput = z.object({
	reason: z.string().min(2).max(500),
	role: z.enum(["job_seeker", "legal_advisor"]),
	targetUserId: z.string().min(1),
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
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(10),
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
	"changes_unsubmitted",
]);

const listEmployersInput = z.object({
	status: employerVerificationStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
	// 페이지네이션용 오프셋. 화면은 limit+1건을 요청하지 않고, 받은 건수가 limit보다
	// 적으면 마지막 페이지로 본다(전체 건수 집계 쿼리를 하나 더 돌리지 않기 위해).
	offset: z.number().int().min(0).default(0),
});

// 팀 합류 초대 조회 입력. 이름은 listPendingTeamInvitations로 유지하되(호출부 하나),
// 운영자가 승인·반려한 이력도 되짚을 수 있도록 상태 필터와 페이지네이션을 받는다.
const listTeamInvitationsInput = z.object({
	status: z.enum(["pending", "accepted", "rejected"]).default("pending"),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

const setChatRoomBlockedInput = z.object({
	chatRoomId: z.string().uuid(),
	isBlocked: z.boolean(),
	reason: z.string().min(2).max(500),
});

const hardDeleteChatRoomInput = z.object({
	chatRoomId: z.string().uuid(),
	reason: z.string().min(2).max(500),
});

const CHAT_MODERATION_PAGE_SIZE = 10;
const CHAT_SEARCH_MAX = 100;

const listAllChatsForModerationInput = z.object({
	// 조치 대상(삭제·차단·신고)만 좁혀 보는 스위치. 기본은 전체 방이다.
	onlyFlagged: z.boolean().default(false),
	page: z.number().int().min(1).default(1),
	search: z.string().trim().max(CHAT_SEARCH_MAX).default(""),
});

// 운영자 면접 일정 열람. 입력 없이도 부르도록 전부 optional로 둔다.
const DEFAULT_INTERVIEW_SCHEDULE_LIMIT = 100;

const listInterviewSchedulesInput = z
	.object({ limit: z.number().int().min(1).max(200).optional() })
	.optional();

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
	// 게시판 key 필터(커뮤니티 글 전용, 다른 유형에서는 무시된다). 존재 여부는 검사하지
	// 않는다 — 없는 key면 빈 목록이 나올 뿐이고, 목록은 이미 게시판을 조인하지 않는다.
	board: z.string().trim().min(1).max(40).optional(),
	page: z.number().int().min(1).default(1),
	status: contentStatusSchema.optional(),
	targetType: moderatableTargetTypeSchema,
});

const hardDeleteCommunityPostInput = z.object({
	postId: z.string().uuid(),
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

const getReportedChatRoomId = async (
	targetType: ReportRow["targetType"],
	targetId: string
): Promise<string | null> => {
	if (targetType === "chat_room") {
		return targetId;
	}
	if (targetType !== "chat_message") {
		return null;
	}

	const [message] = await db
		.select({ chatRoomId: chatMessage.chatRoomId })
		.from(chatMessage)
		.where(eq(chatMessage.id, targetId))
		.limit(1);

	return message?.chatRoomId ?? null;
};

const emitChatReportAvailabilityChanged = async (
	targetType: ReportRow["targetType"],
	targetId: string
): Promise<void> => {
	const roomId = await getReportedChatRoomId(targetType, targetId);

	if (!roomId) {
		return;
	}

	const [room] = await db
		.select({
			authorGender: communityPost.authorGender,
			authorGuestId: communityPost.authorGuestId,
			employerUserId: chatRoom.employerUserId,
			jobSeekerUserId: chatRoom.jobSeekerUserId,
		})
		.from(chatRoom)
		.where(eq(chatRoom.id, roomId))
		.limit(1);

	if (!room) {
		return;
	}

	emitRoomUpdated({ roomId });
	emitChatListUpdated([room.employerUserId, room.jobSeekerUserId], { roomId });
};
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
			createdByUserId: jobPost.createdByUserId,
			id: jobPost.id,
			title: jobPost.title,
			description: jobPost.description,
			status: jobPost.status,
			riskFlags: jobPost.riskFlags,
			rejectionReason: jobPost.rejectionReason,
			organizationDisplayName: employerOrganizationProfile.displayName,
			payAmount: jobPost.payAmount,
			payUnit: jobPost.payUnit,
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
			displayName: user.name,
			role: bambiProfile.role,
			status: bambiProfile.status,
			isPhoneVerified: bambiProfile.isPhoneVerified,
		})
		.from(bambiProfile)
		.innerJoin(user, eq(user.id, bambiProfile.userId))
		.where(eq(bambiProfile.userId, targetId))
		.limit(1);

	return row ? { user: row } : null;
};

const getChatRoomTargetContext = async (targetId: string) => {
	const contextEmployerUser = alias(user, "chat_context_employer_user");
	const contextSeekerUser = alias(user, "chat_context_seeker_user");
	const [room] = await db
		.select({
			employerAccountDeletedAt: contextEmployerUser.deletedAt,
			employerChatDeletedAt: chatRoom.employerDeletedAt,
			id: chatRoom.id,
			isBlocked: chatRoom.isBlocked,
			jobPostTitle: jobPost.title,
			seekerAccountDeletedAt: contextSeekerUser.deletedAt,
			seekerChatDeletedAt: chatRoom.seekerDeletedAt,
			organizationDisplayName: employerOrganizationProfile.displayName,
			employerUserId: chatRoom.employerUserId,
		})
		.from(chatRoom)
		.innerJoin(jobPost, eq(chatRoom.jobPostId, jobPost.id))
		.innerJoin(
			employerOrganizationProfile,
			eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
		)
		.leftJoin(
			contextEmployerUser,
			eq(contextEmployerUser.id, chatRoom.employerUserId)
		)
		.leftJoin(
			contextSeekerUser,
			eq(contextSeekerUser.id, chatRoom.jobSeekerUserId)
		)
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

	const {
		employerAccountDeletedAt,
		employerChatDeletedAt,
		seekerAccountDeletedAt,
		seekerChatDeletedAt,
		...visibleRoom
	} = room;

	return {
		chatRoom: {
			...visibleRoom,
			isDeleted: Boolean(
				employerAccountDeletedAt ||
					employerChatDeletedAt ||
					seekerAccountDeletedAt ||
					seekerChatDeletedAt
			),
			recentMessages,
		},
	};
};

// 신고된 채팅방 id 집합 — 방 직접 신고(chat_room)와 방 안 메시지 신고(chat_message)를 합친다.
// message 신고는 targetId(text)를 message.id::text와 맞춰 방으로 환원한다(uuid 캐스팅 회피).
const getReportedChatRoomIds = async (): Promise<Set<string>> => {
	const directRows = await db
		.selectDistinct({ chatRoomId: report.targetId })
		.from(report)
		.where(eq(report.targetType, "chat_room"));

	const viaMessageRows = await db
		.selectDistinct({ chatRoomId: chatMessage.chatRoomId })
		.from(report)
		.innerJoin(chatMessage, eq(sql`${chatMessage.id}::text`, report.targetId))
		.where(eq(report.targetType, "chat_message"));

	return new Set<string>([
		...directRows.map((row) => row.chatRoomId),
		...viaMessageRows.map((row) => row.chatRoomId),
	]);
};

// ---- 운영자 채팅 목록 공통 조립 ------------------------------------------
// 플래그 목록(listChatsForModeration)과 전체 목록(listAllChatsForModeration)이 같은
// 조인·select·매핑을 공유한다. 두 곳에 각각 쿼리를 두면 행 형태가 갈려 화면이 분기해야 한다.
const chatModerationEmployerUser = alias(user, "chat_moderation_employer_user");
const chatModerationSeekerUser = alias(user, "chat_moderation_seeker_user");

// 상관 서브쿼리는 타입 파서가 없어 timestamp가 문자열로 온다 → 매핑에서 Date로 되돌린다.
const chatModerationLastMessageAtSql = sql<string | null>`(
	select max(${chatMessage.createdAt})
	from ${chatMessage}
	where ${chatMessage.chatRoomId} = ${chatRoom.id}
)`;

const chatModerationSelection = {
	chatRoomId: chatRoom.id,
	employerDeletedAt: chatRoom.employerDeletedAt,
	employerName: chatModerationEmployerUser.name,
	employerUserId: chatRoom.employerUserId,
	isBlocked: chatRoom.isBlocked,
	jobPostTitle: jobPost.title,
	jobSeekerName: chatModerationSeekerUser.name,
	jobSeekerUserId: chatRoom.jobSeekerUserId,
	lastMessageAt: chatModerationLastMessageAtSql,
	seekerDeletedAt: chatRoom.seekerDeletedAt,
};

interface ChatModerationRawRow {
	chatRoomId: string;
	employerDeletedAt: Date | null;
	employerName: string;
	employerUserId: string;
	isBlocked: boolean;
	jobPostTitle: string;
	jobSeekerName: string;
	jobSeekerUserId: string;
	lastMessageAt: string | null;
	seekerDeletedAt: Date | null;
}

const chatModerationBaseQuery = () =>
	db
		.select(chatModerationSelection)
		.from(chatRoom)
		.innerJoin(jobPost, eq(chatRoom.jobPostId, jobPost.id))
		.innerJoin(
			chatModerationEmployerUser,
			eq(chatModerationEmployerUser.id, chatRoom.employerUserId)
		)
		.innerJoin(
			chatModerationSeekerUser,
			eq(chatModerationSeekerUser.id, chatRoom.jobSeekerUserId)
		);

const chatModerationCountQuery = () =>
	db
		.select({ value: count() })
		.from(chatRoom)
		.innerJoin(jobPost, eq(chatRoom.jobPostId, jobPost.id))
		.innerJoin(
			chatModerationEmployerUser,
			eq(chatModerationEmployerUser.id, chatRoom.employerUserId)
		)
		.innerJoin(
			chatModerationSeekerUser,
			eq(chatModerationSeekerUser.id, chatRoom.jobSeekerUserId)
		);

const toChatModerationRow = (
	row: ChatModerationRawRow,
	reportedRoomIds: Set<string>
) => ({
	chatRoomId: row.chatRoomId,
	employerName: row.employerName,
	employerUserId: row.employerUserId,
	isBlocked: row.isBlocked,
	isDeleted: row.seekerDeletedAt !== null || row.employerDeletedAt !== null,
	isReported: reportedRoomIds.has(row.chatRoomId),
	jobPostTitle: row.jobPostTitle,
	jobSeekerName: row.jobSeekerName,
	jobSeekerUserId: row.jobSeekerUserId,
	lastMessageAt:
		row.lastMessageAt === null ? null : new Date(row.lastMessageAt),
});

// 조치 대상(삭제됨·차단됨·신고됨) 필터. 신고 방이 하나도 없으면 inArray를 붙이지 않는다
// (빈 배열 inArray는 항상 거짓이라 조건이 통째로 무너진다).
const buildFlaggedChatCondition = (reportedRoomIds: Set<string>) => {
	const conditions = [
		eq(chatRoom.isBlocked, true),
		isNotNull(chatRoom.seekerDeletedAt),
		isNotNull(chatRoom.employerDeletedAt),
	];
	if (reportedRoomIds.size > 0) {
		conditions.push(inArray(chatRoom.id, [...reportedRoomIds]));
	}

	return or(...conditions);
};

// 참여자 이름·공고 제목 부분 일치. 운영자가 아는 단서가 "누구"와 "어느 공고"뿐이라
// 이 셋만 훑는다(메시지 본문 검색은 열람 로그 없이 대화 내용을 훑게 되므로 두지 않는다).
const buildChatSearchCondition = (search: string) => {
	const keyword = search.trim();
	if (!keyword) {
		return;
	}

	const pattern = `%${escapeLikePattern(keyword)}%`;
	return or(
		ilike(chatModerationEmployerUser.name, pattern),
		ilike(chatModerationSeekerUser.name, pattern),
		ilike(jobPost.title, pattern)
	);
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
			authorGender: communityPost.authorGender,
			authorGuestId: communityPost.authorGuestId,
			authorUserId: communityPost.authorUserId,
			authorDisplayName: communityPost.authorDisplayName,
			authorRole: communityPost.authorRole,
			board: communityPost.board,
			boardLabel: communityBoard.label,
			boardSlug: communityBoard.slug,
			body: communityPost.body,
			createdAt: communityPost.createdAt,
			id: communityPost.id,
			status: communityPost.status,
			title: communityPost.title,
		})
		.from(communityPost)
		.leftJoin(communityBoard, eq(communityBoard.key, communityPost.board))
		.leftJoin(bambiProfile, eq(bambiProfile.userId, communityPost.authorUserId))
		.where(eq(communityPost.id, targetId))
		.limit(1);

	if (!post) {
		return null;
	}
	const authorIdentity = post.authorGuestId
		? await getVerifiedIdentityForAdmin({ guestId: post.authorGuestId })
		: await getVerifiedIdentityForAdmin({ userId: post.authorUserId });
	const secretIdentity =
		post.board === "secret"
			? (authorIdentity ??
				(await getVerifiedIdentityForAdmin({ userId: post.authorUserId })))
			: null;

	return {
		authorUserId: post.authorUserId,
		authorName: post.authorDisplayName,
		authorRole: post.authorRole,
		authorGender: post.authorGender,
		authorIdentity,
		secretIdentity,
		board: post.board,
		boardLabel: post.boardLabel,
		boardSlug: post.boardSlug,
		bodyPreview: toCommunityBodyPreview(post.body),
		createdAt: post.createdAt,
		id: post.id,
		status: post.status,
		title: post.title,
	};
};

// 수집 커뮤니티 글에 달린 댓글의 원글 자리 표기. 우리 community_post 행이 없어 제목·
// 게시판을 조인으로 채울 수 없다(수집 글 제목은 crawled_community_topic에 있고, 운영
// 화면에는 "우리 글이 아니다"만 보이면 충분하다).
const CRAWLED_TOPIC_COMMENT_TITLE = "수집 커뮤니티 글";
// 그 글의 작성자 자리(우리 회원이 아니라 원본 게시판이다).
const CRAWLED_AUTHOR_DISPLAY_NAME = "밤문화이야기";

// community_comment 신고 컨텍스트 — 작성자 표시명은 listComments와 동일하게 user.name
// (표시명 정본)을 쓰고, 제목·게시판은 부모 글 조인으로 채운다(부모 글이 삭제 상태여도 조인 유지).
// 수집 글 댓글은 원글 행이 없어 leftJoin이다 — innerJoin이면 신고가 들어와도 운영 화면에
// 맥락이 뜨지 않아 조치 버튼까지 사라진다.
const getCommunityCommentTargetContext = async (targetId: string) => {
	const [comment] = await db
		.select({
			authorGender: communityComment.authorGender,
			authorGuestId: communityComment.authorGuestId,
			authorUserId: communityComment.authorUserId,
			authorName: user.name,
			authorRole: communityComment.authorRole,
			body: communityComment.body,
			createdAt: communityComment.createdAt,
			id: communityComment.id,
			postBoard: communityPost.board,
			postBoardLabel: communityBoard.label,
			postBoardSlug: communityBoard.slug,
			postId: communityComment.postId,
			postStatus: communityPost.status,
			postTitle: communityPost.title,
			status: communityComment.status,
		})
		.from(communityComment)
		.leftJoin(communityPost, eq(communityPost.id, communityComment.postId))
		.leftJoin(communityBoard, eq(communityBoard.key, communityPost.board))
		.leftJoin(user, eq(user.id, communityComment.authorUserId))
		.leftJoin(
			bambiProfile,
			eq(bambiProfile.userId, communityComment.authorUserId)
		)
		.where(eq(communityComment.id, targetId))
		.limit(1);

	if (!comment) {
		return null;
	}
	const authorIdentity = comment.authorGuestId
		? await getVerifiedIdentityForAdmin({ guestId: comment.authorGuestId })
		: await getVerifiedIdentityForAdmin({ userId: comment.authorUserId });
	const secretIdentity =
		comment.postBoard === "secret"
			? (authorIdentity ??
				(await getVerifiedIdentityForAdmin({ userId: comment.authorUserId })))
			: null;

	return {
		authorUserId: comment.authorUserId,
		authorName: comment.authorName,
		authorRole: comment.authorRole,
		authorGender: comment.authorGender,
		authorIdentity,
		secretIdentity,
		bodyPreview: comment.body.slice(0, COMMUNITY_BODY_PREVIEW_MAX),
		createdAt: comment.createdAt,
		id: comment.id,
		// 수집 글은 밤문화 이야기 게시판에 합류하므로 게시판 배지도 그 값으로 세운다
		// (운영 화면이 게시판 라벨 맵을 태우려면 null이 아니라 key여야 한다).
		postBoard: comment.postBoard ?? "work_talk",
		postBoardLabel: comment.postBoardLabel,
		postBoardSlug: comment.postBoardSlug,
		postId: comment.postId,
		postStatus: comment.postStatus,
		postTitle: comment.postTitle ?? CRAWLED_TOPIC_COMMENT_TITLE,
		status: comment.status,
	};
};

const getReportTargetContext = async (
	reportRow: Pick<ReportRow, "targetId" | "targetType">
) => {
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

type ReportTargetContext = NonNullable<
	Awaited<ReturnType<typeof getReportTargetContext>>
>;

const REPORT_CONTEXT_KEYS = [
	"chatMessage",
	"jobPost",
	"review",
	"user",
	"chatRoom",
	"communityPost",
	"communityComment",
] as const;

const isReportTargetContext = (
	value: unknown
): value is ReportTargetContext => {
	if (!(value && typeof value === "object") || Array.isArray(value)) {
		return false;
	}

	return REPORT_CONTEXT_KEYS.some((key) => key in value);
};

const sanitizeIdentitySnapshot = (
	value: unknown
): { gender: "female" | "male"; phoneNumber: string } | null => {
	if (!(value && typeof value === "object")) {
		return null;
	}
	const { gender, phoneNumber } = value as Record<string, unknown>;
	if (
		(gender !== "female" && gender !== "male") ||
		typeof phoneNumber !== "string"
	) {
		return null;
	}
	return { gender, phoneNumber };
};

const sanitizeReportIdentitySnapshots = (
	context: ReportTargetContext | null
): ReportTargetContext | null => {
	if (context && "communityPost" in context && context.communityPost) {
		return {
			...context,
			communityPost: {
				...context.communityPost,
				authorIdentity: sanitizeIdentitySnapshot(
					context.communityPost.authorIdentity
				),
				secretIdentity: sanitizeIdentitySnapshot(
					context.communityPost.secretIdentity
				),
			},
		};
	}
	if (context && "communityComment" in context && context.communityComment) {
		return {
			...context,
			communityComment: {
				...context.communityComment,
				authorIdentity: sanitizeIdentitySnapshot(
					context.communityComment.authorIdentity
				),
				secretIdentity: sanitizeIdentitySnapshot(
					context.communityComment.secretIdentity
				),
			},
		};
	}
	return context;
};

const mergeReportIdentitySnapshot = (
	live: ReportTargetContext | null,
	snapshot: ReportTargetContext | null
): ReportTargetContext | null => {
	if (!live) {
		return snapshot;
	}
	if (!snapshot) {
		return live;
	}
	if (
		"communityPost" in live &&
		"communityPost" in snapshot &&
		live.communityPost &&
		snapshot.communityPost
	) {
		return {
			...live,
			communityPost: {
				...live.communityPost,
				authorIdentity:
					live.communityPost.authorIdentity ??
					snapshot.communityPost.authorIdentity,
				secretIdentity:
					live.communityPost.secretIdentity ??
					snapshot.communityPost.secretIdentity,
			},
		};
	}
	if (
		"communityComment" in live &&
		"communityComment" in snapshot &&
		live.communityComment &&
		snapshot.communityComment
	) {
		return {
			...live,
			communityComment: {
				...live.communityComment,
				authorIdentity:
					live.communityComment.authorIdentity ??
					snapshot.communityComment.authorIdentity,
				secretIdentity:
					live.communityComment.secretIdentity ??
					snapshot.communityComment.secretIdentity,
			},
		};
	}
	return live;
};

const withReportTargetContexts = async (reportRows: ReportRow[]) =>
	await Promise.all(
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: target-specific live and snapshot fallbacks are normalized exhaustively here.
		reportRows.map(async (reportRow) => {
			const liveTargetContext = await getReportTargetContext(reportRow);
			const snapshotTargetContext = sanitizeReportIdentitySnapshots(
				isReportTargetContext(reportRow.targetSnapshot)
					? reportRow.targetSnapshot
					: null
			);
			const targetContext = mergeReportIdentitySnapshot(
				liveTargetContext,
				snapshotTargetContext
			);
			let targetUserId: string | null = null;
			let isChatTarget = false;
			if (targetContext) {
				if ("jobPost" in targetContext) {
					targetUserId = targetContext.jobPost?.createdByUserId ?? null;
				} else if ("chatRoom" in targetContext) {
					targetUserId = targetContext.chatRoom?.employerUserId ?? null;
					isChatTarget = true;
				} else if ("chatMessage" in targetContext) {
					targetUserId = targetContext.chatMessage?.senderUserId ?? null;
					isChatTarget = true;
				} else if ("communityPost" in targetContext) {
					targetUserId = targetContext.communityPost?.authorUserId ?? null;
				} else if ("communityComment" in targetContext) {
					targetUserId = targetContext.communityComment?.authorUserId ?? null;
				} else if ("user" in targetContext) {
					targetUserId = targetContext.user?.userId ?? null;
				}
			}
			const targetVerifiedIdentity =
				isChatTarget && targetUserId
					? await getVerifiedIdentityForAdmin({ userId: targetUserId })
					: null;
			return {
				...reportRow,
				targetContext,
				targetUserId,
				targetVerifiedIdentity,
				targetUnavailable:
					liveTargetContext === null && snapshotTargetContext === null,
			};
		})
	);

// 신고 목록 각 row에 붙일 신고자 표시 정보(닉네임·이메일 폴백·역할). displayName은 null일 수
// 있어 클라이언트가 listUsers와 동일하게 displayName ?? email로 표시한다.
// orpc 추론이 listReports 반환 타입에 이 이름을 참조하므로 export 해 패키지 경계 밖에서
// 명명 가능하게 한다(비-export 시 TS4023).
export interface ReportReporter {
	displayName: string | null;
	email: string;
	gender: "female" | "male" | null;
	role: string;
}
export interface ReportVerifiedIdentity {
	gender: "female" | "male";
	phoneNumber: string;
}

// listReports 전용: 신고자(reporterUserId)의 닉네임·역할을 배치 조회해 각 row에 reporter로
// 붙인다. 목록 전체를 N+1로 돌리지 않도록 distinct reporterUserId를 inArray로 한 번에
// 조회하고 맵으로 합류한다. displayName·폴백용 email 모두 auth user 테이블에서
// 가져온다(listUsers와 동일한 조인·폴백 패턴). 대상 row가 없는 신고자는 reporter=null.
const isIdentityReportContext = (
	context: ReportTargetContext | null | undefined
) =>
	Boolean(
		context &&
			("communityPost" in context ||
				"communityComment" in context ||
				"chatRoom" in context ||
				"chatMessage" in context)
	);

const snapshotReporterIdentity = (
	value: Record<string, unknown> | null
): ReportVerifiedIdentity | null => {
	const candidate = value?.reporterIdentity;
	if (!(candidate && typeof candidate === "object")) {
		return null;
	}
	const { gender, phoneNumber } = candidate as Record<string, unknown>;
	if (
		(gender !== "female" && gender !== "male") ||
		typeof phoneNumber !== "string"
	) {
		return null;
	}
	return { gender, phoneNumber };
};

const withReporters = async <
	T extends ReportRow & { targetContext?: ReportTargetContext | null },
>(
	reportRows: T[]
): Promise<
	(T & {
		reporter: ReportReporter | null;
		reporterVerifiedIdentity: ReportVerifiedIdentity | null;
	})[]
> => {
	const reporterIds = [...new Set(reportRows.map((row) => row.reporterUserId))];

	if (reporterIds.length === 0) {
		return reportRows.map((row) => ({
			...row,
			reporter: null,
			reporterVerifiedIdentity: null,
		}));
	}

	const reporterRows = await db
		.select({
			userId: bambiProfile.userId,
			displayName: user.name,
			email: user.email,
			gender: bambiProfile.gender,
			role: bambiProfile.role,
		})
		.from(bambiProfile)
		.innerJoin(user, eq(bambiProfile.userId, user.id))
		.where(inArray(bambiProfile.userId, reporterIds));

	const reporterMap = new Map<string, ReportReporter>(
		reporterRows.map((row) => [
			row.userId,
			{
				displayName: row.displayName,
				email: row.email,
				gender: row.gender,
				role: row.role,
			},
		])
	);

	return await Promise.all(
		reportRows.map(async (row) => ({
			...row,
			reporter: reporterMap.get(row.reporterUserId) ?? null,
			reporterVerifiedIdentity: isIdentityReportContext(row.targetContext)
				? ((await getVerifiedIdentityForAdmin({
						userId: row.reporterUserId,
					})) ?? snapshotReporterIdentity(row.targetSnapshot))
				: null,
		}))
	);
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

/**
 * 검수 결과 알림 문구가 갈리는 재료. 유료 공고는 승인돼도 입금 확인 전까지 게시되지 않고,
 * hidden→published는 신규 승인이 아니라 재공개다 — 셋이 전부 "승인돼 게시됐어요"로 읽히면
 * 안 된다. 무료 공고는 저장 시점에 paid로 두므로 unpaid가 곧 입금 대기다.
 */
const buildJobPostStatusNotificationMetadata = ({
	paymentStatus,
	previousStatus,
}: {
	paymentStatus: string;
	previousStatus: string;
}) => ({ paymentPending: paymentStatus !== "paid", previousStatus });

/** 일괄 처리에서 실제로 성공한 대상만 남긴다 — 실패 건에 "처리됨" 알림이 나가면 안 된다. */
const succeededBulkTargetIds = (
	targetIds: readonly string[],
	result: { failures: { targetId: string }[] }
): string[] => {
	const failed = new Set(result.failures.map((failure) => failure.targetId));
	return targetIds.filter((targetId) => !failed.has(targetId));
};

/**
 * 결제 확정이 즉시 노출이 아니라 대기열 접수일 수 있다 — 스페셜/추천은 정원이 차 있으면
 * exposureEndsAt=null(노출 시계 미시작)·listingPaidAt 세팅으로 FIFO 유료 대기열에 들어간다.
 * 그 행을 판별해 알림 문구("게시됐어요" vs "대기열 접수")를 사실에 맞게 가른다.
 */
const isQueuedListingRow = (row: {
	exposureEndsAt: Date | null;
	exposureType: string;
	listingPaidAt: Date | null;
}): boolean =>
	(row.exposureType === "special" || row.exposureType === "recommended") &&
	row.exposureEndsAt === null &&
	row.listingPaidAt !== null;

/**
 * 결제 확정 알림 payload. 대기열 접수면 순번을 붙여 "listing_queued"로, 그 외(즉시 활성화·
 * 비리스팅·unpaid 전환)는 기존 "set_payment"로 낸다. bulk 여부만 set_payment metadata에 반영한다.
 */
const buildListingPaymentNotification = ({
	bulk,
	paymentStatus,
	position,
	row,
}: {
	bulk: boolean;
	paymentStatus: string;
	position: number | null;
	row:
		| {
				exposureEndsAt: Date | null;
				exposureType: string;
				listingPaidAt: Date | null;
				title: string;
		  }
		| undefined;
}): { action: string; metadata: Record<string, unknown> } => {
	if (paymentStatus === "paid" && row && isQueuedListingRow(row)) {
		return {
			action: "listing_queued",
			metadata: {
				exposureType: row.exposureType,
				jobPostTitle: row.title,
				position,
			},
		};
	}
	return {
		action: `set_payment:${paymentStatus}`,
		metadata: bulk ? { bulk: true, paymentStatus } : { paymentStatus },
	};
};

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

// 대기열(결제완료·미활성) 리스팅을 섹션별로 뽑아 FIFO(listing_paid_at asc, 동률 id asc) 순번을
// 부착한다. position은 배열 순번(1-based) — getListingQueuePositions의 섹션별 순번과 같은 규칙.
// 대기 판정은 queuedListingWhere 단일 소스만 쓴다(재발명 금지).
const listListingQueueSection = async (type: "recommended" | "special") => {
	const rows = await db
		.select({
			id: jobPost.id,
			listingPaidAt: jobPost.listingPaidAt,
			organizationDisplayName: employerOrganizationProfile.displayName,
			title: jobPost.title,
		})
		.from(jobPost)
		.innerJoin(
			employerOrganizationProfile,
			eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
		)
		.where(queuedListingWhere(type))
		.orderBy(asc(jobPost.listingPaidAt), asc(jobPost.id));

	return rows.map((row, index) => ({ ...row, position: index + 1 }));
};

export const moderationRouter = {
	createReport: protectedProcedure
		.input(createReportInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const rawTargetContext = await getReportTargetContext(input);
			const reporterIdentity = await getVerifiedIdentityForAdmin({
				userId: profile.userId,
			});
			const targetContext = rawTargetContext
				? { ...rawTargetContext, reporterIdentity }
				: rawTargetContext;

			if (input.targetType === "user" && input.targetId === profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "자기 자신은 신고할 수 없어요.",
				});
			}

			// 채팅 신고는 구직자 전용이다. 구인자에게는 차단만 열어 두고, 화면에서도
			// 신고 버튼을 숨기지만 근본 차단은 여기서 한다(공고·커뮤니티 신고는 그대로).
			if (
				(input.targetType === "chat_room" ||
					input.targetType === "chat_message") &&
				profile.role !== "job_seeker"
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "채팅 신고는 구직자만 할 수 있어요.",
				});
			}

			// 채팅 신고는 그 방의 참여자만 낼 수 있다. 예전에는 "대상이 존재하는가"만 봤는데,
			// 내 신고 목록(listMyReports)이 신고 대상의 최근 메시지 본문을 함께 돌려주므로
			// 방 uuid만 알면 남의 대화를 읽는 우회로가 됐다. 비참여자에겐 requireChatParticipant가
			// NOT_FOUND를 내 존재 여부도 새지 않는다.
			await assertReportTargetExists(input.targetType, input.targetId);

			let communityAuthorRole:
				| "admin"
				| "employer"
				| "guest"
				| "job_seeker"
				| "legal_advisor"
				| null = null;
			if (
				input.targetType === "community_post" &&
				targetContext &&
				"communityPost" in targetContext
			) {
				communityAuthorRole = targetContext.communityPost?.authorRole ?? null;
			} else if (
				input.targetType === "community_comment" &&
				targetContext &&
				"communityComment" in targetContext
			) {
				communityAuthorRole =
					targetContext.communityComment?.authorRole ?? null;
			}
			if (communityAuthorRole === "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "관리자가 작성한 글이나 댓글에는 신고할 수 없습니다.",
				});
			}

			if (input.targetType === "chat_room") {
				await requireChatParticipant(input.targetId, context.session);
			} else if (input.targetType === "chat_message") {
				const [reportedMessage] = await db
					.select({ chatRoomId: chatMessage.chatRoomId })
					.from(chatMessage)
					.where(eq(chatMessage.id, input.targetId))
					.limit(1);

				if (!reportedMessage) {
					throw new ORPCError("NOT_FOUND");
				}

				await requireChatParticipant(
					reportedMessage.chatRoomId,
					context.session
				);
			}

			// 동일 신고자·대상의 중복 신고는 멱등 처리한다(스키마 변경 없이 기존 row 반환).
			// 단 미처리(open/reviewing) 신고만 멱등 대상이다 — 운영자가 기각(dismissed)·조치완료
			// (resolved)한 뒤 같은 대상을 재신고하면 옛 종결 행을 돌려주지 않고 새 신고 행을
			// 만들어야, 재신고가 실제로 접수되고 채팅 숨김 파이프라인도 다시 걸린다.
			const [existing] = await db
				.select()
				.from(report)
				.where(
					and(
						eq(report.reporterUserId, profile.userId),
						eq(report.targetType, input.targetType),
						eq(report.targetId, input.targetId),
						inArray(report.status, [...PENDING_REPORT_STATUSES])
					)
				)
				.limit(1);

			if (existing) {
				await emitChatReportAvailabilityChanged(
					existing.targetType,
					existing.targetId
				);
				throw new ORPCError("CONFLICT", {
					message: duplicateReportMessage(input.targetType),
				});
			}

			const [created] = await db
				.insert(report)
				.values({
					reporterUserId: profile.userId,
					targetType: input.targetType,
					targetId: input.targetId,
					reason: input.reason,
					details: input.details,
					targetSnapshot: targetContext,
				})
				.returning();

			if (created) {
				await emitChatReportAvailabilityChanged(
					created.targetType,
					created.targetId
				);
				await notifyBambiNotification({
					actorUserId: profile.userId,
					metadata: {
						action: "submitted",
						reason: input.reason,
						reportTargetType: input.targetType,
					},
					recipientRole: "admin",
					targetId: created.id,
					targetType: "report",
				});
			}

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
		.input(
			z.object({
				page: z.number().int().min(1).default(1),
				pageSize: z.number().int().min(1).max(50).default(10),
			})
		)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const offset = (input.page - 1) * input.pageSize;

			const [[totalRow], reportRows] = await Promise.all([
				db
					.select({ value: count() })
					.from(report)
					.where(eq(report.reporterUserId, profile.userId)),
				db
					.select()
					.from(report)
					.where(eq(report.reporterUserId, profile.userId))
					.orderBy(desc(report.createdAt), desc(report.id))
					.limit(input.pageSize)
					.offset(offset),
			]);

			return {
				items: await withReportTargetContexts(reportRows),
				page: input.page,
				pageSize: input.pageSize,
				total: totalRow?.value ?? 0,
			};
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
					// 운영자 편집 폼이 지역 Select를 되살리려면 표시 문자열이 아니라 코드가 필요하다
					// (adminUpdateJobPost 입력이 코드를 요구한다).
					regionCode: jobPost.regionCode,
					districtCode: jobPost.districtCode,
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
					// 검수 화면이 본문에서 이 문자열을 그대로 찾아 강조하고, 큐 행의
					// "감지 문구"로도 쓴다(라벨이 아니라 원문이라 하이라이트가 걸린다).
					detectedTerms: jobPost.detectedTerms,
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

			const rows = input.status
				? await query.where(eq(jobPost.status, input.status))
				: await query;

			// 대기 공고는 상태 배지 대신 "스페셜/추천 #N"으로 표기하므로 FIFO 순번을 요청당 1회만
			// 뽑아 부착한다(대기 행이 아니면 null).
			const positions = await getListingQueuePositions(db);
			return rows.map((row) => ({
				...row,
				listingQueuePosition: positions.get(row.id)?.position ?? null,
			}));
		}),

	// 운영자 편집 화면 프리필용. getEditableById(jobs)는 조직 멤버십을 요구해 운영자가
	// 못 쓰므로, admin 게이트로 임의 공고의 전체 필드+미디어 세트를 그대로 내려준다.
	getJobPostForAdmin: adminProcedure
		.input(z.object({ jobPostId: z.string().uuid() }))
		.handler(async ({ input }) => {
			const [post] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			// 배너 레이아웃도 함께 내린다 — 프리필이 없으면 운영자가 저장하는 순간 기존
			// 배너 편집물이 사라진다.
			return {
				...post,
				adBannerLayout: await getStoredAdBannerLayout(post.id),
				media: await getJobPostMediaSet(post.id),
			};
		}),

	// 운영자가 임의 공고 본문/급여/노출/미디어를 직접 수정한다. jobs.update와 동일한 갱신·
	// 노출확정·미디어 교체 로직(applyJobPostUpdate)을 재사용하되 조직 멤버십 검사를 우회하고,
	// 검수·결제를 다시 거치지 않는 "즉시 반영"으로 돈다(moderatorEdit).
	adminUpdateJobPost: adminProcedure
		.input(z.object({ jobPostId: z.string().uuid(), data: jobPostInput }))
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const [existing] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			const result = await applyJobPostUpdate({
				actorUserId: admin.userId,
				data: input.data,
				existing,
				// 운영자 편집은 검수 상태도 결제 상태도 바꾸지 않는다. 게시 중 공고를 손봤다고
				// 노출에서 내려가거나, 승인 직전 오타 수정이 자기 큐로 되돌아오면 안 된다.
				moderatorEdit: true,
			});

			await db.insert(adminModerationAction).values({
				adminUserId: admin.userId,
				targetType: "job_post",
				targetId: input.jobPostId,
				action: "edit_job_post",
				reason: "운영자 공고 수정",
			});

			await notifyModerationAction({
				action: "edit_job_post",
				actorUserId: admin.userId,
				reason: "운영자 공고 수정",
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return result;
		}),

	// 운영자 공고 하드삭제. 자식 행(미디어·프로모션·성과·채팅방→메시지 등)은 job_post FK
	// onDelete cascade로 함께 지워지지만, GCS 미디어 객체는 cascade 대상이 아니라 키를 미리
	// 확보해 직접 지운다(jobs.delete와 동일 원칙, 권한만 admin 게이트로 대체).
	adminDeleteJobPost: adminProcedure
		.input(
			z.object({
				jobPostId: z.string().uuid(),
				reason: z.string().min(2).max(500),
			})
		)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			// 삭제되면 소유자를 되찾을 수 없다 — 공통 훅(조회형) 대신 여기서 미리 확보해
			// 커밋 뒤 명시 수신자로 보낸다(롤백된 삭제의 유령 알림 방지).
			const [existing] = await db
				.select({
					id: jobPost.id,
					ownerUserId: jobPost.createdByUserId,
					pointsUsed: jobPost.pointsUsed,
					// 삭제 알림은 "어느 공고였는지"가 전부다 — 지운 뒤에는 되찾을 수 없다.
					title: jobPost.title,
				})
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			const storageKeys = await getJobPostMediaStorageKeys(input.jobPostId);

			await db.transaction(async (tx) => {
				await tx.delete(jobPost).where(eq(jobPost.id, input.jobPostId));
				await tx.insert(adminModerationAction).values({
					action: "hard_delete",
					adminUserId: admin.userId,
					reason: input.reason,
					metadata: { pointsUsed: existing.pointsUsed, pointRefunded: false },
					targetId: input.jobPostId,
					targetType: "job_post",
				});
			});

			const [recipientUserId] = resolveNotificationRecipients(
				[existing.ownerUserId],
				admin.userId
			);

			await notifyBambiNotification({
				actorUserId: admin.userId,
				metadata: {
					action: "hard_delete",
					jobPostTitle: existing.title,
					reason: input.reason,
				},
				recipientUserId: recipientUserId ?? null,
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			await deletePublicObjects(storageKeys);

			return { ok: true };
		}),

	listUsers: protectedProcedure
		.input(listUsersInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			await normalizeAllExpiredWarningRestrictions();

			// 계정 목록의 기준 테이블은 user다. bambi_profile은 좌측 조인해 부가 정보로만
			// 붙이므로, 프로필이 아직 없는(온보딩 전) 계정도 그대로 노출된다.
			// 집계는 전부 상관 서브쿼리로 뽑는다 — 조인으로 붙이면 소속 업소·차단 수만큼
			// user row가 뻥튀기된다.
			// 기각된 신고는 운영자 판단으로 무효 처리된 건이라 누적 신고 수에서 뺀다.
			// ponytail: 공고·커뮤니티 등 콘텐츠 신고를 작성자에게 귀속시키는 합산은 이번 범위 밖.
			const reportsCountSql = sql<number>`(
				select count(*)::int from ${report}
				where ${report.targetType} = 'user'
					and ${report.targetId} = ${user.id}
					and ${report.status} <> 'dismissed'
			)`;
			const warningsCountSql = activeWarningsCountSql(sql`${user.id}`);
			// 구인자 계정의 소속 업소 표시명. 한 계정이 여러 업소에 속할 수 있어 배열로 모은다.
			const organizationNamesSql = sql<string[]>`(
				select coalesce(
					array_agg(distinct ${employerOrganizationProfile.displayName}),
					'{}'::text[]
				)
				from ${member}
				join ${employerOrganizationProfile}
					on ${employerOrganizationProfile.organizationId} = ${member.organizationId}
				where ${member.userId} = ${user.id}
			)`;
			// 다른 사용자에게 차단당한 횟수(신고와 별개의 위험 신호).
			const blockedByCountSql = sql<number>`(
				select count(*)::int from ${userBlock}
				where ${userBlock.blockedUserId} = ${user.id}
			)`;
			const query = db
				.select({
					userId: user.id,
					name: user.name,
					// 로그인 아이디(better-auth username 플러그인). 미설정 계정은 null.
					loginId: user.login_id,
					email: user.email,
					role: sql<string>`coalesce(${bambiProfile.role}, 'job_seeker')`,
					status: sql<
						"active" | "suspended" | "warned"
					>`coalesce(${bambiProfile.status}, 'active')`,
					isPhoneVerified: sql<boolean>`coalesce(${bambiProfile.isPhoneVerified}, false)`,
					phoneNumber: bambiProfile.phoneNumber,
					reportsCount: reportsCountSql,
					warningsCount: warningsCountSql,
					organizationNames: organizationNamesSql,
					blockedByCount: blockedByCountSql,
					// 소프트 탈퇴 시각. null이 아니면 탈퇴 처리된 계정이다. 표시명(name)은
					// 탈퇴해도 원본 그대로다 — 운영자 화면만 원본을 보고, 일반 사용자 화면은
					// 표시 계층(bambi-withdrawn-display)이 "탈퇴한 회원"으로 바꾼다.
					deletedAt: user.deletedAt,
					// 개인정보 파기 완료 시각. 값이 있으면 탈퇴 복구가 불가능한 계정이다.
					purgedAt: user.purgedAt,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				})
				.from(user)
				.leftJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.orderBy(desc(user.createdAt))
				.limit(input.limit);

			const rows = input.status
				? // 프로필이 없는(온보딩 전) 계정도 목록 표시와 동일하게 active로 취급한다 —
					// 컬럼을 그대로 비교하면 NULL이라 'active' 필터에서 통째로 사라진다.
					await query.where(
						sql`coalesce(${bambiProfile.status}, 'active')::text = ${input.status}`
					)
				: await query;

			// 잔액·등급 뱃지는 userId들로 한 번에 배치 조회해 각 행에 싣는다(행 부풀림 없음).
			const userIds = rows.map((row) => row.userId);
			const [balances, badges] = await Promise.all([
				getPointBalances(userIds),
				loadGradeBadges(userIds),
			]);

			return rows.map((row) => ({
				...row,
				pointBalance: balances.get(row.userId) ?? 0,
				grade: badges.get(row.userId) ?? null,
			}));
		}),

	// 계정 상세의 제재 이력. 감사 로그(admin_moderation_action)에서 해당 사용자를 대상으로
	// 한 기록을 최신순으로 페이지 조회한다(target_type·target_id 인덱스를 그대로 탄다).
	listUserModerationActions: adminProcedure
		.input(listUserModerationActionsInput)
		.handler(async ({ input }) => {
			const where = and(
				eq(adminModerationAction.targetType, "user"),
				eq(adminModerationAction.targetId, input.targetUserId)
			);
			const offset = (input.page - 1) * input.pageSize;
			const [items, [totalRow]] = await Promise.all([
				db
					.select({
						id: adminModerationAction.id,
						action: adminModerationAction.action,
						reason: adminModerationAction.reason,
						metadata: adminModerationAction.metadata,
						adminUserId: adminModerationAction.adminUserId,
						adminName: user.name,
						createdAt: adminModerationAction.createdAt,
					})
					.from(adminModerationAction)
					.innerJoin(user, eq(user.id, adminModerationAction.adminUserId))
					.where(where)
					.orderBy(
						desc(adminModerationAction.createdAt),
						desc(adminModerationAction.id)
					)
					.limit(input.pageSize)
					.offset(offset),
				db.select({ value: count() }).from(adminModerationAction).where(where),
			]);

			return {
				items,
				page: input.page,
				pageSize: input.pageSize,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	listReviews: protectedProcedure
		.input(listReviewsInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const where = input.status ? eq(review.status, input.status) : undefined;
			const offset = (input.page - 1) * input.pageSize;

			const itemsQuery = db
				.select({
					id: review.id,
					body: review.body,
					rating: review.rating,
					status: review.status,
					riskFlags: review.riskFlags,
					isAnonymous: review.isAnonymous,
					reviewerUserId: review.reviewerUserId,
					reviewerDisplayName: user.name,
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
				.leftJoin(user, eq(review.reviewerUserId, user.id))
				.where(where)
				.orderBy(desc(review.createdAt), desc(review.id))
				.limit(input.pageSize)
				.offset(offset);
			const countQuery = db
				.select({ value: count() })
				.from(review)
				.where(where);
			const [items, [totalRow]] = await Promise.all([itemsQuery, countQuery]);

			return {
				items,
				page: input.page,
				pageSize: input.pageSize,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	setReviewStatus: protectedProcedure
		.input(setReviewStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);
			const eventId = randomUUID();

			const transitionResult = await db.transaction(async (tx) => {
				const transition = await transitionReviewPoints(tx, {
					eventId,
					nextStatus: input.status,
					reviewId: input.reviewId,
				});
				const updated = transition?.review;

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

				return transition;
			});
			const updated = transitionResult.review;
			if (
				transitionResult.transactionId &&
				transitionResult.appliedPoints !== 0
			) {
				await notifyBambiNotification({
					actorUserId: admin.userId,
					metadata: {
						action:
							input.status === "hidden"
								? "review_hidden"
								: "review_republished",
						amount: transitionResult.appliedPoints,
						reason: input.reason,
					},
					recipientUserId: transitionResult.reviewerUserId,
					targetId: transitionResult.transactionId,
					targetType: "point_transaction",
				});
			}

			// 후기 알림 딥링크는 metadata.jobPostId로 공고 상세를 연다 — 없으면 알림함으로
			// 떨어진다(web notification-labels: case "review").
			await notifyModerationAction({
				action: `set_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: { jobPostId: updated.jobPostId },
				reason: input.reason,
				targetId: input.reviewId,
				targetType: "review",
			});

			return updated;
		}),

	bulkSetReviewStatus: protectedProcedure
		.input(bulkSetReviewStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			// 알림 딥링크(metadata.jobPostId)용 — 갱신된 행에서만 얻을 수 있어 여기 모은다.
			const jobPostIdByReviewId = new Map<string, string>();
			const pointTransitionByReviewId = new Map<
				string,
				NonNullable<Awaited<ReturnType<typeof transitionReviewPoints>>>
			>();

			const result = await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (reviewId) => {
							const transition = await transitionReviewPoints(tx, {
								eventId: randomUUID(),
								nextStatus: input.status,
								reviewId,
							});
							const updated = transition?.review;

							if (!updated) {
								throw new ORPCError("NOT_FOUND", {
									message: "Review was not found.",
								});
							}

							jobPostIdByReviewId.set(reviewId, updated.jobPostId);
							pointTransitionByReviewId.set(reviewId, transition);

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

			// 알림은 트랜잭션 밖에서 성공분에만 보낸다(항목별 실패가 섞인다).
			for (const reviewId of succeededBulkTargetIds(input.reviewIds, result)) {
				const pointTransition = pointTransitionByReviewId.get(reviewId);
				if (
					pointTransition?.transactionId &&
					pointTransition.appliedPoints !== 0
				) {
					await notifyBambiNotification({
						actorUserId: admin.userId,
						metadata: {
							action:
								input.status === "hidden"
									? "review_hidden"
									: "review_republished",
							amount: pointTransition.appliedPoints,
							reason: input.reason,
						},
						recipientUserId: pointTransition.reviewerUserId,
						targetId: pointTransition.transactionId,
						targetType: "point_transaction",
					});
				}
				await notifyModerationAction({
					action: `set_status:${input.status}`,
					actorUserId: admin.userId,
					metadata: {
						bulk: true,
						jobPostId: jobPostIdByReviewId.get(reviewId),
					},
					reason: input.reason,
					targetId: reviewId,
					targetType: "review",
				});
			}

			return result;
		}),

	setReportStatus: protectedProcedure
		.input(setReportStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const updated = await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(report)
					.set({
						resolutionReason:
							input.status === "dismissed" || input.status === "resolved"
								? input.reason
								: null,
						status: input.status,
					})
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

			await emitChatReportAvailabilityChanged(
				updated.targetType,
				updated.targetId
			);
			// 알림 수신자는 신고당한 콘텐츠 주인이 아니라 신고자다 — targetType은 "report".
			await notifyModerationAction({
				action: `set_report_status:${input.status}`,
				actorUserId: admin.userId,
				reason: input.reason,
				targetId: input.reportId,
				targetType: "report",
			});
			return updated;
		}),

	bulkSetReportStatus: protectedProcedure
		.input(bulkSetReportStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);
			const updatedChatTargets: Array<{
				targetId: string;
				targetType: ReportRow["targetType"];
			}> = [];

			const result = await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (reportId) => {
							const [updated] = await tx
								.update(report)
								.set({
									resolutionReason:
										input.status === "dismissed" || input.status === "resolved"
											? input.reason
											: null,
									status: input.status,
								})
								.where(
									and(
										eq(report.id, reportId),
										inArray(report.status, ["open", "reviewing"])
									)
								)
								.returning();

							if (!updated) {
								throw new ORPCError("CONFLICT", {
									message: "이미 조치 완료되거나 기각된 신고입니다.",
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

							if (
								updated.targetType === "chat_room" ||
								updated.targetType === "chat_message"
							) {
								updatedChatTargets.push({
									targetId: updated.targetId,
									targetType: updated.targetType,
								});
							}
						},
						targetIds: input.reportIds,
					})
			);

			await Promise.all(
				updatedChatTargets.map(({ targetId, targetType }) =>
					emitChatReportAvailabilityChanged(targetType, targetId)
				)
			);
			for (const reportId of succeededBulkTargetIds(input.reportIds, result)) {
				await notifyModerationAction({
					action: `set_report_status:${input.status}`,
					actorUserId: admin.userId,
					metadata: { bulk: true },
					reason: input.reason,
					targetId: reportId,
					targetType: "report",
				});
			}

			return result;
		}),

	setJobPostStatus: protectedProcedure
		.input(setJobPostStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const { previousStatus, updated } = await db.transaction(async (tx) => {
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
				const refundLockPatch =
					input.status === "published" &&
					existing.paymentStatus === "paid" &&
					existing.pointsUsed > 0
						? {
								pointsRefundLockedAt:
									existing.pointsRefundLockedAt ?? new Date(),
							}
						: {};

				const [updated] = await tx
					.update(jobPost)
					.set({ ...statusPatch, ...refundLockPatch })
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

				return { previousStatus: existing.status, updated };
			});

			await notifyModerationAction({
				action: `set_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: buildJobPostStatusNotificationMetadata({
					paymentStatus: updated.paymentStatus,
					previousStatus,
				}),
				reason: input.reason,
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return updated;
		}),

	setJobPostPayment: protectedProcedure
		.input(setJobPostPaymentInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			// 배너형 승인(unpaid→paid)은 프리미엄 정원 게이트가 필요하므로 트랜잭션 안에서
			// advisory lock으로 직렬화한다(assertPremiumApprovalWithinCapacity).
			const { changed, organizationId, updated } = await db.transaction(
				async (tx) => {
					const now = new Date();
					const [existing] = await tx
						.select()
						.from(jobPost)
						.where(eq(jobPost.id, input.jobPostId))
						.limit(1);

					if (!existing) {
						throw new ORPCError("NOT_FOUND");
					}

					// 같은 상태 재확정은 멱등 처리한다(confirmPurchasePayment와 동일 패턴) — 이미
					// paid인 리스팅에 결제완료를 다시 걸면 만석 섹션에서 exposureEndsAt=null로
					// 재계산돼 노출 중인 광고가 대기열 맨 뒤로 강등되고(listingPaidAt 리셋), 배너는
					// 노출 시계가 부당 연장된다. changed=false로 알림·캐시 동기화도 건너뛴다(#4).
					if (existing.paymentStatus === input.paymentStatus) {
						return {
							changed: false,
							organizationId: existing.organizationId,
							updated: existing,
						};
					}

					await assertPremiumApprovalWithinCapacity({
						executor: tx,
						existingExposureType: existing.exposureType,
						existingPaymentStatus: existing.paymentStatus,
						newPaymentStatus: input.paymentStatus,
						now,
					});

					// 스페셜/추천 리스팅은 승인 게이트 대신 FIFO 유료 대기열을 탄다 — 정원이 차 있으면
					// 결제는 성공하되 exposureEndsAt=null로 대기(노출 시계 미시작), 자리가 나면 틱이 승격한다.
					// 정원 내면 즉시 활성화(now+기간). 그 외(배너·비리스팅)는 기존 규칙 그대로.
					const { exposureEndsAt, listingPaidAt } =
						await resolveListingPaymentExposure({
							executor: tx,
							exposureType: existing.exposureType,
							exposureDurationDays: existing.exposureDurationDays,
							newPaymentStatus: input.paymentStatus,
							now,
						});

					await syncBundledBoostPurchasePayment({
						executor: tx,
						jobPostId: input.jobPostId,
						now,
						paymentStatus: input.paymentStatus,
					});

					const [row] = await tx
						.update(jobPost)
						.set({
							exposureEndsAt,
							listingPaidAt,
							paymentStatus: input.paymentStatus,
							pointsRefundLockedAt:
								input.paymentStatus === "paid" && existing.pointsUsed > 0
									? (existing.pointsRefundLockedAt ?? now)
									: existing.pointsRefundLockedAt,
						})
						.where(eq(jobPost.id, input.jobPostId))
						.returning();

					if (!row) {
						throw new ORPCError("NOT_FOUND");
					}

					// unpaid→paid 전환일 때만 조직 누적 원장에 append. 무료(adProductId null) 공고는 제외한다.
					// same-status는 위에서 이미 단락돼(changed=false) 여기 도달하지 않으므로 자연 멱등.
					if (input.paymentStatus === "paid") {
						const ledgerRow = buildAdLedgerInsert(
							input.jobPostId,
							existing,
							"moderation_single"
						);
						if (ledgerRow) {
							await tx.insert(jobAdPurchase).values(ledgerRow);
						}
					}

					return {
						changed: true,
						organizationId: existing.organizationId,
						updated: row,
					};
				}
			);

			// 상태가 실제로 바뀐 경우에만 캐시 동기화·알림을 수행한다 — same-status 멱등 단락에서는
			// 노출·순번이 그대로라 어느 쪽도 재실행할 이유가 없다(#4).
			if (changed) {
				// 결제 상태 전환은 공개 게이트(published AND paid)를 넘나들 수 있으므로
				// 해당 조직 owner/admin의 수다방 광고 자격 캐시를 재동기화한다.
				await syncAdvertiserFlagForOrganization({
					now: new Date(),
					organizationId,
				});

				// unpaid→paid가 노출 개시라, 구인자에게는 "광고가 시작됐다"는 유일한 신호다. 단, 스페셜/추천이
				// 만석 대기열로 들어갔으면(exposureEndsAt=null) 게시가 아니라 접수라 순번을 붙여 다르게 알린다.
				const queuedNow =
					input.paymentStatus === "paid" && isQueuedListingRow(updated);
				const position = queuedNow
					? ((await getListingQueuePositions(db)).get(input.jobPostId)
							?.position ?? null)
					: null;
				const notification = buildListingPaymentNotification({
					bulk: false,
					paymentStatus: input.paymentStatus,
					position,
					row: updated,
				});
				await notifyModerationAction({
					action: notification.action,
					actorUserId: admin.userId,
					metadata: notification.metadata,
					targetId: input.jobPostId,
					targetType: "job_post",
				});
			}

			return updated;
		}),

	// 디자인 제작 진행 상태 토글. 신청하지 않은 공고에는 상태를 세울 수 없다 —
	// 금액 스냅샷 없이 상태만 서면 결제 관리에서 "받은 돈 없는 제작 건"이 생긴다.
	setJobPostDesignStatus: adminProcedure
		.input(setJobPostDesignStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const updated = await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ detailDesignStatus: jobPost.detailDesignStatus })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND");
				}

				if (existing.detailDesignStatus === null) {
					throw new ORPCError("BAD_REQUEST", {
						message: "상세이미지 디자인 제작을 신청하지 않은 공고입니다.",
					});
				}

				const [row] = await tx
					.update(jobPost)
					.set({ detailDesignStatus: input.status })
					.where(eq(jobPost.id, input.jobPostId))
					.returning();

				if (!row) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					action: `set_detail_design_status:${input.status}`,
					adminUserId: admin.userId,
					metadata: { previousStatus: existing.detailDesignStatus },
					reason: "상세이미지 디자인 제작 상태 변경",
					targetId: input.jobPostId,
					targetType: "job_post",
				});

				return row;
			});

			// 완료 처리는 구인자에게 "상세이미지가 올라갔다"는 유일한 신호다.
			await notifyModerationAction({
				action: `set_detail_design_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: { jobPostTitle: updated.title },
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return updated;
		}),

	// 운영자가 완성본을 직접 올린다. 서명 URL의 조직 prefix는 반드시 **대상 공고의 조직**이어야
	// 한다 — 운영자 자신의 조직으로 발급하면 저장 단계의 isOwnedJobPostMediaKey에 걸린다.
	createJobPostDesignMediaUpload: adminProcedure
		.input(createJobPostDesignMediaUploadInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const [target] = await db
				.select({ organizationId: jobPost.organizationId })
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!target) {
				throw new ORPCError("NOT_FOUND");
			}

			const policy = validateJobPostImageUpload({
				byteSize: input.byteSize,
				fileName: input.fileName,
				mimeType: input.mimeType,
				usage: "detail",
			});

			if (!policy.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"상세 이미지는 JPG·PNG·WebP 형식의 10MB 이하 파일만 등록할 수 있습니다.",
				});
			}

			return await createJobPostMediaUploadIntent({
				actorUserId: admin.userId,
				byteSize: input.byteSize,
				fileName: input.fileName,
				mimeType: input.mimeType,
				organizationId: target.organizationId,
			});
		}),

	// 상세 이미지(usage=detail) 전량 교체. 5장 제한은 기존 정책을 그대로 태우고, 교체에서
	// 빠진 키는 트랜잭션 커밋 뒤에만 GCS에서 지운다(롤백된 변경으로 원본을 잃지 않게).
	setJobPostDesignMedia: adminProcedure
		.input(setJobPostDesignMediaInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const [target] = await db
				.select({ organizationId: jobPost.organizationId })
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!target) {
				throw new ORPCError("NOT_FOUND");
			}

			const rows = input.detail.map((item, index) => ({
				...item,
				position: index,
				usage: "detail" as const,
			}));
			const policy = validateJobPostMediaSet(rows);

			if (!policy.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message: `상세 이미지는 최대 ${JOB_POST_DETAIL_IMAGE_LIMIT}장까지, JPG·PNG·WebP 10MB 이하만 등록할 수 있습니다.`,
				});
			}

			for (const row of rows) {
				if (
					!isOwnedJobPostMediaKey({
						organizationId: target.organizationId,
						storageKey: row.storageKey,
					})
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "이 공고의 조직에 속하지 않은 이미지 키입니다.",
					});
				}
			}

			const { detail, removedKeys } = await db.transaction(async (tx) => {
				// 스냅샷도 tx 안에서 읽는다. 밖에서 읽으면 그 사이 끼어든 detail 행이 삭제 대상
				// 목록에 빠져 GCS 객체만 영영 남는다.
				const previousKeys = await tx
					.select({ storageKey: jobPostMedia.storageKey })
					.from(jobPostMedia)
					.where(
						and(
							eq(jobPostMedia.jobPostId, input.jobPostId),
							eq(jobPostMedia.usage, "detail")
						)
					);

				await tx
					.delete(jobPostMedia)
					.where(
						and(
							eq(jobPostMedia.jobPostId, input.jobPostId),
							eq(jobPostMedia.usage, "detail")
						)
					);

				const inserted =
					rows.length === 0
						? []
						: await tx
								.insert(jobPostMedia)
								.values(
									rows.map((row) => ({
										altText: row.altText.trim(),
										byteSize: row.byteSize,
										fileName: row.fileName.trim(),
										height: row.height ?? null,
										jobPostId: input.jobPostId,
										mimeType: row.mimeType,
										organizationId: target.organizationId,
										position: row.position,
										storageKey: row.storageKey,
										uploadedByUserId: admin.userId,
										usage: row.usage,
										width: row.width ?? null,
									}))
								)
								.returning();

				const retained = new Set(rows.map((row) => row.storageKey));
				const removed = previousKeys
					.map((row) => row.storageKey)
					.filter((key) => !retained.has(key));

				// 남의 조직 자산을 파괴적으로 교체하는 조치라 흔적을 남긴다.
				await tx.insert(adminModerationAction).values({
					action: "set_detail_design_media",
					adminUserId: admin.userId,
					metadata: {
						removedCount: removed.length,
						savedCount: inserted.length,
					},
					reason: "상세이미지 디자인 완성본 등록",
					targetId: input.jobPostId,
					targetType: "job_post",
				});

				return { detail: inserted, removedKeys: removed };
			});

			await deletePublicObjects(removedKeys);

			return { detail };
		}),

	// 공고의 광고 종료일만 앞뒤로 민다. 결제 상태·노출 종류는 그대로라 프리미엄 정원(자리 수)에
	// 영향이 없어 승인 게이트를 타지 않는다. 음수(단축)로 과거까지 내리는 것도 허용한다(즉시 만료 조치).
	// 기준일은 `exposureEndsAt ?? now` 단일 규칙이라, 종료일이 없던 공고(미결제·무기한)는 지금
	// 기준으로 종료일이 새로 설정된다 — 즉 무기한 공고에 적용하면 무기한 → 기한부로 바뀐다.
	adjustJobPostExposure: adminProcedure
		.input(adjustJobPostExposureInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const { organizationId, updated } = await db.transaction(async (tx) => {
				// 이전 종료일은 감사 로그 스냅샷 전용으로만 읽는다(FOR UPDATE로 잠가 동시
				// 조정 간 로그가 어긋나지 않게 한다). 실제 종료일 계산은 아래 원자 UPDATE가
				// `coalesce(현재값, now()) + make_interval`로 SQL에서 수행하므로 이 값이
				// 계산에 개입하지 않는다 — read-modify-write 경합을 제거한다.
				const [existing] = await tx
					.select({ exposureEndsAt: jobPost.exposureEndsAt })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.for("update")
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND");
				}

				const [row] = await tx
					.update(jobPost)
					.set({
						exposureEndsAt: sql`coalesce(${jobPost.exposureEndsAt}, now()) + make_interval(days => ${input.days})`,
					})
					.where(eq(jobPost.id, input.jobPostId))
					.returning();

				if (!row) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "job_post",
					targetId: input.jobPostId,
					action: `adjust_job_post_exposure:${input.days > 0 ? "+" : ""}${input.days}`,
					reason: input.reason,
					metadata: {
						days: input.days,
						exposureEndsAt: row.exposureEndsAt?.toISOString() ?? null,
						previousExposureEndsAt:
							existing.exposureEndsAt?.toISOString() ?? null,
					},
				});

				return { organizationId: row.organizationId, updated: row };
			});

			// 종료일이 과거/미래를 넘나들면 광고 유효 여부가 뒤집히므로 수다방 광고 자격
			// 캐시(is_advertiser)를 재동기화한다(setJobPostPayment와 동일 이유).
			await syncAdvertiserFlagForOrganization({
				now: new Date(),
				organizationId,
			});

			await notifyModerationAction({
				action: `adjust_job_post_exposure:${input.days > 0 ? "+" : ""}${input.days}`,
				actorUserId: admin.userId,
				// 공고를 여러 개 굴리는 업주는 제목이 없으면 어느 공고가 조정됐는지 알 수 없다.
				metadata: { days: input.days, jobPostTitle: updated.title },
				reason: input.reason,
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return updated;
		}),

	// 대기 중(paid·미노출)인 스페셜/추천 리스팅을 대기열에서 뺀다 — 결제를 unpaid로 되돌리고
	// listingPaidAt(FIFO 키)·exposureEndsAt을 비운다. 이미 활성(노출 중)이거나 비리스팅·미결제
	// 공고는 대상이 아니라 BAD_REQUEST로 막는다. adjustJobPostExposure와 같은 흐름.
	removeFromListingQueue: adminProcedure
		.input(removeFromListingQueueInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const { organizationId, updated } = await db.transaction(async (tx) => {
				const now = new Date();
				const [existing] = await tx
					.select({
						exposureEndsAt: jobPost.exposureEndsAt,
						exposureType: jobPost.exposureType,
						organizationId: jobPost.organizationId,
						paymentStatus: jobPost.paymentStatus,
					})
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND");
				}

				// 대기열 정의: paid + 리스팅 종류 + exposureEndsAt IS NULL(노출 시계 미시작).
				const isQueuedListing =
					existing.paymentStatus === "paid" &&
					(existing.exposureType === "special" ||
						existing.exposureType === "recommended") &&
					existing.exposureEndsAt === null;
				if (!isQueuedListing) {
					throw new ORPCError("BAD_REQUEST", {
						message: "대기열에 있는 리스팅 공고만 대기열에서 뺄 수 있어요.",
					});
				}

				await syncBundledBoostPurchasePayment({
					executor: tx,
					jobPostId: input.jobPostId,
					now,
					paymentStatus: "unpaid",
				});

				const [row] = await tx
					.update(jobPost)
					.set({
						exposureEndsAt: null,
						listingPaidAt: null,
						paymentStatus: "unpaid",
					})
					.where(eq(jobPost.id, input.jobPostId))
					.returning();

				if (!row) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					action: "remove_from_listing_queue",
					adminUserId: admin.userId,
					metadata: { previousExposureType: existing.exposureType },
					reason: input.reason,
					targetId: input.jobPostId,
					targetType: "job_post",
				});

				return { organizationId: existing.organizationId, updated: row };
			});

			// 대기열에서 빠지면 미결제로 돌아가 공개 게이트(published AND paid)를 벗어나므로
			// 해당 조직의 수다방 광고 자격 캐시를 재동기화한다(setJobPostPayment와 동일 이유).
			await syncAdvertiserFlagForOrganization({
				now: new Date(),
				organizationId,
			});

			await notifyModerationAction({
				action: "remove_from_listing_queue",
				actorUserId: admin.userId,
				metadata: { jobPostTitle: updated.title },
				reason: input.reason,
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return updated;
		}),

	// 운영자 정원 카드용 섹션별 대기열 목록(스페셜/추천). 대기 판정은 queuedListingWhere 단일
	// 소스, 순번은 FIFO(listing_paid_at asc). 가드·프로시저 종류는 removeFromListingQueue와 동일.
	listListingQueues: adminProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);

		const [recommended, special] = await Promise.all([
			listListingQueueSection("recommended"),
			listListingQueueSection("special"),
		]);

		return { recommended, special };
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
				or(
					isNotNull(jobPost.adProductId),
					gt(jobPost.pointsUsed, 0),
					sql`exists (select 1 from ${jobBoostPurchase} where ${jobBoostPurchase.jobPostId} = ${jobPost.id} and ${jobBoostPurchase.purchaseSource} = 'job_registration')`
				),
			];

			if (input.onlyUnpaid) {
				conditions.push(eq(jobPost.paymentStatus, "unpaid"));
			}

			if (input.onlyDetailDesign) {
				conditions.push(isNotNull(jobPost.detailDesignStatus));
			}

			const rows = await db
				.select({
					id: jobPost.id,
					title: jobPost.title,
					status: jobPost.status,
					exposureType: jobPost.exposureType,
					exposureAmount: jobPost.exposureAmount,
					detailDesignAmount: jobPost.detailDesignAmount,
					detailDesignStatus: jobPost.detailDesignStatus,
					pointsUsed: jobPost.pointsUsed,
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

			const bundledPurchases =
				rows.length === 0
					? []
					: await db
							.select({
								amount: jobBoostPurchase.amount,
								jobPostId: jobBoostPurchase.jobPostId,
								optionType: jobBoostPurchase.optionType,
							})
							.from(jobBoostPurchase)
							.where(
								and(
									inArray(
										jobBoostPurchase.jobPostId,
										rows.map((row) => row.id)
									),
									eq(jobBoostPurchase.purchaseSource, "job_registration")
								)
							)
							.orderBy(asc(jobBoostPurchase.createdAt));
			const bundledByJobPostId = new Map<string, typeof bundledPurchases>();
			for (const purchase of bundledPurchases) {
				const current = bundledByJobPostId.get(purchase.jobPostId) ?? [];
				current.push(purchase);
				bundledByJobPostId.set(purchase.jobPostId, current);
			}

			// 결제관리 목록도 대기 공고에 FIFO 순번을 보여주므로 요청당 1회 뽑아 부착한다.
			const positions = await getListingQueuePositions(db);
			return rows.map((row) => ({
				...row,
				boostPurchases: bundledByJobPostId.get(row.id) ?? [],
				listingQueuePosition: positions.get(row.id)?.position ?? null,
			}));
		}),

	bulkSetJobPostStatus: protectedProcedure
		.input(bulkSetJobPostStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			// 단건 경로와 같은 문구 분기를 쓰려면 전이 전 상태·결제 상태가 필요하다 —
			// 알림 루프는 트랜잭션 밖이라 처리하면서 모아 둔다(affectedOrganizationIds와 같은 패턴).
			const notificationMetadataByJobPostId = new Map<
				string,
				ReturnType<typeof buildJobPostStatusNotificationMetadata>
			>();

			const result = await db.transaction(
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

							notificationMetadataByJobPostId.set(
								jobPostId,
								buildJobPostStatusNotificationMetadata({
									paymentStatus: existing.paymentStatus,
									previousStatus: existing.status,
								})
							);

							await tx
								.update(jobPost)
								.set({
									...getJobPostModerationStatusPatch({
										existing,
										reason: input.reason,
										status: input.status,
									}),
									pointsRefundLockedAt:
										input.status === "published" &&
										existing.paymentStatus === "paid" &&
										existing.pointsUsed > 0
											? (existing.pointsRefundLockedAt ?? new Date())
											: existing.pointsRefundLockedAt,
								})
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

			for (const jobPostId of succeededBulkTargetIds(
				input.jobPostIds,
				result
			)) {
				await notifyModerationAction({
					action: `set_status:${input.status}`,
					actorUserId: admin.userId,
					metadata: {
						bulk: true,
						...notificationMetadataByJobPostId.get(jobPostId),
					},
					reason: input.reason,
					targetId: jobPostId,
					targetType: "job_post",
				});
			}

			return result;
		}),

	// 결제관리 목록에서 선택한 공고들의 결제 상태를 일괄 전환한다.
	// 단건 setJobPostPayment와 동일하게 paid 전환 시 노출 만료일(exposureEndsAt)을 계산한다.
	bulkSetJobPostPayment: protectedProcedure
		.input(bulkSetJobPostPaymentInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			// 갱신에 성공한 공고들의 조직 유니크 집합 — 트랜잭션 커밋 후 광고 자격 캐시 동기화용.
			const affectedOrganizationIds = new Set<string>();
			// 같은 상태 재확정으로 무변경 처리된 공고들 — 성공으로 치되 알림·캐시 대상에서 뺀다(#4).
			const noopJobPostIds = new Set<string>();

			const result = await db.transaction(
				async (tx) =>
					await executeBulkModeration({
						processTarget: async (jobPostId) => {
							const now = new Date();
							const [existing] = await tx
								.select({
									adProductId: jobPost.adProductId,
									exposureAmount: jobPost.exposureAmount,
									exposureDurationDays: jobPost.exposureDurationDays,
									exposureType: jobPost.exposureType,
									organizationId: jobPost.organizationId,
									paymentStatus: jobPost.paymentStatus,
									pointsRefundLockedAt: jobPost.pointsRefundLockedAt,
									pointsUsed: jobPost.pointsUsed,
								})
								.from(jobPost)
								.where(eq(jobPost.id, jobPostId))
								.limit(1);

							if (!existing) {
								throw new ORPCError("NOT_FOUND", {
									message: "Job post was not found.",
								});
							}

							// 같은 상태 재확정은 항목 단위 no-op(#4, 단건과 동일). 성공으로 치되
							// 아무것도 바꾸지 않고, 커밋 후 알림·캐시 동기화 대상에서도 뺀다 —
							// 이미 paid인 리스팅을 재확정하면 노출 중인 광고가 대기열로 강등된다.
							if (existing.paymentStatus === input.paymentStatus) {
								noopJobPostIds.add(jobPostId);
								return;
							}

							// 정원 초과 승인은 항목별 실패로 떨어진다(CONFLICT). 같은 트랜잭션에서
							// 앞선 승인이 반영돼 active가 늘므로, 정원 내 앞 항목만 성공한다.
							await assertPremiumApprovalWithinCapacity({
								executor: tx,
								existingExposureType: existing.exposureType,
								existingPaymentStatus: existing.paymentStatus,
								newPaymentStatus: input.paymentStatus,
								now,
							});

							// 스페셜/추천 리스팅은 승인 게이트 없이 FIFO 대기열을 탄다 — 정원 내 항목은
							// 즉시 활성화되고, 같은 트랜잭션의 앞선 활성화가 뒤 항목의 active 카운트에
							// 보이므로 처리 순서대로 자리를 채운다. 정원이 차면 대기(exposureEndsAt=null).
							const { exposureEndsAt, listingPaidAt } =
								await resolveListingPaymentExposure({
									executor: tx,
									exposureType: existing.exposureType,
									exposureDurationDays: existing.exposureDurationDays,
									newPaymentStatus: input.paymentStatus,
									now,
								});

							await syncBundledBoostPurchasePayment({
								executor: tx,
								jobPostId,
								now,
								paymentStatus: input.paymentStatus,
							});

							await tx
								.update(jobPost)
								.set({
									exposureEndsAt,
									listingPaidAt,
									paymentStatus: input.paymentStatus,
									pointsRefundLockedAt:
										input.paymentStatus === "paid" && existing.pointsUsed > 0
											? (existing.pointsRefundLockedAt ?? now)
											: existing.pointsRefundLockedAt,
								})
								.where(eq(jobPost.id, jobPostId));

							if (input.paymentStatus === "paid") {
								const ledgerRow = buildAdLedgerInsert(
									jobPostId,
									existing,
									"moderation_bulk"
								);
								if (ledgerRow) {
									await tx.insert(jobAdPurchase).values(ledgerRow);
								}
							}

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

			// 정원 초과로 CONFLICT 난 공고는 승인되지 않았다 — 성공분에만 결과를 알린다. 스페셜/추천이
			// 만석 대기열로 들어갔으면(exposureEndsAt=null) "노출 개시"가 아니라 "대기열 접수"라 순번을
			// 붙여 다르게 알린다. 성공분 행과 순번 맵을 각각 1회만 뽑아 행별로 문구를 가른다.
			const succeededIds = succeededBulkTargetIds(input.jobPostIds, result);
			const succeededRows =
				succeededIds.length > 0
					? await db
							.select({
								exposureEndsAt: jobPost.exposureEndsAt,
								exposureType: jobPost.exposureType,
								id: jobPost.id,
								listingPaidAt: jobPost.listingPaidAt,
								title: jobPost.title,
							})
							.from(jobPost)
							.where(inArray(jobPost.id, succeededIds))
					: [];
			const succeededRowById = new Map(
				succeededRows.map((row) => [row.id, row] as const)
			);
			// 순번 맵은 대기열 행이 하나라도 있을 때만 1회 뽑는다(즉시 활성화·unpaid엔 불필요).
			const queuePositions =
				input.paymentStatus === "paid" && succeededRows.some(isQueuedListingRow)
					? await getListingQueuePositions(db)
					: null;

			for (const jobPostId of succeededIds) {
				// 무변경(same-status) 건은 실제 전환이 없었으므로 알림을 보내지 않는다(#4).
				if (noopJobPostIds.has(jobPostId)) {
					continue;
				}
				const notification = buildListingPaymentNotification({
					bulk: true,
					paymentStatus: input.paymentStatus,
					position: queuePositions?.get(jobPostId)?.position ?? null,
					row: succeededRowById.get(jobPostId),
				});
				await notifyModerationAction({
					action: notification.action,
					actorUserId: admin.userId,
					metadata: notification.metadata,
					targetId: jobPostId,
					targetType: "job_post",
				});
			}

			return result;
		}),

	setUserStatus: protectedProcedure
		.input(setUserStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);
			await normalizeExpiredWarningRestriction(input.targetUserId);

			return await db.transaction(async (tx) => {
				const [current] = await tx
					.select({
						status: bambiProfile.status,
						warningRestrictionUntil: bambiProfile.warningRestrictionUntil,
					})
					.from(bambiProfile)
					.where(eq(bambiProfile.userId, input.targetUserId))
					.limit(1)
					.for("update");

				if (!current) {
					// 계정 상태는 bambi_profile에만 있어 온보딩 전 계정은 갱신할 행이 없다.
					// NOT_FOUND면 운영자가 "왜 실패했는지" 알 수 없어 원인을 그대로 알려준다.
					throw new ORPCError("BAD_REQUEST", {
						message: PROFILELESS_SANCTION_MESSAGE,
					});
				}

				let nextStatus = input.status;
				let warningRestrictionUntil: Date | null = null;
				if (input.status === "warned") {
					const [countRow] = await tx
						.select({ value: activeWarningsCountSql(input.targetUserId) })
						.from(bambiProfile)
						.where(eq(bambiProfile.userId, input.targetUserId))
						.limit(1);
					const nextWarningCount = (countRow?.value ?? 0) + 1;
					if (nextWarningCount === WARNING_RESTRICTION_THRESHOLD) {
						nextStatus =
							current.status === "suspended" ? "suspended" : "warned";
						warningRestrictionUntil = new Date(
							Date.now() + WARNING_RESTRICTION_DURATION_MS
						);
					} else {
						nextStatus = current.status;
						warningRestrictionUntil = current.warningRestrictionUntil;
					}
				}

				const [updated] = await tx
					.update(bambiProfile)
					.set({
						status: nextStatus,
						warningRestrictionUntil:
							input.status === "active" || input.status === "suspended"
								? null
								: warningRestrictionUntil,
					})
					.where(eq(bambiProfile.userId, input.targetUserId))
					.returning();

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

	revertLatestWarning: protectedProcedure
		.input(revertLatestWarningInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);
			await normalizeExpiredWarningRestriction(input.targetUserId);

			return await db.transaction(async (tx) => {
				const [current] = await tx
					.select({ status: bambiProfile.status })
					.from(bambiProfile)
					.where(eq(bambiProfile.userId, input.targetUserId))
					.limit(1)
					.for("update");
				if (!current) {
					throw new ORPCError("BAD_REQUEST", {
						message: PROFILELESS_SANCTION_MESSAGE,
					});
				}

				const [latestWarning] = await tx
					.select({ id: warningAction.id })
					.from(warningAction)
					.where(
						and(
							eq(warningAction.targetType, "user"),
							eq(warningAction.targetId, input.targetUserId),
							eq(warningAction.action, "set_status:warned"),
							sql`not exists (
								select 1 from "admin_moderation_action" as warning_reversal
								where ${warningReversal.targetType} = 'user'
									and ${warningReversal.targetId} = ${warningAction.targetId}
									and ${warningReversal.action} = 'revert_warning'
									and ${warningReversal.metadata}->>'warningActionId' = ${warningAction.id}::text
							)`
						)
					)
					.orderBy(desc(warningAction.createdAt), desc(warningAction.id))
					.limit(1);
				if (!latestWarning) {
					throw new ORPCError("CONFLICT", {
						message: "되돌릴 경고가 없습니다.",
					});
				}

				await tx.insert(adminModerationAction).values({
					action: "revert_warning",
					adminUserId: admin.userId,
					metadata: { warningActionId: latestWarning.id },
					reason: input.reason,
					targetId: input.targetUserId,
					targetType: "user",
				});

				const [countRow] = await tx
					.select({ value: activeWarningsCountSql(input.targetUserId) })
					.from(bambiProfile)
					.where(eq(bambiProfile.userId, input.targetUserId))
					.limit(1);
				const warningsCount = countRow?.value ?? 0;
				const shouldClearRestriction =
					warningsCount < WARNING_RESTRICTION_THRESHOLD;
				const [updated] = await tx
					.update(bambiProfile)
					.set({
						status:
							shouldClearRestriction && current.status === "warned"
								? "active"
								: current.status,
						warningRestrictionUntil: shouldClearRestriction ? null : undefined,
					})
					.where(eq(bambiProfile.userId, input.targetUserId))
					.returning();

				return { profile: updated, warningsCount };
			});
		}),

	// 법률 자문 계정 지정·해제. 제재(setUserStatus)와 같은 트랜잭션 문법이지만 바꾸는 축이
	// status가 아니라 role이고, 감사 로그 action은 set_role:<역할>로 남긴다.
	setUserRole: adminProcedure
		.input(setUserRoleInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [current] = await tx
					.select({ role: bambiProfile.role })
					.from(bambiProfile)
					.where(eq(bambiProfile.userId, input.targetUserId))
					.limit(1);

				if (!current) {
					// 역할은 bambi_profile에만 있어 온보딩 전 계정에는 지정할 행이 없다.
					throw new ORPCError("BAD_REQUEST", {
						message: PROFILELESS_ROLE_MESSAGE,
					});
				}
				assertLegalAdvisorRoleSwitch(current.role, input.role);

				const [updated] = await tx
					.update(bambiProfile)
					.set({ role: input.role })
					.where(eq(bambiProfile.userId, input.targetUserId))
					.returning();

				await tx.insert(adminModerationAction).values({
					action: `set_role:${input.role}`,
					adminUserId: admin.userId,
					reason: input.reason,
					targetId: input.targetUserId,
					targetType: "user",
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
						// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bulk transitions mirror the single-user transactional warning policy.
						processTarget: async (targetUserId) => {
							const [current] = await tx
								.select({
									status: bambiProfile.status,
									warningRestrictionUntil: bambiProfile.warningRestrictionUntil,
								})
								.from(bambiProfile)
								.where(eq(bambiProfile.userId, targetUserId))
								.limit(1)
								.for("update");
							if (!current) {
								throw new ORPCError("BAD_REQUEST", {
									message: PROFILELESS_SANCTION_MESSAGE,
								});
							}

							let nextStatus = input.status;
							let warningRestrictionUntil: Date | null = null;
							if (input.status === "warned") {
								const [countRow] = await tx
									.select({ value: activeWarningsCountSql(targetUserId) })
									.from(bambiProfile)
									.where(eq(bambiProfile.userId, targetUserId))
									.limit(1);
								const nextWarningCount = (countRow?.value ?? 0) + 1;
								if (nextWarningCount === WARNING_RESTRICTION_THRESHOLD) {
									nextStatus =
										current.status === "suspended" ? "suspended" : "warned";
									warningRestrictionUntil = new Date(
										Date.now() + WARNING_RESTRICTION_DURATION_MS
									);
								} else {
									nextStatus = current.status;
									warningRestrictionUntil = current.warningRestrictionUntil;
								}
							}

							const [updated] = await tx
								.update(bambiProfile)
								.set({
									status: nextStatus,
									warningRestrictionUntil:
										input.status === "active" || input.status === "suspended"
											? null
											: warningRestrictionUntil,
								})
								.where(eq(bambiProfile.userId, targetUserId))
								.returning();

							if (!updated) {
								// 일괄 처리는 실패 대상만 failures로 모으고 나머지는 그대로 적용된다
								// (executeBulkModeration의 기존 동작). 코드·메시지만 원인을 드러내게 바꾼다.
								throw new ORPCError("BAD_REQUEST", {
									message: PROFILELESS_SANCTION_MESSAGE,
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
				representativeName: employerOrganizationProfile.representativeName,
				businessStartDate: employerOrganizationProfile.businessStartDate,
				// 국세청 대조 결과 — null이면 운영자가 미확인으로 보고 더 꼼꼼히 심사한다.
				biznumCheckedAt: employerOrganizationProfile.biznumCheckedAt,
				biznumStatusCode: employerOrganizationProfile.biznumStatusCode,
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
					representativeName: employerOrganizationProfile.representativeName,
					businessStartDate: employerOrganizationProfile.businessStartDate,
					// 국세청 대조 결과 — null이면 운영자가 미확인으로 보고 더 꼼꼼히 심사한다.
					biznumCheckedAt: employerOrganizationProfile.biznumCheckedAt,
					biznumStatusCode: employerOrganizationProfile.biznumStatusCode,
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
				.limit(input.limit)
				.offset(input.offset);

			const employers = input.status
				? await query.where(
						eq(employerOrganizationProfile.verificationStatus, input.status)
					)
				: await query;
			const organizationIds = employers.map(
				({ organizationId }) => organizationId
			);
			const documents =
				organizationIds.length > 0
					? await db
							.select({
								byteSize: employerBusinessDocument.byteSize,
								category: employerBusinessDocument.category,
								fileName: employerBusinessDocument.fileName,
								id: employerBusinessDocument.id,
								mimeType: employerBusinessDocument.mimeType,
								organizationId: employerBusinessDocument.organizationId,
								storageKey: employerBusinessDocument.storageKey,
							})
							.from(employerBusinessDocument)
							.where(
								inArray(
									employerBusinessDocument.organizationId,
									organizationIds
								)
							)
							.orderBy(employerBusinessDocument.createdAt)
					: [];
			const documentsByOrganizationId = new Map<
				string,
				Array<{
					byteSize: number;
					category: "image" | "pdf";
					fileName: string;
					id: string;
					mimeType: string;
					objectUrl: string;
				}>
			>();
			for (const document of documents) {
				const organizationDocuments =
					documentsByOrganizationId.get(document.organizationId) ?? [];
				organizationDocuments.push({
					byteSize: document.byteSize,
					category: document.category,
					fileName: document.fileName,
					id: document.id,
					mimeType: document.mimeType,
					objectUrl: getBusinessDocumentViewPath(document.id),
				});
				documentsByOrganizationId.set(
					document.organizationId,
					organizationDocuments
				);
			}

			return employers.map((employer) => ({
				...employer,
				businessDocuments:
					documentsByOrganizationId.get(employer.organizationId) ?? [],
			}));
		}),

	// 운영자의 부적절 서류 제거 수단. 구인자 본인 삭제(onboarding.deleteBusinessDocument)와
	// 달리 조직 verificationStatus 전이를 하지 않는다 — 심사 판정은 별도 반려 플로우가 담당.
	deleteBusinessDocument: adminProcedure
		.input(z.object({ documentId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const [document] = await db
				.select({
					id: employerBusinessDocument.id,
					storageKey: employerBusinessDocument.storageKey,
				})
				.from(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, input.documentId))
				.limit(1);

			if (!document) {
				throw new ORPCError("NOT_FOUND", {
					message: "Business document was not found.",
				});
			}

			await db
				.delete(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, document.id));
			await deletePrivateObjects([document.storageKey]);

			return { id: document.id };
		}),

	listPendingTeamInvitations: protectedProcedure
		.input(listTeamInvitationsInput)
		.handler(async ({ context, input }) => {
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
					// 구인자가 초대할 때 적은 사유. 운영자가 승인 판단에 쓴다.
					inviteReason: invitation.inviteReason,
					rejectionReason: invitation.rejectionReason,
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
				.where(eq(invitation.status, input.status))
				.orderBy(desc(invitation.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			const now = Date.now();
			return rows.map((row) => ({
				id: row.id,
				organizationId: row.organizationId,
				organizationName: row.organizationName,
				email: row.email,
				inviteeName: row.inviteeName,
				inviterName: row.inviterName,
				inviterEmail: row.inviterEmail,
				inviteReason: row.inviteReason,
				rejectionReason: row.rejectionReason,
				role: normalizeOrganizationManagementRole(row.role) ?? "staff",
				teamId: row.teamId,
				teamName: row.teamProfileName ?? row.teamNameRaw ?? null,
				status: row.status,
				createdAt: row.createdAt,
				expiresAt: row.expiresAt,
				isExpired: row.expiresAt.getTime() < now,
			}));
		}),

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

				// 차단이든 해제든 이 방에 대한 판단은 끝났으므로, 아직 처리 전인 신고를
				// 조치 완료로 닫는다. 이걸 남겨두면 신고자에게는 방이 계속 숨겨진 채
				// "조치 대기 중"으로 굳어, 차단을 풀어도 대화가 돌아오지 않는다.
				const resolvedReports = await tx
					.update(report)
					.set({ resolutionReason: input.reason, status: "resolved" })
					.where(
						and(
							inArray(report.status, ["open", "reviewing"]),
							or(
								and(
									eq(report.targetType, "chat_room"),
									eq(report.targetId, input.chatRoomId)
								),
								and(
									eq(report.targetType, "chat_message"),
									sql`exists (
										select 1 from ${chatMessage}
										where ${chatMessage.id}::text = ${report.targetId}
											and ${chatMessage.chatRoomId} = ${input.chatRoomId}
									)`
								)
							)
						)
					)
					.returning({ id: report.id });

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "chat_room",
					targetId: input.chatRoomId,
					action: `set_blocked:${input.isBlocked}`,
					reason: input.reason,
					metadata: {
						resolvedReportIds: resolvedReports.map(({ id }) => id),
					},
				});

				return updated;
			});
		}),

	// 운영자 면접 일정 열람: 상태·방 상태와 무관하게 최신 면접일부터 내려준다. 이름은
	// 운영자 열람이라 탈퇴 마스킹 없이 원본(user.name)을 그대로 쓴다.
	listInterviewSchedules: adminProcedure
		.input(listInterviewSchedulesInput)
		.handler(async ({ input }) => {
			const employerUser = alias(user, "interview_employer_user");
			const seekerUser = alias(user, "interview_seeker_user");

			const rows = await db
				.select({
					chatRoomId: interviewSchedule.chatRoomId,
					createdAt: interviewSchedule.createdAt,
					employerDeletedAt: chatRoom.employerDeletedAt,
					employerName: employerUser.name,
					id: interviewSchedule.id,
					jobPostTitle: jobPost.title,
					locationNote: interviewSchedule.locationNote,
					roomIsBlocked: chatRoom.isBlocked,
					scheduledAt: interviewSchedule.scheduledAt,
					seekerDeletedAt: chatRoom.seekerDeletedAt,
					seekerName: seekerUser.name,
					status: interviewSchedule.status,
					updatedAt: interviewSchedule.updatedAt,
				})
				.from(interviewSchedule)
				.innerJoin(chatRoom, eq(interviewSchedule.chatRoomId, chatRoom.id))
				.innerJoin(jobPost, eq(chatRoom.jobPostId, jobPost.id))
				.innerJoin(employerUser, eq(employerUser.id, chatRoom.employerUserId))
				.innerJoin(seekerUser, eq(seekerUser.id, chatRoom.jobSeekerUserId))
				.orderBy(desc(interviewSchedule.scheduledAt))
				.limit(input?.limit ?? DEFAULT_INTERVIEW_SCHEDULE_LIMIT);

			// 방의 "나감" 두 컬럼은 화면 계약(roomIsDeleted) 하나로 접어 내려준다.
			return rows.map(({ employerDeletedAt, seekerDeletedAt, ...row }) => ({
				...row,
				roomIsDeleted: isChatRoomLeftByAnyone({
					employerDeletedAt,
					seekerDeletedAt,
				}),
			}));
		}),

	// 운영자 채팅 관리 목록: 삭제됨(seeker/employer deletedAt)·차단됨(isBlocked)·신고됨
	// (chat_room/chat_message 신고가 참조) 방만 노출한다. 플래그 없는 정상 방은 제외.
	// 페이지네이션·검색이 필요한 전체 목록은 listAllChatsForModeration을 쓴다.
	listChatsForModeration: adminProcedure.handler(async () => {
		const reportedRoomIds = await getReportedChatRoomIds();

		const rows = await chatModerationBaseQuery()
			.where(buildFlaggedChatCondition(reportedRoomIds))
			.orderBy(desc(chatRoom.updatedAt));

		return rows.map((row) => toChatModerationRow(row, reportedRoomIds));
	}),

	// 운영자 전체 채팅방 목록: 플래그 유무와 무관하게 모든 방을 페이지 단위로 내려준다.
	// 행 형태는 플래그 목록과 동일(같은 조립 헬퍼)이라 화면이 두 목록을 한 표로 렌더한다.
	// onlyFlagged로 조치 대상만 좁힐 수 있어, 화면은 이 프로시저 하나만 쓴다.
	listAllChatsForModeration: adminProcedure
		.input(listAllChatsForModerationInput)
		.handler(async ({ input }) => {
			const reportedRoomIds = await getReportedChatRoomIds();
			const searchCondition = buildChatSearchCondition(input.search);
			const flaggedCondition = input.onlyFlagged
				? buildFlaggedChatCondition(reportedRoomIds)
				: undefined;
			const where = and(
				...[flaggedCondition, searchCondition].filter((condition) => condition)
			);

			const [totalRow] = await chatModerationCountQuery().where(where);

			const rows = await chatModerationBaseQuery()
				.where(where)
				// 방 갱신 시각이 같은 방이 여러 개면 순서가 매번 흔들려 같은 방이 두 페이지에
				// 걸친다 — id를 마지막 정렬 키로 붙여 고정한다(커뮤니티 목록과 같은 이유).
				.orderBy(desc(chatRoom.updatedAt), desc(chatRoom.id))
				.limit(CHAT_MODERATION_PAGE_SIZE)
				.offset((input.page - 1) * CHAT_MODERATION_PAGE_SIZE);

			return {
				items: rows.map((row) => toChatModerationRow(row, reportedRoomIds)),
				page: input.page,
				pageSize: CHAT_MODERATION_PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	// 운영자 채팅 내역 열람: 특정 방의 전체 메시지를 시간순으로 내려준다. contact_request는
	// body가 이미 사람이 읽는 문구("연락처 공개를 요청했습니다.")라 별도 렌더 없이 그대로 쓴다.
	// 첨부는 storageKey를 제외하고 파일명만 노출한다(getChatMessageTargetContext와 동일 원칙).
	//
	// 읽기 전용이다 — 읽음 영수증(chat_message_read_receipt)도, 알림도 남기지 않는다.
	// 운영자가 열어 본 것을 당사자의 "읽음"으로 만들면 대화 상대에게 거짓 신호가 간다.
	// 대신 열람 사실 자체를 감사 로그에 남긴다(다른 운영 조치와 같은 admin_moderation_action).
	getChatMessagesForModeration: adminProcedure
		.input(z.object({ chatRoomId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);
			const employerUser = alias(user, "chat_history_employer_user");
			const seekerUser = alias(user, "chat_history_seeker_user");

			const [room] = await db
				.select({
					chatRoomId: chatRoom.id,
					employerAccountDeletedAt: employerUser.deletedAt,
					employerChatDeletedAt: chatRoom.employerDeletedAt,
					employerImage: employerUser.image,
					employerName: employerUser.name,
					employerUserId: chatRoom.employerUserId,
					jobPostTitle: jobPost.title,
					jobSeekerAccountDeletedAt: seekerUser.deletedAt,
					jobSeekerChatDeletedAt: chatRoom.seekerDeletedAt,
					jobSeekerImage: seekerUser.image,
					jobSeekerName: seekerUser.name,
					jobSeekerUserId: chatRoom.jobSeekerUserId,
				})
				.from(chatRoom)
				.leftJoin(jobPost, eq(chatRoom.jobPostId, jobPost.id))
				.leftJoin(employerUser, eq(employerUser.id, chatRoom.employerUserId))
				.leftJoin(seekerUser, eq(seekerUser.id, chatRoom.jobSeekerUserId))
				.where(eq(chatRoom.id, input.chatRoomId))
				.limit(1);

			if (!room) {
				throw new ORPCError("NOT_FOUND");
			}

			const messages = await db
				.select({
					body: chatMessage.body,
					createdAt: chatMessage.createdAt,
					id: chatMessage.id,
					kind: chatMessage.kind,
					senderUserId: chatMessage.senderUserId,
				})
				.from(chatMessage)
				.where(eq(chatMessage.chatRoomId, input.chatRoomId))
				.orderBy(asc(chatMessage.createdAt), asc(chatMessage.id));

			const messageIds = messages.map((message) => message.id);
			const attachments = messageIds.length
				? await db
						.select({
							byteSize: chatAttachment.byteSize,
							category: chatAttachment.category,
							fileName: chatAttachment.fileName,
							id: chatAttachment.id,
							messageId: chatAttachment.messageId,
							mimeType: chatAttachment.mimeType,
							storageKey: chatAttachment.storageKey,
						})
						.from(chatAttachment)
						.where(inArray(chatAttachment.messageId, messageIds))
						.orderBy(asc(chatAttachment.createdAt))
				: [];

			const attachmentsByMessage = new Map<
				string,
				{
					byteSize: number;
					category: "image" | "pdf";
					fileName: string;
					id: string;
					mimeType: string;
					objectUrl: string;
				}[]
			>();
			for (const attachment of attachments) {
				const list = attachmentsByMessage.get(attachment.messageId) ?? [];
				list.push({
					byteSize: attachment.byteSize,
					category: attachment.category,
					fileName: attachment.fileName,
					id: attachment.id,
					mimeType: attachment.mimeType,
					objectUrl: getChatAttachmentObjectUrl(attachment),
				});
				attachmentsByMessage.set(attachment.messageId, list);
			}

			// 사유 입력이 없는 조치라 reason은 고정 문구다(컬럼이 NOT NULL). 조치와 섞이지
			// 않도록 action은 view_messages로 구분한다.
			await db.insert(adminModerationAction).values({
				action: "view_messages",
				adminUserId: admin.userId,
				metadata: { messageCount: messages.length },
				reason: "운영자 채팅 내역 열람",
				targetId: input.chatRoomId,
				targetType: "chat_room",
			});

			const {
				employerAccountDeletedAt,
				employerChatDeletedAt,
				jobSeekerAccountDeletedAt,
				jobSeekerChatDeletedAt,
				...visibleRoom
			} = room;

			return {
				...visibleRoom,
				employerName: visibleRoom.employerName ?? "탈퇴한 구인자",
				employerWithdrawn: Boolean(
					employerAccountDeletedAt || employerChatDeletedAt
				),
				jobPostTitle: visibleRoom.jobPostTitle ?? "삭제된 공고",
				jobSeekerName: visibleRoom.jobSeekerName ?? "탈퇴한 구직자",
				jobSeekerWithdrawn: Boolean(
					jobSeekerAccountDeletedAt || jobSeekerChatDeletedAt
				),
				messages: messages.map((message) => ({
					...message,
					attachments: attachmentsByMessage.get(message.id) ?? [],
				})),
			};
		}),

	// 운영자 채팅방 하드삭제. FK 순서를 지켜 자식부터 지운다(읽음영수증→첨부→메시지→
	// 면접일정→방). contact_reveal_consent는 interview_schedule에 cascade로 물려 함께 삭제된다.
	hardDeleteChatRoom: adminProcedure
		.input(hardDeleteChatRoomInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const storageKeys = await db.transaction(async (tx) => {
				const [room] = await tx
					.select({ id: chatRoom.id })
					.from(chatRoom)
					.where(eq(chatRoom.id, input.chatRoomId))
					.limit(1);

				if (!room) {
					throw new ORPCError("NOT_FOUND");
				}

				// 행을 지우고 나면 키가 어디에도 남지 않아 사후 회수 배치를 만들 수 없다.
				// 공고 하드삭제와 같은 순서로, 지우기 전에 먼저 모아 둔다.
				const attachments = await tx
					.select({ storageKey: chatAttachment.storageKey })
					.from(chatAttachment)
					.where(eq(chatAttachment.chatRoomId, input.chatRoomId));

				await tx
					.delete(chatMessageReadReceipt)
					.where(eq(chatMessageReadReceipt.chatRoomId, input.chatRoomId));
				await tx
					.delete(chatAttachment)
					.where(eq(chatAttachment.chatRoomId, input.chatRoomId));
				await tx
					.delete(chatMessage)
					.where(eq(chatMessage.chatRoomId, input.chatRoomId));
				await tx
					.delete(interviewSchedule)
					.where(eq(interviewSchedule.chatRoomId, input.chatRoomId));
				await tx.delete(chatRoom).where(eq(chatRoom.id, input.chatRoomId));

				await tx.insert(adminModerationAction).values({
					action: "hard_delete",
					adminUserId: admin.userId,
					reason: input.reason,
					targetId: input.chatRoomId,
					targetType: "chat_room",
				});

				return attachments.map(({ storageKey }) => storageKey);
			});

			// 트랜잭션 밖에서 지운다(원격 호출이라 실패해도 삭제 자체를 되돌릴 이유가 없다).
			// 공고 삭제 경로와 같은 함수를 쓰며, 없는 객체는 무시한다.
			await deletePublicObjects(storageKeys);

			return { ok: true };
		}),

	setTeamInvitationStatus: protectedProcedure
		.input(setTeamInvitationStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const updated = await db.transaction(async (tx) => {
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

			const isRejected = input.status === "rejected";

			// 커밋 뒤에 알린다(롤백된 처리의 유령 알림 방지). 반려는 초대를 낸 사람이,
			// 승인은 합류한 본인이 알아야 한다.
			await notifyBambiNotification({
				actorUserId: admin.userId,
				metadata: isRejected
					? {
							action: "rejected",
							organizationId: updated?.organizationId,
							reason: input.reason ?? null,
						}
					: { action: "accepted", organizationId: updated?.organizationId },
				recipientUserId:
					(isRejected ? updated?.inviterId : updated?.acceptedUserId) ?? null,
				targetId: input.invitationId,
				targetType: "team_invitation",
			});

			// 승인은 초대를 낸 쪽에도 알린다 — 운영자 승인이 언제 떨어지는지 알 방법이
			// 팀 관리 화면을 다시 여는 것밖에 없었다. 초대자 본인이 합류자면 생략된다.
			if (!isRejected && updated?.acceptedUserId) {
				const [joined] = await db
					.select({ displayName: user.name })
					.from(user)
					.where(eq(user.id, updated.acceptedUserId))
					.limit(1);
				const [recipientUserId] = resolveNotificationRecipients(
					[updated.inviterId],
					updated.acceptedUserId
				);

				await notifyBambiNotification({
					actorUserId: admin.userId,
					metadata: {
						action: "joined",
						joinedDisplayName: joined?.displayName ?? null,
						organizationId: updated.organizationId,
					},
					recipientUserId: recipientUserId ?? null,
					targetId: input.invitationId,
					targetType: "team_invitation",
				});
			}

			return updated;
		}),

	setEmployerVerificationStatus: protectedProcedure
		.input(setEmployerVerificationStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const { owner, updated } = await db.transaction(async (tx) => {
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

				return { owner, updated };
			});

			// 커밋 뒤에 알린다. owner가 없는 조직(멤버 정리 중)이면 수신자가 없어 조용히 생략된다.
			await notifyBambiNotification({
				actorUserId: admin.userId,
				metadata: {
					action: input.status,
					organizationId: input.organizationId,
					reason: input.reason ?? null,
				},
				recipientUserId: owner?.userId ?? null,
				targetId: input.organizationId,
				targetType: "employer_verification",
			});

			return updated;
		}),

	setInquiryStatusByAdmin: adminProcedure
		.input(setInquiryStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);

			await db.transaction(async (tx) => {
				const [inquiry] = await tx
					.select({ id: supportInquiry.id, status: supportInquiry.status })
					.from(supportInquiry)
					.where(eq(supportInquiry.id, input.inquiryId))
					.limit(1);

				if (!inquiry) {
					throw new ORPCError("NOT_FOUND", {
						message: "문의를 찾을 수 없습니다.",
					});
				}

				assertNotAlreadyDeleted({
					current: inquiry.status,
					kind: "inquiry",
					next: input.status,
				});

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
				const where = and(
					input.status ? eq(communityPost.status, input.status) : undefined,
					input.board ? eq(communityPost.board, input.board) : undefined
				);

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
						// 목록에서 게시판을 바로 보고 걸러야 게시판 비우기(영구 삭제 → 게시판 삭제)를
						// 한 화면에서 끝낼 수 있다. 라벨 변환은 화면 몫이다(저장 원값을 그대로 준다).
						board: row.board as string | null,
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
					// 수집 글 댓글은 원글 행이 없다 — innerJoin이면 목록에서 통째로 빠져
					// totalCount와 어긋나고 운영자가 내릴 수단도 사라진다.
					.leftJoin(
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
						// 게시판 열은 커뮤니티 글 탭 전용이라 나머지 유형은 null로 채워
						// 화면이 유형별 좁히기 없이 한 형태만 렌더하게 둔다(상세와 같은 관례).
						board: null as string | null,
						// 댓글은 제목이 없으므로 원글 제목을 맥락으로 보여준다.
						title: row.postTitle ?? CRAWLED_TOPIC_COMMENT_TITLE,
						excerpt: excerpt(row.body),
						authorName: row.postAuthorName ?? CRAWLED_AUTHOR_DISPLAY_NAME,
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
					// 고객센터는 익명 표시명이 없으므로 user.name(표시명 정본)을 조인한다.
					authorName: user.name,
				})
				.from(supportInquiry)
				.leftJoin(user, eq(supportInquiry.authorUserId, user.id))
				.where(where)
				.orderBy(desc(supportInquiry.createdAt))
				.limit(MODERATABLE_PAGE_SIZE)
				.offset(offset);

			return {
				items: rows.map((row) => ({
					id: row.id,
					targetType: "support_inquiry" as const,
					board: null as string | null,
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
					// 목록과 같은 이유로 leftJoin이다(수집 글 댓글은 원글 행이 없다).
					.leftJoin(
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
					title: row.postTitle ?? CRAWLED_TOPIC_COMMENT_TITLE,
					body: row.body,
					authorName: row.postAuthorName ?? CRAWLED_AUTHOR_DISPLAY_NAME,
					createdAt: row.createdAt,
					status: row.status,
					board: null as string | null,
					category: null as string | null,
				};
			}

			const [row] = await db
				.select({
					authorName: user.name,
					body: supportInquiry.body,
					category: supportInquiry.category,
					createdAt: supportInquiry.createdAt,
					status: supportInquiry.status,
					title: supportInquiry.title,
				})
				.from(supportInquiry)
				.leftJoin(user, eq(supportInquiry.authorUserId, user.id))
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

	// 커뮤니티 글 영구 삭제(하드 삭제). 조치 삭제는 소프트 삭제라 행이 남고, 그 행이
	// community_post.board FK로 게시판 삭제를 막는다(communityBoards.remove의 409) —
	// 게시판을 비우는 마지막 한 걸음이다. 되돌릴 수 없으므로 이미 삭제 조치한 글만 받는다.
	// 댓글·추천은 FK cascade가 함께 지우고, 신고·알림의 targetId는 FK가 아니라 남지만
	// 대상 컨텍스트 조회가 이미 null을 허용한다(getReportTargetContext). 감사 로그도 같은
	// 이유로 남길 수 있으나 가리킬 행이 사라지므로 제목·게시판을 metadata에 스냅샷한다.
	// 사유는 선행 삭제 조치가 이미 받아 두었으므로 여기서 다시 받지 않는다(확인 한 단계).
	hardDeleteCommunityPost: adminProcedure
		.input(hardDeleteCommunityPostInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			await db.transaction(async (tx) => {
				const [post] = await tx
					.select({
						authorDisplayName: communityPost.authorDisplayName,
						board: communityPost.board,
						createdAt: communityPost.createdAt,
						status: communityPost.status,
						title: communityPost.title,
					})
					.from(communityPost)
					.where(eq(communityPost.id, input.postId))
					.limit(1);

				if (!post) {
					throw new ORPCError("NOT_FOUND", {
						message: "글을 찾을 수 없습니다.",
					});
				}

				if (post.status !== "deleted") {
					throw new ORPCError("CONFLICT", {
						message:
							"삭제 처리한 글만 영구 삭제할 수 있습니다. 먼저 삭제 조치를 해 주세요.",
					});
				}

				await tx
					.delete(communityPost)
					.where(eq(communityPost.id, input.postId));

				await tx.insert(adminModerationAction).values({
					action: "hard_delete",
					adminUserId: admin.userId,
					metadata: {
						authorName: post.authorDisplayName,
						board: post.board,
						createdAt: post.createdAt.toISOString(),
						title: post.title,
					},
					reason: "영구 삭제",
					targetId: input.postId,
					targetType: "community_post",
				});
			});

			return { ok: true };
		}),

	// 탈퇴 계정의 잔여 식별값 파기 배치의 수동 트리거(즉시 실행용). 실제 로직은 서버
	// 스케줄러(apps/server/src/plugins/withdrawal-purge.ts)가 매일 호출하는 것과 같은
	// 서비스 함수다 — 운영자가 보존기간을 줄인 직후 등 다음 자동 실행을 기다리지 않고
	// 즉시 정리하고 싶을 때 쓴다. 멱등하므로 자동 실행과 겹쳐도 안전하다.
	purgeWithdrawnAccounts: adminProcedure.handler(() =>
		purgeWithdrawnAccountsBatch()
	),
};
