export interface TeamPostAccessScope {
	organizationId: string;
	teamId: string;
}

export interface OrganizationPostAccessMembership {
	organizationId: string;
	role: string;
}

export interface JobPostingScope {
	organizationId: string;
	scopeType: "organization" | "team";
	teamId?: string;
}

interface AccessibleTeamPostScopesInput {
	organizationIds: string[];
	teamMemberships: TeamPostAccessScope[];
}

interface JobPostingScopesInput {
	organizationMemberships: OrganizationPostAccessMembership[];
	teamMemberships: TeamPostAccessScope[];
}

const ORGANIZATION_WIDE_POSTING_ROLES = new Set(["owner", "admin"]);

export const getAccessibleTeamPostScopes = ({
	organizationIds,
	teamMemberships,
}: AccessibleTeamPostScopesInput): TeamPostAccessScope[] => {
	const organizationIdSet = new Set(organizationIds);

	return teamMemberships.filter((membership) =>
		organizationIdSet.has(membership.organizationId)
	);
};

export const getJobPostingScopes = ({
	organizationMemberships,
	teamMemberships,
}: JobPostingScopesInput): JobPostingScope[] => {
	const organizationIds = organizationMemberships.map(
		(membership) => membership.organizationId
	);
	const organizationScopes = organizationMemberships
		.filter((membership) =>
			ORGANIZATION_WIDE_POSTING_ROLES.has(membership.role)
		)
		.map((membership) => ({
			organizationId: membership.organizationId,
			scopeType: "organization" as const,
		}));
	const teamScopes = getAccessibleTeamPostScopes({
		organizationIds,
		teamMemberships,
	}).map((membership) => ({
		organizationId: membership.organizationId,
		scopeType: "team" as const,
		teamId: membership.teamId,
	}));

	return [...organizationScopes, ...teamScopes];
};
