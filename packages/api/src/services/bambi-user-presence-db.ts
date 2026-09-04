import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiSiteSettings,
	userPresenceConnection,
} from "@bambi-app/db/schema/bambi";
import {
	and,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";

import {
	resolveUserOfflineAfterMinutes,
	USER_ACTIVITY_WRITE_INTERVAL_MS,
	USER_PRESENCE_CONNECTION_LEASE_MS,
} from "./bambi-user-presence";

export type UserPresencePlatform = "native" | "web";
const SITE_SETTINGS_ROW_ID = "default";

export const getUserOfflineAfterMinutes = async (): Promise<number> => {
	const [row] = await db
		.select({ value: bambiSiteSettings.userOfflineAfterMinutes })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	return resolveUserOfflineAfterMinutes(row?.value);
};

const leaseExpiry = (now: Date): Date =>
	new Date(now.getTime() + USER_PRESENCE_CONNECTION_LEASE_MS);

const lockUserPresence = async (
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	userId: string
): Promise<void> => {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${`user-presence:${userId}`}, 0))`
	);
};

export const recordUserActivity = async (
	userId: string,
	now = new Date()
): Promise<boolean> => {
	const writeBefore = new Date(now.getTime() - USER_ACTIVITY_WRITE_INTERVAL_MS);
	const updated = await db
		.update(user)
		.set({ lastActivityAt: now, presenceDisconnectedAt: null })
		.where(
			and(
				eq(user.id, userId),
				isNull(user.deletedAt),
				or(
					isNull(user.lastActivityAt),
					lt(user.lastActivityAt, writeBefore),
					isNotNull(user.presenceDisconnectedAt)
				)
			)
		)
		.returning({ id: user.id });
	return updated.length > 0;
};

export const registerUserPresenceConnection = async ({
	connectionId,
	now = new Date(),
	platform,
	sessionId,
	userId,
}: {
	connectionId: string;
	now?: Date;
	platform: UserPresencePlatform;
	sessionId: string;
	userId: string;
}): Promise<void> => {
	await db.transaction(async (tx) => {
		await lockUserPresence(tx, userId);
		await tx
			.delete(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.userId, userId),
					lt(userPresenceConnection.leaseExpiresAt, now)
				)
			);
		await tx
			.insert(userPresenceConnection)
			.values({
				connectedAt: now,
				id: connectionId,
				leaseExpiresAt: leaseExpiry(now),
				platform,
				sessionId,
				updatedAt: now,
				userId,
			})
			.onConflictDoNothing();
		await tx
			.update(userPresenceConnection)
			.set({ leaseExpiresAt: leaseExpiry(now), updatedAt: now })
			.where(
				and(
					eq(userPresenceConnection.id, connectionId),
					eq(userPresenceConnection.sessionId, sessionId),
					eq(userPresenceConnection.userId, userId)
				)
			);
	});
};

export const renewUserPresenceConnections = async (
	connectionIds: string[],
	now = new Date()
): Promise<void> => {
	if (connectionIds.length === 0) {
		return;
	}
	await db
		.update(userPresenceConnection)
		.set({ leaseExpiresAt: leaseExpiry(now), updatedAt: now })
		.where(inArray(userPresenceConnection.id, connectionIds));
};

export const renewUserPresenceConnection = async ({
	connectionId,
	now = new Date(),
	sessionId,
	userId,
}: {
	connectionId: string;
	now?: Date;
	sessionId: string;
	userId: string;
}): Promise<void> => {
	await db
		.update(userPresenceConnection)
		.set({ leaseExpiresAt: leaseExpiry(now), updatedAt: now })
		.where(
			and(
				eq(userPresenceConnection.id, connectionId),
				eq(userPresenceConnection.sessionId, sessionId),
				eq(userPresenceConnection.userId, userId)
			)
		);
};

export const disconnectUserPresenceConnection = async ({
	connectionId,
	now = new Date(),
	sessionId,
	userId,
}: {
	connectionId: string;
	now?: Date;
	sessionId: string;
	userId: string;
}): Promise<boolean> =>
	db.transaction(async (tx) => {
		await lockUserPresence(tx, userId);
		const removed = await tx
			.delete(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.id, connectionId),
					eq(userPresenceConnection.sessionId, sessionId),
					eq(userPresenceConnection.userId, userId)
				)
			)
			.returning({ id: userPresenceConnection.id });

		if (removed.length === 0) {
			return false;
		}

		await tx
			.delete(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.userId, userId),
					lt(userPresenceConnection.leaseExpiresAt, now)
				)
			);
		const [remaining] = await tx
			.select({ id: userPresenceConnection.id })
			.from(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.userId, userId),
					gt(userPresenceConnection.leaseExpiresAt, now)
				)
			)
			.limit(1);

		if (remaining) {
			return false;
		}

		await tx
			.update(user)
			.set({ presenceDisconnectedAt: now })
			.where(eq(user.id, userId));
		return true;
	});

export const disconnectUserPresenceSession = async ({
	now = new Date(),
	sessionId,
	userId,
}: {
	now?: Date;
	sessionId: string;
	userId: string;
}): Promise<boolean> =>
	db.transaction(async (tx) => {
		await lockUserPresence(tx, userId);
		await tx
			.delete(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.sessionId, sessionId),
					eq(userPresenceConnection.userId, userId)
				)
			);
		await tx
			.delete(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.userId, userId),
					lt(userPresenceConnection.leaseExpiresAt, now)
				)
			);
		const [remaining] = await tx
			.select({ id: userPresenceConnection.id })
			.from(userPresenceConnection)
			.where(
				and(
					eq(userPresenceConnection.userId, userId),
					gt(userPresenceConnection.leaseExpiresAt, now)
				)
			)
			.limit(1);
		if (remaining) {
			return false;
		}
		await tx
			.update(user)
			.set({ presenceDisconnectedAt: now })
			.where(eq(user.id, userId));
		return true;
	});
