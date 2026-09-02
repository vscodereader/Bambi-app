import type { Route } from "next";

import { homePathForRole } from "./home-path";

export const ONBOARDING_ROLES = ["employer", "job_seeker"] as const;
export type OnboardingRole = (typeof ONBOARDING_ROLES)[number];
export const ONBOARDING_AUDIENCES = ["common", ...ONBOARDING_ROLES] as const;
export type OnboardingAudience = (typeof ONBOARDING_AUDIENCES)[number];

export const ONBOARDING_ACTION_LABELS = {
	loading: "이용 안내를 준비하고 있어요.",
	next: "다음",
	previous: "이전",
	skip: "건너뛰기",
	start: "시작하기",
} as const;

export const ONBOARDING_AUTO_SWIPE_PAUSE_MS = 1000;
export const ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS = 1000;
export const ONBOARDING_REVIEW_TYPING_INTERVAL_MS = 150;
export const ONBOARDING_REVIEW_SUBMIT_PRESS_MS = 320;
export const ONBOARDING_POINT_SHOP_DIALOG_MS = 2000;
export const ONBOARDING_POINT_SHOP_HISTORY_MS = 3000;

interface StoredOnboardingIntent {
	role: OnboardingRole;
	userId: string;
}

export const SIGNUP_ONBOARDING_INTENT_KEY = "bambi:onboarding:signup-intent";
export const COACHMARK_INTENT_KEY = "bambi:onboarding:coachmark-intent";

const ONBOARDING_COMPLETION_KEY_PREFIX = "bambi:onboarding:seen";

export const isOnboardingRole = (value: unknown): value is OnboardingRole =>
	ONBOARDING_ROLES.includes(value as OnboardingRole);

export const isOnboardingAudience = (
	value: unknown
): value is OnboardingAudience =>
	ONBOARDING_AUDIENCES.includes(value as OnboardingAudience);

const parseIntent = (value: string | null): StoredOnboardingIntent | null => {
	if (!value) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(value);
		if (!(parsed && typeof parsed === "object")) {
			return null;
		}
		const candidate = parsed as Partial<StoredOnboardingIntent>;
		if (
			typeof candidate.userId !== "string" ||
			!candidate.userId ||
			!isOnboardingRole(candidate.role)
		) {
			return null;
		}
		return candidate as StoredOnboardingIntent;
	} catch {
		return null;
	}
};

const readSessionIntent = (key: string): StoredOnboardingIntent | null => {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return parseIntent(window.sessionStorage.getItem(key));
	} catch {
		return null;
	}
};

const writeSessionIntent = (
	key: string,
	intent: StoredOnboardingIntent
): void => {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.sessionStorage.setItem(key, JSON.stringify(intent));
	} catch {
		// 브라우저 저장소가 차단돼도 가입·온보딩 진행 자체는 막지 않는다.
	}
};

const clearSessionIntent = (key: string): void => {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.sessionStorage.removeItem(key);
	} catch {
		// 제거 실패도 화면 진행을 막지 않는다. 사용자·역할 검증이 재사용을 막는다.
	}
};

export const getOnboardingCompletionKey = (
	userId: string,
	role: OnboardingRole
): string => `${ONBOARDING_COMPLETION_KEY_PREFIX}:${userId}:${role}`;

export const markAutomaticOnboardingSeen = (
	userId: string,
	role: OnboardingRole
): void => {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(
			getOnboardingCompletionKey(userId, role),
			userId
		);
	} catch {
		// 기기 저장소가 막혀도 현재 온보딩은 계속 진행한다.
	}
};

export const hasSeenAutomaticOnboarding = (
	userId: string,
	role: OnboardingRole
): boolean => {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		return (
			window.localStorage.getItem(getOnboardingCompletionKey(userId, role)) ===
			userId
		);
	} catch {
		return false;
	}
};

export const writeSignupOnboardingIntent = (
	intent: StoredOnboardingIntent
): void => writeSessionIntent(SIGNUP_ONBOARDING_INTENT_KEY, intent);

export const readSignupOnboardingIntent = (): StoredOnboardingIntent | null =>
	readSessionIntent(SIGNUP_ONBOARDING_INTENT_KEY);

export const clearSignupOnboardingIntent = (): void =>
	clearSessionIntent(SIGNUP_ONBOARDING_INTENT_KEY);

export const writeCoachmarkIntent = (intent: StoredOnboardingIntent): void =>
	writeSessionIntent(COACHMARK_INTENT_KEY, intent);

export const readCoachmarkIntent = (): StoredOnboardingIntent | null =>
	readSessionIntent(COACHMARK_INTENT_KEY);

export const clearCoachmarkIntent = (): void =>
	clearSessionIntent(COACHMARK_INTENT_KEY);

export const getOnboardingHomePath = (role: OnboardingRole): Route =>
	homePathForRole(role);
