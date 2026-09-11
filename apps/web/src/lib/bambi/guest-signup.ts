export type SignupStep = "form" | "verify";
export type GuestSignupStatus =
	| "account_exists"
	| "available"
	| "reauthenticate";

export const resolveGuestSignupRestoration = (
	status: GuestSignupStatus
): null | { reuseGuestVerification: boolean; step: SignupStep } => {
	if (status === "account_exists") {
		return null;
	}
	return status === "available"
		? { reuseGuestVerification: true, step: "form" }
		: { reuseGuestVerification: false, step: "verify" };
};
