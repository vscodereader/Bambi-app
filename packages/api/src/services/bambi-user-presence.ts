export const USER_ACTIVITY_HEADER = "x-bambi-user-activity";
export const USER_ACTIVITY_HEADER_VALUE = "1";
export const DEFAULT_USER_OFFLINE_AFTER_MINUTES = 20;
export const USER_ACTIVITY_WRITE_INTERVAL_MS = 10_000;
export const USER_ACTIVITY_SIGNAL_TTL_MS = 10_000;
export const USER_PRESENCE_CONNECTION_LEASE_MS = 90_000;
export const USER_PRESENCE_CONNECTION_RENEW_MS = 30_000;
export const USER_PRESENCE_CHANNEL = "bambi_user_presence";
export const USER_PRESENCE_SSE_EVENT = "bambi:presence";
export const USER_PRESENCE_SSE_HEARTBEAT_EVENT = "bambi:presence-ping";
export const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface UserPresenceSnapshot {
	deletedAt: Date | null;
	lastActivityAt: Date | null;
	presenceDisconnectedAt: Date | null;
}

export type UserPresenceEvent =
	| {
			deletedAt: number | null;
			lastActivityAt: number | null;
			presenceDisconnectedAt: number | null;
			type: "user";
			userId: string;
	  }
	| {
			offlineAfterMinutes: number | null;
			type: "policy";
	  };

export const resolveUserOfflineAfterMinutes = (
	value: number | null | undefined
): number => value ?? DEFAULT_USER_OFFLINE_AFTER_MINUTES;

export const isUserOnline = ({
	deletedAt,
	lastActivityAt,
	now,
	offlineAfterMinutes,
	presenceDisconnectedAt,
}: UserPresenceSnapshot & {
	now: Date;
	offlineAfterMinutes: number;
}): boolean => {
	if (deletedAt || !lastActivityAt) {
		return false;
	}

	if (
		presenceDisconnectedAt &&
		presenceDisconnectedAt.getTime() >= lastActivityAt.getTime()
	) {
		return false;
	}

	return (
		now.getTime() - lastActivityAt.getTime() < offlineAfterMinutes * 60_000
	);
};

export const getUserPresenceExpiryAt = (
	lastActivityAt: Date | null,
	offlineAfterMinutes: number
): Date | null =>
	lastActivityAt
		? new Date(lastActivityAt.getTime() + offlineAfterMinutes * 60_000)
		: null;

export const parseUserPresenceEvent = (
	raw: string
): UserPresenceEvent | null => {
	try {
		const parsed = JSON.parse(raw) as Partial<UserPresenceEvent>;
		if (parsed.type === "policy") {
			return typeof parsed.offlineAfterMinutes === "number" ||
				parsed.offlineAfterMinutes === null
				? {
						offlineAfterMinutes: parsed.offlineAfterMinutes,
						type: "policy",
					}
				: null;
		}
		if (parsed.type !== "user" || typeof parsed.userId !== "string") {
			return null;
		}
		const deletedAt = parsed.deletedAt ?? null;
		const lastActivityAt = parsed.lastActivityAt ?? null;
		const presenceDisconnectedAt = parsed.presenceDisconnectedAt ?? null;
		if (
			(deletedAt !== null && typeof deletedAt !== "number") ||
			(lastActivityAt !== null && typeof lastActivityAt !== "number") ||
			(presenceDisconnectedAt !== null &&
				typeof presenceDisconnectedAt !== "number")
		) {
			return null;
		}
		return {
			deletedAt,
			lastActivityAt,
			presenceDisconnectedAt,
			type: "user",
			userId: parsed.userId,
		};
	} catch {
		return null;
	}
};
