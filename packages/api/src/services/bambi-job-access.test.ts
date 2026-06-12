import { describe, expect, it } from "vitest";

import {
	getAccessibleTeamPostScopes,
	getJobPostingScopes,
} from "./bambi-job-access";

describe("bambi job access", () => {
	it("keeps assigned team post scopes inside organizations the user belongs to", () => {
		expect(
			getAccessibleTeamPostScopes({
				organizationIds: ["org-a"],
				teamMemberships: [
					{ organizationId: "org-a", teamId: "team-a" },
					{ organizationId: "org-b", teamId: "team-b" },
				],
			})
		).toEqual([{ organizationId: "org-a", teamId: "team-a" }]);
	});

	it("allows organization-wide posting only for organization owner and admin roles", () => {
		expect(
			getJobPostingScopes({
				organizationMemberships: [
					{ organizationId: "org-owner", role: "owner" },
					{ organizationId: "org-admin", role: "admin" },
					{ organizationId: "org-member", role: "member" },
				],
				teamMemberships: [],
			})
		).toEqual([
			{ organizationId: "org-owner", scopeType: "organization" },
			{ organizationId: "org-admin", scopeType: "organization" },
		]);
	});

	it("allows team posting for organization members assigned to matching teams", () => {
		expect(
			getJobPostingScopes({
				organizationMemberships: [{ organizationId: "org-a", role: "member" }],
				teamMemberships: [
					{ organizationId: "org-a", teamId: "team-a" },
					{ organizationId: "org-b", teamId: "team-b" },
				],
			})
		).toEqual([
			{ organizationId: "org-a", scopeType: "team", teamId: "team-a" },
		]);
	});
});
