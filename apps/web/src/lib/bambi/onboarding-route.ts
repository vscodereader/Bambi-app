import type { Route } from "next";

import {
	isOnboardingAudience,
	type OnboardingAudience,
	type OnboardingRole,
} from "./onboarding";

export const ONBOARDING_PATH = "/onboarding" as Route;
export const ONBOARDING_AUDIENCE_QUERY_KEY = "audience";
export const ONBOARDING_SOURCE_QUERY_KEY = "source";
export const ONBOARDING_REPLAY_SOURCE = "replay";

export const isOnboardingPath = (pathname: string | null): boolean =>
	pathname === ONBOARDING_PATH;

export interface OnboardingReplayRequest {
	audience: OnboardingAudience;
	source: typeof ONBOARDING_REPLAY_SOURCE;
}

export const buildOnboardingReplayPath = (
	audience: OnboardingAudience
): Route =>
	`${ONBOARDING_PATH}?${new URLSearchParams({
		[ONBOARDING_AUDIENCE_QUERY_KEY]: audience,
		[ONBOARDING_SOURCE_QUERY_KEY]: ONBOARDING_REPLAY_SOURCE,
	}).toString()}` as Route;

export const parseOnboardingReplayRequest = (
	searchParams: Record<string, string | string[] | undefined>
): OnboardingReplayRequest | null => {
	const audience = searchParams[ONBOARDING_AUDIENCE_QUERY_KEY];
	const source = searchParams[ONBOARDING_SOURCE_QUERY_KEY];
	if (
		typeof audience !== "string" ||
		!isOnboardingAudience(audience) ||
		source !== ONBOARDING_REPLAY_SOURCE
	) {
		return null;
	}
	return { audience, source };
};

export const canReplayAudience = (
	audience: OnboardingAudience,
	role: OnboardingRole
): boolean => audience === "common" || audience === role;
