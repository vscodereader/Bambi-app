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

// member.role 저장 원값 중 owner/manager로 정규화되는 값들 — SQL inArray 필터용
// (레거시 별칭 "admin" 포함, ROLE_ALIASES와 함께 유지).
export const storedOrganizationManagerRoles = [
	"owner",
	"manager",
	"admin",
] as const;

// "owner 또는 manager"만 허용하는 조직 단위 접근(공고 목록·광고·성과 등)의 raw role 판정.
// 저장값에 레거시 별칭이 섞여 있어 정규화 없이 비교하면 canonical "manager"가 누락된다.
export const isOrganizationManagerRole = (
	role: null | string | undefined
): boolean => {
	const normalized = normalizeOrganizationManagementRole(role);
	return normalized === "owner" || normalized === "manager";
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
