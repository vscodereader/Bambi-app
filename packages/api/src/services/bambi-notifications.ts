import { bambiNotification } from "@bambi-app/db/schema/bambi";

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
		.returning({ id: bambiNotification.id });

	return notification?.id ?? null;
};
