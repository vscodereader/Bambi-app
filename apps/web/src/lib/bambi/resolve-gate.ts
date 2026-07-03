export interface GateInput {
	hasSession: boolean;
	isGuest: boolean;
	pathname: string;
}

export type GateDecision = { type: "next" } | { type: "redirect"; to: string };

const PUBLIC_PREFIXES = ["/welcome", "/login", "/api", "/bambi"];

const GUEST_BLOCKED_SEEKER_PREFIXES = [
	"/seeker/jobs",
	"/seeker/community",
	"/seeker/chats",
	"/seeker/me",
];

const isPublic = (pathname: string): boolean =>
	PUBLIC_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);

const next: GateDecision = { type: "next" };
const redirect = (to: string): GateDecision => ({ type: "redirect", to });

export const resolveGate = ({
	pathname,
	hasSession,
	isGuest,
}: GateInput): GateDecision => {
	if (isPublic(pathname)) {
		return next;
	}
	if (hasSession) {
		return next;
	}
	if (isGuest) {
		if (pathname === "/") {
			return redirect("/seeker");
		}
		if (pathname === "/seeker") {
			return next;
		}
		if (
			GUEST_BLOCKED_SEEKER_PREFIXES.some((prefix) =>
				pathname.startsWith(prefix)
			) ||
			pathname.startsWith("/employer") ||
			pathname.startsWith("/moderator")
		) {
			return redirect("/welcome?signup");
		}
		return redirect("/welcome?signup");
	}
	return redirect("/welcome");
};
