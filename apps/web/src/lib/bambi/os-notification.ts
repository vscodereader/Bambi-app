"use client";

// 브라우저 내장 Notification API 얇은 래퍼. 서비스워커·VAPID를 쓰는 진짜 Web Push는
// 의존성이 필요해 이번 범위 밖이고, 여기서는 "탭은 열려 있지만 보고 있지 않을 때"만
// OS 알림을 띄운다. 권한 요청은 알림함 화면의 안내 배너에서만 부른다 — 진입하자마자
// 권한 팝업을 띄우면 대부분 거부로 굳어 되돌릴 방법이 없다.

export type OsNotificationPermission =
	| "default"
	| "denied"
	| "granted"
	| "unsupported";

const notificationApi = (): typeof Notification | null => {
	if (typeof window === "undefined" || !("Notification" in window)) {
		return null;
	}
	return window.Notification;
};

export function osNotificationPermission(): OsNotificationPermission {
	const api = notificationApi();
	return api ? api.permission : "unsupported";
}

export async function requestOsNotificationPermission(): Promise<OsNotificationPermission> {
	const api = notificationApi();

	if (!api) {
		return "unsupported";
	}

	try {
		return await api.requestPermission();
	} catch {
		// 사용자 제스처 없이 부르면 던지는 브라우저가 있다. 배지·알림함이 정본이라
		// 여기서 실패해도 기능 손실은 없다.
		return api.permission;
	}
}

export function showOsNotification({
	body,
	href,
	title,
}: {
	body?: null | string;
	href: string;
	title: string;
}): void {
	const api = notificationApi();

	if (
		api?.permission !== "granted" ||
		typeof document === "undefined" ||
		!document.hidden
	) {
		return;
	}

	try {
		// tag를 목적지로 두면 같은 곳으로 가는 알림이 쌓이지 않고 하나로 접힌다.
		const notification = new api(title, { body: body ?? undefined, tag: href });
		notification.onclick = () => {
			window.focus();
			window.location.assign(href);
		};
	} catch {
		// OS·브라우저 정책(집중 모드 등)으로 막히면 그대로 넘어간다.
	}
}
