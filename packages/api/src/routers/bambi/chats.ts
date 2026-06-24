import { db } from "@bambi-app/db";
import {
	chatAttachment,
	chatMessage,
	chatRoom,
	contactRevealConsent,
	interviewSchedule,
	jobPost,
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import {
	getChatRecipientUserId,
	getUnreadMessageCount,
	markChatMessagesRead,
} from "../../services/bambi-chat-read-state";
import {
	emitMessageCreated,
	emitMessageRead,
	emitUnreadUpdated,
	isParticipantActiveInRoom,
} from "../../services/bambi-chat-realtime";
import {
	type ChatMediaCategory,
	type ChatMediaUploadInput,
	validateChatMediaUpload,
} from "../../services/bambi-media-policy";
import { createBambiNotification } from "../../services/bambi-notifications";
import { canRevealContact, canStartChat } from "../../services/bambi-policy";
import {
	createChatAttachmentUploadIntent,
	getChatAttachmentObjectUrl,
} from "../../services/bambi-storage";

const startFromJobPostInput = z.object({
	jobPostId: z.string().uuid(),
});

const sendMessageInput = z.object({
	chatRoomId: z.string().uuid(),
	body: z.string().min(1).max(2000),
});

const attachmentMetadataInput = z.object({
	chatRoomId: z.string().uuid(),
	fileName: z.string().max(180),
	mimeType: z.string().min(1).max(120),
	byteSize: z.number().int().min(1),
});

const sendMediaMessageInput = attachmentMetadataInput.extend({
	storageKey: z.string().min(1).max(512),
});

const markReadInput = z.object({
	chatRoomId: z.string().uuid(),
	messageIds: z.array(z.string().uuid()).min(1).max(50),
});

const isFutureIsoDateTime = (value: string): boolean => {
	const time = new Date(value).getTime();

	return Number.isFinite(time) && time > Date.now();
};

const proposeInterviewInput = z
	.object({
		chatRoomId: z.string().uuid(),
		scheduledAt: z.string().datetime(),
		locationNote: z.string().max(300).optional(),
	})
	.refine(({ scheduledAt }) => isFutureIsoDateTime(scheduledAt), {
		message: "Interview schedule must be in the future.",
		path: ["scheduledAt"],
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

const toIsoDateTime = (value: Date | string): string =>
	value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const getPolicyErrorMessage = (code: string): string => {
	switch (code) {
		case "empty_file_name":
			return "Attachment filename is required.";
		case "file_too_large":
			return "Attachment file is too large.";
		default:
			return "Attachment file type is not supported.";
	}
};

const requireAllowedChatMedia = (
	input: ChatMediaUploadInput
): ChatMediaCategory => {
	const result = validateChatMediaUpload(input);

	if (!result.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: getPolicyErrorMessage(result.code),
		});
	}

	return result.category;
};

interface NotifyChatMessageInput {
	createdAt: Date | string;
	messageId: string;
	profileUserId: string;
	room: {
		employerUserId: string;
		id: string;
		jobSeekerUserId: string;
	};
}

const notifyChatMessageCreated = async ({
	createdAt,
	messageId,
	profileUserId,
	room,
}: NotifyChatMessageInput): Promise<void> => {
	const recipientUserId = getChatRecipientUserId(room, profileUserId);
	const recipientUnreadCount = await getUnreadMessageCount({
		chatRoomId: room.id,
		userId: recipientUserId,
	});

	emitMessageCreated({
		createdAt: toIsoDateTime(createdAt),
		messageId,
		roomId: room.id,
		senderUserId: profileUserId,
	});
	emitUnreadUpdated({
		roomId: room.id,
		unreadCount: recipientUnreadCount,
		userId: recipientUserId,
	});

	if (!isParticipantActiveInRoom(room.id, recipientUserId)) {
		await createBambiNotification({
			actorUserId: profileUserId,
			chatRoomId: room.id,
			recipientUserId,
			targetId: messageId,
			targetType: "chat_message",
		});
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

		const rooms = await db
			.select()
			.from(chatRoom)
			.where(
				or(
					eq(chatRoom.employerUserId, profile.userId),
					eq(chatRoom.jobSeekerUserId, profile.userId)
				)
			)
			.orderBy(desc(chatRoom.updatedAt));

		return await Promise.all(
			rooms.map(async (room) => ({
				...room,
				unreadCount: await getUnreadMessageCount({
					chatRoomId: room.id,
					userId: profile.userId,
				}),
			}))
		);
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
			const attachments =
				messages.length > 0
					? await db
							.select()
							.from(chatAttachment)
							.where(
								inArray(
									chatAttachment.messageId,
									messages.map(({ id }) => id)
								)
							)
					: [];
			const attachmentsByMessageId = new Map<
				string,
				Array<
					(typeof attachments)[number] & {
						objectUrl: string;
					}
				>
			>();

			for (const attachment of attachments) {
				const mappedAttachment = {
					...attachment,
					objectUrl: getChatAttachmentObjectUrl(attachment),
				};
				const existing = attachmentsByMessageId.get(attachment.messageId) ?? [];
				existing.push(mappedAttachment);
				attachmentsByMessageId.set(attachment.messageId, existing);
			}

			const schedules = await db
				.select()
				.from(interviewSchedule)
				.where(eq(interviewSchedule.chatRoomId, room.id))
				.orderBy(desc(interviewSchedule.createdAt));

			return {
				currentUserId: profile.userId,
				jobPost: post ?? null,
				messages: messages.map((message) => ({
					...message,
					attachments: attachmentsByMessageId.get(message.id) ?? [],
				})),
				room,
				schedules,
			};
		}),

	createAttachmentUpload: protectedProcedure
		.input(attachmentMetadataInput)
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

			const category = requireAllowedChatMedia(input);

			return createChatAttachmentUploadIntent({
				byteSize: input.byteSize,
				category,
				chatRoomId: room.id,
				createdByUserId: profile.userId,
				fileName: input.fileName,
				mimeType: input.mimeType,
			});
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

			if (!message) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Chat message could not be created.",
				});
			}

			await db
				.update(chatRoom)
				.set({ updatedAt: new Date() })
				.where(eq(chatRoom.id, room.id));

			await notifyChatMessageCreated({
				createdAt: toIsoDateTime(message.createdAt),
				messageId: message.id,
				profileUserId: profile.userId,
				room,
			});

			return message;
		}),

	sendMediaMessage: protectedProcedure
		.input(sendMediaMessageInput)
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

			const category = requireAllowedChatMedia(input);
			const { attachment, message } = await db.transaction(async (tx) => {
				const [createdMessage] = await tx
					.insert(chatMessage)
					.values({
						body: "첨부 파일을 보냈습니다.",
						chatRoomId: room.id,
						senderUserId: profile.userId,
					})
					.returning();

				if (!createdMessage) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Chat message could not be created.",
					});
				}

				const [createdAttachment] = await tx
					.insert(chatAttachment)
					.values({
						byteSize: input.byteSize,
						category,
						chatRoomId: room.id,
						createdByUserId: profile.userId,
						fileName: input.fileName.trim(),
						messageId: createdMessage.id,
						mimeType: input.mimeType,
						storageKey: input.storageKey,
					})
					.returning();

				if (!createdAttachment) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Chat attachment could not be created.",
					});
				}

				await tx
					.update(chatRoom)
					.set({ updatedAt: new Date() })
					.where(eq(chatRoom.id, room.id));

				return {
					attachment: createdAttachment,
					message: createdMessage,
				};
			});

			await notifyChatMessageCreated({
				createdAt: message.createdAt,
				messageId: message.id,
				profileUserId: profile.userId,
				room,
			});

			return { attachment, message };
		}),

	markRead: protectedProcedure
		.input(markReadInput)
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

			const readReceipts = await markChatMessagesRead({
				chatRoomId: room.id,
				messageIds: input.messageIds,
				readerUserId: profile.userId,
			});
			const unreadCount = await getUnreadMessageCount({
				chatRoomId: room.id,
				userId: profile.userId,
			});

			for (const receipt of readReceipts) {
				emitMessageRead({
					messageId: receipt.messageId,
					readAt: toIsoDateTime(receipt.readAt),
					readerUserId: profile.userId,
					roomId: room.id,
				});
			}

			if (readReceipts.length > 0) {
				emitUnreadUpdated({
					roomId: room.id,
					unreadCount,
					userId: profile.userId,
				});
			}

			return {
				readMessageIds: readReceipts.map(({ messageId }) => messageId),
				unreadCount,
			};
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
				.where(
					and(
						eq(interviewSchedule.id, input.interviewScheduleId),
						eq(interviewSchedule.status, schedule.status)
					)
				)
				.returning();

			if (!updatedSchedule) {
				throw new ORPCError("CONFLICT", {
					message: "Interview schedule status has changed.",
				});
			}

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
