import { describe, expect, it } from "vitest";

import {
	DEFAULT_USER_OFFLINE_AFTER_MINUTES,
	getUserPresenceExpiryAt,
	isUserOnline,
	parseUserPresenceEvent,
	resolveUserOfflineAfterMinutes,
} from "@/services/bambi-user-presence";

const now = new Date("2026-09-04T01:00:00.000Z");

describe("bambi user presence", () => {
	it("uses the shared default and keeps configured positive values", () => {
		expect(resolveUserOfflineAfterMinutes(null)).toBe(
			DEFAULT_USER_OFFLINE_AFTER_MINUTES
		);
		expect(resolveUserOfflineAfterMinutes(100)).toBe(100);
	});

	it("is online strictly before the configured inactivity boundary", () => {
		const common = {
			deletedAt: null,
			now,
			offlineAfterMinutes: 20,
			presenceDisconnectedAt: null,
		};
		expect(
			isUserOnline({
				...common,
				lastActivityAt: new Date("2026-09-04T00:40:00.001Z"),
			})
		).toBe(true);
		expect(
			isUserOnline({
				...common,
				lastActivityAt: new Date("2026-09-04T00:40:00.000Z"),
			})
		).toBe(false);
	});

	it("treats missing, deleted, and explicitly disconnected users as offline", () => {
		const common = { now, offlineAfterMinutes: 20 };
		expect(
			isUserOnline({
				...common,
				deletedAt: null,
				lastActivityAt: null,
				presenceDisconnectedAt: null,
			})
		).toBe(false);
		expect(
			isUserOnline({
				...common,
				deletedAt: now,
				lastActivityAt: now,
				presenceDisconnectedAt: null,
			})
		).toBe(false);
		expect(
			isUserOnline({
				...common,
				deletedAt: null,
				lastActivityAt: new Date("2026-09-04T00:59:00.000Z"),
				presenceDisconnectedAt: now,
			})
		).toBe(false);
	});

	it("computes the exact expiry and parses database events defensively", () => {
		expect(getUserPresenceExpiryAt(now, 100)?.toISOString()).toBe(
			"2026-09-04T02:40:00.000Z"
		);
		expect(
			parseUserPresenceEvent(
				'{"type":"user","userId":"user-1","lastActivityAt":null}'
			)
		).toMatchObject({ type: "user", userId: "user-1" });
		expect(parseUserPresenceEvent("invalid")).toBeNull();
		expect(parseUserPresenceEvent('{"type":"resync"}')).toEqual({
			type: "resync",
		});
	});
});
