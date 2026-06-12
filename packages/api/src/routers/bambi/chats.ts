import { db } from "@bambi-app/db";
import {
	chatMessage,
	chatRoom,
	contactRevealConsent,
	interviewSchedule,
	jobPost,
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import { canRevealContact, canStartChat } from "../../services/bambi-policy";

const startFromJobPostInput = z.object({
	jobPostId: z.string().uuid(),
});

const sendMessageInput = z.object({
	chatRoomId: z.string().uuid(),
	body: z.string().min(1).max(2000),
});

const proposeInterviewInput = z.object({
	chatRoomId: z.string().uuid(),
	scheduledAt: z.string().datetime(),
	locationNote: z.string().max(300).optional(),
});

const setInterviewStatusInput = z.object({
	interviewScheduleId: z.string().uuid(),
	status: z.enum(["confirmed", "declined", "canceled", "completed"]),
});

const revealContactInput = z.object({
	interviewScheduleId: z.string().uuid(),
	contactMethod: z.enum(["phone", "kakao", "email"]),
	contactValue: z.string().min(3).max(120),
});

type RequestedInterviewStatus = z.infer<
	typeof setInterviewStatusInput
>["status"];

interface ChatBlockInput {
	actorUserId: string;
	employerUserId: string;
	isBlocked: boolean;
	jobSeekerUserId: string;
}

interface InterviewStatusTransitionInput {
	actorUserId: string;
	currentStatus: string;
	proposedByUserId: string;
	requestedStatus: RequestedInterviewStatus;
}

const throwIfChatBlocked = async ({
	actorUserId,
	employerUserId,
	isBlocked,
	jobSeekerUserId,
}: ChatBlockInput): Promise<void> => {
	if (isBlocked) {
		throw new ORPCError("FORBIDDEN");
	}

	const otherUserId =
		employerUserId === actorUserId ? jobSeekerUserId : employerUserId;
	const [block] = await db
		.select({ id: userBlock.id })
		.from(userBlock)
		.where(
			or(
				and(
					eq(userBlock.blockerUserId, actorUserId),
					eq(userBlock.blockedUserId, otherUserId)
				),
				and(
					eq(userBlock.blockerUserId, otherUserId),
					eq(userBlock.blockedUserId, actorUserId)
				)
			)
		)
		.limit(1);

	if (block) {
		throw new ORPCError("FORBIDDEN");
	}
};

const canSetInterviewStatus = ({
	actorUserId,
	currentStatus,
	proposedByUserId,
	requestedStatus,
}: InterviewStatusTransitionInput): boolean => {
	switch (requestedStatus) {
		case "confirmed":
		case "declined":
			return currentStatus === "proposed" && actorUserId !== proposedByUserId;
		case "canceled":
			return currentStatus === "proposed" || currentStatus === "confirmed";
		case "completed":
			return currentStatus === "confirmed";
		default:
			return false;
	}
};

export const chatsRouter = {
	startFromJobPost: protectedProcedure
		.input(startFromJobPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			if (profile.role !== "job_seeker") {
				throw new ORPCError("FORBIDDEN");
			}

			const [post] = await db
				.select({
					id: jobPost.id,
					status: jobPost.status,
					organizationId: jobPost.organizationId,
					teamId: jobPost.teamId,
					employerUserId: jobPost.createdByUserId,
				})
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			if (post.employerUserId === profile.userId) {
				throw new ORPCError("FORBIDDEN");
			}

			if (
				!canStartChat({
					accountStatus: profile.status,
					isPhoneVerified: profile.isPhoneVerified,
					jobPostStatus: post.status,
				})
			) {
				throw new ORPCError("FORBIDDEN");
			}

			const [createdRoom] = await db
				.insert(chatRoom)
				.values({
					jobPostId: post.id,
					organizationId: post.organizationId,
					teamId: post.teamId,
					employerUserId: post.employerUserId,
					jobSeekerUserId: profile.userId,
				})
				.onConflictDoNothing({
					target: [chatRoom.jobPostId, chatRoom.jobSeekerUserId],
				})
				.returning();

			if (createdRoom) {
				return createdRoom;
			}

			const [existingRoom] = await db
				.select()
				.from(chatRoom)
				.where(
					and(
						eq(chatRoom.jobPostId, input.jobPostId),
						eq(chatRoom.jobSeekerUserId, profile.userId)
					)
				)
				.limit(1);

			if (!existingRoom) {
				throw new ORPCError("NOT_FOUND");
			}

			return existingRoom;
		}),

	listMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		return await db
			.select()
			.from(chatRoom)
			.where(
				or(
					eq(chatRoom.employerUserId, profile.userId),
					eq(chatRoom.jobSeekerUserId, profile.userId)
				)
			)
			.orderBy(desc(chatRoom.updatedAt));
	}),

	getById: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.id,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				employerUserId: room.employerUserId,
				isBlocked: room.isBlocked,
				jobSeekerUserId: room.jobSeekerUserId,
			});

			const [post] = await db
				.select({
					id: jobPost.id,
					title: jobPost.title,
					industryCategory: jobPost.industryCategory,
					region: jobPost.region,
					payAmount: jobPost.payAmount,
					payUnit: jobPost.payUnit,
					status: jobPost.status,
				})
				.from(jobPost)
				.where(eq(jobPost.id, room.jobPostId))
				.limit(1);

			const messages = await db
				.select()
				.from(chatMessage)
				.where(eq(chatMessage.chatRoomId, room.id))
				.orderBy(asc(chatMessage.createdAt));

			const schedules = await db
				.select()
				.from(interviewSchedule)
				.where(eq(interviewSchedule.chatRoomId, room.id))
				.orderBy(desc(interviewSchedule.createdAt));

			return {
				currentUserId: profile.userId,
				jobPost: post ?? null,
				messages,
				room,
				schedules,
			};
		}),

	sendMessage: protectedProcedure
		.input(sendMessageInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				employerUserId: room.employerUserId,
				isBlocked: room.isBlocked,
				jobSeekerUserId: room.jobSeekerUserId,
			});

			const [message] = await db
				.insert(chatMessage)
				.values({
					chatRoomId: room.id,
					senderUserId: profile.userId,
					body: input.body,
				})
				.returning();

			await db
				.update(chatRoom)
				.set({ updatedAt: new Date() })
				.where(eq(chatRoom.id, room.id));

			return message;
		}),

	proposeInterview: protectedProcedure
		.input(proposeInterviewInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				employerUserId: room.employerUserId,
				isBlocked: room.isBlocked,
				jobSeekerUserId: room.jobSeekerUserId,
			});

			const [schedule] = await db
				.insert(interviewSchedule)
				.values({
					chatRoomId: room.id,
					proposedByUserId: profile.userId,
					scheduledAt: new Date(input.scheduledAt),
					locationNote: input.locationNote,
				})
				.returning();

			return schedule;
		}),

	setInterviewStatus: protectedProcedure
		.input(setInterviewStatusInput)
		.handler(async ({ context, input }) => {
			const [schedule] = await db
				.select({
					chatRoomId: interviewSchedule.chatRoomId,
					proposedByUserId: interviewSchedule.proposedByUserId,
					status: interviewSchedule.status,
				})
				.from(interviewSchedule)
				.where(eq(interviewSchedule.id, input.interviewScheduleId))
				.limit(1);

			if (!schedule) {
				throw new ORPCError("NOT_FOUND");
			}

			const { profile, room } = await requireChatParticipant(
				schedule.chatRoomId,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				employerUserId: room.employerUserId,
				isBlocked: room.isBlocked,
				jobSeekerUserId: room.jobSeekerUserId,
			});

			if (
				!canSetInterviewStatus({
					actorUserId: profile.userId,
					currentStatus: schedule.status,
					proposedByUserId: schedule.proposedByUserId,
					requestedStatus: input.status,
				})
			) {
				throw new ORPCError("FORBIDDEN");
			}

			const [updatedSchedule] = await db
				.update(interviewSchedule)
				.set({ status: input.status })
				.where(eq(interviewSchedule.id, input.interviewScheduleId))
				.returning();

			return updatedSchedule;
		}),

	revealContact: protectedProcedure
		.input(revealContactInput)
		.handler(async ({ context, input }) => {
			const [schedule] = await db
				.select()
				.from(interviewSchedule)
				.where(eq(interviewSchedule.id, input.interviewScheduleId))
				.limit(1);

			if (!schedule) {
				throw new ORPCError("NOT_FOUND");
			}

			const { profile, room } = await requireChatParticipant(
				schedule.chatRoomId,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				employerUserId: room.employerUserId,
				isBlocked: room.isBlocked,
				jobSeekerUserId: room.jobSeekerUserId,
			});

			if (
				!canRevealContact({
					interviewStatus: schedule.status,
					ownerConsented: true,
					ownerPhoneVerified: profile.isPhoneVerified,
				})
			) {
				throw new ORPCError("FORBIDDEN");
			}

			const [consent] = await db
				.insert(contactRevealConsent)
				.values({
					interviewScheduleId: schedule.id,
					userId: profile.userId,
					contactMethod: input.contactMethod,
					contactValue: input.contactValue,
				})
				.onConflictDoUpdate({
					target: [
						contactRevealConsent.interviewScheduleId,
						contactRevealConsent.userId,
						contactRevealConsent.contactMethod,
					],
					set: {
						contactValue: input.contactValue,
					},
				})
				.returning();

			return consent;
		}),
};
