export const organizationManagementRoles = [
	"owner",
	"manager",
	"staff",
] as const;

export type OrganizationManagementRole =
	(typeof organizationManagementRoles)[number];

export interface OrganizationMembership {
	organizationId: string;
	role: null | string;
}

export interface TeamMembership {
	organizationId: string;
	teamId: string;
}

interface OrganizationAccessInput {
	organizationId: string;
	organizationMemberships: OrganizationMembership[];
}

interface TeamAccessInput extends OrganizationAccessInput {
	teamId: string;
	teamMemberships: TeamMembership[];
}

interface JobPostAccessInput extends OrganizationAccessInput {
	teamId?: null | string;
	teamMemberships: TeamMembership[];
}

const ROLE_ALIASES = {
	admin: "manager",
	member: "staff",
} as const satisfies Record<string, OrganizationManagementRole>;

const directRoles = new Set<OrganizationManagementRole>(
	organizationManagementRoles
);

export const normalizeOrganizationManagementRole = (
	role: null | string | undefined
): null | OrganizationManagementRole => {
	if (!role) {
		return null;
	}

	if (directRoles.has(role as OrganizationManagementRole)) {
		return role as OrganizationManagementRole;
	}

	return ROLE_ALIASES[role as keyof typeof ROLE_ALIASES] ?? null;
};

const getOrganizationRole = ({
	organizationId,
	organizationMemberships,
}: OrganizationAccessInput): null | OrganizationManagementRole => {
	const membership = organizationMemberships.find(
		(item) => item.organizationId === organizationId
	);

	return normalizeOrganizationManagementRole(membership?.role);
};

const hasTeamMembership = ({
	organizationId,
	teamId,
	teamMemberships,
}: TeamAccessInput): boolean =>
	teamMemberships.some(
		(membership) =>
			membership.organizationId === organizationId &&
			membership.teamId === teamId
	);

export const canManageOrganization = (
	input: OrganizationAccessInput
): boolean => getOrganizationRole(input) === "owner";

export const canManageTeam = (input: TeamAccessInput): boolean => {
	const role = getOrganizationRole(input);

	return input.teamId.length > 0 && (role === "owner" || role === "manager");
};

export const canInviteMembers = (input: OrganizationAccessInput): boolean => {
	const role = getOrganizationRole(input);

	return role === "owner" || role === "manager";
};

export const canManageJobPosts = (input: JobPostAccessInput): boolean => {
	const role = getOrganizationRole(input);

	if (role === "owner" || role === "manager") {
		return true;
	}

	if (role !== "staff" || !input.teamId) {
		return false;
	}

	return hasTeamMembership({
		organizationId: input.organizationId,
		organizationMemberships: input.organizationMemberships,
		teamId: input.teamId,
		teamMemberships: input.teamMemberships,
	});
};
