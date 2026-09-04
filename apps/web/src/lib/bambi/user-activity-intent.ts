import {
	USER_ACTIVITY_HEADER,
	USER_ACTIVITY_HEADER_VALUE,
	USER_ACTIVITY_SIGNAL_TTL_MS,
	USER_PRESENCE_CONNECTION_ID_QUERY,
	USER_PRESENCE_DISCONNECT_PATH,
} from "@bambi-app/api/services/bambi-user-presence";
import { env } from "@bambi-app/env/web";

const PRESENCE_CONNECTION_STORAGE_KEY = "bambi-presence-connection-id";
const PRESENCE_CONNECTION_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let lastIntentAt = Date.now();
let consumed = false;
let installed = false;
let memoryPresenceConnectionId: string | null = null;

const createPresenceConnectionId = (): string => {
	try {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.randomUUID === "function"
		) {
			return crypto.randomUUID();
		}
	} catch {
		// 비보안 origin·제한된 WebView에서는 Web Crypto 접근 자체가 실패할 수 있다.
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
		const random = Math.floor(Math.random() * 16);
		const value = token === "x" ? random : (random % 4) + 8;
		return value.toString(16);
	});
};

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
		const query = new URLSearchParams({
			[USER_PRESENCE_CONNECTION_ID_QUERY]: connectionId,
		});
		fetch(
			`${env.NEXT_PUBLIC_SERVER_URL}${USER_PRESENCE_DISCONNECT_PATH}?${query}`,
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
	if (memoryPresenceConnectionId) {
		return memoryPresenceConnectionId;
	}
	try {
		const existing = sessionStorage.getItem(PRESENCE_CONNECTION_STORAGE_KEY);
		if (existing && PRESENCE_CONNECTION_ID_PATTERN.test(existing)) {
			memoryPresenceConnectionId = existing;
			return existing;
		}
	} catch {
		// 차단된 storage에서는 탭 수명 인메모리 id로 계속 동작한다.
	}
	const created = createPresenceConnectionId();
	memoryPresenceConnectionId = created;
	try {
		sessionStorage.setItem(PRESENCE_CONNECTION_STORAGE_KEY, created);
	} catch {
		// 저장 실패는 알림·presence 스트림을 막지 않는다.
	}
	return created;
};
