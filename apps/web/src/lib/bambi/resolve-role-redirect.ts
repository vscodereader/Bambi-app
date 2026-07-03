export interface RoleRoutingInput {
	approvalStatus: "none" | "pending" | "verified" | "rejected";
	pathname: string;
	role: "job_seeker" | "employer" | "admin" | null;
}

const roleHome = (role: "job_seeker" | "employer" | "admin"): string => {
	if (role === "admin") {
		return "/moderator";
	}
	if (role === "employer") {
		return "/employer";
	}
	return "/seeker";
};

const isUnder = (pathname: string, prefix: string): boolean =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

export const resolveRoleRedirect = ({
	role,
	approvalStatus,
	pathname,
}: RoleRoutingInput): string | null => {
	if (role === null) {
		return "/welcome";
	}

	const home = roleHome(role);

	if (role === "employer") {
		if (approvalStatus !== "verified") {
			return pathname === "/employer/pending" ? null : "/employer/pending";
		}
		if (pathname === "/employer/pending") {
			return "/employer";
		}
	}

	if (isUnder(pathname, "/employer") && role !== "employer") {
		return home;
	}
	if (isUnder(pathname, "/moderator") && role !== "admin") {
		return home;
	}
	if (pathname === "/") {
		return home;
	}
	return null;
};
