import { relations } from "drizzle-orm";
import {
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

export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
]);

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
		interviewScheduleId: uuid("interview_schedule_id")
			.notNull()
			.references(() => interviewSchedule.id, { onDelete: "cascade" }),
		reviewerUserId: text("reviewer_user_id")
			.notNull()
			.references(() => user.id),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id),
		rating: integer("rating").notNull(),
		body: text("body"),
		isHidden: boolean("is_hidden").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("review_interview_schedule_id_reviewer_user_id_uidx").on(
			table.interviewScheduleId,
			table.reviewerUserId
		),
		index("review_target_user_id_idx").on(table.targetUserId),
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
}));
