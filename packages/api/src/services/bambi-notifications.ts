import { bambiNotification } from "@bambi-app/db/schema/bambi";

import { emitBambiNotification } from "./bambi-notification-stream";

type NotificationTargetType = "chat_message" | "chat_room";

export interface CreateBambiNotificationInput {
	actorUserId: string;
	chatRoomId?: null | string;
	recipientUserId: string;
	targetId: string;
	targetType: NotificationTargetType;
}

export const buildBambiNotificationValues = ({
	actorUserId,
	chatRoomId,
	recipientUserId,
	targetId,
	targetType,
}: CreateBambiNotificationInput) => ({
	actorUserId,
	chatRoomId,
	metadata: { source: "chat" },
	recipientUserId,
	targetId,
	targetType,
});

export const createBambiNotification = async (
	input: CreateBambiNotificationInput
): Promise<string | null> => {
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

	// 알림 행이 실제로 생겼을 때만 SSE로 밀어 준다. 본문·연락처는 담지 않고
	// "무엇이 생겼는지"만 보내 클라이언트가 정본을 다시 조회하게 한다.
	emitBambiNotification(input.recipientUserId, {
		chatRoomId: input.chatRoomId ?? null,
		createdAt: notification.createdAt.toISOString(),
		notificationId: notification.id,
		targetId: input.targetId,
		targetType: input.targetType,
	});

	return notification.id;
};
