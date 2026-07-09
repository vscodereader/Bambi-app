import { db } from "@bambi-app/db";
import {
	bambiProfile,
	chatAttachment,
	chatMessage,
	chatRoom,
	contactRevealConsent,
	employerOrganizationProfile,
	employerTeamProfile,
	interviewSchedule,
	jobPost,
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { recordJobPerformanceEvent } from "../../services/bambi-analytics";
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
	emitChatListUpdated,
	emitMessageCreated,
	emitMessageRead,
	emitRoomUpdated,
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
	// 방 소켓룸에 입장하지 않은 목록 화면도 새 방/새 메시지를 반영하도록
	// 양쪽 참여자의 유저 채널로 목록 갱신 신호를 보낸다.
	emitChatListUpdated([room.employerUserId, room.jobSeekerUserId], {
		roomId: room.id,
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

interface CounterpartRoom {
	employerUserId: string;
	id: string;
	jobSeekerUserId: string;
	organizationId: string;
	teamId: string | null;
}

/**
 * 현재 보는 사람(viewer) 기준으로 대화 상대방의 표시 이름을 방마다 해석한다.
 * - 구인자가 볼 때 → 상대는 구직자(bambi_profile.display_name)
 * - 구직자가 볼 때 → 상대는 구인자(팀 프로필 → 조직 프로필 → 구인자 개인 프로필 순)
 */
const resolveCounterpartNames = async (
	rooms: CounterpartRoom[],
	viewerUserId: string
): Promise<Map<string, string | null>> => {
	const profileUserIds = new Set<string>();
	const teamIds = new Set<string>();
	const organizationIds = new Set<string>();

	for (const room of rooms) {
		if (room.employerUserId === viewerUserId) {
			profileUserIds.add(room.jobSeekerUserId);
		} else {
			profileUserIds.add(room.employerUserId);
			organizationIds.add(room.organizationId);
			if (room.teamId) {
				teamIds.add(room.teamId);
			}
		}
	}

	const [profiles, teamProfiles, organizationProfiles] = await Promise.all([
		profileUserIds.size > 0
			? db
					.select({
						userId: bambiProfile.userId,
						displayName: bambiProfile.displayName,
					})
					.from(bambiProfile)
					.where(inArray(bambiProfile.userId, [...profileUserIds]))
			: Promise.resolve([]),
		teamIds.size > 0
			? db
					.select({
						teamId: employerTeamProfile.teamId,
						displayName: employerTeamProfile.displayName,
					})
					.from(employerTeamProfile)
					.where(inArray(employerTeamProfile.teamId, [...teamIds]))
			: Promise.resolve([]),
		organizationIds.size > 0
			? db
					.select({
						organizationId: employerOrganizationProfile.organizationId,
						displayName: employerOrganizationProfile.displayName,
					})
					.from(employerOrganizationProfile)
					.where(
						inArray(employerOrganizationProfile.organizationId, [
							...organizationIds,
						])
					)
			: Promise.resolve([]),
	]);

	const nameByUserId = new Map(
		profiles.map((entry) => [entry.userId, entry.displayName])
	);
	const nameByTeamId = new Map(
		teamProfiles.map((entry) => [entry.teamId, entry.displayName])
	);
	const nameByOrganizationId = new Map(
		organizationProfiles.map((entry) => [
			entry.organizationId,
			entry.displayName,
		])
	);

	const namesByRoomId = new Map<string, string | null>();
	for (const room of rooms) {
		if (room.employerUserId === viewerUserId) {
			namesByRoomId.set(
				room.id,
				nameByUserId.get(room.jobSeekerUserId) ?? null
			);
		} else {
			const employerName =
				(room.teamId ? nameByTeamId.get(room.teamId) : undefined) ??
				nameByOrganizationId.get(room.organizationId) ??
				nameByUserId.get(room.employerUserId) ??
				null;
			namesByRoomId.set(room.id, employerName);
		}
	}

	return namesByRoomId;
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
				await recordJobPerformanceEvent({
					actorUserId: profile.userId,
					eventType: "chat_start",
					jobPostId: post.id,
					metadata: {
						chatRoomId: createdRoom.id,
					},
					organizationId: post.organizationId,
				});

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

		if (rooms.length === 0) {
			return [];
		}

		// 아직 메시지가 하나도 오가지 않은 방(구직자가 채팅 시작만 하고 첫
		// 메시지를 보내지 않은 빈 방)은 목록에서 숨긴다.
		const roomsWithLastMessage = await Promise.all(
			rooms.map(async (room) => {
				const [lastMessage] = await db
					.select({ id: chatMessage.id, body: chatMessage.body })
					.from(chatMessage)
					.where(eq(chatMessage.chatRoomId, room.id))
					.orderBy(desc(chatMessage.createdAt))
					.limit(1);

				return { lastMessage, room };
			})
		);
		const visibleRooms = roomsWithLastMessage.filter(
			({ lastMessage }) => lastMessage
		);

		if (visibleRooms.length === 0) {
			return [];
		}

		const jobPostIds = [
			...new Set(visibleRooms.map(({ room }) => room.jobPostId)),
		];
		const posts = await db
			.select({ id: jobPost.id, title: jobPost.title })
			.from(jobPost)
			.where(inArray(jobPost.id, jobPostIds));
		const jobTitleById = new Map(posts.map((post) => [post.id, post.title]));

		const counterpartNames = await resolveCounterpartNames(
			visibleRooms.map(({ room }) => room),
			profile.userId
		);

		return await Promise.all(
			visibleRooms.map(async ({ lastMessage, room }) => ({
				...room,
				counterpartName: counterpartNames.get(room.id) ?? null,
				jobTitle: jobTitleById.get(room.jobPostId) ?? null,
				lastMessageBody: lastMessage?.body ?? null,
				unreadCount: await getUnreadMessageCount({
					chatRoomId: room.id,
					userId: profile.userId,
				}),
			}))
		);
	}),

	// 내가 참여한 방들의 "다가오는" 면접 목록. status가 proposed·confirmed이고
	// scheduledAt이 현재 이후인 일정만 시간순으로 모아 방을 넘나들며 보여준다.
	listMyUpcomingInterviews: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		const rooms = await db
			.select()
			.from(chatRoom)
			.where(
				or(
					eq(chatRoom.employerUserId, profile.userId),
					eq(chatRoom.jobSeekerUserId, profile.userId)
				)
			);
		if (rooms.length === 0) {
			return [];
		}

		const roomById = new Map(rooms.map((room) => [room.id, room]));
		const schedules = await db
			.select()
			.from(interviewSchedule)
			.where(
				and(
					inArray(interviewSchedule.chatRoomId, [...roomById.keys()]),
					inArray(interviewSchedule.status, ["proposed", "confirmed"]),
					gte(interviewSchedule.scheduledAt, new Date())
				)
			)
			.orderBy(asc(interviewSchedule.scheduledAt));
		if (schedules.length === 0) {
			return [];
		}

		const involvedRooms = schedules
			.map((schedule) => roomById.get(schedule.chatRoomId))
			.filter((room): room is (typeof rooms)[number] => room !== undefined);

		const counterpartNames = await resolveCounterpartNames(
			involvedRooms,
			profile.userId
		);
		const jobPostIds = [
			...new Set(involvedRooms.map((room) => room.jobPostId)),
		];
		const posts = await db
			.select({ id: jobPost.id, title: jobPost.title })
			.from(jobPost)
			.where(inArray(jobPost.id, jobPostIds));
		const jobTitleById = new Map(posts.map((post) => [post.id, post.title]));

		return schedules.map((schedule) => {
			const room = roomById.get(schedule.chatRoomId);
			return {
				...schedule,
				counterpartName: room ? (counterpartNames.get(room.id) ?? null) : null,
				jobTitle: room ? (jobTitleById.get(room.jobPostId) ?? null) : null,
			};
		});
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

			const counterpartNames = await resolveCounterpartNames(
				[room],
				profile.userId
			);

			return {
				counterpartName: counterpartNames.get(room.id) ?? null,
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

			// 면접 일정은 구인자만 제안할 수 있다. 구직자는 제안을 받기만 한다.
			if (profile.userId !== room.employerUserId) {
				throw new ORPCError("FORBIDDEN");
			}

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

			emitRoomUpdated({ roomId: room.id });

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

			emitRoomUpdated({ roomId: room.id });

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

			await recordJobPerformanceEvent({
				actorUserId: profile.userId,
				eventType: "contact_reveal",
				jobPostId: room.jobPostId,
				metadata: {
					chatRoomId: room.id,
					contactMethod: input.contactMethod,
					interviewScheduleId: schedule.id,
				},
				organizationId: room.organizationId,
			});

			return consent;
		}),
};
