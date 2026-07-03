import { describe, expect, it } from "vitest";
import { resolveRoleRedirect } from "./resolve-role-redirect";

describe("resolveRoleRedirect", () => {
	it("sends null role to /welcome", () => {
		expect(
			resolveRoleRedirect({ role: null, approvalStatus: "none", pathname: "/" })
		).toBe("/welcome");
	});
	it("routes root to role home", () => {
		expect(
			resolveRoleRedirect({
				role: "job_seeker",
				approvalStatus: "none",
				pathname: "/",
			})
		).toBe("/seeker");
		expect(
			resolveRoleRedirect({
				role: "admin",
				approvalStatus: "none",
				pathname: "/",
			})
		).toBe("/moderator");
	});
	it("verified employer at root goes to /employer", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/",
			})
		).toBe("/employer");
	});
	it("unverified employer forced to pending", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "pending",
				pathname: "/employer",
			})
		).toBe("/employer/pending");
	});
	it("unverified employer allowed on pending page", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "rejected",
				pathname: "/employer/pending",
			})
		).toBeNull();
	});
	it("verified employer redirected off pending page", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/employer/pending",
			})
		).toBe("/employer");
	});
	it("job seeker blocked from employer area", () => {
		expect(
			resolveRoleRedirect({
				role: "job_seeker",
				approvalStatus: "none",
				pathname: "/employer",
			})
		).toBe("/seeker");
	});
	it("non-admin blocked from moderator area", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/moderator",
			})
		).toBe("/employer");
	});
	it("allows seeker area for any authed role", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/seeker",
			})
		).toBeNull();
	});
});
