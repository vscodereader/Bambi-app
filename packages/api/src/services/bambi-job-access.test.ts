import { describe, expect, it } from "vitest";

import { getAccessibleTeamPostScopes } from "./bambi-job-access";

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
});
