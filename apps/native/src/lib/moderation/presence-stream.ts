import {
	DEFAULT_USER_OFFLINE_AFTER_MINUTES,
	parseUserPresenceEvent,
	USER_ACTIVITY_WRITE_INTERVAL_MS,
	USER_PRESENCE_SSE_EVENT,
	USER_PRESENCE_SSE_PATH,
	type UserPresenceEvent,
} from "@bambi-app/api/services/bambi-user-presence";
import { env } from "@bambi-app/env/native";
import { fetch } from "expo/fetch";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { authClient } from "@/lib/auth-client";
import { parseSseChunk } from "@/src/lib/sse-parser";

type UserEvent = Extract<UserPresenceEvent, { type: "user" }>;
export interface PresenceSnapshot {
	now: number;
	policyMinutes: number;
	reconnectRevision: number;
	users: ReadonlyMap<string, UserEvent>;
}

const optionalDate = (value: Date | number | string | null): Date | null =>
	value === null ? null : new Date(value);

export const resolveLivePresence = (
	event: UserEvent | undefined,
	fallback: {
		deletedAt: Date | string | null;
		lastActivityAt: Date | string | null;
		presenceDisconnectedAt: Date | string | null;
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

export function useModeratorPresence(): PresenceSnapshot {
	const [snapshot, setSnapshot] = useState<PresenceSnapshot>({
		now: Date.now(),
		policyMinutes: DEFAULT_USER_OFFLINE_AFTER_MINUTES,
		reconnectRevision: 0,
		users: new Map(),
	});

	useEffect(() => {
		let abort: AbortController | null = null;
		let disposed = false;
		let retry: ReturnType<typeof setTimeout> | null = null;
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one SSE connection owns stream parsing, lifecycle, and reconnect scheduling.
		const open = async () => {
			if (disposed || AppState.currentState !== "active") {
				return;
			}
			abort = new AbortController();
			try {
				const cookie = authClient.getCookie();
				const response = await fetch(
					`${env.EXPO_PUBLIC_SERVER_URL}${USER_PRESENCE_SSE_PATH}`,
					{
						credentials: "omit",
						headers: cookie ? { Cookie: cookie } : {},
						signal: abort.signal,
					}
				);
				if (!(response.ok && response.body)) {
					throw new Error(`presence ${response.status}`);
				}
				setSnapshot((current) => ({
					...current,
					reconnectRevision: current.reconnectRevision + 1,
				}));
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				while (!disposed) {
					const part = await reader.read();
					if (part.done) {
						break;
					}
					buffer += decoder.decode(part.value, { stream: true });
					const parsed = parseSseChunk(buffer);
					buffer = parsed.rest;
					for (const frame of parsed.frames) {
						if (frame.event !== USER_PRESENCE_SSE_EVENT) {
							continue;
						}
						const event = parseUserPresenceEvent(frame.data);
						if (!event) {
							continue;
						}
						setSnapshot((current) => {
							if (event.type === "resync") {
								return {
									...current,
									reconnectRevision: current.reconnectRevision + 1,
								};
							}
							if (event.type === "policy") {
								return {
									...current,
									policyMinutes:
										event.offlineAfterMinutes ??
										DEFAULT_USER_OFFLINE_AFTER_MINUTES,
								};
							}
							const users = new Map(current.users);
							users.set(event.userId, event);
							return { ...current, now: Date.now(), users };
						});
					}
				}
			} catch {
				/* reconnect below */
			} finally {
				abort = null;
				if (!disposed && AppState.currentState === "active") {
					retry = setTimeout(open, 1000);
				}
			}
		};
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") {
				open().catch(() => undefined);
			} else {
				abort?.abort();
			}
		});
		const clock = setInterval(
			() => setSnapshot((current) => ({ ...current, now: Date.now() })),
			USER_ACTIVITY_WRITE_INTERVAL_MS
		);
		open().catch(() => undefined);
		return () => {
			disposed = true;
			abort?.abort();
			if (retry) {
				clearTimeout(retry);
			}
			clearInterval(clock);
			subscription.remove();
		};
	}, []);
	return snapshot;
}
