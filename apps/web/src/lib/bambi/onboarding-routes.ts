export type OnboardingNextRoute = "/employer" | "/moderator" | "/seeker";

export const getOnboardingNextRoute = (
	role?: null | string
): OnboardingNextRoute => {
	if (role === "admin") {
		return "/moderator";
	}

	if (role === "employer") {
		return "/employer";
	}

	return "/seeker";
};
