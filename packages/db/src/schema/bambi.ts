import { relations } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { organization, team, user } from "./auth";

export const bambiUserRole = pgEnum("bambi_user_role", [
	"job_seeker",
	"employer",
	"admin",
]);

export const accountStatus = pgEnum("account_status", [
	"active",
	"warned",
	"suspended",
]);

// 성별. 휴대폰 본인인증 결과로 채워진다(1남/2여 → male/female). 게스트는 프로필이
// 없어 쿠키에만 남고, 정식 회원은 이 컬럼에 저장된다. 여성/광고 업소 회원만 입장하는
// 수다방 접근 판정에 쓰인다.
export const bambiGender = pgEnum("bambi_gender", ["male", "female"]);

export const employerVerificationStatus = pgEnum(
	"employer_verification_status",
	["none", "pending", "verified", "rejected"]
);

export const jobPostStatus = pgEnum("job_post_status", [
	"draft",
	"pending_review",
	"published",
	"hidden",
	"rejected",
]);

export const interviewStatus = pgEnum("interview_status", [
	"proposed",
	"confirmed",
	"declined",
	"canceled",
	"completed",
]);

export const reportStatus = pgEnum("report_status", [
	"open",
	"reviewing",
	"resolved",
	"dismissed",
]);

export const reviewStatus = pgEnum("review_status", [
	"published",
	"pending_review",
	"hidden",
]);

export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"community_post",
	"community_comment",
	"support_inquiry",
	"support_inquiry_message",
]);

// 수다방 게시판. 베스트글은 저장 컬럼이 아니라 추천수 큐레이션 가상 게시판이다.
// notice(공지사항)는 admin만 작성 가능(API 강제).
export const communityBoard = pgEnum("community_board", [
	"free",
	"work_talk",
	"market",
	"notice",
]);

// 글·댓글 공용 상태. 삭제는 소프트(deleted), hidden은 후속 운영자 숨김용 예약값.
export const communityContentStatus = pgEnum("community_content_status", [
	"published",
	"hidden",
	"deleted",
]);

// 고객센터 문의 분류. FAQ도 같은 분류를 재사용한다(사용자가 같은 기준으로 찾게).
export const supportInquiryCategory = pgEnum("support_inquiry_category", [
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
]);

// 문의 진행 상태. 운영 조치 상태(community_content_status)와는 별개 축이다 —
// answered면서 hidden일 수 있다.
export const supportInquiryStatus = pgEnum("support_inquiry_status", [
	"open",
	"answered",
	"closed",
]);

export const promotionTier = pgEnum("promotion_tier", [
	"premium",
	"recommended",
	"standard",
]);

export const promotionStatus = pgEnum("promotion_status", [
	"draft",
	"pending_payment",
	"active",
	"paused",
	"expired",
	"canceled",
]);

export const jobPerformanceEventType = pgEnum("job_performance_event_type", [
	"impression",
	"detail_view",
	"chat_start",
	"contact_reveal",
]);

export const jobPostMediaUsage = pgEnum("job_post_media_usage", [
	"cover",
	"detail",
]);

export const chatAttachmentCategory = pgEnum("chat_attachment_category", [
	"image",
	"pdf",
]);

export const jobDescriptionBlockTypes = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
] as const;

export type JobDescriptionBlockType = (typeof jobDescriptionBlockTypes)[number];

export interface JobDescriptionBlock {
	id: string;
	text: string;
	type: JobDescriptionBlockType;
}

export const bambiProfile = pgTable(
	"bambi_profile",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		role: bambiUserRole("role").notNull(),
		status: accountStatus("status").default("active").notNull(),
		isPhoneVerified: boolean("is_phone_verified").default(false).notNull(),
		phoneNumber: text("phone_number"),
		gender: bambiGender("gender"),
		// 본인인증 시 입력받는 생년월일. 목 인증 폼과 동일하게 8자리 YYYYMMDD 문자열로 저장한다.
		birthDate: text("birth_date"),
		// 광고(프로모션) 중인 업소(owner/admin) 표시 캐시. 진실값은 조회 시 캠페인 조인으로
		// 파생 계산하며(bambi-advertiser), 이 컬럼은 activate/pause 이벤트에서 동기화된다.
		isAdvertiser: boolean("is_advertiser").default(false).notNull(),
		displayName: text("display_name"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("bambi_profile_role_idx").on(table.role),
		index("bambi_profile_status_idx").on(table.status),
	]
);

export const employerOrganizationProfile = pgTable(
	"employer_organization_profile",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		displayName: text("display_name").notNull(),
		businessRegistrationNumber: text("business_registration_number"),
		verificationStatus: employerVerificationStatus("verification_status")
			.default("none")
			.notNull(),
		verificationNote: text("verification_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("employer_organization_profile_organization_id_uidx").on(
			table.organizationId
		),
		index("employer_organization_profile_verification_status_idx").on(
			table.verificationStatus
		),
	]
);

export const employerTeamProfile = pgTable(
	"employer_team_profile",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		displayName: text("display_name").notNull(),
		region: text("region"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("employer_team_profile_team_id_uidx").on(table.teamId),
		index("employer_team_profile_organization_id_idx").on(table.organizationId),
	]
);

export const jobPost = pgTable(
	"job_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, {
			onDelete: "set null",
		}),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		status: jobPostStatus("status").default("pending_review").notNull(),
		industryCategory: text("industry_category").notNull(),
		region: text("region").notNull(),
		payAmount: integer("pay_amount").notNull(),
		payUnit: text("pay_unit").notNull(),
		workSchedule: text("work_schedule").notNull(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		descriptionBlocks: jsonb("description_blocks")
			.$type<JobDescriptionBlock[]>()
			.default([])
			.notNull(),
		interviewNotes: text("interview_notes"),
		rejectionReason: text("rejection_reason"),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		publishedAt: timestamp("published_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("job_post_organization_id_idx").on(table.organizationId),
		index("job_post_team_id_idx").on(table.teamId),
		index("job_post_created_by_user_id_idx").on(table.createdByUserId),
		index("job_post_status_idx").on(table.status),
		index("job_post_discovery_idx").on(
			table.status,
			table.industryCategory,
			table.region,
			table.payAmount
		),
	]
);

export const jobPostMedia = pgTable(
	"job_post_media",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		uploadedByUserId: text("uploaded_by_user_id")
			.notNull()
			.references(() => user.id),
		usage: jobPostMediaUsage("usage").notNull(),
		position: integer("position").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		storageKey: text("storage_key").notNull(),
		altText: text("alt_text").default("").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("job_post_media_job_post_id_idx").on(table.jobPostId),
		index("job_post_media_organization_id_idx").on(table.organizationId),
		index("job_post_media_usage_position_idx").on(table.usage, table.position),
		uniqueIndex("job_post_media_storage_key_uidx").on(table.storageKey),
	]
);

export const jobPromotionCampaign = pgTable(
	"job_promotion_campaign",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		tier: promotionTier("tier").notNull(),
		status: promotionStatus("status").default("draft").notNull(),
		startsAt: timestamp("starts_at").notNull(),
		endsAt: timestamp("ends_at").notNull(),
		manualBoostsTotal: integer("manual_boosts_total").default(0).notNull(),
		manualBoostsUsed: integer("manual_boosts_used").default(0).notNull(),
		autoBoostsPerDay: integer("auto_boosts_per_day").default(0).notNull(),
		lastBoostedAt: timestamp("last_boosted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("job_promotion_campaign_job_post_id_idx").on(table.jobPostId),
		index("job_promotion_campaign_organization_id_idx").on(
			table.organizationId
		),
		index("job_promotion_campaign_status_idx").on(table.status),
		index("job_promotion_campaign_active_listing_idx").on(
			table.status,
			table.tier,
			table.endsAt,
			table.lastBoostedAt
		),
	]
);

export const jobPromotionBoostEvent = pgTable(
	"job_promotion_boost_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		campaignId: uuid("campaign_id")
			.notNull()
			.references(() => jobPromotionCampaign.id, { onDelete: "cascade" }),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		boostType: text("boost_type").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_promotion_boost_event_campaign_id_idx").on(table.campaignId),
		index("job_promotion_boost_event_job_post_id_idx").on(table.jobPostId),
		index("job_promotion_boost_event_organization_id_idx").on(
			table.organizationId
		),
	]
);

export const jobPerformanceEvent = pgTable(
	"job_performance_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		eventType: jobPerformanceEventType("event_type").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_performance_event_job_post_id_idx").on(table.jobPostId),
		index("job_performance_event_organization_id_idx").on(table.organizationId),
		index("job_performance_event_type_created_at_idx").on(
			table.eventType,
			table.createdAt
		),
	]
);

export const chatRoom = pgTable(
	"chat_room",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, {
			onDelete: "set null",
		}),
		employerUserId: text("employer_user_id")
			.notNull()
			.references(() => user.id),
		jobSeekerUserId: text("job_seeker_user_id")
			.notNull()
			.references(() => user.id),
		isBlocked: boolean("is_blocked").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("chat_room_job_post_id_job_seeker_user_id_uidx").on(
			table.jobPostId,
			table.jobSeekerUserId
		),
		index("chat_room_organization_id_idx").on(table.organizationId),
		index("chat_room_team_id_idx").on(table.teamId),
		index("chat_room_employer_user_id_idx").on(table.employerUserId),
		index("chat_room_job_seeker_user_id_idx").on(table.jobSeekerUserId),
	]
);

export const chatMessage = pgTable(
	"chat_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		senderUserId: text("sender_user_id")
			.notNull()
			.references(() => user.id),
		body: text("body").notNull(),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("chat_message_chat_room_id_idx").on(table.chatRoomId),
		index("chat_message_sender_user_id_idx").on(table.senderUserId),
	]
);

export const chatAttachment = pgTable(
	"chat_attachment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		messageId: uuid("message_id")
			.notNull()
			.references(() => chatMessage.id, { onDelete: "cascade" }),
		storageKey: text("storage_key").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		category: chatAttachmentCategory("category").notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("chat_attachment_chat_room_id_idx").on(table.chatRoomId),
		index("chat_attachment_message_id_idx").on(table.messageId),
		uniqueIndex("chat_attachment_storage_key_uidx").on(table.storageKey),
		index("chat_attachment_created_by_user_id_idx").on(table.createdByUserId),
	]
);

export const chatMessageReadReceipt = pgTable(
	"chat_message_read_receipt",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => chatMessage.id, { onDelete: "cascade" }),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		readerUserId: text("reader_user_id")
			.notNull()
			.references(() => user.id),
		readAt: timestamp("read_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("chat_message_read_receipt_message_id_reader_user_id_uidx").on(
			table.messageId,
			table.readerUserId
		),
		index("chat_message_read_receipt_chat_room_id_idx").on(table.chatRoomId),
		index("chat_message_read_receipt_reader_user_id_idx").on(
			table.readerUserId
		),
	]
);

export const interviewSchedule = pgTable(
	"interview_schedule",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		proposedByUserId: text("proposed_by_user_id")
			.notNull()
			.references(() => user.id),
		status: interviewStatus("status").default("proposed").notNull(),
		scheduledAt: timestamp("scheduled_at").notNull(),
		locationNote: text("location_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("interview_schedule_chat_room_id_idx").on(table.chatRoomId),
		index("interview_schedule_status_idx").on(table.status),
	]
);

export const contactRevealConsent = pgTable(
	"contact_reveal_consent",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		interviewScheduleId: uuid("interview_schedule_id")
			.notNull()
			.references(() => interviewSchedule.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		contactMethod: text("contact_method").notNull(),
		contactValue: text("contact_value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("contact_reveal_consent_schedule_id_user_id_method_uidx").on(
			table.interviewScheduleId,
			table.userId,
			table.contactMethod
		),
	]
);

export const userBlock = pgTable(
	"user_block",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		blockerUserId: text("blocker_user_id")
			.notNull()
			.references(() => user.id),
		blockedUserId: text("blocked_user_id")
			.notNull()
			.references(() => user.id),
		chatRoomId: uuid("chat_room_id").references(() => chatRoom.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("user_block_blocker_user_id_blocked_user_id_uidx").on(
			table.blockerUserId,
			table.blockedUserId
		),
	]
);

export const review = pgTable(
	"review",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		reviewerUserId: text("reviewer_user_id")
			.notNull()
			.references(() => user.id),
		rating: integer("rating").notNull(),
		body: text("body").notNull(),
		status: reviewStatus("status").default("published").notNull(),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("review_chat_room_id_reviewer_user_id_uidx").on(
			table.chatRoomId,
			table.reviewerUserId
		),
		index("review_job_post_id_status_idx").on(table.jobPostId, table.status),
		index("review_organization_id_idx").on(table.organizationId),
		index("review_reviewer_user_id_idx").on(table.reviewerUserId),
	]
);

export const report = pgTable(
	"report",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reporterUserId: text("reporter_user_id")
			.notNull()
			.references(() => user.id),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		reason: text("reason").notNull(),
		details: text("details"),
		status: reportStatus("status").default("open").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("report_status_idx").on(table.status),
		index("report_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
	]
);

export const adminModerationAction = pgTable(
	"admin_moderation_action",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		adminUserId: text("admin_user_id")
			.notNull()
			.references(() => user.id),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		action: text("action").notNull(),
		reason: text("reason").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("admin_moderation_action_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
	]
);

export const bambiNotification = pgTable(
	"bambi_notification",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		chatRoomId: uuid("chat_room_id").references(() => chatRoom.id, {
			onDelete: "cascade",
		}),
		readAt: timestamp("read_at"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("bambi_notification_recipient_user_id_idx").on(table.recipientUserId),
		index("bambi_notification_chat_room_id_idx").on(table.chatRoomId),
		index("bambi_notification_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
	]
);

export const communityPost = pgTable(
	"community_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		board: communityBoard("board").notNull(),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 클래식 게시판 필드: 글별 표시명(익명), 글 비밀번호(scrypt salt:hash), 비밀글 여부.
		authorDisplayName: text("author_display_name").notNull(),
		passwordHash: text("password_hash").notNull(),
		isLocked: boolean("is_locked").default(false).notNull(),
		// 작성 시점 계정 유형 스냅샷(서버 기록, 위조 불가). 업소 배지·필터용 — 이후 role 변경과 무관.
		authorRole: bambiUserRole("author_role").notNull(),
		// 업소회원 자율 광고 표시. employer만 true 가능(API 강제), 미표시 광고는 신고로 보완.
		isPromotion: boolean("is_promotion").default(false).notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		viewCount: integer("view_count").default(0).notNull(),
		// 추천·댓글 수 캐시. 진실값은 community_post_like/community_comment 집계이며
		// 토글·작성·삭제 트랜잭션에서 함께 증감한다.
		likeCount: integer("like_count").default(0).notNull(),
		commentCount: integer("comment_count").default(0).notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		// $onUpdate를 쓰지 않는다 — 조회수 증가가 "수정됨" 시각을 갱신하면 안 되므로
		// updatePost에서만 명시적으로 갱신한다.
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("community_post_board_status_created_at_idx").on(
			table.board,
			table.status,
			table.createdAt
		),
		index("community_post_status_created_at_idx").on(
			table.status,
			table.createdAt
		),
		index("community_post_author_user_id_idx").on(table.authorUserId),
	]
);

export const communityComment = pgTable(
	"community_comment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		postId: uuid("post_id")
			.notNull()
			.references(() => communityPost.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 계정 유형 스냅샷(서버 기록). 업소 댓글 배지·숨김 토글용.
		authorRole: bambiUserRole("author_role").notNull(),
		// 대댓글(1단계). null이면 최상위 댓글. 1단계 제한은 API에서 강제한다.
		parentCommentId: uuid("parent_comment_id").references(
			(): AnyPgColumn => communityComment.id,
			{ onDelete: "cascade" }
		),
		body: text("body").notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("community_comment_post_id_status_created_at_idx").on(
			table.postId,
			table.status,
			table.createdAt
		),
		index("community_comment_author_user_id_idx").on(table.authorUserId),
		index("community_comment_parent_comment_id_idx").on(table.parentCommentId),
	]
);

export const communityPostLike = pgTable(
	"community_post_like",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		postId: uuid("post_id")
			.notNull()
			.references(() => communityPost.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("community_post_like_post_id_user_id_uidx").on(
			table.postId,
			table.userId
		),
		index("community_post_like_user_id_idx").on(table.userId),
	]
);

export const supportInquiry = pgTable(
	"support_inquiry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 계정 유형 스냅샷(서버 기록). 이후 role 변경과 무관하게 문의 맥락을 보존한다.
		authorRole: bambiUserRole("author_role").notNull(),
		category: supportInquiryCategory("category").notNull(),
		title: text("title").notNull(),
		// 커뮤니티와 달리 평문이다 — 문의에 서식이 필요 없고 금칙어 검사를 바로 걸 수 있다.
		body: text("body").notNull(),
		inquiryStatus: supportInquiryStatus("inquiry_status")
			.default("open")
			.notNull(),
		// 운영 조치 상태. community_content_status를 재사용해 조치 로직·UI 매핑을 공유한다.
		status: communityContentStatus("status").default("published").notNull(),
		// 목록 정렬용 — 답변이 달리면 갱신해 위로 올린다.
		lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_inquiry_author_user_id_created_at_idx").on(
			table.authorUserId,
			table.createdAt
		),
		index("support_inquiry_inquiry_status_last_message_at_idx").on(
			table.inquiryStatus,
			table.lastMessageAt
		),
		index("support_inquiry_status_created_at_idx").on(
			table.status,
			table.createdAt
		),
	]
);

export const supportInquiryMessage = pgTable(
	"support_inquiry_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		inquiryId: uuid("inquiry_id")
			.notNull()
			.references(() => supportInquiry.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 운영자 여부 스냅샷. 이후 role이 바뀌어도 스레드 표시가 흔들리지 않는다.
		isStaff: boolean("is_staff").default(false).notNull(),
		body: text("body").notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_inquiry_message_inquiry_id_created_at_idx").on(
			table.inquiryId,
			table.createdAt
		),
	]
);

export const faqEntry = pgTable(
	"faq_entry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		category: supportInquiryCategory("category").notNull(),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isPublished: boolean("is_published").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("faq_entry_is_published_sort_order_idx").on(
			table.isPublished,
			table.sortOrder
		),
	]
);

export const bannedWord = pgTable(
	"banned_word",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// 운영자가 입력한 원문(표시용).
		term: text("term").notNull(),
		// 정규화형(매칭용). 저장 시 계산해 두고 매 요청 재계산을 피한다.
		normalizedTerm: text("normalized_term").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		// 정규화형에 걸어야 "성 매매"와 "성매매"가 중복 등록되지 않는다.
		uniqueIndex("banned_word_normalized_term_uidx").on(table.normalizedTerm),
		index("banned_word_is_active_idx").on(table.isActive),
	]
);

export const bambiProfileRelations = relations(bambiProfile, ({ one }) => ({
	user: one(user, {
		fields: [bambiProfile.userId],
		references: [user.id],
	}),
}));

export const employerOrganizationProfileRelations = relations(
	employerOrganizationProfile,
	({ many }) => ({
		teamProfiles: many(employerTeamProfile),
	})
);

export const employerTeamProfileRelations = relations(
	employerTeamProfile,
	({ one }) => ({
		organizationProfile: one(employerOrganizationProfile, {
			fields: [employerTeamProfile.organizationId],
			references: [employerOrganizationProfile.organizationId],
		}),
	})
);

export const jobPostRelations = relations(jobPost, ({ many }) => ({
	chatRooms: many(chatRoom),
	media: many(jobPostMedia),
	promotionCampaigns: many(jobPromotionCampaign),
}));

export const jobPostMediaRelations = relations(jobPostMedia, ({ one }) => ({
	jobPost: one(jobPost, {
		fields: [jobPostMedia.jobPostId],
		references: [jobPost.id],
	}),
}));

export const jobPromotionCampaignRelations = relations(
	jobPromotionCampaign,
	({ many, one }) => ({
		boostEvents: many(jobPromotionBoostEvent),
		jobPost: one(jobPost, {
			fields: [jobPromotionCampaign.jobPostId],
			references: [jobPost.id],
		}),
	})
);

export const jobPromotionBoostEventRelations = relations(
	jobPromotionBoostEvent,
	({ one }) => ({
		campaign: one(jobPromotionCampaign, {
			fields: [jobPromotionBoostEvent.campaignId],
			references: [jobPromotionCampaign.id],
		}),
		jobPost: one(jobPost, {
			fields: [jobPromotionBoostEvent.jobPostId],
			references: [jobPost.id],
		}),
	})
);

export const chatRoomRelations = relations(chatRoom, ({ many, one }) => ({
	attachments: many(chatAttachment),
	jobPost: one(jobPost, {
		fields: [chatRoom.jobPostId],
		references: [jobPost.id],
	}),
	messages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ many, one }) => ({
	attachments: many(chatAttachment),
	room: one(chatRoom, {
		fields: [chatMessage.chatRoomId],
		references: [chatRoom.id],
	}),
}));

export const chatAttachmentRelations = relations(chatAttachment, ({ one }) => ({
	message: one(chatMessage, {
		fields: [chatAttachment.messageId],
		references: [chatMessage.id],
	}),
	room: one(chatRoom, {
		fields: [chatAttachment.chatRoomId],
		references: [chatRoom.id],
	}),
}));

export const communityPostRelations = relations(communityPost, ({ many }) => ({
	comments: many(communityComment),
	likes: many(communityPostLike),
}));

export const communityCommentRelations = relations(
	communityComment,
	({ one }) => ({
		post: one(communityPost, {
			fields: [communityComment.postId],
			references: [communityPost.id],
		}),
	})
);

export const communityPostLikeRelations = relations(
	communityPostLike,
	({ one }) => ({
		post: one(communityPost, {
			fields: [communityPostLike.postId],
			references: [communityPost.id],
		}),
	})
);

export const supportInquiryRelations = relations(
	supportInquiry,
	({ many }) => ({
		messages: many(supportInquiryMessage),
	})
);

export const supportInquiryMessageRelations = relations(
	supportInquiryMessage,
	({ one }) => ({
		inquiry: one(supportInquiry, {
			fields: [supportInquiryMessage.inquiryId],
			references: [supportInquiry.id],
		}),
	})
);
