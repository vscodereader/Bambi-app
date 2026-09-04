import {
	USER_ACTIVITY_HEADER,
	USER_ACTIVITY_HEADER_VALUE,
	USER_ACTIVITY_SIGNAL_TTL_MS,
} from "@bambi-app/api/services/bambi-user-presence";
import { env } from "@bambi-app/env/web";

const PRESENCE_CONNECTION_STORAGE_KEY = "bambi-presence-connection-id";

let lastIntentAt = Date.now();
let consumed = false;
let installed = false;

const markIntent = (): void => {
	lastIntentAt = Date.now();
	consumed = false;
};

const installActivityListeners = (): void => {
	if (installed || typeof document === "undefined") {
		return;
	}
	installed = true;
	document.addEventListener("click", markIntent, true);
	document.addEventListener("submit", markIntent, true);
	window.addEventListener("pagehide", () => {
		const connectionId = getPresenceConnectionId();
		fetch(
			`${env.NEXT_PUBLIC_SERVER_URL}/presence/disconnect?connectionId=${encodeURIComponent(connectionId)}`,
			{
				credentials: "include",
				keepalive: true,
				method: "POST",
			}
		).catch(() => undefined);
	});
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Enter" || event.key === " ") {
				markIntent();
			}
		},
		true
	);
};

export const consumeUserActivityHeader = (): Record<string, string> => {
	installActivityListeners();
	if (
		consumed ||
		Date.now() - lastIntentAt > USER_ACTIVITY_SIGNAL_TTL_MS ||
		document.visibilityState !== "visible"
	) {
		return {};
	}
	consumed = true;
	return { [USER_ACTIVITY_HEADER]: USER_ACTIVITY_HEADER_VALUE };
};

export const getPresenceConnectionId = (): string => {
	const existing = sessionStorage.getItem(PRESENCE_CONNECTION_STORAGE_KEY);
	if (existing) {
		return existing;
	}
	const created = crypto.randomUUID();
	sessionStorage.setItem(PRESENCE_CONNECTION_STORAGE_KEY, created);
	return created;
};
