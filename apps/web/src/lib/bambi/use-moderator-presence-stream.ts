"use client";

import {
	DEFAULT_USER_OFFLINE_AFTER_MINUTES,
	parseUserPresenceEvent,
	USER_ACTIVITY_WRITE_INTERVAL_MS,
	USER_PRESENCE_SSE_EVENT,
	USER_PRESENCE_SSE_PATH,
	type UserPresenceEvent,
} from "@bambi-app/api/services/bambi-user-presence";
import { env } from "@bambi-app/env/web";
import { useSyncExternalStore } from "react";

interface PresenceStoreSnapshot {
	now: number;
	policyMinutes: number | null;
	reconnectRevision: number;
	users: ReadonlyMap<string, Extract<UserPresenceEvent, { type: "user" }>>;
}

const listeners = new Set<() => void>();
let source: EventSource | null = null;
let timer: null | ReturnType<typeof setInterval> = null;
let snapshot: PresenceStoreSnapshot = {
	now: Date.now(),
	policyMinutes: null,
	reconnectRevision: 0,
	users: new Map(),
};

const emit = (patch: Partial<PresenceStoreSnapshot>): void => {
	snapshot = { ...snapshot, ...patch };
	for (const listener of listeners) {
		listener();
	}
};

const open = (): void => {
	if (source || listeners.size === 0) {
		return;
	}
	const nextSource = new EventSource(
		`${env.NEXT_PUBLIC_SERVER_URL}${USER_PRESENCE_SSE_PATH}`,
		{ withCredentials: true }
	);
	nextSource.addEventListener("open", () => {
		emit({ reconnectRevision: snapshot.reconnectRevision + 1 });
	});
	nextSource.addEventListener(USER_PRESENCE_SSE_EVENT, (message) => {
		const event = parseUserPresenceEvent(
			(message as MessageEvent<string>).data
		);
		if (!event) {
			return;
		}
		if (event.type === "resync") {
			emit({ reconnectRevision: snapshot.reconnectRevision + 1 });
			return;
		}
		if (event.type === "policy") {
			emit({ policyMinutes: event.offlineAfterMinutes });
			return;
		}
		const users = new Map(snapshot.users);
		users.set(event.userId, event);
		emit({ now: Date.now(), users });
	});
	source = nextSource;
	timer = setInterval(
		() => emit({ now: Date.now() }),
		USER_ACTIVITY_WRITE_INTERVAL_MS
	);
};

const close = (): void => {
	source?.close();
	source = null;
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
};

const subscribe = (listener: () => void): (() => void) => {
	listeners.add(listener);
	open();
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			close();
		}
	};
};

const getSnapshot = (): PresenceStoreSnapshot => snapshot;
const serverSnapshot: PresenceStoreSnapshot = {
	now: Date.now(),
	policyMinutes: DEFAULT_USER_OFFLINE_AFTER_MINUTES,
	reconnectRevision: 0,
	users: new Map(),
};
const getServerSnapshot = (): PresenceStoreSnapshot => serverSnapshot;

export const useModeratorPresenceStream = (): PresenceStoreSnapshot =>
	useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

const optionalDate = (value: Date | number | string | null): Date | null =>
	value ? new Date(value) : null;

export const resolveLivePresenceSnapshot = (
	event: Extract<UserPresenceEvent, { type: "user" }> | undefined,
	fallback: {
		deletedAt: Date | number | string | null;
		lastActivityAt: Date | number | string | null;
		presenceDisconnectedAt: Date | number | string | null;
	}
) => ({
	deletedAt: optionalDate(event ? event.deletedAt : fallback.deletedAt),
	lastActivityAt: optionalDate(
		event ? event.lastActivityAt : fallback.lastActivityAt
	),
	presenceDisconnectedAt: optionalDate(
		event ? event.presenceDisconnectedAt : fallback.presenceDisconnectedAt
	),
});
