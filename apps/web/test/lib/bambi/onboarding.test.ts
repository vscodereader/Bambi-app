import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	COACHMARK_INTENT_KEY,
	clearCoachmarkIntent,
	clearSignupOnboardingIntent,
	getOnboardingCompletionKey,
	hasSeenAutomaticOnboarding,
	markAutomaticOnboardingSeen,
	readCoachmarkIntent,
	readSignupOnboardingIntent,
	SIGNUP_ONBOARDING_INTENT_KEY,
	writeCoachmarkIntent,
	writeSignupOnboardingIntent,
} from "@/lib/bambi/onboarding";

const USER_ID = "user-onboarding";

const createMemoryStorage = (): Storage => {
	const values = new Map<string, string>();
	return {
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		},
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
};

const localStorage = createMemoryStorage();
const sessionStorage = createMemoryStorage();

describe("onboarding browser state", () => {
	beforeEach(() => {
		vi.stubGlobal("window", { localStorage, sessionStorage });
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("scopes completion by user and role", () => {
		expect(getOnboardingCompletionKey(USER_ID, "job_seeker")).toBe(
			`bambi:onboarding:seen:${USER_ID}:job_seeker`
		);
		expect(hasSeenAutomaticOnboarding(USER_ID, "job_seeker")).toBe(false);
		markAutomaticOnboardingSeen(USER_ID, "job_seeker");
		expect(hasSeenAutomaticOnboarding(USER_ID, "job_seeker")).toBe(true);
		expect(hasSeenAutomaticOnboarding(USER_ID, "employer")).toBe(false);
		expect(hasSeenAutomaticOnboarding("another-user", "job_seeker")).toBe(
			false
		);
	});

	it("round trips a signup intent with user and role", () => {
		const intent = {
			role: "employer" as const,
			userId: USER_ID,
		};
		writeSignupOnboardingIntent(intent);
		expect(readSignupOnboardingIntent()).toEqual(intent);
		clearSignupOnboardingIntent();
		expect(sessionStorage.getItem(SIGNUP_ONBOARDING_INTENT_KEY)).toBeNull();
	});

	it("rejects malformed signup intents", () => {
		sessionStorage.setItem(SIGNUP_ONBOARDING_INTENT_KEY, "not-json");
		expect(readSignupOnboardingIntent()).toBeNull();
	});

	it("keeps coachmark intent separate and clears it once requested", () => {
		const intent = {
			role: "job_seeker" as const,
			userId: USER_ID,
		};
		writeCoachmarkIntent(intent);
		expect(readCoachmarkIntent()).toEqual(intent);
		expect(sessionStorage.getItem(SIGNUP_ONBOARDING_INTENT_KEY)).toBeNull();
		clearCoachmarkIntent();
		expect(sessionStorage.getItem(COACHMARK_INTENT_KEY)).toBeNull();
	});
});
