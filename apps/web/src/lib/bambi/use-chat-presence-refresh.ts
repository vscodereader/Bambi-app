"use client";

import { useEffect } from "react";

const TIMER_PADDING_MS = 50;

export const useChatPresenceRefresh = (
	refreshAtValues: Array<Date | null | string | undefined>,
	refresh: () => unknown
): void => {
	const timestamps = refreshAtValues
		.flatMap((value) => {
			if (!value) {
				return [];
			}
			const timestamp = new Date(value).getTime();
			return Number.isFinite(timestamp) ? [timestamp] : [];
		})
		.filter(Number.isFinite);
	const nextRefreshAt = timestamps.length > 0 ? Math.min(...timestamps) : null;

	useEffect(() => {
		if (nextRefreshAt === null) {
			return;
		}
		const timer = window.setTimeout(
			() => {
				Promise.resolve(refresh()).catch(() => undefined);
			},
			Math.max(0, nextRefreshAt - Date.now()) + TIMER_PADDING_MS
		);
		return () => window.clearTimeout(timer);
	}, [nextRefreshAt, refresh]);
};
