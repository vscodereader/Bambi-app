export interface TeamPostAccessScope {
	organizationId: string;
	teamId: string;
}

interface AccessibleTeamPostScopesInput {
	organizationIds: string[];
	teamMemberships: TeamPostAccessScope[];
}

export const getAccessibleTeamPostScopes = ({
	organizationIds,
	teamMemberships,
}: AccessibleTeamPostScopesInput): TeamPostAccessScope[] => {
	const organizationIdSet = new Set(organizationIds);

	return teamMemberships.filter((membership) =>
		organizationIdSet.has(membership.organizationId)
	);
};
