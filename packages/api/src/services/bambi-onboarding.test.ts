import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	isEmployerProfileManagerRole,
} from "./bambi-onboarding";

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
});
