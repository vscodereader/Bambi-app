import { db } from "@bambi-app/db";
import { chatRoom, userBlock } from "@bambi-app/db/schema/bambi";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getRoomIdsHiddenByActiveReport } from "./bambi-chat-report-availability";

// presence 원문은 공개하지 않고, 현재 살아 있는 채팅 관계의 양쪽 개인 socket room을
// 고르는 데만 쓴다. 나간 방과 운영자 차단 방은 일반 사용자 상태 전파 대상이 아니다.
export const getChatPresenceAudienceUserIds = async (
	userId: string
): Promise<string[]> => {
	const rooms = await db
		.select({
			employerUserId: chatRoom.employerUserId,
			id: chatRoom.id,
			jobSeekerUserId: chatRoom.jobSeekerUserId,
		})
		.from(chatRoom)
		.where(
			and(
				or(
					eq(chatRoom.employerUserId, userId),
					eq(chatRoom.jobSeekerUserId, userId)
				),
				eq(chatRoom.isBlocked, false),
				isNull(chatRoom.employerDeletedAt),
				isNull(chatRoom.seekerDeletedAt)
			)
		);

	const counterpartIds = rooms.map((room) =>
		room.employerUserId === userId ? room.jobSeekerUserId : room.employerUserId
	);
	const [hiddenRoomIds, blocks] = await Promise.all([
		getRoomIdsHiddenByActiveReport(rooms.map(({ id }) => id)),
		counterpartIds.length === 0
			? []
			: db
					.select({
						blockedUserId: userBlock.blockedUserId,
						blockerUserId: userBlock.blockerUserId,
					})
					.from(userBlock)
					.where(
						or(
							and(
								eq(userBlock.blockerUserId, userId),
								inArray(userBlock.blockedUserId, counterpartIds)
							),
							and(
								eq(userBlock.blockedUserId, userId),
								inArray(userBlock.blockerUserId, counterpartIds)
							)
						)
					),
	]);
	const blockedCounterpartIds = new Set(
		blocks.map((block) =>
			block.blockerUserId === userId ? block.blockedUserId : block.blockerUserId
		)
	);
	const audience = new Set<string>([userId]);
	for (const room of rooms) {
		if (hiddenRoomIds.has(room.id)) {
			continue;
		}
		const counterpartId =
			room.employerUserId === userId
				? room.jobSeekerUserId
				: room.employerUserId;
		if (!blockedCounterpartIds.has(counterpartId)) {
			audience.add(counterpartId);
		}
	}
	return [...audience];
};
