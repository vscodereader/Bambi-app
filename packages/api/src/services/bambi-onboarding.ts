import type { bambiUserRole } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";

export type BambiProfileRole = (typeof bambiUserRole.enumValues)[number];

export type OrganizationRole = "owner" | "admin" | "member";

interface AssertCanCreateBambiProfileInput {
	existingRole?: BambiProfileRole | null;
}

interface AssertCanManageEmployerProfileInput {
	organizationRole?: OrganizationRole | null;
}

interface AssertCanUpdateOwnBambiProfileInput {
	existingRole?: BambiProfileRole | null;
	hasPersonalProfileChanges?: boolean;
	requestedRole?: BambiProfileRole;
}

const EMPLOYER_PROFILE_MANAGER_ROLES = new Set<OrganizationRole>([
	"owner",
	"admin",
]);

export const isEmployerProfileManagerRole = (
	role: OrganizationRole | null | undefined
): boolean =>
	role !== null &&
	role !== undefined &&
	EMPLOYER_PROFILE_MANAGER_ROLES.has(role);

export const assertCanCreateBambiProfile = ({
	existingRole,
}: AssertCanCreateBambiProfileInput): void => {
	if (existingRole) {
		throw new ORPCError("CONFLICT", {
			message: "Bambi profile already exists.",
		});
	}
};

export const assertCanUpdateOwnBambiProfile = ({
	existingRole,
	hasPersonalProfileChanges = true,
	requestedRole,
}: AssertCanUpdateOwnBambiProfileInput): void => {
	if (!existingRole) {
		throw new ORPCError("NOT_FOUND", {
			message: "Bambi profile is required.",
		});
	}

	if (requestedRole && requestedRole !== existingRole) {
		throw new ORPCError("FORBIDDEN", {
			message: "Bambi profile role cannot be changed from onboarding.",
		});
	}

	if (!hasPersonalProfileChanges) {
		throw new ORPCError("BAD_REQUEST", {
			message: "At least one personal profile field is required.",
		});
	}
};

export const assertCanManageEmployerProfile = ({
	organizationRole,
}: AssertCanManageEmployerProfileInput): void => {
	if (isEmployerProfileManagerRole(organizationRole)) {
		return;
	}

	throw new ORPCError("FORBIDDEN", {
		message: "Organization owner or admin role is required.",
	});
};

export type EmployerApprovalStatus =
	| "none"
	| "pending"
	| "verified"
	| "rejected";

export const deriveEmployerApprovalStatus = (
	statuses: string[]
): EmployerApprovalStatus => {
	if (statuses.includes("verified")) {
		return "verified";
	}
	if (statuses.includes("pending")) {
		return "pending";
	}
	if (statuses.includes("rejected")) {
		return "rejected";
	}
	return "none";
};
