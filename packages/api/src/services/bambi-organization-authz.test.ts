import { describe, expect, it } from "vitest";

import {
	canInviteMembers,
	canManageJobPosts,
	canManageOrganization,
	canManageTeam,
	isOrganizationManagerRole,
	normalizeOrganizationManagementRole,
	storedOrganizationManagerRoles,
} from "./bambi-organization-authz";

describe("bambi organization authorization", () => {
	it("allows owners to manage organization, teams, members, and job posts", () => {
		const organizationMemberships = [
			{ organizationId: "org-a", role: "owner" },
		];

		expect(
			canManageOrganization({
				organizationId: "org-a",
				organizationMemberships,
			})
		).toBe(true);
		expect(
			canManageTeam({
				organizationId: "org-a",
				organizationMemberships,
				teamId: "team-a",
				teamMemberships: [],
			})
		).toBe(true);
		expect(
			canManageJobPosts({
				organizationId: "org-a",
				organizationMemberships,
				teamMemberships: [],
			})
		).toBe(true);
		expect(
			canInviteMembers({ organizationId: "org-a", organizationMemberships })
		).toBe(true);
	});

	it("allows managers to manage teams, invite members, and create job posts without organization profile access", () => {
		const organizationMemberships = [
			{ organizationId: "org-a", role: "manager" },
		];

		expect(
			canManageOrganization({
				organizationId: "org-a",
				organizationMemberships,
			})
		).toBe(false);
		expect(
			canManageTeam({
				organizationId: "org-a",
				organizationMemberships,
				teamId: "team-a",
				teamMemberships: [],
			})
		).toBe(true);
		expect(
			canManageJobPosts({
				organizationId: "org-a",
				organizationMemberships,
				teamMemberships: [],
			})
		).toBe(true);
		expect(
			canInviteMembers({ organizationId: "org-a", organizationMemberships })
		).toBe(true);
	});

	it("allows staff to create job posts only inside assigned teams", () => {
		const organizationMemberships = [
			{ organizationId: "org-a", role: "staff" },
		];
		const teamMemberships = [{ organizationId: "org-a", teamId: "team-a" }];

		expect(
			canManageOrganization({
				organizationId: "org-a",
				organizationMemberships,
			})
		).toBe(false);
		expect(
			canManageTeam({
				organizationId: "org-a",
				organizationMemberships,
				teamId: "team-a",
				teamMemberships,
			})
		).toBe(false);
		expect(
			canInviteMembers({ organizationId: "org-a", organizationMemberships })
		).toBe(false);
		expect(
			canManageJobPosts({
				organizationId: "org-a",
				organizationMemberships,
				teamId: "team-a",
				teamMemberships,
			})
		).toBe(true);
		expect(
			canManageJobPosts({
				organizationId: "org-a",
				organizationMemberships,
				teamMemberships,
			})
		).toBe(false);
	});

	it("denies access across organization boundaries", () => {
		const organizationMemberships = [
			{ organizationId: "org-a", role: "owner" },
		];
		const teamMemberships = [{ organizationId: "org-a", teamId: "team-a" }];

		expect(
			canManageOrganization({
				organizationId: "org-b",
				organizationMemberships,
			})
		).toBe(false);
		expect(
			canManageTeam({
				organizationId: "org-b",
				organizationMemberships,
				teamId: "team-a",
				teamMemberships,
			})
		).toBe(false);
		expect(
			canManageJobPosts({
				organizationId: "org-b",
				organizationMemberships,
				teamId: "team-a",
				teamMemberships,
			})
		).toBe(false);
		expect(
			canInviteMembers({ organizationId: "org-b", organizationMemberships })
		).toBe(false);
	});

	it("treats canonical manager and legacy admin as organization managers", () => {
		expect(isOrganizationManagerRole("owner")).toBe(true);
		expect(isOrganizationManagerRole("manager")).toBe(true);
		expect(isOrganizationManagerRole("admin")).toBe(true);
		expect(isOrganizationManagerRole("staff")).toBe(false);
		expect(isOrganizationManagerRole("member")).toBe(false);
		expect(isOrganizationManagerRole("guest")).toBe(false);
		expect(isOrganizationManagerRole(null)).toBe(false);
		expect(isOrganizationManagerRole(undefined)).toBe(false);
		// SQL inArray용 원값 목록과 raw 판정이 서로 어긋나지 않아야 한다.
		for (const role of storedOrganizationManagerRoles) {
			expect(isOrganizationManagerRole(role)).toBe(true);
		}
	});

	it("normalizes legacy Better Auth organization roles", () => {
		expect(normalizeOrganizationManagementRole("owner")).toBe("owner");
		expect(normalizeOrganizationManagementRole("manager")).toBe("manager");
		expect(normalizeOrganizationManagementRole("staff")).toBe("staff");
		expect(normalizeOrganizationManagementRole("admin")).toBe("manager");
		expect(normalizeOrganizationManagementRole("member")).toBe("staff");
		expect(normalizeOrganizationManagementRole(null)).toBe(null);
		expect(normalizeOrganizationManagementRole("guest")).toBe(null);
	});
});
