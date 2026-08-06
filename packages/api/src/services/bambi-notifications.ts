import { bambiNotification, bambiProfile } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";
import { resolveNotificationRecipients } from "./bambi-notification-recipients";
import {
	type BambiNotificationTargetType,
	emitBambiNotification,
	logBambiNotificationError,
} from "./bambi-notification-stream";

/**
 * 역할 공유 수신이 가능한 역할. 개인 수신자가 없는 "큐 도착" 성격 알림만 여기로 온다
 * — 운영자 심사거리·법률자문 새 잠금글. 구직자·구인자는 언제나 개인 수신이다.
 */
export type BambiNotificationRecipientRole = "admin" | "legal_advisor";

export interface CreateBambiNotificationInput {
	actorUserId: string;
	chatRoomId?: null | string;
	/** 이벤트 세부. 라벨·딥링크가 읽는다: { action, reason, board, postId, jobPostId, ... } */
	metadata?: Record<string, unknown>;
	/** recipientUserId와 정확히 한쪽만 채운다(DB CHECK와 같은 규칙). */
	recipientRole?: BambiNotificationRecipientRole | null;
	recipientUserId?: null | string;
	targetId: string;
	targetType: BambiNotificationTargetType;
}

/**
 * 수신자가 정확히 한쪽만 채워졌는지. 수신자 해석 실패(게스트 글·탈퇴 계정·본인 행위
 * 제외)는 null로 내려오므로, 여기서 걸러 조용히 생략한다 — DB CHECK 위반으로
 * 본 작업(검수·면접 제안)이 터지는 일이 없어야 한다.
 */
export const hasExactlyOneRecipient = ({
	recipientRole,
	recipientUserId,
}: CreateBambiNotificationInput): boolean =>
	Boolean(recipientUserId) !== Boolean(recipientRole);

export const buildBambiNotificationValues = ({
	actorUserId,
	chatRoomId,
	metadata,
	recipientRole,
	recipientUserId,
	targetId,
	targetType,
}: CreateBambiNotificationInput) => ({
	actorUserId,
	chatRoomId: chatRoomId ?? null,
	metadata: metadata ?? {},
	recipientRole: recipientRole ?? null,
	recipientUserId: recipientUserId ?? null,
	targetId,
	targetType,
});

export const createBambiNotification = async (
	input: CreateBambiNotificationInput
): Promise<null | string> => {
	if (!hasExactlyOneRecipient(input)) {
		return null;
	}

	const { db } = await import("@bambi-app/db");
	const [notification] = await db
		.insert(bambiNotification)
		.values(buildBambiNotificationValues(input))
		.returning({
			createdAt: bambiNotification.createdAt,
			id: bambiNotification.id,
		});

	if (!notification) {
		return null;
	}

	// 역할 공유 행은 DB에 1개지만 SSE는 그 역할 계정 전원에게 보낸다 — 행을 복제하면
	// 한 명이 확인해도 나머지 배지가 남는다(공유 읽음 의미론이 깨진다).
	// 역할 계정은 소수이고 bambi_profile_role_idx가 있어 조회 비용이 무시할 만하다.
	const recipientUserIds = input.recipientUserId
		? [input.recipientUserId]
		: (
				await db
					.select({ userId: bambiProfile.userId })
					.from(bambiProfile)
					.where(eq(bambiProfile.role, input.recipientRole ?? "admin"))
			).map((row) => row.userId);

	// 본문·연락처는 담지 않고 "무엇이 생겼는지"만 보내 클라이언트가 정본을 다시 조회하게 한다.
	for (const userId of recipientUserIds) {
		emitBambiNotification(userId, {
			chatRoomId: input.chatRoomId ?? null,
			createdAt: notification.createdAt.toISOString(),
			notificationId: notification.id,
			targetId: input.targetId,
			targetType: input.targetType,
		});
	}

	return notification.id;
};

/**
 * best-effort 알림. 알림 생성 실패가 본 작업(면접 제안·검수 처리·글 작성)을 실패시키면
 * 안 된다 — 신규 호출부는 전부 이 래퍼를 쓴다. 재시도가 필요한 채팅 메시지 알림만
 * 예외로 outbox(bambi-chat-sync-queue)가 createBambiNotification을 직접 쓴다.
 */
export const notifyBambiNotification = async (
	input: CreateBambiNotificationInput
): Promise<void> => {
	try {
		await createBambiNotification(input);
	} catch (error) {
		logBambiNotificationError(error, "bambi notification create failed");
	}
};

/**
 * 운영자 조치 알림의 대상 타입. 조치 지점마다 "이 대상의 주인이 누구인가"를 다시 쓰지
 * 않도록, 여기 한 곳에서만 해석한다. 수신자 id가 이미 핸들러에 있는 이벤트
 * (사업자 인증 owner·팀 초대 대상·구성원 변경)는 이 훅이 아니라
 * notifyBambiNotification으로 직접 부른다 — 훅이 같은 조회를 두 번 하지 않게.
 */
export type ModerationNotificationTargetType =
	| "community_comment"
	| "community_post"
	| "job_post"
	| "report"
	| "review";

interface NotifyModerationActionInput {
	/** 감사 로그(admin_moderation_action.action)와 같은 문자열을 그대로 넘긴다. */
	action: string;
	actorUserId: string;
	metadata?: Record<string, unknown>;
	reason?: null | string;
	targetId: string;
	targetType: ModerationNotificationTargetType;
}

/** 대상 주인 조회. 못 찾으면 null이고, 알림은 조용히 생략된다. */
const loadModerationOwnerUserId = async (
	targetType: ModerationNotificationTargetType,
	targetId: string
): Promise<null | string> => {
	const { db } = await import("@bambi-app/db");
	const { communityComment, communityPost, jobPost, report, review } =
		await import("@bambi-app/db/schema/bambi");

	switch (targetType) {
		case "job_post": {
			const [row] = await db
				.select({ userId: jobPost.createdByUserId })
				.from(jobPost)
				.where(eq(jobPost.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "review": {
			const [row] = await db
				.select({ userId: review.reviewerUserId })
				.from(review)
				.where(eq(review.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "community_post": {
			// 게스트 글은 author_user_id가 null이다 — 계정이 없어 알림을 보낼 곳도 없다.
			const [row] = await db
				.select({ userId: communityPost.authorUserId })
				.from(communityPost)
				.where(eq(communityPost.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "community_comment": {
			const [row] = await db
				.select({ userId: communityComment.authorUserId })
				.from(communityComment)
				.where(eq(communityComment.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "report": {
			// 신고 대상의 주인이 아니라 신고자에게 처리 결과를 알린다(스펙 §3).
			const [row] = await db
				.select({ userId: report.reporterUserId })
				.from(report)
				.where(eq(report.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		default:
			return null;
	}
};

/**
 * 운영자 조치 → 당사자 알림. admin_moderation_action을 남기는 지점에서 부른다.
 * best-effort라 조회·전송이 실패해도 조치 자체는 그대로 성립한다.
 */
export const notifyModerationAction = async ({
	action,
	actorUserId,
	metadata,
	reason,
	targetId,
	targetType,
}: NotifyModerationActionInput): Promise<void> => {
	try {
		const ownerUserId = await loadModerationOwnerUserId(targetType, targetId);
		const [recipientUserId] = resolveNotificationRecipients(
			[ownerUserId],
			actorUserId
		);

		if (!recipientUserId) {
			return;
		}

		await notifyBambiNotification({
			actorUserId,
			metadata: { ...metadata, action, reason: reason ?? null },
			recipientUserId,
			targetId,
			targetType,
		});
	} catch (error) {
		logBambiNotificationError(error, "bambi moderation notification failed");
	}
};
