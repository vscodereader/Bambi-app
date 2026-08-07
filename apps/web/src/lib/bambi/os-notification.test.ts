import { afterEach, describe, expect, it, vi } from "vitest";

import {
	osNotificationPermission,
	showOsNotification,
} from "./os-notification";

afterEach(() => {
	vi.unstubAllGlobals();
});

const stubNotification = (permission: NotificationPermission) => {
	const constructed: { options?: NotificationOptions; title: string }[] = [];
	class FakeNotification {
		static permission = permission;
		onclick: (() => void) | null = null;
		constructor(title: string, options?: NotificationOptions) {
			constructed.push({ options, title });
		}
	}
	vi.stubGlobal("Notification", FakeNotification);
	vi.stubGlobal("window", { Notification: FakeNotification });
	return constructed;
};

describe("osNotificationPermission", () => {
	it("Notification API가 없으면 unsupported다", () => {
		vi.stubGlobal("window", {});
		expect(osNotificationPermission()).toBe("unsupported");
	});

	it("권한 상태를 그대로 돌려준다", () => {
		stubNotification("granted");
		expect(osNotificationPermission()).toBe("granted");
	});
});

describe("showOsNotification", () => {
	it("탭이 숨겨져 있고 권한이 허용이면 띄운다", () => {
		const constructed = stubNotification("granted");
		vi.stubGlobal("document", { hidden: true });

		showOsNotification({ href: "/seeker/notifications", title: "새 알림" });

		expect(constructed).toHaveLength(1);
		expect(constructed[0]?.title).toBe("새 알림");
	});

	it("탭을 보고 있으면 띄우지 않는다(화면이 이미 갱신된다)", () => {
		const constructed = stubNotification("granted");
		vi.stubGlobal("document", { hidden: false });

		showOsNotification({ href: "/seeker/notifications", title: "새 알림" });

		expect(constructed).toHaveLength(0);
	});

	it("권한이 없으면 조용히 무시한다(진입 시 강제 팝업 금지)", () => {
		const constructed = stubNotification("default");
		vi.stubGlobal("document", { hidden: true });

		expect(() =>
			showOsNotification({ href: "/seeker/notifications", title: "새 알림" })
		).not.toThrow();
		expect(constructed).toHaveLength(0);
	});
});
