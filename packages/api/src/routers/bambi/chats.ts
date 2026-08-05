import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
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
	report,
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { recordJobPerformanceEvent } from "../../services/bambi-analytics";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import {
	getSenderRoomRestoreFields,
	hasCounterpartLeftChatRoom,
} from "../../services/bambi-chat-participation";
import {
	getChatRecipientUserId,
	getUnreadMessageCount,
	getUnreadMessageCountForUser,
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
import {
	canRevealContact,
	canStartChat,
	canViewCounterpartContact,
} from "../../services/bambi-policy";
import {
	createChatAttachmentUploadIntent,
	getChatAttachmentObjectUrl,
} from "../../services/bambi-storage";
import {
	resolveVisibleDisplayName,
	WITHDRAWN_DISPLAY_NAME,
} from "../../services/bambi-withdrawn-display";

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

const getContactRevealInput = z.object({
	chatRoomId: z.string().uuid(),
});

const requestContactRevealInput = z.object({
	chatRoomId: z.string().uuid(),
});

const respondContactRevealInput = z.object({
	messageId: z.string().uuid(),
	decision: z.enum(["reveal", "decline"]),
});

const deleteChatRoomInput = z.object({
	chatRoomId: z.string().uuid(),
});

type ContactRequestStatus = "declined" | "pending" | "revealed";

interface ContactRequestMetadata {
	requesterUserId: string;
	status: ContactRequestStatus;
	targetUserId: string;
}

const CONTACT_REQUEST_STATUSES: readonly string[] = [
	"declined",
	"pending",
	"revealed",
];

// jsonb 컬럼은 drizzle에서 unknown이라 좁혀서 읽는다. 형태가 어긋나면 null.
const readContactRequestMetadata = (
	value: unknown
): ContactRequestMetadata | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const { requesterUserId, status, targetUserId } = value as Record<
		string,
		unknown
	>;

	if (
		typeof requesterUserId === "string" &&
		typeof targetUserId === "string" &&
		typeof status === "string" &&
		CONTACT_REQUEST_STATUSES.includes(status)
	) {
		return {
			requesterUserId,
			status: status as ContactRequestStatus,
			targetUserId,
		};
	}

	return null;
};

type RequestedInterviewStatus = z.infer<
	typeof setInterviewStatusInput
>["status"];

interface InterviewStatusTransitionInput {
	actorUserId: string;
	currentStatus: string;
	proposedByUserId: string;
	requestedStatus: RequestedInterviewStatus;
}

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

// 구직자가 보는 구인자 이름. 담당자가 탈퇴했으면 팀·조직 표시명보다 탈퇴 표기가
// 앞선다 — 업소 이름만 보이면 응대할 사람이 없는 방에서 답을 기다리게 된다.
// 탈퇴 계정의 user.name은 원본 닉네임이라 그대로 내보내면 안 된다. 표시 문구는
// WITHDRAWN_DISPLAY_NAME(표시 계층)으로 고정한다.
const resolveEmployerName = (
	room: CounterpartRoom,
	names: {
		byOrganizationId: Map<string, string>;
		byTeamId: Map<string, string>;
		byUserId: Map<string, string>;
		withdrawnUserIds: Set<string>;
	}
): string | null => {
	if (names.withdrawnUserIds.has(room.employerUserId)) {
		return WITHDRAWN_DISPLAY_NAME;
	}
	return (
		(room.teamId ? names.byTeamId.get(room.teamId) : undefined) ??
		names.byOrganizationId.get(room.organizationId) ??
		names.byUserId.get(room.employerUserId) ??
		null
	);
};

/**
 * 현재 보는 사람(viewer) 기준으로 대화 상대방의 표시 이름을 방마다 해석한다.
 * - 구인자가 볼 때 → 상대는 구직자(user.name, 표시명 정본)
 * - 구직자가 볼 때 → 상대는 구인자(탈퇴 표기 → 팀 프로필 → 조직 프로필 → 개인 프로필 순)
 *
 * 어느 쪽이든 탈퇴한 상대는 원본 닉네임 대신 "탈퇴한 회원"으로 나간다 — 탈퇴는 이제
 * user.deletedAt 마커만 남기므로 이름을 그대로 실으면 실명이 상대 화면에 남는다.
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
						userId: user.id,
						displayName: user.name,
						deletedAt: user.deletedAt,
					})
					.from(user)
					.where(inArray(user.id, [...profileUserIds]))
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

	// 탈퇴한 상대의 원본 닉네임이 목록에 남지 않도록 지도를 만들 때부터 표시 문구로 바꾼다
	// (구인자가 보는 구직자 이름도 이 지도를 그대로 쓴다).
	const nameByUserId = new Map(
		profiles.map((entry) => [
			entry.userId,
			resolveVisibleDisplayName(
				{ deletedAt: entry.deletedAt, name: entry.displayName },
				entry.displayName
			),
		])
	);
	const withdrawnUserIds = new Set(
		profiles.flatMap((entry) => (entry.deletedAt ? [entry.userId] : []))
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
			namesByRoomId.set(
				room.id,
				resolveEmployerName(room, {
					byOrganizationId: nameByOrganizationId,
					byTeamId: nameByTeamId,
					byUserId: nameByUserId,
					withdrawnUserIds,
				})
			);
		}
	}

	return namesByRoomId;
};

// 방에서 나의 상대가 누구인지. 구인자로 보면 구직자, 구직자로 보면 구인자다.
const counterpartUserId = (
	room: { employerUserId: string; jobSeekerUserId: string },
	viewerUserId: string
): string =>
	room.employerUserId === viewerUserId
		? room.jobSeekerUserId
		: room.employerUserId;

/**
 * 목록에 보이는 상대들 중 나와 차단 관계에 있는 사용자 ID를 한 번에 모은다.
 *
 * 방향을 양쪽 다 본다. 내가 차단한 상대뿐 아니라 **상대가 나를 차단한** 경우도
 * 방 진입 가드(throwIfChatBlocked)가 막기 때문이다. 그쪽은 서버만 알 수 있어서,
 * 목록이 이 정보를 싣지 않으면 화면은 열리는 방처럼 그려놓고 누르면 에러가 뜬다.
 */
const resolveBlockedCounterpartIds = async (
	rooms: { employerUserId: string; jobSeekerUserId: string }[],
	viewerUserId: string
): Promise<Set<string>> => {
	const counterpartIds = [
		...new Set(rooms.map((room) => counterpartUserId(room, viewerUserId))),
	];

	if (counterpartIds.length === 0) {
		return new Set();
	}

	const blocks = await db
		.select({
			blockedUserId: userBlock.blockedUserId,
			blockerUserId: userBlock.blockerUserId,
		})
		.from(userBlock)
		.where(
			or(
				and(
					eq(userBlock.blockerUserId, viewerUserId),
					inArray(userBlock.blockedUserId, counterpartIds)
				),
				and(
					eq(userBlock.blockedUserId, viewerUserId),
					inArray(userBlock.blockerUserId, counterpartIds)
				)
			)
		);

	return new Set(
		blocks.map((block) =>
			block.blockerUserId === viewerUserId
				? block.blockedUserId
				: block.blockerUserId
		)
	);
};

type ChatBlockReason =
	| "blocked_by_counterpart"
	| "blocked_by_me"
	| "counterpart_left"
	| "moderation"
	| "pending_report";

const CHAT_BLOCK_MESSAGES: Record<ChatBlockReason, string> = {
	blocked_by_counterpart: "상대가 회원님을 차단한 채팅방이에요.",
	blocked_by_me: "회원님이 상대를 차단한 채팅방이에요.",
	counterpart_left: "상대방이 채팅방을 나가서 더 이상 메시지를 보낼 수 없어요.",
	moderation: "신고에 대한 운영자 조치로 종료된 채팅방이에요.",
	pending_report: "신고를 검토하고 있는 채팅이에요. 처리 후 다시 볼 수 있어요.",
};

// 신고 처리 전(open·reviewing) 상태. 이 구간에는 신고자에게서 방을 감춘다.
const PENDING_REPORT_STATUSES = ["open", "reviewing"] as const;

/**
 * "내가 신고했고 아직 처리 전"인 방 id들.
 *
 * 신고 완료 안내가 "해당 채팅은 잠시 숨겨둘게요"라고 약속하므로, 신고자에게는 목록에서도
 * 방 안에서도 보이지 않아야 한다. 방을 직접 겨눈 신고(chat_room)뿐 아니라 그 방의 특정
 * 메시지를 겨눈 신고(chat_message)도 같은 방을 가리키므로 함께 모은다. 상대에게는 아무
 * 영향이 없고, 운영자가 처리(resolved·dismissed)하면 자연히 다시 보인다.
 */
const getRoomIdsHiddenByMyReport = async ({
	reporterUserId,
	roomIds,
}: {
	reporterUserId: string;
	roomIds: string[];
}): Promise<Set<string>> => {
	if (roomIds.length === 0) {
		return new Set();
	}

	const [directRows, viaMessageRows] = await Promise.all([
		db
			.select({ roomId: report.targetId })
			.from(report)
			.where(
				and(
					eq(report.reporterUserId, reporterUserId),
					eq(report.targetType, "chat_room"),
					inArray(report.targetId, roomIds),
					inArray(report.status, [...PENDING_REPORT_STATUSES])
				)
			),
		db
			.select({ roomId: chatMessage.chatRoomId })
			.from(report)
			.innerJoin(chatMessage, eq(sql`${chatMessage.id}::text`, report.targetId))
			.where(
				and(
					eq(report.reporterUserId, reporterUserId),
					eq(report.targetType, "chat_message"),
					inArray(chatMessage.chatRoomId, roomIds),
					inArray(report.status, [...PENDING_REPORT_STATUSES])
				)
			),
	]);

	return new Set([
		...directRows.map((row) => row.roomId),
		...viaMessageRows.map((row) => row.roomId),
	]);
};

/**
 * 방 진입을 막고, **왜** 막혔는지를 오류에 실어 보낸다.
 *
 * 예전에는 세 경우 모두 맨 FORBIDDEN이라 화면이 "채팅방을 불러올 수 없어요"라는
 * 막다른 카드밖에 못 그렸다. 사유(chatBlockReason)와 상대 이름을 error data로 함께
 * 내려야 웹이 목록으로 돌려보내며 토스트로 이유를 말해줄 수 있다. 이름은 방 row가
 * 있어야 풀리는데(구인자 쪽은 팀·조직 프로필 경유) 이 가드가 이미 방을 받으므로
 * 여기서 푼다 — 오류 경로에서만 도는 조회다.
 */
const throwChatBlocked = async (
	reason: ChatBlockReason,
	room: CounterpartRoom,
	actorUserId: string
): Promise<never> => {
	const counterpartNames = await resolveCounterpartNames([room], actorUserId);

	throw new ORPCError("FORBIDDEN", {
		data: {
			chatBlockReason: reason,
			counterpartName: counterpartNames.get(room.id) ?? null,
		},
		message: CHAT_BLOCK_MESSAGES[reason],
	});
};

const throwIfChatBlocked = async ({
	actorUserId,
	room,
}: {
	actorUserId: string;
	room: CounterpartRoom & { isBlocked: boolean };
}): Promise<void> => {
	if (room.isBlocked) {
		await throwChatBlocked("moderation", room, actorUserId);
	}

	const otherUserId = counterpartUserId(room, actorUserId);
	const [block] = await db
		.select({ blockerUserId: userBlock.blockerUserId })
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
		await throwChatBlocked(
			block.blockerUserId === actorUserId
				? "blocked_by_me"
				: "blocked_by_counterpart",
			room,
			actorUserId
		);
	}
};

/** 내가 신고해 숨겨진 방이면 진입 자체를 막는다(상대는 영향 없음). */
const throwIfHiddenByMyReport = async ({
	actorUserId,
	room,
}: {
	actorUserId: string;
	room: CounterpartRoom;
}): Promise<void> => {
	const hiddenRoomIds = await getRoomIdsHiddenByMyReport({
		reporterUserId: actorUserId,
		roomIds: [room.id],
	});

	if (hiddenRoomIds.has(room.id)) {
		await throwChatBlocked("pending_report", room, actorUserId);
	}
};

/**
 * 방을 열어 보는 것까지 허용되는 가드(운영자 조치·사용자 차단·내 신고 대기).
 * 상대가 나간 방은 읽기는 그대로 두고 발신만 막으므로 여기서 보지 않는다.
 */
const throwIfChatUnavailable = async ({
	actorUserId,
	room,
}: {
	actorUserId: string;
	room: CounterpartRoom & { isBlocked: boolean };
}): Promise<void> => {
	await throwIfChatBlocked({ actorUserId, room });
	await throwIfHiddenByMyReport({ actorUserId, room });
};

/**
 * 발신 계열(메시지·첨부·면접 제안·연락처 요청 등) 전용 가드.
 *
 * 상대가 "나가기"로 지운 방에 새 내용을 밀어 넣지 못하게 한다. 예전에는 전송이 양쪽
 * 소프트삭제를 되돌려 나간 사람 방을 강제로 되살렸는데, 그건 나간 쪽 의사를 무시하는
 * 동작이라 차단 사유(counterpart_left)로 거절한다.
 */
const throwIfChatSendBlocked = async ({
	actorUserId,
	room,
}: {
	actorUserId: string;
	room: CounterpartRoom & {
		employerDeletedAt: Date | null;
		isBlocked: boolean;
		seekerDeletedAt: Date | null;
	};
}): Promise<void> => {
	await throwIfChatUnavailable({ actorUserId, room });

	if (hasCounterpartLeftChatRoom(room, actorUserId)) {
		await throwChatBlocked("counterpart_left", room, actorUserId);
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

			// 구인자가 나간 방은 다시 열어 주지 않는다. 이 경로가 방을 되살리면
			// 상대는 "나가기"를 눌러도 계속 새 대화를 받게 된다.
			if (hasCounterpartLeftChatRoom(existingRoom, profile.userId)) {
				await throwChatBlocked(
					"counterpart_left",
					existingRoom,
					profile.userId
				);
			}

			// 내가 지웠던 방으로 다시 들어오는 경우엔 내 목록에만 되돌린다.
			if (existingRoom.seekerDeletedAt) {
				const [restoredRoom] = await db
					.update(chatRoom)
					.set({ seekerDeletedAt: null })
					.where(eq(chatRoom.id, existingRoom.id))
					.returning();

				return restoredRoom ?? existingRoom;
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
					and(
						eq(chatRoom.employerUserId, profile.userId),
						isNull(chatRoom.employerDeletedAt)
					),
					and(
						eq(chatRoom.jobSeekerUserId, profile.userId),
						isNull(chatRoom.seekerDeletedAt)
					)
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
		const roomsWithMessages = roomsWithLastMessage.filter(
			({ lastMessage }) => lastMessage
		);

		// 내가 신고하고 아직 처리 전인 방은 목록에서 뺀다. 신고 완료 안내가 "해당 채팅은
		// 잠시 숨겨둘게요"라고 약속하는데, 예전에는 라벨만 붙인 채 그대로 남아 있었다.
		const hiddenRoomIds = await getRoomIdsHiddenByMyReport({
			reporterUserId: profile.userId,
			roomIds: roomsWithMessages.map(({ room }) => room.id),
		});
		const visibleRooms = roomsWithMessages.filter(
			({ room }) => !hiddenRoomIds.has(room.id)
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

		const blockedCounterpartIds = await resolveBlockedCounterpartIds(
			visibleRooms.map(({ room }) => room),
			profile.userId
		);

		return await Promise.all(
			visibleRooms.map(async ({ lastMessage, room }) => ({
				...room,
				// 목록이 쓰는 isBlocked는 방 컬럼이 아니라 "이 방에 들어갈 수 있는가"다.
				// chatRoom.isBlocked는 운영자 차단만 담고, 사용자 간 차단은 user_block에
				// 따로 있다 — 방 진입 가드(throwIfChatBlocked)는 둘 다 보므로 목록이 방
				// 컬럼만 보면 "열리는 것처럼 보이는데 누르면 에러"가 그대로 남는다.
				isBlocked:
					room.isBlocked ||
					blockedCounterpartIds.has(counterpartUserId(room, profile.userId)),
				counterpartName: counterpartNames.get(room.id) ?? null,
				// 목록 화면이 뷰어 쪽(구직자/구인자)을 판별하고 차단 대상을 고르는 근거.
				// 방 row에는 양쪽 id만 있어 뷰어가 누구인지 화면에서 알 수 없다.
				counterpartUserId: counterpartUserId(room, profile.userId),
				// 상대가 나간 방은 목록에서도 발신 불가를 미리 알린다(방에 들어가서야
				// 입력창이 잠긴 걸 발견하지 않도록).
				hasCounterpartLeft: hasCounterpartLeftChatRoom(room, profile.userId),
				jobTitle: jobTitleById.get(room.jobPostId) ?? null,
				lastMessageBody: lastMessage?.body ?? null,
				unreadCount: await getUnreadMessageCount({
					chatRoomId: room.id,
					userId: profile.userId,
				}),
			}))
		);
	}),

	// 헤더 채팅 버튼 핀·모바일 탭 뱃지용 경량 집계. listMine은 방마다 상대 이름·
	// 마지막 메시지·안 읽음 수를 모두 조립해 무거우므로 재사용하지 않고, 안 읽은
	// 메시지 총합만 한 번의 쿼리로 센다.
	unreadState: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		return {
			unreadMessageCount: await getUnreadMessageCountForUser({
				userId: profile.userId,
			}),
		};
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

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
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
					// 채팅방에서 공고 상세로 보낼지 판단하는 데 쓴다. 상세(jobs.getById)가
					// published + paid만 열어 주므로 같은 기준을 화면에도 내려야 한다.
					paymentStatus: jobPost.paymentStatus,
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

			// 구인자 인증번호는 양쪽에 노출, 구직자 공개번호는 revealed 요청을 보는
			// 구인자에게만 응답 조립 시점에 실어 준다(DB metadata엔 저장하지 않음).
			const participantPhones = await db
				.select({
					userId: bambiProfile.userId,
					isPhoneVerified: bambiProfile.isPhoneVerified,
					phoneNumber: bambiProfile.phoneNumber,
				})
				.from(bambiProfile)
				.where(
					inArray(bambiProfile.userId, [
						room.employerUserId,
						room.jobSeekerUserId,
					])
				);
			const verifiedPhoneFor = (userId: string): string | null => {
				const entry = participantPhones.find(
					(candidate) => candidate.userId === userId
				);

				return entry?.isPhoneVerified ? (entry.phoneNumber ?? null) : null;
			};
			const viewerIsEmployer = profile.userId === room.employerUserId;
			const seekerVerifiedPhone = verifiedPhoneFor(room.jobSeekerUserId);

			return {
				counterpartName: counterpartNames.get(room.id) ?? null,
				// 상대가 나간 방은 읽기만 허용한다. 화면이 입력창을 미리 잠그도록 내려 준다.
				counterpartLeft: hasCounterpartLeftChatRoom(room, profile.userId),
				currentUserId: profile.userId,
				employerVerifiedPhone: verifiedPhoneFor(room.employerUserId),
				jobPost: post ?? null,
				messages: messages.map((message) => {
					const revealedPhone =
						viewerIsEmployer &&
						message.kind === "contact_request" &&
						readContactRequestMetadata(message.metadata)?.status === "revealed"
							? seekerVerifiedPhone
							: null;

					return {
						...message,
						attachments: attachmentsByMessageId.get(message.id) ?? [],
						revealedPhone,
					};
				}),
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

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
			});

			const category = requireAllowedChatMedia(input);

			return await createChatAttachmentUploadIntent({
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

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
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

			// 새 메시지는 **보낸 사람 본인이** 지웠던 방만 다시 노출한다. 상대의
			// 소프트삭제(나가기)는 그대로 둔다 — 되돌리면 나간 의사를 지우는 셈이다.
			await db
				.update(chatRoom)
				.set({
					...getSenderRoomRestoreFields(room, profile.userId),
					updatedAt: new Date(),
				})
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

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
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

				// 텍스트 전송과 같은 규칙 — 보낸 사람 본인 소프트삭제만 되돌린다.
				await tx
					.update(chatRoom)
					.set({
						...getSenderRoomRestoreFields(room, profile.userId),
						updatedAt: new Date(),
					})
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
				room,
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
				// 읽은 본인의 유저 채널로도 목록 갱신 신호를 보내, 방 소켓룸에
				// 들어가 있지 않은 헤더 채팅 버튼·모바일 탭이 안 읽음 핀/뱃지를
				// 즉시 끄게 한다(emitUnreadUpdated는 방 소켓룸에만 도달한다).
				emitChatListUpdated([profile.userId], { roomId: room.id });
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

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
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
				room,
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

	// 조회 전용. 상대 연락처는 canViewCounterpart가 true일 때만 응답에 싣는다.
	getContactReveal: protectedProcedure
		.input(getContactRevealInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				room,
			});

			const viewerIsEmployer = profile.userId === room.employerUserId;

			// 완료된 면접도 확정을 거친 것이라 연락처 흐름을 유지한다(완료 버튼을 눌러도
			// 조기 반환으로 꺼지지 않게). declined·canceled는 계속 제외.
			const [confirmedSchedule] = await db
				.select({
					id: interviewSchedule.id,
					locationNote: interviewSchedule.locationNote,
					scheduledAt: interviewSchedule.scheduledAt,
					status: interviewSchedule.status,
				})
				.from(interviewSchedule)
				.where(
					and(
						eq(interviewSchedule.chatRoomId, room.id),
						inArray(interviewSchedule.status, ["confirmed", "completed"])
					)
				)
				.limit(1);

			if (!confirmedSchedule) {
				return {
					canViewCounterpart: false,
					confirmedSchedule: null,
					counterpartContacts: [],
					mineContacts: [],
					viewerIsEmployer,
				};
			}

			// 연락처 공개는 구인자만 한다. 구인자 명의 행만 읽으므로 과거 구직자 동의
			// 행은 마이그레이션 없이 조회에서 제외된다.
			const employerContacts = (
				await db
					.select({
						contactMethod: contactRevealConsent.contactMethod,
						contactValue: contactRevealConsent.contactValue,
					})
					.from(contactRevealConsent)
					.where(
						and(
							eq(
								contactRevealConsent.interviewScheduleId,
								confirmedSchedule.id
							),
							eq(contactRevealConsent.userId, room.employerUserId)
						)
					)
			).map(({ contactMethod, contactValue }) => ({
				contactMethod,
				contactValue,
			}));

			if (viewerIsEmployer) {
				return {
					canViewCounterpart: false,
					confirmedSchedule,
					counterpartContacts: [],
					mineContacts: employerContacts,
					viewerIsEmployer,
				};
			}

			const canViewCounterpart = canViewCounterpartContact({
				counterpartConsented: employerContacts.length > 0,
				interviewStatus: confirmedSchedule.status,
				viewerIsEmployer,
			});

			return {
				canViewCounterpart,
				confirmedSchedule,
				counterpartContacts: canViewCounterpart ? employerContacts : [],
				mineContacts: [],
				viewerIsEmployer,
			};
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

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
			});

			if (
				!canRevealContact({
					interviewStatus: schedule.status,
					ownerConsented: true,
					ownerIsEmployer: profile.userId === room.employerUserId,
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

	// 구인자가 구직자 연락처 공개를 요청한다. 인라인 contact_request 메시지 1건을
	// 진실원으로 두고, 응답은 같은 메시지의 metadata.status 전이로 표현한다.
	requestContactReveal: protectedProcedure
		.input(requestContactRevealInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			if (profile.userId !== room.employerUserId) {
				throw new ORPCError("FORBIDDEN");
			}

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
			});

			if (!profile.isPhoneVerified) {
				throw new ORPCError("BAD_REQUEST", {
					message: "본인인증 후 이용할 수 있습니다.",
				});
			}

			const [pending] = await db
				.select({ id: chatMessage.id })
				.from(chatMessage)
				.where(
					and(
						eq(chatMessage.chatRoomId, room.id),
						eq(chatMessage.kind, "contact_request"),
						sql`${chatMessage.metadata}->>'status' = 'pending'`
					)
				)
				.limit(1);

			if (pending) {
				throw new ORPCError("CONFLICT", {
					message: "이미 연락처 공개 요청이 진행 중입니다.",
				});
			}

			const [message] = await db
				.insert(chatMessage)
				.values({
					body: "연락처 공개를 요청했습니다.",
					chatRoomId: room.id,
					kind: "contact_request",
					metadata: {
						requesterUserId: room.employerUserId,
						status: "pending",
						targetUserId: room.jobSeekerUserId,
					},
					senderUserId: profile.userId,
				})
				.returning();

			if (!message) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Contact request could not be created.",
				});
			}

			await db
				.update(chatRoom)
				.set({ updatedAt: new Date() })
				.where(eq(chatRoom.id, room.id));

			await notifyChatMessageCreated({
				createdAt: message.createdAt,
				messageId: message.id,
				profileUserId: profile.userId,
				room,
			});

			return message;
		}),

	// 대상 구직자만 pending 요청에 응답한다. reveal은 status를 revealed로, decline은
	// declined로 낙관적 전이(where status='pending')한다.
	respondContactReveal: protectedProcedure
		.input(respondContactRevealInput)
		.handler(async ({ context, input }) => {
			const [message] = await db
				.select()
				.from(chatMessage)
				.where(eq(chatMessage.id, input.messageId))
				.limit(1);

			if (!message) {
				throw new ORPCError("NOT_FOUND");
			}

			const metadata = readContactRequestMetadata(message.metadata);

			if (
				message.kind !== "contact_request" ||
				!metadata ||
				metadata.status !== "pending"
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "처리할 수 있는 연락처 공개 요청이 아닙니다.",
				});
			}

			const { profile, room } = await requireChatParticipant(
				message.chatRoomId,
				context.session
			);

			if (profile.userId !== metadata.targetUserId) {
				throw new ORPCError("FORBIDDEN");
			}

			await throwIfChatSendBlocked({
				actorUserId: profile.userId,
				room,
			});

			if (input.decision === "reveal" && !profile.isPhoneVerified) {
				throw new ORPCError("BAD_REQUEST", {
					message: "본인인증 후 연락처를 공개할 수 있습니다.",
				});
			}

			const nextStatus: ContactRequestStatus =
				input.decision === "reveal" ? "revealed" : "declined";
			const [updated] = await db
				.update(chatMessage)
				.set({ metadata: { ...metadata, status: nextStatus } })
				.where(
					and(
						eq(chatMessage.id, message.id),
						sql`${chatMessage.metadata}->>'status' = 'pending'`
					)
				)
				.returning();

			if (!updated) {
				throw new ORPCError("CONFLICT", {
					message: "연락처 공개 요청 상태가 이미 변경되었습니다.",
				});
			}

			await notifyChatMessageCreated({
				createdAt: updated.createdAt,
				messageId: updated.id,
				profileUserId: profile.userId,
				room,
			});

			return updated;
		}),

	// 회원별 소프트삭제(목록 숨김). 상대는 그대로 보며, 새 메시지가 오면 재노출된다.
	deleteChatRoom: protectedProcedure
		.input(deleteChatRoomInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			const deletedAt = new Date();
			await db
				.update(chatRoom)
				.set(
					profile.userId === room.employerUserId
						? { employerDeletedAt: deletedAt }
						: { seekerDeletedAt: deletedAt }
				)
				.where(eq(chatRoom.id, room.id));

			return { ok: true as const };
		}),
};
