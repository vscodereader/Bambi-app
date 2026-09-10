import { db } from "@bambi-app/db";
import { chatResponseActivity } from "@bambi-app/db/schema/bambi";
import {
	and,
	asc,
	avg,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	lt,
	ne,
	sql,
} from "drizzle-orm";

import {
	CHAT_RESPONSE_WINDOW_DAYS,
	type ChatResponseBucket,
	resolveChatResponseBucket,
} from "./bambi-chat-response-policy";

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * MILLISECONDS_PER_SECOND;

type ChatResponseTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

export const lockChatResponseActivityRoom = async (
	tx: ChatResponseTransaction,
	chatRoomId: string
): Promise<void> => {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${`chat-response:${chatRoomId}`}, 0))`
	);
};

export interface RecordChatResponseActivityInput {
	activityKey: string;
	actorUserId: string;
	chatRoomId: string;
	occurredAt: Date;
}

export const recordChatResponseActivity = async (
	tx: ChatResponseTransaction,
	input: RecordChatResponseActivityInput
): Promise<{ created: boolean; responseSeconds: null | number }> => {
	await lockChatResponseActivityRoom(tx, input.chatRoomId);

	const [existing] = await tx
		.select({ responseSeconds: chatResponseActivity.responseSeconds })
		.from(chatResponseActivity)
		.where(eq(chatResponseActivity.activityKey, input.activityKey))
		.limit(1);
	if (existing) {
		return { created: false, responseSeconds: existing.responseSeconds };
	}

	const [previous] = await tx
		.select({
			actorUserId: chatResponseActivity.actorUserId,
			id: chatResponseActivity.id,
		})
		.from(chatResponseActivity)
		.where(eq(chatResponseActivity.chatRoomId, input.chatRoomId))
		.orderBy(desc(chatResponseActivity.id))
		.limit(1);

	let promptStartedAt: Date | null = null;
	let responseSeconds: number | null = null;
	if (previous && previous.actorUserId !== input.actorUserId) {
		const [boundary] = await tx
			.select({ id: chatResponseActivity.id })
			.from(chatResponseActivity)
			.where(
				and(
					eq(chatResponseActivity.chatRoomId, input.chatRoomId),
					lt(chatResponseActivity.id, previous.id),
					ne(chatResponseActivity.actorUserId, previous.actorUserId)
				)
			)
			.orderBy(desc(chatResponseActivity.id))
			.limit(1);
		const promptConditions = [
			eq(chatResponseActivity.chatRoomId, input.chatRoomId),
			boundary ? gt(chatResponseActivity.id, boundary.id) : undefined,
		];
		const [prompt] = await tx
			.select({ occurredAt: chatResponseActivity.occurredAt })
			.from(chatResponseActivity)
			.where(and(...promptConditions))
			.orderBy(asc(chatResponseActivity.id))
			.limit(1);
		if (prompt) {
			promptStartedAt = prompt.occurredAt;
			responseSeconds = Math.max(
				0,
				Math.floor(
					(input.occurredAt.getTime() - prompt.occurredAt.getTime()) /
						MILLISECONDS_PER_SECOND
				)
			);
		}
	}

	const inserted = await tx
		.insert(chatResponseActivity)
		.values({
			activityKey: input.activityKey,
			actorUserId: input.actorUserId,
			chatRoomId: input.chatRoomId,
			occurredAt: input.occurredAt,
			promptStartedAt,
			responseSeconds,
		})
		.onConflictDoNothing({ target: chatResponseActivity.activityKey })
		.returning({ id: chatResponseActivity.id });

	return { created: inserted.length > 0, responseSeconds };
};

export const getChatResponseBucketsByUser = async (
	userIds: string[],
	now = new Date()
): Promise<Map<string, ChatResponseBucket>> => {
	const uniqueUserIds = [...new Set(userIds)];
	if (uniqueUserIds.length === 0) {
		return new Map();
	}
	const cutoff = new Date(
		now.getTime() - CHAT_RESPONSE_WINDOW_DAYS * MILLISECONDS_PER_DAY
	);
	const rows = await db
		.select({
			actorUserId: chatResponseActivity.actorUserId,
			averageResponseSeconds: avg(chatResponseActivity.responseSeconds),
		})
		.from(chatResponseActivity)
		.where(
			and(
				inArray(chatResponseActivity.actorUserId, uniqueUserIds),
				gte(chatResponseActivity.occurredAt, cutoff),
				isNotNull(chatResponseActivity.responseSeconds)
			)
		)
		.groupBy(chatResponseActivity.actorUserId);

	return new Map(
		rows.flatMap((row) => {
			const average = Number(row.averageResponseSeconds);
			const bucket = Number.isFinite(average)
				? resolveChatResponseBucket(average)
				: null;
			return bucket ? [[row.actorUserId, bucket] as const] : [];
		})
	);
};
