import { describe, expect, it } from "vitest";
import {
	isPopupHidden,
	nativePopupLink,
	nativePopupPageId,
	onboardingCompletionKey,
	popupHiddenKey,
	savePopupLoginTarget,
	takePopupLoginTarget,
	warnedDismissKey,
} from "./account-experience";

const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

describe("account experience storage", () => {
	it("경고는 사용자와 제재 시각별 key를 쓴다", () => {
		expect(warnedDismissKey("u", null)).toContain("u.no-timestamp");
		expect(warnedDismissKey("u", "2026-09-10T00:00:00Z")).toContain(
			"1788998400000"
		);
	});
	it("현재 native 화면만 popup page와 링크로 변환한다", () => {
		expect(nativePopupPageId("/(seeker)/me/attendance")).toBe(
			"seeker_attendance"
		);
		expect(nativePopupLink("/seeker/jobs/job-1")).toBe("/(seeker)/jobs/job-1");
		expect(nativePopupLink("/support")).toBeNull();
	});
	it("로그인 target은 한 번만 소비하는 메모리 세션 값이다", () => {
		savePopupLoginTarget("/(seeker)/jobs/a");
		expect(takePopupLoginTarget()).toBe("/(seeker)/jobs/a");
		expect(takePopupLoginTarget()).toBeNull();
	});
	it("온보딩과 팝업 key가 사용자 역할 및 popup별로 갈린다", () => {
		const onboardingKey = onboardingCompletionKey("u", "job_seeker");
		const hiddenKey = popupHiddenKey("p");
		expect(onboardingKey).toContain("u.job_seeker");
		expect(hiddenKey).toBe("bambi.main-popup.hidden.p");
		for (const key of [
			onboardingKey,
			hiddenKey,
			warnedDismissKey("u", "2026-09-10T00:00:00Z"),
		]) {
			expect(key).toMatch(SECURE_STORE_KEY_PATTERN);
		}
	});
	it("같은 revision이고 숨김 시간이 남았을 때만 숨긴다", () => {
		const raw = JSON.stringify({ hiddenUntil: 200, revision: 2 });
		expect(isPopupHidden(raw, 2, 100)).toBe(true);
		expect(isPopupHidden(raw, 3, 100)).toBe(false);
		expect(isPopupHidden(raw, 2, 300)).toBe(false);
	});
});
