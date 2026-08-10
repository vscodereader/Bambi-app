import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	deriveEmployerApprovalStatus,
	isEmployerProfileManagerRole,
} from "@/services/bambi-onboarding";

const getOrpcErrorCode = (callback: () => void): string => {
	try {
		callback();
	} catch (error) {
		expect(error).toBeInstanceOf(ORPCError);

		if (error instanceof ORPCError) {
			return error.code;
		}
	}

	throw new Error("Expected ORPCError to be thrown.");
};

describe("bambi onboarding", () => {
	it("allows profile creation when no existing role is present", () => {
		expect(() =>
			assertCanCreateBambiProfile({
				existingRole: undefined,
			})
		).not.toThrow();

		expect(() =>
			assertCanCreateBambiProfile({
				existingRole: null,
			})
		).not.toThrow();
	});

	it("rejects profile creation when any profile role already exists", () => {
		for (const existingRole of ["job_seeker", "employer", "admin"] as const) {
			expect(
				getOrpcErrorCode(() =>
					assertCanCreateBambiProfile({
						existingRole,
					})
				)
			).toBe("CONFLICT");
		}
	});

	it("allows organization owner and admin roles to manage employer profiles", () => {
		expect(isEmployerProfileManagerRole("owner")).toBe(true);
		expect(isEmployerProfileManagerRole("admin")).toBe(true);

		expect(() =>
			assertCanManageEmployerProfile({ organizationRole: "owner" })
		).not.toThrow();
		expect(() =>
			assertCanManageEmployerProfile({ organizationRole: "admin" })
		).not.toThrow();
	});

	it("rejects member and missing organization roles from managing employer profiles", () => {
		expect(isEmployerProfileManagerRole("member")).toBe(false);
		expect(isEmployerProfileManagerRole(null)).toBe(false);
		expect(isEmployerProfileManagerRole(undefined)).toBe(false);

		for (const organizationRole of ["member", null, undefined] as const) {
			expect(
				getOrpcErrorCode(() =>
					assertCanManageEmployerProfile({ organizationRole })
				)
			).toBe("FORBIDDEN");
		}
	});

	it("allows personal profile fields to be updated without role changes", () => {
		expect(() =>
			assertCanUpdateOwnBambiProfile({
				existingRole: "job_seeker",
				requestedRole: undefined,
			})
		).not.toThrow();
	});

	it("blocks role changes after the Bambi profile exists", () => {
		expect(() =>
			assertCanUpdateOwnBambiProfile({
				existingRole: "job_seeker",
				requestedRole: "employer",
			})
		).toThrow("Bambi profile role cannot be changed from onboarding.");
	});

	it("requires an existing profile before personal profile update", () => {
		expect(() =>
			assertCanUpdateOwnBambiProfile({
				existingRole: null,
				requestedRole: undefined,
			})
		).toThrow("Bambi profile is required.");
	});

	it("requires at least one personal profile field before profile update", () => {
		expect(() =>
			assertCanUpdateOwnBambiProfile({
				existingRole: "job_seeker",
				hasPersonalProfileChanges: false,
				requestedRole: undefined,
			})
		).toThrow("At least one personal profile field is required.");
	});
});

describe("deriveEmployerApprovalStatus", () => {
	it("returns none for empty list", () => {
		expect(deriveEmployerApprovalStatus([])).toBe("none");
	});
	it("prioritizes verified over everything", () => {
		expect(
			deriveEmployerApprovalStatus(["pending", "rejected", "verified"])
		).toBe("verified");
	});
	it("returns pending when any pending and no verified", () => {
		expect(deriveEmployerApprovalStatus(["rejected", "pending"])).toBe(
			"pending"
		);
	});
	it("returns rejected when only rejected/none", () => {
		expect(deriveEmployerApprovalStatus(["none", "rejected"])).toBe("rejected");
	});
	it("returns none when only none", () => {
		expect(deriveEmployerApprovalStatus(["none", "none"])).toBe("none");
	});
});
