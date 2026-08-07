import { db } from "@bambi-app/db";
import { chatMessage, report } from "@bambi-app/db/schema/bambi";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

// 기각만 방을 다시 연다. 접수·검토·조치 완료 신고는 양쪽 참여자에게 동일하게 막힌다.
export const CHAT_UNAVAILABLE_REPORT_STATUSES = [
	"open",
	"reviewing",
	"resolved",
] as const;

const uuidSchema = z.string().uuid();

/** 활성 채팅 신고가 걸린 방을 신고자와 무관하게 찾는다. */
export const getRoomIdsHiddenByActiveReport = async (
	roomIds: string[]
): Promise<Set<string>> => {
	if (roomIds.length === 0) {
		return new Set();
	}

	const [directRows, messageReportRows] = await Promise.all([
		db
			.select({ roomId: report.targetId })
			.from(report)
			.where(
				and(
					eq(report.targetType, "chat_room"),
					inArray(report.targetId, roomIds),
					inArray(report.status, [...CHAT_UNAVAILABLE_REPORT_STATUSES])
				)
			),
		db
			.select({ messageId: report.targetId })
			.from(report)
			.where(
				and(
					eq(report.targetType, "chat_message"),
					inArray(report.status, [...CHAT_UNAVAILABLE_REPORT_STATUSES])
				)
			),
	]);

	const messageIds = messageReportRows
		.map(({ messageId }) => messageId)
		.filter((messageId) => uuidSchema.safeParse(messageId).success);
	const viaMessageRows =
		messageIds.length === 0
			? []
			: await db
					.select({ roomId: chatMessage.chatRoomId })
					.from(chatMessage)
					.where(
						and(
							inArray(chatMessage.id, messageIds),
							inArray(chatMessage.chatRoomId, roomIds)
						)
					);

	return new Set([
		...directRows.map(({ roomId }) => roomId),
		...viaMessageRows.map(({ roomId }) => roomId),
	]);
};
