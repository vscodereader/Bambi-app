export interface ChatPreflightState {
	blocked: boolean;
	canContinue: boolean;
	hasProfile: boolean;
	signedIn: boolean;
	verified: boolean;
}

export const resolveChatPreflight = (input: {
	blocked: boolean;
	profileRole: null | string;
	visitorState: "anon" | "guest" | "member" | "pending";
	verified: boolean;
}): ChatPreflightState => {
	const signedIn = input.visitorState === "member";
	const hasProfile = input.profileRole === "job_seeker";
	return {
		blocked: input.blocked,
		canContinue: signedIn && hasProfile && input.verified && !input.blocked,
		hasProfile,
		signedIn,
		verified: input.verified,
	};
};
