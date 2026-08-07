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
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { recordJobPerformanceEvent } from "../../services/bambi-analytics";
import {
	findUserBlockBetween,
	requireActiveBambiProfile,
	requireChatParticipant,
} from "../../services/bambi-authz";
import { generateChatMessageId } from "../../services/bambi-chat-message-id";
import {
	getChatRecipientUserId,
	getUnreadMessageCount,
	getUnreadMessageCountForUser,
	getUnreadMessageCountsByRoom,
	markChatMessagesReadUpTo,
} from "../../services/bambi-chat-read-state";
import {
	emitChatListUpdated,
	emitMessageRead,
	emitRoomUpdated,
	emitUnreadUpdated,
} from "../../services/bambi-chat-realtime";
import { getRoomIdsHiddenByActiveReport } from "../../services/bambi-chat-report-availability";
import {
	drainPendingChatMessageSyncs,
	enqueueChatMessageSync,
	notifyChatMessageCreated,
} from "../../services/bambi-chat-sync-queue";
import {
	type ChatMediaCategory,
	type ChatMediaUploadInput,
	validateChatMediaUpload,
} from "../../services/bambi-media-policy";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import {
	canRevealContact,
	canStartChat,
	canViewCounterpartContact,
} from "../../services/bambi-policy";
import {
	createChatAttachmentUploadIntent,
	getChatAttachmentObjectUrl,
	isOwnedChatAttachmentKey,
} from "../../services/bambi-storage";
import {
	resolveVisibleDisplayName,
	WITHDRAWN_DISPLAY_NAME,
} from "../../services/bambi-withdrawn-display";
import {
	type ChatSendAction,
	resolveChatSendRateLimit,
	takeRateLimit,
} from "../../services/rate-limit";

const startFromJobPostInput = z.object({
	jobPostId: z.string().uuid(),
});

// 메시지 id는 클라이언트가 전송 전에 만들어 실어 보낸다(UUIDv7). 네트워크 재시도나
// 더블클릭이 같은 id로 다시 오면 서버가 PK 충돌로 흡수해 같은 행을 돌려준다.
// 옛 클라이언트는 id를 안 보내므로 optional — 그때는 서버가 같은 유틸로 만든다.
const clientMessageIdInput = z.string().uuid().optional();

const sendMessageInput = z.object({
	chatRoomId: z.string().uuid(),
	body: z.string().min(1).max(2000),
	messageId: clientMessageIdInput,
});

const attachmentMetadataInput = z.object({
	chatRoomId: z.string().uuid(),
	fileName: z.string().max(180),
	mimeType: z.string().min(1).max(120),
	byteSize: z.number().int().min(1),
});

const sendMediaMessageInput = attachmentMetadataInput.extend({
	messageId: clientMessageIdInput,
	storageKey: z.string().min(1).max(512),
});

// 읽음 처리는 id 목록이 아니라 기준선("이 메시지까지 봤다") 하나만 받는다. 예전에는
// 클라이언트가 방의 상대 메시지 id를 전부 실어 보냈는데 상한이 50이라, 51건째부터 요청
// 전체가 거절돼 읽음영수증이 한 건도 안 써졌다(안 읽음 뱃지가 영영 안 꺼짐).
const markReadInput = z.object({
	chatRoomId: z.string().uuid(),
	upToMessageId: z.string().uuid(),
});

// 방 열람 기본 페이지 크기. 예전에는 LIMIT이 없어 소켓 이벤트가 뜰 때마다 방 이력 전체가
// 다시 나갔다.
const DEFAULT_CHAT_MESSAGE_PAGE_SIZE = 50;
// 한 번에 실어 보낼 수 있는 최대 페이지 크기. 예전에는 이 값이 곧 "열람 가능한 이력의 끝"
// 이었지만(더 보기 = limit 확장), 이제 커서로 계속 거슬러 올라갈 수 있어 한 응답의
// 크기 상한일 뿐이다. limit 입력은 옛 화면 호환을 위해 그대로 받는다.
const MAX_CHAT_MESSAGE_PAGE_SIZE = 500;

// "이 메시지보다 오래된 것"의 기준점. 정렬 총순서가 (created_at, id)라 커서도 두 값을 함께 든다.
const chatMessageCursorInput = z.object({
	createdAt: z.string().datetime(),
	id: z.string().uuid(),
});

const getChatRoomByIdInput = z.object({
	cursor: chatMessageCursorInput.optional(),
	id: z.string().uuid(),
	limit: z
		.number()
		.int()
		.min(1)
		.max(MAX_CHAT_MESSAGE_PAGE_SIZE)
		.default(DEFAULT_CHAT_MESSAGE_PAGE_SIZE),
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

const getInterviewChatContextInput = z.object({
	cursor: chatMessageCursorInput.optional(),
	interviewScheduleId: z.string().uuid(),
});

const DAY_IN_MS = 24 * 60 * 60 * 1000;
// 면접 목록에 남겨 두는 기간. 지난 확정 면접은 완료를 누를 수 있어야 하고, 완료한 면접도
// 한동안 기록으로 보여야 한다.
const INTERVIEW_RETENTION_DAYS = 30;

/** 진행 중(제안·확정)이 가까운 일시 순으로 먼저, 완료는 뒤에 최근 처리 순. */
const compareInterviewSchedules = (
	left: { scheduledAt: Date; status: string; updatedAt: Date },
	right: { scheduledAt: Date; status: string; updatedAt: Date }
): number => {
	const leftDone = left.status === "completed";
	const rightDone = right.status === "completed";

	if (leftDone !== rightDone) {
		return leftDone ? 1 : -1;
	}

	return leftDone
		? right.updatedAt.getTime() - left.updatedAt.getTime()
		: left.scheduledAt.getTime() - right.scheduledAt.getTime();
};

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
	employerUserId: string;
	proposedByUserId: string;
	requestedStatus: RequestedInterviewStatus;
}

const canSetInterviewStatus = ({
	actorUserId,
	currentStatus,
	employerUserId,
	proposedByUserId,
	requestedStatus,
}: InterviewStatusTransitionInput): boolean => {
	switch (requestedStatus) {
		case "confirmed":
		case "declined":
			return currentStatus === "proposed" && actorUserId !== proposedByUserId;
		case "canceled":
			return currentStatus === "proposed" || currentStatus === "confirmed";
		// 면접 완료 처리는 구인자만 한다(구직자는 확정까지). UI 숨김만으로는 직접 호출을 못 막는다.
		case "completed":
			return currentStatus === "confirmed" && actorUserId === employerUserId;
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

const CHAT_SEND_RATE_LIMIT_MESSAGE =
	"채팅 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";

/**
 * 발신 계열의 계정 단위 한도. 수다방 회원 글쓰기(community.ts)와 같은 규칙·같은 카운터를 쓴다.
 *
 * 호출 위치는 항상 차단·참여 검증을 **통과한 뒤**다 — 검증에서 튕긴 시도가 창을 먹으면
 * 사용자가 고쳐서 다시 낼 수 없다.
 */
const assertChatSendRateLimit = (
	action: ChatSendAction,
	userId: string
): void => {
	const { key, limit, windowMs } = resolveChatSendRateLimit({ action, userId });

	if (!takeRateLimit({ key, limit, now: Date.now(), windowMs })) {
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message: CHAT_SEND_RATE_LIMIT_MESSAGE,
		});
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

/**
 * 같은 메시지 id로 INSERT가 한 행도 남기지 않았을 때(PK 충돌 = 재시도·더블클릭) 이미
 * 들어와 있는 행을 돌려준다.
 *
 * 남의 방이나 남의 이름으로 이미 쓰인 id를 재사용하려는 요청은 CONFLICT로 막는다 —
 * 그대로 돌려주면 다른 방의 메시지 본문이 응답으로 새어 나간다.
 */
const requireExistingChatMessage = async (
	messageId: string,
	roomId: string,
	senderUserId: string
) => {
	const [existing] = await db
		.select()
		.from(chatMessage)
		.where(eq(chatMessage.id, messageId))
		.limit(1);

	if (
		!existing ||
		existing.chatRoomId !== roomId ||
		existing.senderUserId !== senderUserId
	) {
		throw new ORPCError("CONFLICT", {
			message: "이미 사용된 메시지 식별자예요. 다시 시도해 주세요.",
		});
	}

	return existing;
};

/**
 * 방 메시지 한 페이지를 keyset 커서로 읽어 화면 순서(오래된 → 최신)로 돌려준다.
 *
 * 최신 limit건만 받되 한 건을 더 읽어 "이전 메시지가 더 있는지"를 별도 count 없이 본다.
 * 커서를 받으면 그보다 오래된 구간을 읽는다 — 정렬 총순서가 (created_at, id)라
 * (chat_room_id, created_at) 인덱스를 그대로 타고, 동시각 메시지도 id로 갈라 페이지
 * 경계에서 빠지거나 겹치지 않는다. 방 화면(getById)과 면접 내역(getInterviewChatContext)이
 * 같은 커서 규칙을 쓰도록 여기 한 곳에 둔다.
 */
const loadChatMessagePage = async ({
	chatRoomId,
	cursor,
	limit,
}: {
	chatRoomId: string;
	cursor?: z.infer<typeof chatMessageCursorInput>;
	limit: number;
}) => {
	const cursorCreatedAt = cursor ? new Date(cursor.createdAt) : null;
	const olderThanCursor =
		cursorCreatedAt && cursor
			? or(
					lt(chatMessage.createdAt, cursorCreatedAt),
					and(
						eq(chatMessage.createdAt, cursorCreatedAt),
						lt(chatMessage.id, cursor.id)
					)
				)
			: undefined;
	const recentMessages = await db
		.select()
		.from(chatMessage)
		.where(and(eq(chatMessage.chatRoomId, chatRoomId), olderThanCursor))
		.orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
		.limit(limit + 1);
	const hasMoreMessages = recentMessages.length > limit;
	const messages = recentMessages.slice(0, limit).reverse();
	const oldestMessage = messages[0];

	return {
		hasMoreMessages,
		messages,
		// 다음 페이지의 기준점 = 이번 페이지에서 가장 오래된 메시지. 더 없으면 null.
		nextCursor:
			hasMoreMessages && oldestMessage
				? {
						createdAt: toIsoDateTime(oldestMessage.createdAt),
						id: oldestMessage.id,
					}
				: null,
	};
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
 *
 * maskWithdrawn: false는 면접 경로 전용이다(사용자 확정) — 이미 약속을 잡은 상대가
 * "탈퇴한 회원"으로 바뀌면 누구와의 면접인지 알 수 없어진다. 다른 호출부는 기본값(마스킹).
 */
const resolveCounterpartNames = async (
	rooms: CounterpartRoom[],
	viewerUserId: string,
	options?: { maskWithdrawn?: boolean }
): Promise<Map<string, string | null>> => {
	const maskWithdrawn = options?.maskWithdrawn !== false;
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
			maskWithdrawn
				? resolveVisibleDisplayName(
						{ deletedAt: entry.deletedAt, name: entry.displayName },
						entry.displayName
					)
				: entry.displayName,
		])
	);
	const withdrawnUserIds = new Set(
		maskWithdrawn
			? profiles.flatMap((entry) => (entry.deletedAt ? [entry.userId] : []))
			: []
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

const getHiddenParticipantRoomIds = async (
	userId: string
): Promise<Set<string>> => {
	const participantRooms = await db
		.select({ id: chatRoom.id })
		.from(chatRoom)
		.where(
			or(
				eq(chatRoom.employerUserId, userId),
				eq(chatRoom.jobSeekerUserId, userId)
			)
		);

	return await getRoomIdsHiddenByActiveReport(
		participantRooms.map(({ id }) => id)
	);
};

type ChatBlockReason =
	| "blocked_by_counterpart"
	| "blocked_by_me"
	| "moderation"
	| "pending_report";

const CHAT_BLOCK_MESSAGES: Record<ChatBlockReason, string> = {
	blocked_by_counterpart: "상대가 회원님을 차단한 채팅방이에요.",
	blocked_by_me: "회원님이 상대를 차단한 채팅방이에요.",
	moderation: "신고에 대한 운영자 조치로 종료된 채팅방이에요.",
	pending_report: "신고를 검토하고 있는 채팅이에요. 처리 후 다시 볼 수 있어요.",
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
	const block = await findUserBlockBetween(actorUserId, otherUserId);

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

/** 어느 참여자가 신고했든 활성 신고가 있으면 양쪽의 진입과 상호작용을 막는다. */
const throwIfHiddenByActiveReport = async ({
	actorUserId,
	room,
}: {
	actorUserId: string;
	room: CounterpartRoom;
}): Promise<void> => {
	const hiddenRoomIds = await getRoomIdsHiddenByActiveReport([room.id]);

	if (hiddenRoomIds.has(room.id)) {
		await throwChatBlocked("pending_report", room, actorUserId);
	}
};

/**
 * 채팅 가드(운영자 조치·사용자 차단·내 신고 대기). 열람·발신이 같은 기준을 쓴다.
 *
 * 한쪽이 나간 방은 여기까지 오지 않는다 — 방 로드 가드(requireChatParticipant)가
 * 이미 NOT_FOUND로 끊는다.
 */
const throwIfChatUnavailable = async ({
	actorUserId,
	room,
}: {
	actorUserId: string;
	room: CounterpartRoom & { isBlocked: boolean };
}): Promise<void> => {
	await throwIfChatBlocked({ actorUserId, room });
	await throwIfHiddenByActiveReport({ actorUserId, room });
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

			assertChatSendRateLimit("startFromJobPost", profile.userId);

			// 살아 있는 방이 있으면 INSERT가 부분 유니크에 걸려 아무것도 만들지 않는다.
			// 나갔던 방은 그 인덱스 밖이라 새 방이 생긴다 — 재문의는 언제나 새 대화다.
			// 충돌 판정을 DB에 맡기므로 동시 더블클릭에도 방은 하나만 생긴다.
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
					where: sql`${chatRoom.seekerDeletedAt} IS NULL AND ${chatRoom.employerDeletedAt} IS NULL`,
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

			// 충돌했다 = 살아 있는 방이 이미 있다. 그 방으로 들여보낸다.
			const [existingRoom] = await db
				.select()
				.from(chatRoom)
				.where(
					and(
						eq(chatRoom.jobPostId, input.jobPostId),
						eq(chatRoom.jobSeekerUserId, profile.userId),
						isNull(chatRoom.seekerDeletedAt),
						isNull(chatRoom.employerDeletedAt)
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

		// 어느 한쪽이라도 나간 방은 양쪽 목록에서 함께 사라진다(내가 나간 방만이 아니다).
		const rooms = await db
			.select()
			.from(chatRoom)
			.where(
				and(
					or(
						eq(chatRoom.employerUserId, profile.userId),
						eq(chatRoom.jobSeekerUserId, profile.userId)
					),
					isNull(chatRoom.employerDeletedAt),
					isNull(chatRoom.seekerDeletedAt)
				)
			)
			.orderBy(desc(chatRoom.updatedAt));

		if (rooms.length === 0) {
			return [];
		}

		// 아직 메시지가 하나도 오가지 않은 방(구직자가 채팅 시작만 하고 첫
		// 메시지를 보내지 않은 빈 방)은 목록에서 숨긴다.
		// 방마다 따로 물으면 방 수만큼 왕복이 늘어나므로(목록 한 번에 수십 쿼리) 방별
		// 마지막 메시지를 DISTINCT ON 한 번으로 모은다.
		const roomIds = rooms.map((room) => room.id);
		const lastMessageRows = await db
			.selectDistinctOn([chatMessage.chatRoomId], {
				body: chatMessage.body,
				chatRoomId: chatMessage.chatRoomId,
				id: chatMessage.id,
			})
			.from(chatMessage)
			.where(inArray(chatMessage.chatRoomId, roomIds))
			// 방 화면과 같은 총순서(created_at, id) — 같은 ms에 두 건이 들어오면 id가
			// 갈라 주지 않는 한 목록의 "마지막 메시지"가 매번 달라진다.
			.orderBy(
				chatMessage.chatRoomId,
				desc(chatMessage.createdAt),
				desc(chatMessage.id)
			);
		const lastMessageByRoomId = new Map(
			lastMessageRows.map((row) => [row.chatRoomId, row])
		);
		const roomsWithMessages = rooms
			.map((room) => ({
				lastMessage: lastMessageByRoomId.get(room.id),
				room,
			}))
			.filter(({ lastMessage }) => lastMessage);

		// 내가 신고하고 아직 처리 전인 방은 목록에서 뺀다. 신고 완료 안내가 "해당 채팅은
		// 잠시 숨겨둘게요"라고 약속하는데, 예전에는 라벨만 붙인 채 그대로 남아 있었다.
		const hiddenRoomIds = await getRoomIdsHiddenByActiveReport(
			roomsWithMessages.map(({ room }) => room.id)
		);
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

		// 안 읽음 수도 방마다 묻지 않고 한 번의 집계로 모은다.
		const unreadCountByRoomId = await getUnreadMessageCountsByRoom({
			roomIds: visibleRooms.map(({ room }) => room.id),
			userId: profile.userId,
		});

		return visibleRooms.map(({ lastMessage, room }) => ({
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
			jobTitle: jobTitleById.get(room.jobPostId) ?? null,
			lastMessageBody: lastMessage?.body ?? null,
			unreadCount: unreadCountByRoomId.get(room.id) ?? 0,
		}));
	}),

	// 헤더 채팅 버튼 핀·모바일 탭 뱃지용 경량 집계. listMine은 방마다 상대 이름·
	// 마지막 메시지·안 읽음 수를 모두 조립해 무거우므로 재사용하지 않고, 안 읽은
	// 메시지 총합만 한 번의 쿼리로 센다.
	unreadState: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		const hiddenRoomIds = await getHiddenParticipantRoomIds(profile.userId);

		return {
			unreadMessageCount: await getUnreadMessageCountForUser({
				excludedRoomIds: [...hiddenRoomIds],
				userId: profile.userId,
			}),
		};
	}),

	// 내가 참여한 방들의 면접 목록("예정된 면접" 화면). 면접 완료 처리가 방이 아니라 이
	// 목록에 있으므로, 노출 규칙이 곧 "완료를 누를 수 있는 기간"이다.
	// - proposed: 면접일이 남은 것만(답 없이 지난 제안은 접는다)
	// - confirmed: 면접일이 지나도 30일간 남긴다 — 여기서 사라지면 완료를 영영 못 누른다
	// - completed: 완료 시각(updatedAt) 기준 30일간 완료 뱃지로 남는다
	listMyUpcomingInterviews: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		// 방 삭제 여부는 보지 않는다 — 면접은 현실의 약속이라 방이 사라져도 일정 카드는
		// 남아야 한다. 아코디언의 내역 열람·완료 처리도 나간 방에서 그대로 열린다.
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
		const now = new Date();
		const retentionSince = new Date(
			now.getTime() - INTERVIEW_RETENTION_DAYS * DAY_IN_MS
		);
		const schedules = await db
			.select()
			.from(interviewSchedule)
			.where(
				and(
					inArray(interviewSchedule.chatRoomId, [...roomById.keys()]),
					or(
						and(
							eq(interviewSchedule.status, "proposed"),
							gte(interviewSchedule.scheduledAt, now)
						),
						and(
							eq(interviewSchedule.status, "confirmed"),
							gte(interviewSchedule.scheduledAt, retentionSince)
						),
						and(
							eq(interviewSchedule.status, "completed"),
							gte(interviewSchedule.updatedAt, retentionSince)
						)
					)
				)
			);
		if (schedules.length === 0) {
			return [];
		}

		schedules.sort(compareInterviewSchedules);

		const involvedRooms = schedules
			.map((schedule) => roomById.get(schedule.chatRoomId))
			.filter((room): room is (typeof rooms)[number] => room !== undefined);

		// 면접 목록은 탈퇴한 상대도 원래 이름으로 보여준다(사용자 확정).
		const counterpartNames = await resolveCounterpartNames(
			involvedRooms,
			profile.userId,
			{ maskWithdrawn: false }
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
				// 완료 버튼은 구인자에게만 뜬다. 화면이 전역 역할 상태를 다시 들지 않도록
				// 방 기준 판정을 응답에 실어 준다(서버 가드도 같은 기준이다).
				viewerIsEmployer: room?.employerUserId === profile.userId,
			};
		});
	}),

	getById: protectedProcedure
		.input(getChatRoomByIdInput)
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

			const { hasMoreMessages, messages, nextCursor } =
				await loadChatMessagePage({
					chatRoomId: room.id,
					cursor: input.cursor,
					limit: input.limit,
				});
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
				currentUserId: profile.userId,
				employerVerifiedPhone: verifiedPhoneFor(room.employerUserId),
				// 화면이 "이전 메시지 더 보기"를 띄울지 판단하는 근거.
				hasMoreMessages,
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
				// 이 값을 그대로 다음 요청의 cursor로 보내면 그 이전 구간이 온다.
				nextCursor,
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

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});

			const category = requireAllowedChatMedia(input);

			// 서명 URL 발급은 매번 외부(IAM signBlob) 호출이라 횟수 자체를 묶어 둔다.
			assertChatSendRateLimit("createAttachmentUpload", profile.userId);

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

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});
			assertChatSendRateLimit("sendMessage", profile.userId);

			const messageId = input.messageId ?? generateChatMessageId();
			// 메시지·방 갱신·전파 이벤트가 한 트랜잭션으로 함께 커밋된다. 예전에는 INSERT
			// 뒤에 전파를 이어 했기 때문에, 그 사이에 죽으면 상대에게 아무 신호도 가지
			// 않는 메시지가 남았다.
			const message = await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(chatMessage)
					.values({
						body: input.body,
						chatRoomId: room.id,
						id: messageId,
						senderUserId: profile.userId,
					})
					.onConflictDoNothing()
					.returning();

				if (!created) {
					return null;
				}

				await tx
					.update(chatRoom)
					.set({ updatedAt: new Date() })
					.where(eq(chatRoom.id, room.id));
				await enqueueChatMessageSync(tx, {
					chatRoomId: room.id,
					createdAt: created.createdAt,
					messageId: created.id,
					senderUserId: profile.userId,
				});

				return created;
			});

			// 같은 id가 이미 들어와 있다 = 재시도·더블클릭. 방 갱신도 전파도 다시 하지
			// 않고 원래 행만 돌려준다.
			if (!message) {
				return await requireExistingChatMessage(
					messageId,
					room.id,
					profile.userId
				);
			}

			await drainPendingChatMessageSyncs();

			return message;
		}),

	sendMediaMessage: protectedProcedure
		.input(sendMediaMessageInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});

			const category = requireAllowedChatMedia(input);

			// storageKey는 응답에 실려 나가는 값이라 비밀이 아니다. 그대로 믿으면 업로드 없이
			// 남의 방 첨부 키를 자기 방에 붙이거나 버킷의 임의 객체를 가리킬 수 있으므로,
			// 공고·본문 미디어와 같은 방식으로 발급 시점 prefix 규칙을 다시 확인한다.
			if (
				!isOwnedChatAttachmentKey({
					chatRoomId: room.id,
					storageKey: input.storageKey,
					userId: profile.userId,
				})
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: "첨부 파일 정보가 올바르지 않아요. 다시 업로드해 주세요.",
				});
			}

			assertChatSendRateLimit("sendMediaMessage", profile.userId);

			const messageId = input.messageId ?? generateChatMessageId();
			const inserted = await db.transaction(async (tx) => {
				const [createdMessage] = await tx
					.insert(chatMessage)
					.values({
						body: "첨부 파일을 보냈습니다.",
						chatRoomId: room.id,
						id: messageId,
						senderUserId: profile.userId,
					})
					.onConflictDoNothing()
					.returning();

				if (!createdMessage) {
					return null;
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
				await enqueueChatMessageSync(tx, {
					chatRoomId: room.id,
					createdAt: createdMessage.createdAt,
					messageId: createdMessage.id,
					senderUserId: profile.userId,
				});

				return {
					attachment: createdAttachment,
					message: createdMessage,
				};
			});

			// 같은 id의 재전송이면 첨부도 이미 붙어 있다. 다시 쓰지 않고 그대로 돌려준다
			// (storage_key 유니크 제약에 걸리기 전에 여기서 흡수된다).
			if (!inserted) {
				const message = await requireExistingChatMessage(
					messageId,
					room.id,
					profile.userId
				);
				const [existingAttachment] = await db
					.select()
					.from(chatAttachment)
					.where(eq(chatAttachment.messageId, message.id))
					.limit(1);

				if (!existingAttachment) {
					throw new ORPCError("CONFLICT", {
						message: "이미 사용된 메시지 식별자예요. 다시 시도해 주세요.",
					});
				}

				return { attachment: existingAttachment, message };
			}

			await drainPendingChatMessageSyncs();

			return inserted;
		}),

	markRead: protectedProcedure
		.input(markReadInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});

			const readReceipts = await markChatMessagesReadUpTo({
				chatRoomId: room.id,
				readerUserId: profile.userId,
				upToMessageId: input.upToMessageId,
			});
			const unreadCount = await getUnreadMessageCount({
				chatRoomId: room.id,
				userId: profile.userId,
			});
			// 핀(헤더 채팅 버튼·모바일 탭)이 그리는 값은 방별 수가 아니라 계정 전체 합계다.
			// 읽음 응답에 그 합계를 함께 실어 주면, 화면이 "무효화 → 재조회"가 언제 도는지에
			// 기대지 않고 곧바로 정본으로 맞출 수 있다. 증감 누적이 아니라 여기서 다시 센
			// 값이므로 핀 숫자의 정본이 DB 집계라는 규칙은 그대로다.
			const totalUnreadMessageCount = await getUnreadMessageCountForUser({
				excludedRoomIds: [
					...(await getHiddenParticipantRoomIds(profile.userId)),
				],
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
				totalUnreadMessageCount,
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

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});
			assertChatSendRateLimit("proposeInterview", profile.userId);

			const [schedule] = await db
				.insert(interviewSchedule)
				.values({
					chatRoomId: room.id,
					proposedByUserId: profile.userId,
					scheduledAt: new Date(input.scheduledAt),
					locationNote: input.locationNote,
				})
				.returning();

			if (!schedule) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Interview schedule could not be created.",
				});
			}

			emitRoomUpdated({ roomId: room.id });

			// emitRoomUpdated는 그 방 소켓룸에 들어와 있는 클라이언트에게만 닿는다 —
			// 방 밖(목록·다른 화면)에 있는 구직자는 새로고침 전까지 제안을 모른다.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				chatRoomId: room.id,
				metadata: { action: "proposed" },
				recipientUserId: getChatRecipientUserId(room, profile.userId),
				targetId: schedule.id,
				targetType: "interview_schedule",
			});

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

			// 완료 처리만은 나간 방에서도 열어 둔다(사용자 확정) — 완료 버튼이 방이 아니라
			// "예정된 면접" 목록에 있고, 방을 나갔다고 지난 약속을 못 끝내면 안 된다.
			// 그 밖의 전환(확정·거절·취소)은 기존대로 나간 방에서 NOT_FOUND다.
			const { profile, room } = await requireChatParticipant(
				schedule.chatRoomId,
				context.session,
				{ allowLeftRoom: input.status === "completed" }
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				room,
			});

			if (
				!canSetInterviewStatus({
					actorUserId: profile.userId,
					currentStatus: schedule.status,
					employerUserId: room.employerUserId,
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

			// 확정·거절·취소·완료 전부 상대가 알아야 하는 전이다. 상태값은 metadata.action에
			// 실어 화면이 "면접이 확정됐어요"처럼 문구를 가른다.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				chatRoomId: room.id,
				metadata: { action: input.status },
				recipientUserId: getChatRecipientUserId(room, profile.userId),
				targetId: updatedSchedule.id,
				targetType: "interview_schedule",
			});

			return updatedSchedule;
		}),

	/**
	 * "예정된 면접" 아코디언이 펼칠 때 읽는 면접 컨텍스트 — 일정 + 그 방의 채팅 내역.
	 *
	 * 읽기 전용이다: 읽음영수증도, markRead도, 소켓 신호도 남기지 않는다. 지난 약속을
	 * 다시 읽는 화면이라 상대에게 "읽음"이 가면 거짓 신호가 된다.
	 * 나간 방도 연다(면접 예외). 차단·신고 대기 방은 기존 정책 그대로 막는다.
	 */
	getInterviewChatContext: protectedProcedure
		.input(getInterviewChatContextInput)
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
				context.session,
				{ allowLeftRoom: true }
			);

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});

			const { messages, nextCursor } = await loadChatMessagePage({
				chatRoomId: room.id,
				cursor: input.cursor,
				limit: DEFAULT_CHAT_MESSAGE_PAGE_SIZE,
			});
			const counterpartNames = await resolveCounterpartNames(
				[room],
				profile.userId,
				{ maskWithdrawn: false }
			);
			const [post] = await db
				.select({ title: jobPost.title })
				.from(jobPost)
				.where(eq(jobPost.id, room.jobPostId))
				.limit(1);

			return {
				counterpartName: counterpartNames.get(room.id) ?? null,
				currentUserId: profile.userId,
				jobTitle: post?.title ?? null,
				// 읽기 전용 말풍선에 필요한 것만 싣는다. 첨부·연락처 요청도 body가 이미
				// 사람이 읽는 문구라("첨부 파일을 보냈습니다.") 별도 매핑이 필요 없다.
				messages: messages.map(
					({ body, createdAt, id, kind, senderUserId }) => ({
						body,
						createdAt,
						id,
						kind,
						senderUserId,
					})
				),
				// 이 값을 그대로 다음 요청의 cursor로 보내면 그 이전 구간이 온다.
				nextCursor,
				schedule,
			};
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

			await throwIfChatUnavailable({
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

			assertChatSendRateLimit("revealContact", profile.userId);

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

			// 연락처를 공개하는 쪽은 항상 구인자이고, 알아야 하는 쪽은 구직자다.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				chatRoomId: room.id,
				metadata: { contactMethod: input.contactMethod },
				recipientUserId: room.jobSeekerUserId,
				targetId: schedule.id,
				targetType: "contact_reveal",
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

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});

			if (!profile.isPhoneVerified) {
				throw new ORPCError("BAD_REQUEST", {
					message: "본인인증 후 이용할 수 있습니다.",
				});
			}

			assertChatSendRateLimit("requestContactReveal", profile.userId);

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

			// 서버가 만드는 메시지도 클라이언트 전송과 같은 유틸로 id를 만든다 —
			// 정렬·커서의 기준(UUIDv7)이 메시지 종류에 따라 갈리지 않게.
			const message = await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(chatMessage)
					.values({
						body: "연락처 공개를 요청했습니다.",
						chatRoomId: room.id,
						id: generateChatMessageId(),
						kind: "contact_request",
						metadata: {
							requesterUserId: room.employerUserId,
							status: "pending",
							targetUserId: room.jobSeekerUserId,
						},
						senderUserId: profile.userId,
					})
					.returning();

				if (!created) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Contact request could not be created.",
					});
				}

				await tx
					.update(chatRoom)
					.set({ updatedAt: new Date() })
					.where(eq(chatRoom.id, room.id));
				await enqueueChatMessageSync(tx, {
					chatRoomId: room.id,
					createdAt: created.createdAt,
					messageId: created.id,
					senderUserId: profile.userId,
				});

				return created;
			});

			await drainPendingChatMessageSyncs();

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

			await throwIfChatUnavailable({
				actorUserId: profile.userId,
				room,
			});

			if (input.decision === "reveal" && !profile.isPhoneVerified) {
				throw new ORPCError("BAD_REQUEST", {
					message: "본인인증 후 연락처를 공개할 수 있습니다.",
				});
			}

			assertChatSendRateLimit("respondContactReveal", profile.userId);

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

	// 나가기 = 방이 양쪽 모두에게서 사라진다. 컬럼은 "누가 언제 나갔나" 기록으로만
	// 남고, 되살아나지 않는다(재문의는 새 방).
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

			// 상대 목록에서도 즉시 사라져야 하므로 양쪽 유저 채널로 갱신 신호를 보낸다.
			emitChatListUpdated([room.employerUserId, room.jobSeekerUserId], {
				roomId: room.id,
			});

			return { ok: true as const };
		}),
};
